import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import type { FieldDiff, ItemDiff } from "@/lib/recipe-diff.ts";

interface Step {
  text: string;
  name?: string;
}

interface RecipeData {
  name?: string;
  description?: string;
  image?: string | string[];
  recipeYield?: string | number;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeCategory?: string;
  recipeCuisine?: string;
  keywords?: string[] | string;
  recipeIngredient?: string[];
  recipeInstructions?: Array<string | Step>;
}

interface Props {
  recipe: RecipeData;
  /** When provided, items/fields are highlighted based on diff status. */
  diffs?: FieldDiff[];
}

function firstImage(image?: string | string[]) {
  if (!image) return undefined;
  return Array.isArray(image) ? image[0] : image;
}

function normalizeSteps(instructions?: Array<string | Step>): Step[] {
  if (!Array.isArray(instructions)) return [];
  return instructions.map((s) => (typeof s === "string" ? { text: s } : s));
}

function formatDuration(iso?: string): string | undefined {
  if (!iso) return undefined;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const parts: string[] = [];
  if (match[1]) parts.push(`${match[1]}h`);
  if (match[2]) parts.push(`${match[2]}min`);
  if (match[3]) parts.push(`${match[3]}s`);
  return parts.join(" ") || iso;
}

function keywordList(keywords?: string[] | string): string[] {
  if (!keywords) return [];
  if (Array.isArray(keywords)) return keywords;
  return keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

const KIND_ITEM_STYLES = {
  added: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200",
  removed: "line-through opacity-50",
  changed: "bg-amber-100 dark:bg-amber-900/40",
  unchanged: "",
};

const STEP_NUM_STYLES = {
  added: "bg-emerald-500 text-white ring-2 ring-emerald-300",
  removed: "bg-muted text-muted-foreground opacity-40",
  changed: "bg-amber-500 text-white ring-2 ring-amber-300",
  unchanged: "bg-primary text-primary-foreground",
};

export default function RecipePreview({ recipe, diffs }: Props) {
  const img = firstImage(recipe.image);
  const steps = normalizeSteps(recipe.recipeInstructions);
  const tags = keywordList(recipe.keywords);
  const times = [
    recipe.prepTime && `Prep: ${formatDuration(recipe.prepTime)}`,
    recipe.cookTime && `Cook: ${formatDuration(recipe.cookTime)}`,
    recipe.totalTime && `Total: ${formatDuration(recipe.totalTime)}`,
  ].filter(Boolean);

  // Build lookup maps from diffs
  const fieldKind = new Map<string, string>(diffs?.map((d) => [d.field, d.kind]) ?? []);
  const itemDiffMap = new Map<string, ItemDiff[]>(
    diffs?.filter((d) => d.itemDiffs).map((d) => [d.field, d.itemDiffs!]) ?? [],
  );

  const descKind = fieldKind.get("description");
  const ingItems = itemDiffMap.get("recipeIngredient");
  const kwItems = itemDiffMap.get("keywords");
  const instrItems = itemDiffMap.get("recipeInstructions");

  // For step lookup: match by text
  function stepKind(text: string): "added" | "removed" | "changed" | "unchanged" {
    if (!instrItems) return "unchanged";
    const match = instrItems.find((d) => d.value.trim() === text.trim());
    return (match?.kind as "added" | "removed" | "changed" | "unchanged") ?? "unchanged";
  }

  function ingKind(value: string): "added" | "removed" | "changed" | "unchanged" {
    if (!ingItems) return "unchanged";
    const match = ingItems.find((d) => d.value.trim() === value.trim());
    return (match?.kind as "added" | "removed" | "changed" | "unchanged") ?? "unchanged";
  }

  function kwKind(value: string): "added" | "removed" | "changed" | "unchanged" {
    if (!kwItems) return "unchanged";
    const match = kwItems.find((d) => d.value.trim() === value.trim());
    return (match?.kind as "added" | "removed" | "changed" | "unchanged") ?? "unchanged";
  }

  return (
    <div className="space-y-4 text-sm">
      {/* Header */}
      {img && (
        <img
          src={img}
          alt={recipe.name ?? "Recipe"}
          className="w-full h-40 object-cover rounded-lg"
        />
      )}
      <div>
        <h2 className="text-lg font-bold">{recipe.name ?? "(untitled)"}</h2>
        {recipe.description && (
          <p
            className={cn(
              "mt-1 text-xs",
              descKind === "added" || descKind === "changed"
                ? "rounded px-1.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200"
                : "text-muted-foreground",
            )}
          >
            {recipe.description}
          </p>
        )}
      </div>

      {/* Meta */}
      {(times.length > 0 ||
        recipe.recipeYield ||
        recipe.recipeCuisine ||
        recipe.recipeCategory) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-y border-border py-2">
          {times.map((t) => (
            <span key={t}>{t}</span>
          ))}
          {recipe.recipeYield && <span>Serves: {recipe.recipeYield}</span>}
          {recipe.recipeCuisine && <span>{recipe.recipeCuisine}</span>}
          {recipe.recipeCategory && <span>{recipe.recipeCategory}</span>}
        </div>
      )}

      {/* Ingredients */}
      {Array.isArray(recipe.recipeIngredient) && recipe.recipeIngredient.length > 0 && (
        <div>
          <h3 className="font-semibold mb-1.5">Ingredients</h3>
          <ul className="space-y-0.5">
            {recipe.recipeIngredient.map((ing, i) => {
              const kind = ingKind(ing);
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-2 text-xs rounded px-1",
                    kind !== "unchanged" && KIND_ITEM_STYLES[kind],
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0",
                      kind === "added" ? "text-emerald-600 font-bold" : "text-muted-foreground",
                    )}
                  >
                    {kind === "added" ? "+" : "·"}
                  </span>
                  <span>{ing}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Instructions */}
      {steps.length > 0 && (
        <div>
          <h3 className="font-semibold mb-1.5">Instructions</h3>
          <ol className="space-y-2">
            {steps.map((step, i) => {
              const kind = stepKind(step.text);
              return (
                <li
                  key={i}
                  className={cn(
                    "flex gap-2 text-xs rounded px-1 py-0.5",
                    kind !== "unchanged" && KIND_ITEM_STYLES[kind],
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold",
                      STEP_NUM_STYLES[kind],
                    )}
                  >
                    {i + 1}
                  </span>
                  <div>
                    {step.name && <p className="font-medium">{step.name}</p>}
                    <p className={kind === "unchanged" ? "text-muted-foreground" : ""}>
                      {step.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => {
            const kind = kwKind(t);
            return (
              <Badge
                key={t}
                variant={kind === "added" ? "default" : "secondary"}
                className={cn(
                  "text-[10px]",
                  kind === "added" &&
                    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border border-emerald-300",
                )}
              >
                {kind === "added" && <span className="mr-0.5 font-bold">+</span>}
                {t}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
