import { useRef } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { TranslateEntityDialog } from "@/components/admin/TranslateEntityDialog.tsx";

interface IngredientTranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  locale: "en" | "de";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract: any;
  snapshot: Record<string, unknown>;
  runId: string;
}

export function IngredientTranslateDialog({
  open,
  onOpenChange,
  slug,
  locale,
  contract,
  snapshot,
  runId,
}: IngredientTranslateDialogProps) {
  const translationTargetLocaleRef = useRef<string>("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <TranslateEntityDialog
          contract={contract}
          sourceRef={{ kind: "ingredient", id: slug }}
          sourceLocale={locale}
          sourceData={snapshot}
          availableLocales={locale === "en" ? ["de"] : ["en"]}
          onCreate={async (targetLocale, _slug, fields, meta) => {
            translationTargetLocaleRef.current = targetLocale;
            const { error } = await actions.aiCreateIngredientTranslation({
              slug,
              sourceLocale: locale,
              targetLocale: targetLocale as "en" | "de",
              fields,
              meta: meta as unknown as Record<string, unknown>,
            });
            if (error) throw new Error(error.message);
            return { kind: "ingredient", id: slug };
          }}
          onComplete={() => {
            const tl = translationTargetLocaleRef.current;
            onOpenChange(false);
            toast.success("Translation created");
            if (tl) window.open(`/admin/ingredients/${slug}/edit?locale=${tl}`, "_blank");
          }}
          aiEventLog={{ read: async () => [], append: async () => {} }}
          onFill={async (params) => {
            const ctx = params.sourceContext as {
              sourceLocale: string;
              targetLocale: string;
              sourceData: Record<string, unknown>;
            };
            const { data, error } = await actions.aiFillTranslation({
              kind: "ingredient",
              sourceRef: { id: slug, kind: "ingredient" },
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
            entityKind: "ingredient",
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
