export type {
  AiContract,
  FieldConfig,
  FieldPath,
  Preset,
  AutoApplyPolicy,
  PromptContext,
  ResolvedPreset,
  TranslationBehavior,
} from "./contract.ts";

export {
  aiEventSchema,
  isPrunable,
  planPrune,
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

export { normalizePayload, fingerprintHash } from "./hash.ts";

export { createProvider, PROVIDER_OPTIONS } from "./provider.ts";
export type { AiConfig, ProviderOptions } from "./provider.ts";

export { isSuppressed, filterSuggestions, buildRejectedContext } from "./suppression.ts";

// Note: testing utilities (createMockLanguageModel, MockLanguageModelV3) live
// at `@pixelmord/content-ai-core/testing` and are intentionally NOT re-exported
// here — they pull `ai/test` which transitively imports `node:async_hooks`,
// poisoning client bundles when components reach this barrel.
