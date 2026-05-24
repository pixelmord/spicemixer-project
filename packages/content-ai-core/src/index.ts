export type {
  AiContract,
  FieldConfig,
  FieldPath,
  Preset,
  AutoApplyPolicy,
  PromptContext,
  RejectedSuggestion,
  ResolvedPreset,
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

export { normalizePayload, fingerprintHash, hashSuggestion, hashContent } from "./hash.ts";

export type { AiConfig, ProviderOptions } from "./provider.ts";

export { isSuppressed, filterSuggestions, buildRejectedContext } from "./suppression.ts";

export { AiError } from "./errors.ts";
export type { AiErrorCode, AiErrorDetails } from "./errors.ts";

export { noopLogger, createConsoleLogger } from "./logger.ts";
export type { Logger, LogFn, LogLevel } from "./logger.ts";

export { translationBehaviorSchema, resolveTranslation } from "./translation.ts";

export { diffFieldHashes, classifyRefreshKind } from "./field-diff.ts";
export type { RefreshKind } from "./field-diff.ts";

// Note: server-only exports (origin/ALS, tracing middleware) live at
// `@pixelmord/content-ai-core/server` — they use `node:async_hooks` which
// cannot be bundled for the browser.
// Testing utilities live at `@pixelmord/content-ai-core/testing` for the same reason.
