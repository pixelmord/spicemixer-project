import { generateText, Output } from "ai";
import type { ZodSchema } from "zod";
import { hashSuggestion } from "./hash.ts";
import { createProvider, PROVIDER_OPTIONS } from "./provider.ts";
import type {
  AppliedSuggestion,
  FieldSuggestion,
  FieldWritePolicy,
  IngestAiEvent,
  RunFillParams,
  RunFillResult,
  TraceSummary,
} from "./types.ts";

function resolvePolicy(
  field: string,
  {
    currentData,
    writePolicy,
    fieldPolicies,
    contractFieldPolicy,
  }: {
    currentData?: Record<string, unknown>;
    writePolicy?: FieldWritePolicy;
    fieldPolicies?: Record<string, FieldWritePolicy>;
    contractFieldPolicy?: FieldWritePolicy;
  },
): FieldWritePolicy {
  return (
    fieldPolicies?.[field] ??
    writePolicy ??
    contractFieldPolicy ??
    (currentData !== undefined ? "fill-if-empty" : "replace")
  );
}

function shouldSkipField(
  field: string,
  currentData: Record<string, unknown> | undefined,
  policy: FieldWritePolicy,
): boolean {
  if (currentData === undefined) return false;
  if (currentData[field] == null) return false;
  return policy === "preserve" || policy === "fill-if-empty";
}

function summarizeFieldValue(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 80);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value as object).join(", ")}}`;
  return String(value);
}

export async function runFill<S extends ZodSchema, Source>(
  params: RunFillParams<S, Source>,
): Promise<RunFillResult> {
  const { contract, sourceContext, config, currentData, userPrompt, writePolicy, fieldPolicies } =
    params;

  const { messages, prompt, warnings = [] } = await contract.buildMessages(sourceContext);

  const skipSet = new Set<string>();
  if (currentData !== undefined) {
    const schemaObj = contract.schema as { shape?: Record<string, unknown> };
    const fieldKeys = schemaObj.shape ? Object.keys(schemaObj.shape) : [];
    for (const field of fieldKeys) {
      const policy = resolvePolicy(field, {
        currentData,
        writePolicy,
        fieldPolicies,
        contractFieldPolicy: contract.fieldPolicies?.[field],
      });
      if (shouldSkipField(field, currentData, policy)) {
        skipSet.add(field);
      }
    }
  }

  const model = createProvider(config);
  const traceId = crypto.randomUUID();
  const start = Date.now();

  const effectivePrompt = userPrompt
    ? `${prompt ?? ""}\n\nAdditional instructions: ${userPrompt}`.trim()
    : prompt;

  const sharedArgs = {
    model,
    output: Output.object({ schema: contract.schema }),
    providerOptions: PROVIDER_OPTIONS,
    system: contract.systemPrompt,
  } as const;

  const result = await (messages
    ? generateText({ ...sharedArgs, messages })
    : generateText({ ...sharedArgs, prompt: effectivePrompt ?? "" }));
  const rawOutput = result.output as Record<string, unknown>;

  const runtimeMs = Date.now() - start;

  const suggestions = new Map<string, FieldSuggestion>();
  for (const [field, value] of Object.entries(rawOutput)) {
    if (skipSet.has(field)) continue;
    if (value === undefined || value === null) continue;

    const hash = hashSuggestion({ field, value });
    suggestions.set(field, {
      kind: "single",
      value,
      confidence: "medium",
      summary: `${field}: ${summarizeFieldValue(value)}`,
      hash,
      traceId,
    });
  }

  const autoApplied = new Map<string, AppliedSuggestion>();

  const traces = new Map<string, TraceSummary>();
  traces.set(traceId, {
    traceId,
    model: config.model,
    runtimeMs,
    ...(params.preset ? { preset: params.preset } : {}),
    ...(userPrompt ? { userPrompt } : {}),
  });

  const ingestedEvent: IngestAiEvent = {
    type: "ingested",
    at: new Date().toISOString(),
    model: config.model,
    suggestion: {
      hash: hashSuggestion(rawOutput),
      summary: `Fill: ${suggestions.size} field${suggestions.size !== 1 ? "s" : ""} proposed`,
    },
    traceId,
  };

  return { suggestions, autoApplied, traces, ingestedEvent, warnings };
}
