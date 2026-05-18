// Re-export shim: delegates to the canonical ALS in @pixelmord/content-ai-core.
// Consumers can keep using `runWithOrigin` and the curried `withOrigin(config)` form
// unchanged; both now operate on the single shared originContext.
export type { Origin, OriginConfig } from "@pixelmord/content-ai-core";

export { getCurrentOrigin } from "@pixelmord/content-ai-core";

// runWithOrigin(origin, fn) is the old name for core's withOrigin(origin, fn)
export { withOrigin as runWithOrigin } from "@pixelmord/content-ai-core";

// withOrigin(config) is the old curried-factory name for core's wrapWithOrigin(config)
export { wrapWithOrigin as withOrigin } from "@pixelmord/content-ai-core";
