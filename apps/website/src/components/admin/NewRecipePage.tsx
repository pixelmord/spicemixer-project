import { useState, useEffect } from "react";
import RecipeForm from "./RecipeForm.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";
import { hashSuggestion, recordAiEvent } from "content-ai";

interface Props {
  collection: RecipeCollection;
}

interface ImportData {
  recipe: Record<string, unknown>;
  meta: Record<string, unknown>;
}

/**
 * Reads import data from sessionStorage (set by ImportFromUrl widget) then mounts
 * RecipeForm. Must use useEffect so sessionStorage is read after hydration — useMemo
 * runs during SSR where window/sessionStorage don't exist, causing the form to
 * initialise with empty defaultValues before the import data is available.
 */
export default function NewRecipePage({ collection }: Props) {
  const [ready, setReady] = useState(false);
  const [importData, setImportData] = useState<ImportData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("import-recipe");
    if (stored) {
      sessionStorage.removeItem("import-recipe");
      try {
        const parsed = JSON.parse(stored) as {
          recipe: Record<string, unknown>;
          source: { url: string; canonical?: string };
          meta?: { language?: string };
        };
        const sourceUrl = parsed.source.canonical ?? parsed.source.url;
        const recipeName =
          typeof parsed.recipe.name === "string" ? parsed.recipe.name : "Imported recipe";
        const aiEvents = sourceUrl.trim()
          ? recordAiEvent([], {
              type: "ingested",
              source: sourceUrl,
              suggestion: { hash: hashSuggestion({ url: sourceUrl }), summary: recipeName },
              model: "recipe-ingestion",
            })
          : [];
        const language = parsed.meta?.language;
        setImportData({
          recipe: parsed.recipe,
          meta: {
            draft: true,
            externalSources: [{ url: sourceUrl, title: recipeName }],
            aiEvents,
            ...(language ? { language } : {}),
          },
        });
      } catch {
        // malformed — proceed with empty form
      }
    }
    setReady(true);
  }, []);

  // Don't mount RecipeForm until useEffect has run — this guarantees useForm
  // and the ingredient/instruction useState hooks all initialise from the correct data.
  if (!ready) return null;

  return (
    <RecipeForm
      collection={collection}
      isNew
      initialRecipe={importData?.recipe as never}
      initialMeta={importData?.meta as never}
    />
  );
}
