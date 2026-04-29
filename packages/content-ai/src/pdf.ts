import { createRequire } from "node:module";
import { AiError } from "./errors.ts";

export interface PdfTextResult {
  text: string;
  pageCount: number;
}

export interface PdfFileResult {
  bytes: Uint8Array;
  pageCount: number;
}

export type PdfContent = ({ kind: "text" } & PdfTextResult) | ({ kind: "file" } & PdfFileResult);

const SPARSE_TEXT_THRESHOLD = 50;

export async function extractTextFromPdf(bytes: Uint8Array): Promise<PdfTextResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const require = createRequire(import.meta.url);
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
  }

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    doc = await pdfjs.getDocument({
      data: bytes,
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    throw new AiError("PDF_PARSE_FAILED", `Failed to parse PDF: ${String(e)}`);
  }

  const pageCount = doc.numPages;
  const pages: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push(pageText);
  }

  return { text: pages.join("\n\n"), pageCount };
}

/**
 * Try text extraction. If the PDF has no meaningful text (scanned/image-only),
 * return the raw PDF bytes for vision-model processing instead.
 */
export async function extractPdfContent(bytes: Uint8Array): Promise<PdfContent> {
  const result = await extractTextFromPdf(bytes);
  if (result.text.trim().length >= SPARSE_TEXT_THRESHOLD) {
    return { kind: "text", ...result };
  }
  return { kind: "file", bytes, pageCount: result.pageCount };
}
