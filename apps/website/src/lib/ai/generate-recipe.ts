import { streamObject } from "ai";
import {
  createProvider,
  PROVIDER_OPTIONS,
  getCurrentOrigin,
} from "@pixelmord/content-ai-core/server";
import { toAiError, type AiDebugInfo } from "@/lib/ai-debug.ts";
import { publish } from "@/lib/pubsub.ts";
import { recipeExtractSchema, type RecipeExtract } from "@/contracts/schemas/recipe-extract.ts";
import type { AiConfig } from "@pixelmord/content-ai-ingest";

export interface GenerateRecipeInput {
  prompt: string;
  locale?: "en" | "de";
  style?: "recipe" | "mixture";
}

export interface GenerateRecipeResult {
  recipe: RecipeExtract;
  warnings: string[];
  debug?: AiDebugInfo;
}

export interface GenerateOptions {
  debug?: boolean;
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
  options: GenerateOptions = {},
): Promise<GenerateRecipeResult> {
  const model = createProvider(config);
  const { prompt, locale = "en", style = "recipe" } = input;

  const styleHint = style === "mixture" ? "spice blend, sauce, or condiment" : style;
  const localeHint =
    locale === "de" ? "Write the recipe in German." : "Write the recipe in English.";

  try {
    const stream = streamObject({
      model,
      schema: recipeExtractSchema,
      providerOptions: PROVIDER_OPTIONS,
      system: GENERATE_SYSTEM_PROMPT,
      prompt: `Create a complete ${styleHint} for: ${prompt}\n\n${localeHint}`,
    });

    const origin = getCurrentOrigin();

    for await (const partial of stream.partialObjectStream) {
      if (origin) {
        publish(origin.runId, { type: "partial", recipe: partial });
      }
    }

    const recipe = await stream.object;

    if (options.debug) {
      const [finishReason, usage] = await Promise.all([stream.finishReason, stream.usage]);
      const debug: AiDebugInfo = {
        finishReason: finishReason ?? undefined,
        usage: usage
          ? {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            }
          : undefined,
      };
      return { recipe, warnings: [], debug };
    }

    return { recipe, warnings: [] };
  } catch (e) {
    throw toAiError(e, "Recipe generation failed");
  }
}
