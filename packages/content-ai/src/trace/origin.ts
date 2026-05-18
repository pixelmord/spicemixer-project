// Re-export shim — keeps old names while the canonical ALS lives in content-ai-core.
export type { Origin, OriginConfig } from "@pixelmord/content-ai-core";
export { getCurrentOrigin } from "@pixelmord/content-ai-core";
export { withOrigin as runWithOrigin } from "@pixelmord/content-ai-core";
export { wrapWithOrigin as withOrigin } from "@pixelmord/content-ai-core";
