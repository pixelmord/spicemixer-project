import type { Recipe } from "./schema.ts";

export type { Recipe };

export interface IngestWarning {
  code: string;
  field?: string;
  message: string;
}

export interface IngestSource {
  url: string;
  canonical?: string;
  siteName?: string;
  fetchedAt: string;
}

export interface IngestResult {
  recipe: Recipe;
  source: IngestSource;
  warnings: IngestWarning[];
  /** BCP-47 language tag detected from JSON-LD inLanguage field, e.g. "en", "de". */
  language?: string;
}

export interface FetchOptions {
  /** Injectable fetch function — useful for tests or server-side rendering contexts. */
  fetch?: typeof globalThis.fetch;
  /** Extra request headers. Merged with the default User-Agent header. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Request timeout in milliseconds. Defaults to 15 000. */
  timeoutMs?: number;
}
