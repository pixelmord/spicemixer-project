import { generateText, Output } from "ai";
import type { ZodSchema } from "zod";
import { noopLogger, type Logger } from "@pixelmord/content-ai-core";
import type { TraceSink } from "@pixelmord/content-ai-core/server";
import { hashSuggestion } from "./hash.ts";
import { createProvider, PROVIDER_OPTIONS } from "./provider.ts";
import type {
  AiConfig,
  AppliedSuggestion,
  FieldSuggestion,
  FieldWritePolicy,
  IngestAiEvent,
  MessageSet,
  RunFillParams,
  RunFillResult,
  SiblingLocaleSource,
  TraceSummary,
  TranslationBehavior,
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

function isSiblingLocaleSource(source: unknown): source is SiblingLocaleSource {
  return (
    typeof source === "object" &&
    source !== null &&
    (source as Record<string, unknown>).kind === "sibling-locale"
  );
}

const DEFAULT_TRANSLATION: TranslationBehavior = { mode: "translate" };

function resolveTranslationMode(
  fieldConfig: { translation?: TranslationBehavior } | undefined,
): TranslationBehavior {
  return fieldConfig?.translation ?? DEFAULT_TRANSLATION;
}

async function callLlm(
  schema: ZodSchema,
  systemPrompt: string,
  config: AiConfig,
  messageSet: MessageSet,
  userPrompt?: string,
  sinks?: TraceSink[],
  logger: Logger = noopLogger,
): Promise<Record<string, unknown>> {
  const model = createProvider(config, sinks?.length ? { sinks } : undefined);
  const effectivePrompt = userPrompt
    ? `${messageSet.prompt ?? ""}\n\nAdditional instructions: ${userPrompt}`.trim()
    : messageSet.prompt;
  const sharedArgs = {
    model,
    output: Output.object({ schema }),
    providerOptions: PROVIDER_OPTIONS,
    system: systemPrompt,
  } as const;
  const start = Date.now();
  logger.debug(
    { op: "fill.llm.start", model: config.model, hasMessages: Boolean(messageSet.messages) },
    "runFill: llm call start",
  );
  try {
    const result = await (messageSet.messages
      ? generateText({ ...sharedArgs, messages: messageSet.messages })
      : generateText({ ...sharedArgs, prompt: effectivePrompt ?? "" }));
    logger.info(
      { op: "fill.llm.success", model: config.model, runtimeMs: Date.now() - start },
      `runFill: llm ok (${Date.now() - start}ms)`,
    );
    return result.output as Record<string, unknown>;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        op: "fill.llm.error",
        model: config.model,
        runtimeMs: Date.now() - start,
        err: { name: error.name, message: error.message, stack: error.stack },
      },
      `runFill: llm failed — ${error.message}`,
    );
    throw err;
  }
}

export async function runFill<S extends ZodSchema, Source>(
  params: RunFillParams<S, Source>,
): Promise<RunFillResult> {
  const { contract, sourceContext, config, userPrompt, logger = noopLogger } = params;
  logger.info(
    {
      op: "fill.start",
      model: config.model,
      hasUserPrompt: Boolean(userPrompt),
      sourceKind: isSiblingLocaleSource(sourceContext) ? "sibling-locale" : "external",
    },
    "runFill: start",
  );

  if (isSiblingLocaleSource(sourceContext)) {
    const schemaObj = contract.schema as { shape?: Record<string, unknown> };
    const fieldKeys = schemaObj.shape ? Object.keys(schemaObj.shape) : [];

    const llmFields: string[] = [];
    const copyFields: string[] = [];

    for (const field of fieldKeys) {
      const mode = resolveTranslationMode(contract.fieldConfigs?.[field]);
      if (mode.mode === "skip") continue;
      if (mode.mode === "copy") {
        copyFields.push(field);
      } else {
        llmFields.push(field);
      }
    }

    const suggestions = new Map<string, FieldSuggestion>();
    const autoApplied = new Map<string, AppliedSuggestion>();
    const traces = new Map<string, TraceSummary>();
    const traceId = crypto.randomUUID();
    const start = Date.now();
    const warnings: string[] = [];

    for (const field of copyFields) {
      const value = (sourceContext.sourceData as Record<string, unknown>)[field];
      if (value == null) continue;
      const hash = hashSuggestion({ field, value });
      suggestions.set(field, {
        kind: "single",
        value,
        confidence: "high",
        summary: `${field}: ${summarizeFieldValue(value)}`,
        hash,
        traceId,
      });
    }

    if (llmFields.length > 0) {
      const {
        messages,
        prompt,
        warnings: msgWarnings = [],
      } = await contract.buildMessages(sourceContext);
      warnings.push(...msgWarnings);

      const rawOutput = await callLlm(
        contract.schema,
        contract.systemPrompt,
        config,
        { messages, prompt },
        userPrompt,
        params.sinks,
        logger,
      );

      for (const field of llmFields) {
        const value = rawOutput[field];
        if (value == null) continue;
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
    }

    const runtimeMs = Date.now() - start;
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
        hash: hashSuggestion(Object.fromEntries(suggestions)),
        summary: `Fill: ${suggestions.size} field${suggestions.size !== 1 ? "s" : ""} proposed`,
      },
      traceId,
    };

    if (warnings.length > 0) {
      logger.warn(
        { op: "fill.warnings", warnings },
        `runFill: ${warnings.length} warning(s) from buildMessages`,
      );
    }
    logger.info(
      {
        op: "fill.end",
        suggestions: suggestions.size,
        autoApplied: autoApplied.size,
        runtimeMs,
      },
      `runFill: end (${suggestions.size} suggestions, ${runtimeMs}ms)`,
    );

    return { suggestions, autoApplied, traces, ingestedEvent, warnings };
  }

  const { currentData, writePolicy, fieldPolicies } = params;
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

  const traceId = crypto.randomUUID();
  const start = Date.now();

  const rawOutput = await callLlm(
    contract.schema,
    contract.systemPrompt,
    config,
    { messages, prompt },
    userPrompt,
    params.sinks,
    logger,
  );

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

  if (warnings.length > 0) {
    logger.warn(
      { op: "fill.warnings", warnings },
      `runFill: ${warnings.length} warning(s) from buildMessages`,
    );
  }
  logger.info(
    { op: "fill.end", suggestions: suggestions.size, runtimeMs },
    `runFill: end (${suggestions.size} suggestions, ${runtimeMs}ms)`,
  );

  return { suggestions, autoApplied, traces, ingestedEvent, warnings };
}
