import { z } from "zod";
import type { FieldConfig } from "./contract.ts";

export const translationBehaviorSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("translate") }),
  z.object({ mode: z.literal("copy") }),
  z.object({ mode: z.literal("localize"), instruction: z.string().optional() }),
  z.object({ mode: z.literal("skip") }),
]);

const DEFAULT_TRANSLATION = { mode: "translate" as const };

export function resolveTranslation(config: FieldConfig | undefined) {
  return config?.translation ?? DEFAULT_TRANSLATION;
}
