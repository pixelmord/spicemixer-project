import { z } from "zod";

export const binaryMetaSchema = z.object({
  kind: z.enum(["pdf", "image", "text"]),
  mime: z.string(),
  sizeBytes: z.number(),
  filename: z.string().optional(),
  url: z.string().optional(),
  uploadedAt: z.string(),
});

export const textMetaSchema = z.object({
  strategy: z.string(),
  version: z.string(),
  charCount: z.number(),
  pageCount: z.number().optional(),
  extractedAt: z.string(),
  parentBinaryHash: z.string(),
});

export const structuredMetaSchema = z.object({
  capability: z.string(),
  model: z.string(),
  traceId: z.string(),
  runId: z.string().optional(),
  at: z.string(),
  parentTextHash: z.string().optional(),
  parentBinaryHash: z.string().optional(),
});

export type BinaryMeta = z.infer<typeof binaryMetaSchema>;
export type TextMeta = z.infer<typeof textMetaSchema>;
export type StructuredMeta = z.infer<typeof structuredMetaSchema>;
