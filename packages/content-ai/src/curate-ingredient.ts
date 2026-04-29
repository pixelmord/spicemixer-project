import { generateText, Output } from "ai";
import { z } from "zod";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { AiError } from "./errors.ts";
import type { ImprovementProposal, TranslationDraft } from "./curate-recipe.ts";

export interface IngredientSnapshot {
  name: string;
  summary?: string;
  description?: string;
  category?: string;
  origin?: string[];
  flavorNotes?: string[];
}

export type { ImprovementProposal, TranslationDraft };

export interface PairingProposal {
  slug: string;
  note?: string;
}

export async function proposeIngredientPairings(
  ingredient: IngredientSnapshot,
  inventory: Array<{ slug: string; name: string }>,
  config: AiConfig,
): Promise<PairingProposal[]> {
  if (!inventory.length) return [];

  const model = createProvider(config);
  const inventoryList = inventory.map((i) => `${i.slug}: ${i.name}`).join("\n");

  const schema = z.object({
    pairings: z.array(
      z.object({
        slug: z.string(),
        note: z.string().optional(),
      }),
    ),
  });

  const context = [
    `Name: ${ingredient.name}`,
    ingredient.category ? `Category: ${ingredient.category}` : null,
    ingredient.flavorNotes?.length ? `Flavor notes: ${ingredient.flavorNotes.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Suggest ingredient pairings for this spice/ingredient. Only select slugs from the inventory.

Ingredient:
${context}

Inventory (slug: name):
${inventoryList}

Return up to 6 pairings with optional short pairing notes (e.g. "great in chai", "balances the heat").`,
    });
    return output.pairings;
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Pairing proposal failed: ${String(e)}`);
  }
}

export async function proposeIngredientImprovements(
  ingredient: IngredientSnapshot,
  missingFields: string[],
  config: AiConfig,
): Promise<ImprovementProposal> {
  if (!missingFields.length) return { fields: [] };

  const model = createProvider(config);

  const schema = z.object({
    fields: z.array(
      z.object({
        field: z.string(),
        suggestion: z.string(),
        rationale: z.string(),
      }),
    ),
  });

  const context = [
    `Name: ${ingredient.name}`,
    ingredient.category ? `Category: ${ingredient.category}` : null,
    ingredient.flavorNotes?.length ? `Flavor notes: ${ingredient.flavorNotes.join(", ")}` : null,
    ingredient.origin?.length ? `Origins: ${ingredient.origin.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Suggest values for the missing fields of this ingredient.

Ingredient:
${context}

Missing fields: ${missingFields.join(", ")}

For each field, provide a suggested value and a one-sentence rationale.`,
    });
    return output;
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Improvement proposal failed: ${String(e)}`);
  }
}

export async function proposeIngredientTranslation(
  ingredient: IngredientSnapshot,
  sourceLocale: string,
  targetLocale: string,
  config: AiConfig,
): Promise<TranslationDraft> {
  const model = createProvider(config);

  const fieldsToTranslate: Record<string, string> = {};
  if (ingredient.name) fieldsToTranslate["name"] = ingredient.name;
  if (ingredient.summary) fieldsToTranslate["summary"] = ingredient.summary;
  if (ingredient.description) fieldsToTranslate["description"] = ingredient.description;

  if (!Object.keys(fieldsToTranslate).length) {
    return { targetLocale, fields: {} };
  }

  const schema = z.object({ fields: z.record(z.string(), z.string()) });

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Translate the following ingredient fields from ${sourceLocale} to ${targetLocale}. Return a JSON object with the same keys and translated values.

Fields to translate:
${JSON.stringify(fieldsToTranslate, null, 2)}`,
    });
    return { targetLocale, fields: output.fields };
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Translation failed: ${String(e)}`);
  }
}
