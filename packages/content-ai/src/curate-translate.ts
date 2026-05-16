import { generateText, Output } from "ai";
import { z } from "zod";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { AiError } from "./errors.ts";

// Translation drafts for ingredient, recipe, and pairing fields.
// Full translation flow will move to runFill (PRD 10); these remain
// until that migration is complete.

export interface TranslationDraft {
  targetLocale: string;
  fields: Record<string, string>;
}

export async function translateIngredientFields(
  ingredient: { name?: string; summary?: string; description?: string },
  sourceLocale: string,
  targetLocale: string,
  config: AiConfig,
): Promise<TranslationDraft> {
  const fieldsToTranslate: Record<string, string> = {};
  if (ingredient.name) fieldsToTranslate["name"] = ingredient.name;
  if (ingredient.summary) fieldsToTranslate["summary"] = ingredient.summary;
  if (ingredient.description) fieldsToTranslate["description"] = ingredient.description;

  if (!Object.keys(fieldsToTranslate).length) {
    return { targetLocale, fields: {} };
  }

  const model = createProvider(config);
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

export async function translateRecipeFields(
  recipe: {
    name?: string;
    description?: string;
    recipeCategory?: string;
    recipeCuisine?: string;
  },
  sourceLocale: string,
  targetLocale: string,
  config: AiConfig,
): Promise<TranslationDraft> {
  const fieldsToTranslate: Record<string, string> = {};
  if (recipe.name) fieldsToTranslate["name"] = recipe.name;
  if (recipe.description) fieldsToTranslate["description"] = recipe.description;
  if (recipe.recipeCategory) fieldsToTranslate["recipeCategory"] = recipe.recipeCategory;
  if (recipe.recipeCuisine) fieldsToTranslate["recipeCuisine"] = recipe.recipeCuisine;

  if (!Object.keys(fieldsToTranslate).length) {
    return { targetLocale, fields: {} };
  }

  const model = createProvider(config);
  const schema = z.object({ fields: z.record(z.string(), z.string()) });

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Translate the following recipe fields from ${sourceLocale} to ${targetLocale}. Return a JSON object with the same keys and translated values.

Fields to translate:
${JSON.stringify(fieldsToTranslate, null, 2)}`,
    });
    return { targetLocale, fields: output.fields };
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Translation failed: ${String(e)}`);
  }
}

export async function translatePairingDescription(
  pairing: { ingredient1?: string; ingredient2?: string; description?: string },
  sourceLocale: string,
  targetLocale: string,
  config: AiConfig,
): Promise<TranslationDraft> {
  if (!pairing.description) return { targetLocale, fields: {} };

  const model = createProvider(config);
  const schema = z.object({ fields: z.record(z.string(), z.string()) });

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Translate the following ingredient pairing description from ${sourceLocale} to ${targetLocale}.

Description: "${pairing.description}"

Return { fields: { description: "<translated>" } }`,
    });
    return { targetLocale, fields: output.fields };
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Pairing translation failed: ${String(e)}`);
  }
}
