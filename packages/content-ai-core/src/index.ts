export type {
  AiContract,
  FieldConfig,
  Preset,
  AutoApplyPolicy,
  PromptContext,
  TranslationBehavior,
} from "./contract.ts";

export {
  aiEventSchema,
  isPrunable,
  planPrune,
  prune,
  appendEvent,
  recordAiEvent,
  hasAutoApplied,
  sourceDescriptorSchema,
  normalizeSourceField,
} from "./events.ts";
export type { AiEvent, AiEventLog, EntityRef, SourceDescriptor } from "./events.ts";

export type {
  FieldWritePolicy,
  FieldSuggestion,
  AppliedSuggestion,
  TraceSummary,
} from "./suggestions.ts";

export { originContext, withOrigin, wrapWithOrigin, getCurrentOrigin } from "./origin.ts";
export type { Origin, OriginConfig } from "./origin.ts";

export { generateTraceId, tracingMiddleware } from "./trace.ts";
export type { TraceSink, TraceEvent, TraceFinishReason } from "./trace.ts";

export { normalizePayload, fingerprintHash, hashSuggestion, hashContent } from "./hash.ts";

export { createProvider, resolveConfig, PROVIDER_OPTIONS } from "./provider.ts";
export type { AiConfig, ProviderOptions } from "./provider.ts";

export { isSuppressed, filterSuggestions, buildRejectedContext } from "./suppression.ts";

export { AiError } from "./errors.ts";
export type { AiErrorCode, AiErrorDetails } from "./errors.ts";

export { translationBehaviorSchema, resolveTranslation } from "./translation.ts";

export { diffFieldHashes, classifyRefreshKind } from "./field-diff.ts";
export type { RefreshKind } from "./field-diff.ts";

// Note: testing utilities (createMockLanguageModel, MockLanguageModelV3) live
// at `@pixelmord/content-ai-core/testing` and are intentionally NOT re-exported
// here — they pull `ai/test` which transitively imports `node:async_hooks`,
// poisoning client bundles when components reach this barrel.
