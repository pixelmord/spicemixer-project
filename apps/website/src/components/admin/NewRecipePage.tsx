import { useMemo } from "react";
import RecipeForm from "./RecipeForm.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";

interface Props {
  collection: RecipeCollection;
}

/** Reads import data from sessionStorage (set by ImportFromUrl widget) on mount. */
export default function NewRecipePage({ collection }: Props) {
  const { recipe, meta } = useMemo(() => {
    if (typeof window === "undefined") return { recipe: undefined, meta: undefined };
    const stored = sessionStorage.getItem("import-recipe");
    if (!stored) return { recipe: undefined, meta: undefined };
    sessionStorage.removeItem("import-recipe");
    try {
      const parsed = JSON.parse(stored) as {
        recipe: Record<string, unknown>;
        source: { url: string };
      };
      const importedMeta = {
        draft: true,
        externalSources: [
          { url: parsed.source.url, title: String(parsed.recipe.name ?? "Imported recipe") },
        ],
      };
      return { recipe: parsed.recipe, meta: importedMeta };
    } catch {
      return { recipe: undefined, meta: undefined };
    }
  }, []);

  return (
    <RecipeForm
      collection={collection}
      isNew
      initialRecipe={recipe as never}
      initialMeta={meta as never}
    />
  );
}
