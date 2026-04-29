import { z } from "zod";

export const pairingExtractSchema = z.object({
  ingredient1: z.string(),
  ingredient2: z.string(),
  description: z.string(),
});

export type PairingExtract = z.infer<typeof pairingExtractSchema>;
