import { actions } from "astro:actions";
import { readSSE } from "@/lib/sse.ts";
import type { SourceShape } from "@/components/admin/FileTextPromptSourcePicker.tsx";

export type ContentType = "recipe" | "ingredient" | "pairing";
export type RecipeCollection = "recipes" | "mixtures";
export type Locale = "en" | "de";

interface AiDebugInfo {
  modelId?: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  rawText?: string;
}

export interface SourceMeta {
  kind: "pdf" | "image" | "text";
  mime: string;
  sizeBytes: number;
  filename?: string;
  hash: string;
  ingestedAt: string;
  traceId: string;
}

export interface ImportResult {
  result: Record<string, unknown>;
  warnings: string[];
  successMessage: string;
  debug?: AiDebugInfo;
  sourceMeta?: SourceMeta;
}

const AI_DETAILS_MARKER = "__AI_DETAILS__";

export interface ParsedActionError {
  message: string;
  details?: AiDebugInfo & { cause?: string };
}

export function parseActionError(message: string): ParsedActionError {
  const idx = message.indexOf(AI_DETAILS_MARKER);
  if (idx === -1) return { message };
  const head = message.slice(0, idx).trim();
  const tail = message.slice(idx + AI_DETAILS_MARKER.length);
  try {
    const details = JSON.parse(tail) as ParsedActionError["details"];
    return { message: head || "Action failed", details };
  } catch {
    return { message };
  }
}

export function buildFormData(source: SourceShape, debug?: boolean): FormData {
  const fd = new FormData();
  if (source.kind === "file") {
    fd.append("file", source.file);
    fd.append("mimeType", source.mimeType);
  } else {
    fd.append("text", source.kind === "text" ? source.content : source.prompt);
  }
  if (debug) fd.append("debug", "1");
  return fd;
}

function sourceKindFromMime(mime: string): "pdf" | "image" | "text" {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return "text";
}

function buildSourceMeta(
  source: SourceShape,
  data: { traceId?: string; binaryHash?: string },
): SourceMeta | undefined {
  if (!data.traceId || !data.binaryHash) return undefined;
  if (source.kind === "file") {
    const mime = source.mimeType;
    return {
      kind: sourceKindFromMime(mime),
      mime,
      sizeBytes: source.file.size,
      filename: source.file.name,
      hash: data.binaryHash,
      ingestedAt: new Date().toISOString(),
      traceId: data.traceId,
    };
  }
  if (source.kind === "text") {
    const bytes = new TextEncoder().encode(source.content).length;
    return {
      kind: "text",
      mime: "text/plain",
      sizeBytes: bytes,
      hash: data.binaryHash,
      ingestedAt: new Date().toISOString(),
      traceId: data.traceId,
    };
  }
  return undefined;
}

export async function generateRecipe(
  prompt: string,
  locale: Locale,
  collection: RecipeCollection,
  onPartial?: (partial: Record<string, unknown>) => void,
): Promise<ImportResult> {
  const response = await fetch("/api/ai/generate-recipe/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      locale,
      style: collection === "recipes" ? "recipe" : "mixture",
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Generation failed: ${response.statusText}`);
  }

  for await (const event of readSSE(response.body)) {
    if (event["type"] === "partial" && onPartial) {
      onPartial(event["recipe"] as Record<string, unknown>);
    } else if (event["type"] === "complete") {
      const result = event["result"] as { recipe: Record<string, unknown>; warnings: string[] };
      return {
        result: result.recipe,
        warnings: result.warnings ?? [],
        successMessage: "Recipe generated!",
      };
    } else if (event["type"] === "error") {
      const msg = typeof event["message"] === "string" ? event["message"] : "Generation failed";
      throw new Error(msg);
    }
  }

  throw new Error("Stream ended without a complete event");
}

export async function extractContent(
  contentType: ContentType,
  source: SourceShape,
  debug: boolean,
): Promise<ImportResult> {
  const formData = buildFormData(source, debug);
  if (contentType === "recipe") {
    const { data, error } = await actions.aiExtractRecipe(formData);
    if (error || !data) throw new Error(error?.message ?? "Extraction failed");
    return {
      result: data.recipe as Record<string, unknown>,
      warnings: data.warnings,
      successMessage: "Recipe extracted!",
      debug: (data as { debug?: AiDebugInfo }).debug,
      sourceMeta: buildSourceMeta(source, data),
    };
  }
  if (contentType === "ingredient") {
    const { data, error } = await actions.aiExtractIngredient(formData);
    if (error || !data) throw new Error(error?.message ?? "Extraction failed");
    return {
      result: data.ingredient as Record<string, unknown>,
      warnings: data.warnings,
      successMessage: "Ingredient extracted!",
      debug: (data as { debug?: AiDebugInfo }).debug,
      sourceMeta: buildSourceMeta(source, data),
    };
  }
  const { data, error } = await actions.aiExtractPairing(formData);
  if (error || !data) throw new Error(error?.message ?? "Extraction failed");
  return {
    result: data.pairing as Record<string, unknown>,
    warnings: data.warnings,
    successMessage: "Pairing extracted!",
    debug: (data as { debug?: AiDebugInfo }).debug,
    sourceMeta: buildSourceMeta(source, data),
  };
}

export function useImportAction(
  contentType: ContentType,
  locale: Locale,
  collection: RecipeCollection = "recipes",
  onPartial?: (partial: Record<string, unknown>) => void,
): (source: SourceShape, debug?: boolean) => Promise<ImportResult> {
  return async (source: SourceShape, debug = false) => {
    if (contentType === "recipe" && source.kind === "prompt") {
      return generateRecipe(source.prompt, locale, collection, onPartial);
    }
    return extractContent(contentType, source, debug);
  };
}
