import { z } from "zod";
import { aiEventSchema } from "@pixelmord/content-ai-core";

export const entityMetaSchema = z.object({
  draft: z.boolean().default(false),
  canonicalLocale: z.string().length(2).optional(),
  translationOf: z.string().optional(),
  translationStaleSince: z.string().datetime().optional(),
  canonicalContentHash: z.string().optional(),
  canonicalFieldHashes: z.record(z.string(), z.string()).optional(),
  aiEvents: z.array(aiEventSchema).default([]),
  // Per-entity map of locale → "locale/slug" tracking which locales have translations
  translations: z.record(z.string(), z.string()).optional(),
  featured: z.boolean().optional(),
  variants: z.array(z.string()).optional(),
});

export type EntityMeta = z.infer<typeof entityMetaSchema>;

/**
 * Minimal sidecar interface EntityMeta depends on. Satisfied structurally by
 * MetaSidecar from apps/website (duck typing — no import required).
 */
export interface EntityMetaSidecar {
  read(ref: EntityMetaRef): Promise<{ data: unknown } | null>;
  write(ref: EntityMetaRef, data: unknown): Promise<void>;
}

export type EntityMetaRef = {
  collection: string;
  locale?: string;
  slug: string;
};

const EMPTY_META: EntityMeta = { draft: false, aiEvents: [] };

export const entityMeta = {
  /**
   * Read and validate the meta sidecar for the given ref.
   * Returns schema defaults when no record exists or the stored data fails
   * validation (e.g. during a migration window).
   */
  async read(sidecar: EntityMetaSidecar, ref: EntityMetaRef): Promise<EntityMeta> {
    const item = await sidecar.read(ref);
    const result = entityMetaSchema.safeParse(item?.data ?? {});
    return result.success ? result.data : EMPTY_META;
  },

  /**
   * Partial-merge `partial` into the existing sidecar record. All fields not
   * present in `partial` are preserved. Extra fields beyond the EntityMeta
   * schema (e.g. kind-specific fields) are also preserved.
   */
  async merge(
    sidecar: EntityMetaSidecar,
    ref: EntityMetaRef,
    partial: Record<string, unknown>,
  ): Promise<void> {
    const item = await sidecar.read(ref);
    const existing = (item?.data as Record<string, unknown>) ?? {};
    await sidecar.write(ref, { ...existing, ...partial });
  },
};
