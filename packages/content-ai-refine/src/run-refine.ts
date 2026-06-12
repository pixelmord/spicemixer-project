import { generateText, Output } from "ai";
import { z } from "zod";
import type { ZodObject, ZodRawShape, ZodSchema } from "zod";
import { noopLogger } from "@pixelmord/content-ai-core";
import { createProvider, PROVIDER_OPTIONS } from "@pixelmord/content-ai-core/server";
import { fingerprintHash } from "./hash.ts";
import type {
  AiEvent,
  AppliedSuggestion,
  AutoApplyPolicy,
  FieldRunError,
  FieldSuggestion,
  FieldWritePolicy,
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

const CONFIDENCE_SCORES: Record<"high" | "medium" | "low", number> = {
  high: 1.0,
  medium: 0.5,
  low: 0.0,
};

function confidenceScore(level: "high" | "medium" | "low"): number {
  return CONFIDENCE_SCORES[level];
}

function resolveAutoApply<S extends ZodSchema, Source>(
  fieldAutoApply:
    | AutoApplyPolicy
    | ((ctx: PromptContext<S, Source>) => AutoApplyPolicy)
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
  policy: FieldWritePolicy<unknown> | undefined,
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

/**
 * runRefine asks the model to produce a value for a single field. If the
 * entity schema marks the field as `.optional()` / `.nullable()` / has a
 * default, the wrapped output schema would let the model legally return
 * nothing — which surfaces as "model returned no value" with no real cause.
 *
 * Strip those wrappers so the generated JSON schema requires a value.
 */
function requireValueSchema(schema: ZodSchema): ZodSchema {
  let current: unknown = schema;
  // Walk up to 8 layers to handle stacked wrappers (e.g. optional().nullable()).
  for (let i = 0; i < 8; i++) {
    const typeName =
      (current as { _def?: { typeName?: string } })._def?.typeName ??
      (current as { _zod?: { def?: { type?: string } } })._zod?.def?.type;
    const unwrap = (current as { unwrap?: () => ZodSchema }).unwrap;
    if (
      typeof unwrap === "function" &&
      (typeName === "optional" ||
        typeName === "nullable" ||
        typeName === "default" ||
        typeName === "ZodOptional" ||
        typeName === "ZodNullable" ||
        typeName === "ZodDefault")
    ) {
      current = unwrap.call(current);
      continue;
    }
    break;
  }
  return current as ZodSchema;
}

function isSiblingLocaleSource(ctx: unknown): boolean {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    (ctx as Record<string, unknown>).kind === "sibling-locale"
  );
}

export async function runRefine<S extends ZodSchema, Source = never>(
  params: RunRefineParams<S, Source>,
): Promise<RunRefineResult> {
  if (isSiblingLocaleSource(params.sourceContext)) {
    throw new Error(
      "runRefine does not accept sibling-locale sources — use runFill for translation operations.",
    );
  }

  const {
    contract,
    currentData,
    sourceContext,
    target,
    preset,
    userPrompt,
    config,
    sinks,
    events = [],
    logger = noopLogger,
    errorMode = "collect",
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
  const errors = new Map<string, FieldRunError>();

  const runStart = Date.now();
  logger.info(
    {
      op: "refine.start",
      model: config.model,
      target: targetFields,
      preset,
      hasUserPrompt: Boolean(userPrompt),
    },
    "runRefine: start",
  );

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

      // Resolve output schema: explicit outputSchema wins, then entity field schema.
      // Strip optional/nullable/default wrappers so the model is required to
      // produce a value — otherwise OpenAI's structured-output mode will
      // legally return `{ value: null }` and we surface that as "no value".
      const rawSchema =
        fieldConfig.outputSchema ?? extractFieldSchema(contract.schema, field) ?? z.unknown();
      const outputSchema = requireValueSchema(rawSchema);

      const ctx: PromptContext<S, Source> = {
        currentData: dataAsRecord as z.infer<S>,
        sourceContext: sourceContext as Source,
        userPrompt,
        preset,
      };

      let systemPromptStr = fieldConfig.systemPrompt(ctx);

      // A field whose prompt resolves to empty for the current context is gated
      // off — its precondition is unmet (e.g. pairings with no inventory). Skip
      // it silently so an all-fields run can include every bulk field without
      // firing wasteful, prompt-less LLM calls. This is what lets the contract
      // (not a hand-maintained target list) decide which fields actually run.
      if (!systemPromptStr.trim()) return;

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

      logger.debug(
        { op: "refine.field.start", field, model: config.model, traceId },
        `runRefine[${field}]: start`,
      );

      try {
        const model = createProvider(config, sinks?.length ? { sinks } : undefined);
        const wrappedSchema = z.object({ value: outputSchema });

        // Reinforce the wrapper-key contract in the user prompt as
        // defense-in-depth — the system prompt mentions the field name, so
        // without this the model drifts to `{ <fieldName>: ... }`. We also
        // override providerOptions to strict mode for OpenAI so the schema
        // is enforced server-side.
        const explicitPrompt =
          userPrompt ??
          `Generate the value for the "${field}" field. ` +
            `You MUST return JSON of exactly this shape: { "value": <generated content> }. ` +
            `Do not use "${field}" as the JSON key — always use "value".`;

        const { output } = await generateText({
          model,
          output: Output.object({ schema: wrappedSchema }),
          providerOptions: { ...PROVIDER_OPTIONS, openai: { strictJsonSchema: true } },
          system: systemPromptStr,
          prompt: explicitPrompt,
        });

        const value = (output as { value: unknown }).value;
        const runtimeMs = Date.now() - start;

        if (value == null) {
          logger.warn(
            { op: "refine.field.empty", field, runtimeMs, traceId, rawOutput: output },
            `runRefine[${field}]: model returned no value (rawOutput=${JSON.stringify(output)})`,
          );
          errors.set(field, {
            field,
            name: "EmptyResult",
            message: "The model returned no value for this field.",
          });
          return;
        }

        const hash = fingerprintHash({ field, value });
        const summary = summarizeValue(field, value);
        const confidence: "high" | "medium" | "low" = "medium";

        const traceSummary: TraceSummary = {
          traceId,
          model: config.model,
          runtimeMs,
          ...(preset ? { preset } : {}),
          ...(userPrompt ? { userPrompt } : {}),
        };
        traces.set(traceId, traceSummary);

        // Suppression check
        if (isSuppressed(events, field, hash)) {
          logger.debug(
            { op: "refine.field.suppressed", field, traceId, hash },
            `runRefine[${field}]: suppressed (previously rejected)`,
          );
          return;
        }

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
        logger.info(
          { op: "refine.field.success", field, runtimeMs, traceId, summary },
          `runRefine[${field}]: ok`,
        );
      } catch (err) {
        const runtimeMs = Date.now() - start;
        const error = err instanceof Error ? err : new Error(String(err));
        // ai SDK's AI_NoObjectGeneratedError attaches the raw model response
        // on `.text` and the diagnosed cause on `.cause` — surface both so
        // schema-mismatch failures show what the model actually said.
        const errDetails = err as {
          text?: string;
          cause?: unknown;
          response?: { id?: string; modelId?: string };
        };
        logger.error(
          {
            op: "refine.field.error",
            field,
            runtimeMs,
            traceId,
            err: { name: error.name, message: error.message, stack: error.stack },
            rawText: errDetails.text,
            cause: errDetails.cause,
            response: errDetails.response,
          },
          `runRefine[${field}]: failed — ${error.message}`,
        );
        errors.set(field, {
          field,
          name: error.name,
          message: error.message,
          cause: err,
        });
        if (errorMode === "throw") throw err;
      }
    }),
  );

  const totalMs = Date.now() - runStart;
  logger.info(
    {
      op: "refine.end",
      totalMs,
      suggestions: suggestions.size,
      autoApplied: autoApplied.size,
      errors: errors.size,
    },
    `runRefine: end (${suggestions.size} suggestions, ${errors.size} errors, ${totalMs}ms)`,
  );

  return { suggestions, autoApplied, traces, errors };
}
