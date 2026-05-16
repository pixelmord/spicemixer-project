export { resolveConfig, createProvider } from "./provider.ts";
export type { AiConfig } from "./provider.ts";

export { extractRecipeFromFile } from "./extract-recipe.ts";
export type { RecipeFileInput, RecipeExtractionResult, ExtractOptions } from "./extract-recipe.ts";

export type { AiDebugInfo } from "./debug.ts";

export { extractIngredientFromFile } from "./extract-ingredient.ts";
export type { IngredientFileInput, IngredientExtractionResult } from "./extract-ingredient.ts";

export {
  proposeIngredientLinks,
  proposeTags,
  proposeRecipeImprovements,
  proposeRecipeTranslation,
  detectLanguage,
  proposeRelations,
  proposeSlug,
} from "./curate-recipe.ts";
export type {
  RecipeSnapshot,
  IngredientLinkProposal,
  TagProposal,
  ImprovementProposal,
  TranslationDraft,
  RelationProposal,
} from "./curate-recipe.ts";

export {
  proposeIngredientPairings,
  proposeIngredientImprovements,
  proposeIngredientTranslation,
} from "./curate-ingredient.ts";
export type { IngredientSnapshot, PairingProposal } from "./curate-ingredient.ts";

export { mergeIngredient } from "./merge-ingredient.ts";
export type {
  MergeIngredientSource,
  MergeIngredientInput,
  MergeIngredientResult,
} from "./merge-ingredient.ts";

export { proposePairingImprovements, proposePairingTranslation } from "./curate-pairing.ts";
export type { PairingSnapshot } from "./curate-pairing.ts";

export { extractPairingFromFile } from "./extract-pairing.ts";
export type { PairingFileInput, PairingExtractionResult } from "./extract-pairing.ts";

export { mergePairing } from "./merge-pairing.ts";
export type { MergePairingSource, MergePairingInput, MergePairingResult } from "./merge-pairing.ts";

export type { PairingExtract } from "./schemas/pairing-extract.ts";

export type { RecipeExtract } from "./schemas/recipe-extract.ts";
export type { IngredientExtract } from "./schemas/ingredient-extract.ts";

export { generateRecipeFromPrompt } from "./generate-recipe.ts";
export type { GenerateRecipeInput, GenerateRecipeResult } from "./generate-recipe.ts";

export { mergeRecipe } from "./merge-recipe.ts";
export type { MergeSource, MergeRecipeInput, MergeRecipeResult } from "./merge-recipe.ts";

export { AiError } from "./errors.ts";
export type { AiErrorCode, AiErrorDetails } from "./errors.ts";

export { SidecarEventLog, createAiEventLog } from "./event-log.ts";
export type {
  AiEventLog,
  AiEventSidecar,
  MetaRef,
  FingerprintInputs,
  SkipResult,
} from "./event-log.ts";

export { searchImages } from "./search-images.ts";
export type { ImageResult, SearchImagesOptions } from "./search-images.ts";

export { aiEventSchema } from "./schemas/ai-events.ts";
export type { AiEvent } from "./schemas/ai-events.ts";

export { normalizePayload, hashSuggestion, hashContent } from "./hash.ts";

export { ALLOWLIST, isAllowedAutoApply, assertAutoApplyAllowed } from "./auto-apply.ts";
export type { AutoApplyKind, Confidence } from "./auto-apply.ts";

export {
  isPrunable,
  planPrune,
  prune,
  isSuppressed,
  filterSuggestions,
  appendEvent,
  recordAiEvent,
  hasAutoApplied,
  buildRejectedContext,
} from "./events.ts";

export { runCurate, CURATE_REGISTRY } from "./run-curate.ts";
export type { EntityKind, CurateOp } from "./run-curate.ts";

export {
  runWithOrigin,
  getCurrentOrigin,
  withOrigin,
  tracingMiddleware,
  FileTraceSink,
  PubSubTraceSink,
} from "./trace/index.ts";
export type { Origin, OriginConfig, TraceSink, TraceEvent } from "./trace/index.ts";

export { LocalSourceStore, InMemorySourceStore, hashBinary } from "./source-store/index.ts";
export type { SourceStore, BinaryMeta, TextMeta, StructuredMeta } from "./source-store/index.ts";
export { binaryMetaSchema, textMetaSchema, structuredMetaSchema } from "./source-store/index.ts";
export type { SourceDescriptor } from "./schemas/ai-events.ts";
export { sourceDescriptorSchema, normalizeSourceField } from "./schemas/ai-events.ts";

export { extractPdfContent } from "./pdf.ts";
export type { PdfContent, PdfTextResult, PdfFileResult } from "./pdf.ts";

export { subscribe, publish } from "./pubsub.ts";
export type { PubSubEvent } from "./pubsub.ts";

export { translationBehaviorSchema, resolveTranslation } from "./translation.ts";
export type { TranslationBehavior, FieldConfig } from "./translation.ts";

export { diffFieldHashes, classifyRefreshKind } from "./field-diff.ts";
export type { RefreshKind } from "./field-diff.ts";

export { ingredientFieldConfig, recipeFieldConfig, pairingFieldConfig } from "./contracts/index.ts";

export { entityMeta, entityMetaSchema } from "./entity-meta.ts";
export type { EntityMeta, EntityMetaSidecar, EntityMetaRef } from "./entity-meta.ts";
