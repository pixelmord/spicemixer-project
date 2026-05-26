import type { Dispatch, SetStateAction } from "react";
import IngredientLinkModal from "@/components/admin/IngredientLinkModal.tsx";
import type { EntityOption } from "@/components/admin/EntityCombobox.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";
import type { IngredientLink } from "../../recipe-types.ts";

type LinkModalState =
  | { open: false }
  | { open: true; mode: "view"; slug: string; ingredientIndex: number }
  | {
      open: true;
      mode: "link";
      ingredientIndex: number;
      ingredientString: string;
      aiSuggestion?: { pattern: string; slug: string; confidence: "high" | "medium" | "low" };
    };

interface RecipeIngredientLinkDialogProps {
  state: LinkModalState;
  onClose: () => void;
  locale: string;
  collection: RecipeCollection;
  ingredients: string[];
  ingredientOptions: EntityOption[];
  setIngredientLinks: Dispatch<SetStateAction<IngredientLink[]>>;
  setIngredientOptions: Dispatch<SetStateAction<EntityOption[]>>;
}

export function RecipeIngredientLinkDialog({
  state,
  onClose,
  locale,
  collection,
  ingredients,
  ingredientOptions,
  setIngredientLinks,
  setIngredientOptions,
}: RecipeIngredientLinkDialogProps) {
  if (!state.open) return null;

  if (state.mode === "view") {
    return (
      <IngredientLinkModal
        open
        onClose={onClose}
        mode="view"
        slug={state.slug}
        locale={locale}
        onUnlink={() => {
          const ing = ingredients[state.ingredientIndex] ?? "";
          setIngredientLinks((prev) =>
            prev.filter((l) => !ing.toLowerCase().includes(l.pattern.toLowerCase())),
          );
          onClose();
        }}
      />
    );
  }

  return (
    <IngredientLinkModal
      open
      onClose={onClose}
      mode="link"
      ingredientString={state.ingredientString}
      aiSuggestion={state.aiSuggestion}
      ingredientOptions={ingredientOptions}
      locale={locale}
      collection={collection}
      onLinked={(newSlug, pattern) => {
        setIngredientLinks((prev) => {
          if (prev.some((l) => l.pattern === pattern)) return prev;
          return [...prev, { pattern, slug: newSlug, kind: "ingredient" as const }];
        });
        if (!ingredientOptions.some((o) => o.value === newSlug)) {
          setIngredientOptions((prev) => [
            ...prev,
            { value: newSlug, label: newSlug, sublabel: newSlug },
          ]);
        }
        onClose();
      }}
    />
  );
}
