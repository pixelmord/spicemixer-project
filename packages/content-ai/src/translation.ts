import { z } from "zod";

export const translationBehaviorSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("translate") }),
  z.object({ mode: z.literal("copy") }),
  z.object({ mode: z.literal("localize"), instruction: z.string().optional() }),
  z.object({ mode: z.literal("skip") }),
]);

export type TranslationBehavior = z.infer<typeof translationBehaviorSchema>;

/**
 * Per-field AI configuration. When `translation` is absent, the runner
 * defaults to `{ mode: "translate" }` per PRD 10.
 */
export interface FieldConfig {
  translation?: TranslationBehavior;
}

const DEFAULT_TRANSLATION: TranslationBehavior = { mode: "translate" };

export function resolveTranslation(config: FieldConfig | undefined): TranslationBehavior {
  return config?.translation ?? DEFAULT_TRANSLATION;
}
