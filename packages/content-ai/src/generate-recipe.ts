import { generateText, Output } from "ai";
import { AiError } from "./errors.ts";
import { createProvider, PROVIDER_OPTIONS, type AiConfig } from "./provider.ts";
import { recipeExtractSchema, type RecipeExtract } from "./schemas/recipe-extract.ts";

export interface GenerateRecipeInput {
  prompt: string;
  locale?: "en" | "de";
  style?: "recipe" | "mixture";
}

export interface GenerateRecipeResult {
  recipe: RecipeExtract;
  warnings: string[];
}

const GENERATE_SYSTEM_PROMPT = `You are a professional recipe author. Create a complete, detailed, and delicious recipe based on the user's brief.
- Provide realistic quantities and clear instructions
- List each ingredient as a separate string (e.g. "2 cups all-purpose flour", "1 tsp kosher salt")
- Break instructions into clear, numbered steps
- Include realistic prep and cook times in ISO 8601 duration format (e.g. "PT15M", "PT1H")
- Suggest a cuisine and category if applicable
- Add relevant keywords as individual tags`;

export async function generateRecipeFromPrompt(
  input: GenerateRecipeInput,
  config: AiConfig,
): Promise<GenerateRecipeResult> {
  const model = createProvider(config);
  const { prompt, locale = "en", style = "recipe" } = input;

  const styleHint = style === "mixture" ? "spice blend, sauce, or condiment" : style;
  const localeHint =
    locale === "de" ? "Write the recipe in German." : "Write the recipe in English.";

  try {
    const r = await generateText({
      model,
      output: Output.object({ schema: recipeExtractSchema }),
      providerOptions: PROVIDER_OPTIONS,
      system: GENERATE_SYSTEM_PROMPT,
      prompt: `Create a complete ${styleHint} for: ${prompt}\n\n${localeHint}`,
    });

    return { recipe: r.output, warnings: [] };
  } catch (e) {
    throw new AiError("EXTRACTION_FAILED", `Recipe generation failed: ${String(e)}`);
  }
}
