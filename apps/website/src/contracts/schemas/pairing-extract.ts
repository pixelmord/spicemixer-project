import { z } from "zod";
import { unwrapSchemaShaped } from "./preprocess.ts";

const pairingExtractInner = z.object({
  ingredient1: z.string(),
  ingredient2: z.string(),
  description: z.string(),
});

export const pairingExtractSchema = z.preprocess(unwrapSchemaShaped, pairingExtractInner);

export type PairingExtract = z.infer<typeof pairingExtractInner>;
