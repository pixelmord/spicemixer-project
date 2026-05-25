import type { MutableRefObject } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { TranslateEntityDialog } from "@/components/admin/TranslateEntityDialog.tsx";

interface PairingTranslateDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  pairingId: string;
  locale: string;
  description: string;
  availableLocales: string[];
  runId: string;
  pendingTranslationRef: MutableRefObject<{ locale: string; desc: string } | null>;
}

export function PairingTranslateDialog({
  open,
  onOpenChange,
  pairingId,
  locale,
  description,
  availableLocales,
  runId,
  pendingTranslationRef,
}: PairingTranslateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-lg">
        <TranslateEntityDialog
          contract={{
            presets: [],
            fields: { description: { translation: { mode: "translate" } } },
          }}
          sourceRef={{ kind: "pairing", id: pairingId }}
          sourceLocale={locale}
          sourceData={{ description }}
          availableLocales={availableLocales}
          onCreate={async (targetLocale, _slug, fields) => {
            const fd = fields as Record<string, unknown>;
            const descRaw = fd["description"];
            const desc = typeof descRaw === "string" ? descRaw : "";
            pendingTranslationRef.current = { locale: targetLocale, desc };
            const { error } = await actions.aiTranslatePairing({
              id: pairingId,
              sourceLocale: locale as "en" | "de",
              targetLocale: targetLocale as "en" | "de",
              description: desc,
            });
            if (error) throw new Error(error.message);
            return { kind: "pairing", id: pairingId };
          }}
          onComplete={() => {
            pendingTranslationRef.current = null;
            onOpenChange(false);
            toast.success("Translation saved — switch locale to view");
          }}
          aiEventLog={{ read: async () => [], append: async () => {} }}
          onFill={async (params) => {
            const ctx = params.sourceContext as {
              sourceLocale: string;
              targetLocale: string;
              sourceData: Record<string, unknown>;
            };
            const { data, error } = await actions.aiFillTranslation({
              kind: "pairing",
              sourceRef: { id: pairingId, kind: "pairing" },
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
            entityKind: "pairing",
            entityRef: pairingId,
            userInitiated: true,
            runId,
            triggeredBy: "editor" as const,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
