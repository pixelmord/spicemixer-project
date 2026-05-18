import type { BinaryMeta, TextMeta, StructuredMeta } from "./types.ts";

export interface SourceStore {
  putBinary(bytes: Uint8Array, meta: BinaryMeta): Promise<{ binaryHash: string }>;
  putText(
    binaryHash: string,
    strategy: string,
    version: string,
    text: string,
    meta: Omit<TextMeta, "strategy" | "version">,
  ): Promise<void>;
  putStructured(
    binaryHash: string,
    traceId: string,
    data: unknown,
    meta: Omit<StructuredMeta, "traceId">,
  ): Promise<void>;
  readBinary(binaryHash: string): Promise<Uint8Array | null>;
  listForBinary(binaryHash: string): Promise<{ texts: string[]; structured: string[] }>;
  getBinaryMeta(hash: string): Promise<BinaryMeta | undefined>;
  getTextArtifact(hash: string, strategy: string, version: string): Promise<string | undefined>;
  getStructuredArtifact(hash: string, traceId: string): Promise<unknown>;
}

export { LocalSourceStore } from "./local.ts";
export { InMemorySourceStore } from "./in-memory.ts";
export { hashBinary } from "./ids.ts";
export type { BinaryMeta, TextMeta, StructuredMeta } from "./types.ts";
export { binaryMetaSchema, textMetaSchema, structuredMetaSchema } from "./types.ts";
