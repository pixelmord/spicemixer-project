import { generateText, Output } from "ai";
import { z } from "zod";
import type { ZodObject, ZodRawShape, ZodSchema } from "zod";
import { createProvider, PROVIDER_OPTIONS } from "./provider.ts";
import { fingerprintHash } from "./hash.ts";
import type {
  AiEvent,
  AppliedSuggestion,
  AutoApplyPolicy,
  FieldSuggestion,
  PromptContext,
  RunRefineParams,
  RunRefineResult,
  TraceSummary,
} from "./types.ts";

function isSuppressed(events: AiEvent[], field: string, hash: string): boolean {
  return events.some(
    (e) => e.type === "rejected" && e.field === field && e.suggestion.hash === hash,
  );
}

function summarizeValue(field: string, value: unknown): string {
  if (typeof value === "string") return `${field}: ${value.slice(0, 80)}`;
  if (Array.isArray(value)) return `${field}: [${value.length} items]`;
  if (value !== null && typeof value === "object")
    return `${field}: {${Object.keys(value as object).join(", ")}}`;
  return `${field}: ${String(value)}`;
}

function confidenceScore(level: "high" | "medium" | "low"): number {
  return level === "high" ? 1.0 : level === "medium" ? 0.5 : 0.0;
}

function resolveAutoApply<S extends ZodSchema, Source>(
  fieldAutoApply:
    | import("./types.ts").AutoApplyPolicy
    | ((ctx: PromptContext<S, Source>) => import("./types.ts").AutoApplyPolicy)
    | undefined,
  ctx: PromptContext<S, Source>,
  presetOverride?: AutoApplyPolicy,
): AutoApplyPolicy {
  if (presetOverride) return presetOverride;
  if (!fieldAutoApply) return { policy: "never" };
  if (typeof fieldAutoApply === "function") return fieldAutoApply(ctx);
  return fieldAutoApply;
}

function shouldSkipByPolicy(
  field: string,
  currentData: Record<string, unknown>,
  policy: import("./types.ts").FieldWritePolicy<unknown> | undefined,
): boolean {
  if (!policy) return false;
  if (policy === "preserve" || policy === "fill-if-empty") {
    const val = currentData[field];
    return val != null && val !== "" && !(Array.isArray(val) && val.length === 0);
  }
  return false;
}

function extractFieldSchema(entitySchema: ZodSchema, field: string): ZodSchema | undefined {
  const shape = (entitySchema as ZodObject<ZodRawShape>).shape;
  if (!shape) return undefined;
  return shape[field] as ZodSchema | undefined;
}

export async function runRefine<S extends ZodSchema, Source = never>(
  params: RunRefineParams<S, Source>,
): Promise<RunRefineResult> {
  const {
    contract,
    currentData,
    sourceContext,
    target,
    preset,
    userPrompt,
    config,
    events = [],
  } = params;

  const allContractFields = Object.keys(contract.fields);
  const targetFields: string[] = target
    ? Array.isArray(target)
      ? target
      : [target]
    : allContractFields;

  const presetObj = preset ? contract.presets.find((p) => p.id === preset) : undefined;

  const dataAsRecord = currentData as Record<string, unknown>;

  const suggestions = new Map<string, FieldSuggestion>();
  const autoApplied = new Map<string, AppliedSuggestion>();
  const traces = new Map<string, TraceSummary>();

  await Promise.all(
    targetFields.map(async (field) => {
      const fieldConfig = contract.fields[field];
      if (!fieldConfig?.systemPrompt) return;

      // If preset is specified, only process fields that opted into it
      if (preset && presetObj && !fieldConfig.presetIds?.includes(preset)) {
        return;
      }

      // Write policy check: skip LLM if policy is preserve/fill-if-empty and field has value
      if (shouldSkipByPolicy(field, dataAsRecord, fieldConfig.writePolicy)) return;

      // Resolve output schema: explicit outputSchema wins, then entity field schema
      const outputSchema =
        fieldConfig.outputSchema ?? extractFieldSchema(contract.schema, field) ?? z.unknown();

      const ctx: PromptContext<S, Source> = {
        currentData: dataAsRecord as z.infer<S>,
        sourceContext: sourceContext as Source,
        userPrompt,
        preset,
      };

      let systemPromptStr = fieldConfig.systemPrompt(ctx);

      // Append preset instruction if applicable
      if (presetObj) {
        const presetInstruction =
          typeof presetObj.instruction === "function"
            ? presetObj.instruction(ctx)
            : presetObj.instruction;
        systemPromptStr = `${systemPromptStr}\n\n${presetInstruction}`;
      }

      const traceId = crypto.randomUUID();
      const start = Date.now();

      try {
        const model = createProvider(config);
        const wrappedSchema = z.object({ value: outputSchema });

        const { output } = await generateText({
          model,
          output: Output.object({ schema: wrappedSchema }),
          providerOptions: PROVIDER_OPTIONS,
          system: systemPromptStr,
          prompt: userPrompt ?? `Suggest a value for the "${field}" field.`,
        });

        const value = (output as { value: unknown }).value;
        if (value == null) return;

        const hash = fingerprintHash({ field, value });
        const summary = summarizeValue(field, value);
        const confidence: "high" | "medium" | "low" = "medium";

        const runtimeMs = Date.now() - start;
        const traceSummary: TraceSummary = {
          traceId,
          model: config.model,
          runtimeMs,
          ...(preset ? { preset } : {}),
          ...(userPrompt ? { userPrompt } : {}),
        };
        traces.set(traceId, traceSummary);

        // Suppression check
        if (isSuppressed(events, field, hash)) return;

        // Auto-apply decision
        const autoApplyPolicy = resolveAutoApply(
          fieldConfig.autoApply,
          ctx,
          presetObj?.autoApplyOverride,
        );

        if (
          autoApplyPolicy.policy === "high-confidence" &&
          confidenceScore(confidence) >= autoApplyPolicy.threshold
        ) {
          autoApplied.set(field, { value, hash, summary, confidence });
        } else {
          const suggestion: FieldSuggestion = {
            kind: "single",
            value,
            confidence,
            summary,
            hash,
            traceId,
          };
          suggestions.set(field, suggestion);
        }
      } catch {
        // Non-fatal: other fields still processed
      }
    }),
  );

  return { suggestions, autoApplied, traces };
}
