import type { SourceStore } from "./index.ts";
import type { BinaryMeta, TextMeta, StructuredMeta } from "./types.ts";
import { hashBinary } from "./ids.ts";

export class InMemorySourceStore implements SourceStore {
  #binaries = new Map<string, Uint8Array>();
  #binaryMeta = new Map<string, BinaryMeta>();
  #texts = new Map<string, string>();
  #textMeta = new Map<string, TextMeta>();
  #structured = new Map<string, unknown>();
  #structuredMeta = new Map<string, StructuredMeta>();

  #textKey(hash: string, strategy: string, version: string): string {
    return `${hash}::${strategy}-${version}`;
  }

  #structuredKey(hash: string, traceId: string): string {
    return `${hash}::${traceId}`;
  }

  async putBinary(bytes: Uint8Array, meta: BinaryMeta): Promise<{ binaryHash: string }> {
    const binaryHash = hashBinary(bytes);
    if (!this.#binaries.has(binaryHash)) {
      this.#binaries.set(binaryHash, bytes);
    }
    this.#binaryMeta.set(binaryHash, meta);
    return { binaryHash };
  }

  async putText(
    binaryHash: string,
    strategy: string,
    version: string,
    text: string,
    meta: Omit<TextMeta, "strategy" | "version">,
  ): Promise<void> {
    const key = this.#textKey(binaryHash, strategy, version);
    this.#texts.set(key, text);
    this.#textMeta.set(key, { ...meta, strategy, version });
  }

  async putStructured(
    binaryHash: string,
    traceId: string,
    data: unknown,
    meta: Omit<StructuredMeta, "traceId">,
  ): Promise<void> {
    const key = this.#structuredKey(binaryHash, traceId);
    this.#structured.set(key, data);
    this.#structuredMeta.set(key, { ...meta, traceId });
  }

  async readBinary(binaryHash: string): Promise<Uint8Array | null> {
    return this.#binaries.get(binaryHash) ?? null;
  }

  async listForBinary(binaryHash: string): Promise<{ texts: string[]; structured: string[] }> {
    const prefix = `${binaryHash}::`;
    const texts: string[] = [];
    for (const key of this.#texts.keys()) {
      if (key.startsWith(prefix)) {
        texts.push(key.slice(prefix.length));
      }
    }
    const structured: string[] = [];
    for (const key of this.#structured.keys()) {
      if (key.startsWith(prefix)) {
        structured.push(key.slice(prefix.length));
      }
    }
    return { texts, structured };
  }

  async getBinaryMeta(hash: string): Promise<BinaryMeta | undefined> {
    return this.#binaryMeta.get(hash);
  }

  async getTextArtifact(
    hash: string,
    strategy: string,
    version: string,
  ): Promise<string | undefined> {
    return this.#texts.get(this.#textKey(hash, strategy, version));
  }

  async getStructuredArtifact(hash: string, traceId: string): Promise<unknown> {
    return this.#structured.get(this.#structuredKey(hash, traceId));
  }
}
