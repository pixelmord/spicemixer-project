import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { TraceEvent } from "../src/trace/sinks/types.ts";

export type TraceRecord = TraceEvent;

export function hashPrompt(prompt: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(prompt)));
}

/**
 * Reads .ai-trace/*.jsonl, indexes records by sha256 of params.prompt.
 * Replaces evalite's wrapAISDKModel cache (evalite 0.19 pins @ai-sdk/provider@^2).
 */
export class JsonlCache {
  private index = new Map<string, TraceRecord>();
  private loaded = false;

  constructor(private readonly dir = ".ai-trace") {}

  private async loadOnce(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      let text: string;
      try {
        text = await readFile(join(this.dir, file), "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed) as TraceRecord;
          const prompt = record.params?.prompt;
          if (typeof prompt === "string") {
            const key = hashPrompt(prompt);
            if (!this.index.has(key)) {
              this.index.set(key, record);
            }
          }
        } catch {
          // malformed line — skip, do not crash
        }
      }
    }
  }

  async lookup(inputHash: string): Promise<TraceRecord | null> {
    await this.loadOnce();
    return this.index.get(inputHash) ?? null;
  }
}
