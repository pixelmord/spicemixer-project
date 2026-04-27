type NutritionOut = {
  "@type": "NutritionInformation";
  calories?: string;
  proteinContent?: string;
  fatContent?: string;
  carbohydrateContent?: string;
  servingSize?: string;
};

function toStr(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

export function normalizeNutrition(raw: unknown): NutritionOut | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;

  const result: NutritionOut = { "@type": "NutritionInformation" };

  const calories = toStr(o["calories"]);
  const protein = toStr(o["proteinContent"]);
  const fat = toStr(o["fatContent"]);
  const carbs = toStr(o["carbohydrateContent"]);
  const serving = toStr(o["servingSize"]);

  if (calories) result.calories = calories;
  if (protein) result.proteinContent = protein;
  if (fat) result.fatContent = fat;
  if (carbs) result.carbohydrateContent = carbs;
  if (serving) result.servingSize = serving;

  // Return only if at least one nutritional field is present
  return Object.keys(result).length > 1 ? result : undefined;
}
