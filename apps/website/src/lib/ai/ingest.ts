import { runFill, type AiConfig, type IngestContract } from "@pixelmord/content-ai-ingest";
import type { ZodSchema } from "zod";
import { extractPdfContent } from "@/lib/pdf.ts";

/** Canonical warning when a PDF has no extractable text and must go to a vision model. */
export const SCANNED_PDF_WARNING =
  "PDF appears to be a scanned image. Sending to vision model for OCR — requires a vision-capable model (e.g. gpt-4o).";

const LARGE_PDF_PAGE_LIMIT = 20;

export type ResolvedPdf =
  | { kind: "text"; content: string }
  | { kind: "pdf-vision"; bytes: Uint8Array };

/**
 * Resolve PDF bytes for ingestion: extract text when present, otherwise hand the
 * raw bytes to a vision model. `warnLargePdf` opts into the page-count warning
 * (recipe extraction only).
 */
export async function resolvePdf(
  bytes: Uint8Array,
  options: { warnLargePdf?: boolean } = {},
): Promise<{ resolved: ResolvedPdf; warnings: string[] }> {
  const warnings: string[] = [];
  const content = await extractPdfContent(bytes);

  if (content.kind === "text") {
    if (options.warnLargePdf && content.pageCount > LARGE_PDF_PAGE_LIMIT) {
      warnings.push(`PDF has ${content.pageCount} pages — only first pages were processed`);
    }
    return { resolved: { kind: "text", content: content.text }, warnings };
  }

  warnings.push(SCANNED_PDF_WARNING);
  return { resolved: { kind: "pdf-vision", bytes }, warnings };
}

/**
 * Run a fill against an ingest contract and collapse its single-valued
 * suggestions into a plain fields record. Shared by every extract/merge entry.
 */
export async function ingestFields<S extends ZodSchema, Source>(
  contract: IngestContract<S, Source>,
  sourceContext: Source,
  config: AiConfig,
): Promise<{ fields: Record<string, unknown>; warnings: string[] }> {
  const result = await runFill({ contract, sourceContext, config });

  const fields: Record<string, unknown> = {};
  for (const [field, suggestion] of result.suggestions) {
    if (suggestion.kind === "single") fields[field] = suggestion.value;
  }

  return { fields, warnings: result.warnings };
}
