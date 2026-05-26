import { useRef } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { TranslateEntityDialog } from "@/components/admin/TranslateEntityDialog.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";

type EntityKind = "recipe" | "mixture";

interface RecipeTranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  locale: string;
  collection: RecipeCollection;
  entityKind: EntityKind;
  snapshot: Record<string, unknown>;
  runId: string;
}

const RECIPE_TRANSLATE_CONTRACT = {
  presets: [],
  fields: {
    name: { translation: { mode: "translate" as const } },
    description: { translation: { mode: "translate" as const } },
    recipeCategory: { translation: { mode: "translate" as const } },
    recipeCuisine: { translation: { mode: "translate" as const } },
    slug: { translation: { mode: "translate" as const } },
  },
};

export function RecipeTranslateDialog({
  open,
  onOpenChange,
  slug,
  locale,
  collection,
  entityKind,
  snapshot,
  runId,
}: RecipeTranslateDialogProps) {
  const translationSlugRef = useRef<string>("");
  const targetLocale = locale === "en" ? "de" : "en";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-lg">
        <TranslateEntityDialog
          contract={RECIPE_TRANSLATE_CONTRACT}
          sourceRef={{ kind: entityKind, id: slug }}
          sourceLocale={locale}
          sourceData={snapshot}
          availableLocales={[targetLocale]}
          onCheckSlugAvailable={async (_kind, candidateSlug) => {
            const { data } = await actions.checkSlugAvailable({
              collection,
              slug: candidateSlug,
              locale: targetLocale as "en" | "de",
            });
            return data?.available ?? false;
          }}
          onCreate={async (tLocale, translationSlug, fields, meta) => {
            translationSlugRef.current = translationSlug ?? "";
            const sidecarMeta = {
              draft: true,
              kind: entityKind,
              tags: [] as string[],
              ingredientLinks: [] as unknown[],
              sources: [] as unknown[],
              variants: [] as string[],
              language: tLocale,
              locale: tLocale,
              translationOf: slug,
              translations: {},
              aiEvents: meta.aiEvents,
              canonicalLocale: meta.canonicalLocale,
              canonicalFieldHashes: meta.canonicalFieldHashes,
            };
            const { error } = await actions.aiCreateTranslation({
              collection,
              slug,
              sourceLocale: locale as "en" | "de",
              targetLocale: tLocale as "en" | "de",
              translationSlug: translationSlug ?? "",
              fields,
              meta: sidecarMeta as Record<string, unknown>,
            });
            if (error) throw new Error(error.message);
            return { kind: entityKind, id: translationSlug ?? "" };
          }}
          onComplete={() => {
            const ts = translationSlugRef.current;
            onOpenChange(false);
            toast.success("Translation created");
            if (ts) window.open(`/admin/${collection}/${ts}/edit?locale=${targetLocale}`, "_blank");
          }}
          aiEventLog={{ read: async () => [], append: async () => {} }}
          onFill={async (params) => {
            const ctx = params.sourceContext as {
              sourceLocale: string;
              targetLocale: string;
              sourceData: Record<string, unknown>;
            };
            const { data, error } = await actions.aiFillTranslation({
              kind: entityKind,
              sourceRef: { id: slug, kind: entityKind },
              sourceLocale: ctx.sourceLocale as "en" | "de",
              targetLocale: ctx.targetLocale as "en" | "de",
              sourceData: ctx.sourceData,
              target: params.target,
            });
            if (error) throw new Error(error.message);
            return data!;
          }}
          origin={{
            surface: "admin",
            action: "aiFillTranslation",
            entityKind,
            entityRef: slug,
            userInitiated: true,
            runId,
            triggeredBy: "editor" as const,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
