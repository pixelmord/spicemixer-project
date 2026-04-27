import type { Recipe } from "../content.config.ts";

export type Step = { text: string; name?: string };

export function normalizeInstructions(instructions: Recipe["recipeInstructions"]): Step[] {
  const items = instructions as Array<string | { text: string; name?: string }>;
  return items.map((step) =>
    typeof step === "string" ? { text: step } : { text: step.text, name: step.name },
  );
}

export function firstImage(image: Recipe["image"]): string | undefined {
  if (!image) return undefined;
  return Array.isArray(image) ? image[0] : image;
}

export function keywordList(keywords: Recipe["keywords"]): string[] {
  if (!keywords) return [];
  if (Array.isArray(keywords)) return keywords;
  return keywords
    .split(",")
    .map((k: string) => k.trim())
    .filter(Boolean);
}
