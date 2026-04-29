import { generateText, Output } from "ai";
import { z } from "zod";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { AiError } from "./errors.ts";

export interface RecipeSnapshot {
  name: string;
  description?: string;
  recipeIngredient?: string[];
  recipeCategory?: string;
  recipeCuisine?: string;
  keywords?: string[];
}

export interface IngredientLinkProposal {
  pattern: string;
  slug: string;
  confidence: "high" | "medium" | "low";
}

export interface TagProposal {
  tags: string[];
}

export interface ImprovementProposal {
  fields: Array<{
    field: string;
    suggestion: string;
    rationale: string;
  }>;
}

export interface TranslationDraft {
  targetLocale: string;
  fields: Record<string, string>;
}

export async function proposeIngredientLinks(
  recipeIngredients: string[],
  inventory: Array<{ slug: string; name: string }>,
  config: AiConfig,
): Promise<IngredientLinkProposal[]> {
  if (!recipeIngredients.length || !inventory.length) return [];

  const model = createProvider(config);
  const inventoryList = inventory.map((i) => `${i.slug}: ${i.name}`).join("\n");

  const schema = z.object({
    links: z.array(
      z.object({
        pattern: z.string(),
        slug: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    ),
  });

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Match each recipe ingredient string to the best slug from the inventory. Only match if you're reasonably confident.

Recipe ingredients:
${recipeIngredients.map((i, n) => `${n + 1}. ${i}`).join("\n")}

Ingredient inventory (slug: name):
${inventoryList}

For each ingredient that has a clear match, return:
- pattern: a substring of the ingredient string that identifies the ingredient (e.g. "flour", "olive oil")
- slug: the matching inventory slug
- confidence: high/medium/low

Skip ingredients with no reasonable match. Do not invent slugs.`,
    });
    return output.links;
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Ingredient link proposal failed: ${String(e)}`);
  }
}

export async function proposeTags(
  recipe: RecipeSnapshot,
  existingTags: string[],
  config: AiConfig,
): Promise<TagProposal> {
  const model = createProvider(config);

  const schema = z.object({ tags: z.array(z.string()) });

  const context = [
    `Name: ${recipe.name}`,
    recipe.description ? `Description: ${recipe.description}` : null,
    recipe.recipeCategory ? `Category: ${recipe.recipeCategory}` : null,
    recipe.recipeCuisine ? `Cuisine: ${recipe.recipeCuisine}` : null,
    recipe.recipeIngredient?.length
      ? `Key ingredients: ${recipe.recipeIngredient.slice(0, 8).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const tagHints = existingTags.length
    ? `Prefer tags from this existing vocabulary where applicable:\n${existingTags.slice(0, 60).join(", ")}`
    : "";

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Suggest 3–8 concise tags for this recipe. Tags should be lowercase, hyphenated if multi-word (e.g. "quick-dinner", "vegan", "spicy").

${context}
${tagHints}`,
    });
    return output;
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Tag proposal failed: ${String(e)}`);
  }
}

export async function proposeRecipeImprovements(
  recipe: RecipeSnapshot,
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
    `Name: ${recipe.name}`,
    recipe.description ? `Description: ${recipe.description}` : null,
    recipe.recipeCuisine ? `Cuisine: ${recipe.recipeCuisine}` : null,
    recipe.recipeCategory ? `Category: ${recipe.recipeCategory}` : null,
    recipe.recipeIngredient?.length
      ? `Ingredients: ${recipe.recipeIngredient.slice(0, 6).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Suggest values for the missing fields of this recipe.

Recipe:
${context}

Missing fields to fill: ${missingFields.join(", ")}

For each field, provide a suggested value and a one-sentence rationale. Only suggest fields from the missing list.`,
    });
    return output;
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Improvement proposal failed: ${String(e)}`);
  }
}

