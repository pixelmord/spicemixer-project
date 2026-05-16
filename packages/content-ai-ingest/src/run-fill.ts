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
  const resolved =
    fieldPolicies?.[field] ??
    writePolicy ??
    contractFieldPolicy ??
    (currentData !== undefined ? "fill-if-empty" : "replace");
  return resolved;
}

function shouldSkipField(
  field: string,
  currentData: Record<string, unknown> | undefined,
  policy: FieldWritePolicy,
): boolean {
  if (currentData === undefined) return false;
  const hasValue = currentData[field] !== undefined && currentData[field] !== null;
  if (!hasValue) return false;
  if (policy === "preserve") return true;
  if (policy === "fill-if-empty") return true;
  return false;
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

  // 1. Build messages from source context
  const { messages, prompt, warnings = [] } = await contract.buildMessages(sourceContext);

  // 2. Determine which fields to skip before making the LLM call
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

  // 3. Call the LLM with structured output
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

  // 4. Convert to Map<FieldPath, FieldSuggestion>, respecting write policies
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

  // 5. Auto-apply: none at this stage (requires AiEventLog integration)
  const autoApplied = new Map<string, AppliedSuggestion>();

  // 6. Trace summary
  const traces = new Map<string, TraceSummary>();
  traces.set(traceId, {
    traceId,
    model: config.model,
    runtimeMs,
    ...(params.preset ? { preset: params.preset } : {}),
    ...(userPrompt ? { userPrompt } : {}),
  });

  // 7. Ingested event
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
