import { z } from "zod";
import type { FieldConfig } from "./contract.ts";

/** Zod schema for {@link TranslationBehavior}. */
export const translationBehaviorSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("translate") }),
  z.object({ mode: z.literal("copy") }),
  z.object({ mode: z.literal("localize"), instruction: z.string().optional() }),
  z.object({ mode: z.literal("skip") }),
]);

const DEFAULT_TRANSLATION = { mode: "translate" as const };

/**
 * The effective {@link TranslationBehavior} for a field config, defaulting to
 * `{ mode: "translate" }` when the field declares none.
 */
export function resolveTranslation(config: FieldConfig | undefined) {
  return config?.translation ?? DEFAULT_TRANSLATION;
}