export interface RelationProposal {
  kind: "goesWellWith" | "usesBase";
  collection: "recipes" | "spicemixes" | "sauces";
  slug: string;
  name: string;
  rationale: string;
}

export async function detectLanguage(
  text: string,
  config: AiConfig,
): Promise<{ language: string }> {
  const model = createProvider(config);
  const schema = z.object({ language: z.string().length(2) });

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Identify the language of the following text and return only its ISO 639-1 two-letter code (e.g. "en", "de", "fr").

Text: "${text.slice(0, 500)}"`,
    });
    return output;
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Language detection failed: ${String(e)}`);
  }
}

export async function proposeRelations(
  recipe: RecipeSnapshot,
  existingRecipes: Array<{
    collection: string;
    slug: string;
    name: string;
    recipeIngredient?: string[];
  }>,
  config: AiConfig,
): Promise<RelationProposal[]> {
  if (!existingRecipes.length) return [];

  const model = createProvider(config);
  const schema = z.object({
    relations: z.array(
      z.object({
        kind: z.enum(["goesWellWith", "usesBase"]),
        collection: z.enum(["recipes", "spicemixes", "sauces"]),
        slug: z.string(),
        name: z.string(),
        rationale: z.string(),
      }),
    ),
  });

  const recipeContext = [
    `Name: ${recipe.name}`,
    recipe.description ? `Description: ${recipe.description}` : null,
    recipe.recipeCategory ? `Category: ${recipe.recipeCategory}` : null,
    recipe.recipeCuisine ? `Cuisine: ${recipe.recipeCuisine}` : null,
    recipe.recipeIngredient?.length
      ? `Key ingredients: ${recipe.recipeIngredient.slice(0, 8).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const candidatesList = existingRecipes
    .slice(0, 50)
    .map((r) => `${r.collection}/${r.slug}: ${r.name}`)
    .join("\n");

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Based on this recipe, suggest related recipes from the catalog below.

Current recipe:
${recipeContext}

Available recipes (collection/slug: name):
${candidatesList}

Return up to 4 relations:
- "goesWellWith": recipes this pairs or serves well alongside
- "usesBase": recipes/spicemixes this recipe uses as a base ingredient (e.g. a spice blend used in a dish)

Only suggest relations with clear culinary logic. Return empty if nothing fits.`,
    });
    return output.relations;
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Relation proposal failed: ${String(e)}`);
  }
}

export async function proposeSlug(
  name: string,
  locale: string,
  config: AiConfig,
): Promise<{ slug: string }> {
  const model = createProvider(config);
  const schema = z.object({ slug: z.string() });

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema }),
      providerOptions: PROVIDER_OPTIONS,
      prompt: `Generate a clean URL slug for the recipe name below. Rules:
- Lowercase only
- Hyphens as separators (no underscores)
- Transliterate or translate non-ASCII characters to their Latin equivalents
- Keep it short (2-5 words max)
- No stop words unless they aid clarity
- Locale hint: ${locale}

Recipe name: "${name}"

Return only the slug string, e.g. "ras-el-hanout" or "marokkanische-gewuerzmischung".`,
    });
    return output;
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Slug proposal failed: ${String(e)}`);
  }
}

export async function proposeRecipeTranslation(
  recipe: RecipeSnapshot,
  sourceLocale: string,
  targetLocale: string,
  config: AiConfig,
): Promise<TranslationDraft> {
  const model = createProvider(config);

  const fieldsToTranslate: Record<string, string> = {};
  if (recipe.name) fieldsToTranslate["name"] = recipe.name;
  if (recipe.description) fieldsToTranslate["description"] = recipe.description;
  if (recipe.recipeCategory) fieldsToTranslate["recipeCategory"] = recipe.recipeCategory;
  if (recipe.recipeCuisine) fieldsToTranslate["recipeCuisine"] = recipe.recipeCuisine;

  if (!Object.keys(fieldsToTranslate).length) {
    return { targetLocale, fields: {} };
  }

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
