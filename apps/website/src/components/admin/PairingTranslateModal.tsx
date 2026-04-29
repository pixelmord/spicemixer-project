import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Languages, Check } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";

const LOCALES = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  pairingId: string;
  currentLocale: string;
  hasDescriptionForLocale: (locale: string) => boolean;
  onTranslated: (locale: string, description: string) => void;
}

export default function PairingTranslateModal({
  open,
  onClose,
  pairingId,
  currentLocale,
  hasDescriptionForLocale,
  onTranslated,
}: Props) {
  const [targetLocale, setTargetLocale] = useState<string>(currentLocale === "en" ? "de" : "en");
  const [translating, setTranslating] = useState(false);
  const [done, setDone] = useState(false);

  function handleClose() {
    setDone(false);
    onClose();
  }

  async function handleCreate() {
    setTranslating(true);
    try {
      const { data, error } = await actions.aiTranslatePairing({
        id: pairingId,
        sourceLocale: currentLocale as "en" | "de",
        targetLocale: targetLocale as "en" | "de",
      });
      if (error) {
        if (error.message.includes("CONFLICT")) {
          toast.error(`${targetLocale.toUpperCase()} translation already exists.`);
          return;
        }
        throw new Error(error.message);
      }
      toast.success(`Translated to ${targetLocale.toUpperCase()}`);
      onTranslated(targetLocale, data?.description ?? "");
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslating(false);
    }
  }

  const availableLocales = LOCALES.filter((l) => l.value !== currentLocale);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages size={16} className="text-primary" />
            Translate pairing description
          </DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              ✓ Translation added for {targetLocale.toUpperCase()}
            </p>
            <Button size="sm" onClick={handleClose}>
              <Check size={12} className="mr-1.5" />
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                Translate from <strong>{currentLocale.toUpperCase()}</strong> to:
              </p>
              <Select value={targetLocale} onValueChange={(v) => v && setTargetLocale(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLocales.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                      {hasDescriptionForLocale(l.value) && (
                        <span className="ml-1 text-xs text-muted-foreground">(already exists)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={translating}>
                {translating ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1" />
                    Translating…
                  </>
                ) : (
                  <>
                    <Languages size={14} className="mr-1" />
                    Translate
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
