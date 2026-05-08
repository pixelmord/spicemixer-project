import { extractJsonLd } from "./extract.ts";
import { findRecipe } from "./find-recipe.ts";
import { normalizeRecipe } from "./normalize/index.ts";
import { IngestError } from "./errors.ts";
import { resolveLanguage } from "./util/language.ts";
import type { FetchOptions, IngestResult } from "./types.ts";

const DEFAULT_UA = "spicemixer-recipe-ingest/0.1";
const DEFAULT_TIMEOUT_MS = 15_000;

function extractMeta(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const m = re.exec(html);
  return m?.[1] ?? m?.[2];
}

function extractCanonical(html: string): string | undefined {
  const m =
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html) ??
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i.exec(html);
  return m?.[1];
}

/**
 * Fetch a URL and return a normalized recipe.
 * Throws IngestError on network failure, timeout, missing JSON-LD, or validation error.
 */
export async function fetchRecipe(url: string, opts: FetchOptions = {}): Promise<IngestResult> {
  const {
    fetch: fetchFn = globalThis.fetch,
    headers = {},
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  let html: string;
  try {
    const res = await fetchFn(url, {
      signal: combinedSignal,
      headers: { "User-Agent": DEFAULT_UA, ...headers },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new IngestError("FETCH_FAILED", `HTTP ${res.status} fetching ${url}`);
    }
    html = await res.text();
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof IngestError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new IngestError("TIMEOUT", `Request timed out after ${timeoutMs}ms`, err);
    }
    throw new IngestError("FETCH_FAILED", `Failed to fetch ${url}: ${String(err)}`, err);
  }
  clearTimeout(timer);

  const canonical = extractCanonical(html);
  const siteName = extractMeta(html, "og:site_name");
  const fetchedAt = new Date().toISOString();

  const jsonLd = extractJsonLd(html);
  if (jsonLd.length === 0) {
    throw new IngestError("NO_JSONLD", `No JSON-LD found at ${url}`);
  }

  const rawRecipe = findRecipe(jsonLd);
  if (!rawRecipe) {
    throw new IngestError("NO_RECIPE", `No Recipe entity found in JSON-LD at ${url}`);
  }

  const { recipe, warnings } = normalizeRecipe(rawRecipe, url, jsonLd);

  const language = resolveLanguage((rawRecipe as Record<string, unknown>)["inLanguage"], html);

  return {
    recipe,
    source: { url, canonical, siteName, fetchedAt },
    warnings,
    language,
  };
}
