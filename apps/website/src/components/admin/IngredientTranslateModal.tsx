import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Languages, ExternalLink, Check } from "lucide-react";
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
  slug: string;
  ingredient: Record<string, unknown>;
  currentLocale: "en" | "de";
}

export default function IngredientTranslateModal({
  open,
  onClose,
  slug,
  ingredient,
  currentLocale,
}: Props) {
  const [targetLocale, setTargetLocale] = useState<string>(currentLocale === "en" ? "de" : "en");
  const [translating, setTranslating] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function handleClose() {
    setDone(null);
    onClose();
  }

  async function handleCreate() {
    setTranslating(true);
    try {
      const { error } = await actions.aiCreateIngredientTranslation({
        slug,
        ingredient,
        sourceLocale: currentLocale,
        targetLocale: targetLocale as "en" | "de",
      });
      if (error) {
        if (error.message.includes("CONFLICT")) {
          toast.error(
            `A ${targetLocale.toUpperCase()} translation already exists. Open it to edit.`,
          );
          window.open(`/admin/ingredients/${slug}/edit?locale=${targetLocale}`, "_blank");
          return;
        }
        throw new Error(error.message);
      }
      toast.success(`Translation created: ${targetLocale}/${slug}`);
      setDone(targetLocale);
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
            Create translation
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4 text-sm space-y-2">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                Translation created
              </p>
              <p className="text-muted-foreground">
                <span className="font-mono text-xs">
                  {done}/{slug}
                </span>{" "}
                saved as draft.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(`/admin/ingredients/${slug}/edit?locale=${done}`, "_blank")
                }
              >
                <ExternalLink size={12} className="mr-1.5" />
                Open translation
              </Button>
              <Button size="sm" onClick={handleClose}>
                <Check size={12} className="mr-1.5" />
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                Translates{" "}
                <span className="font-mono text-xs font-medium">
                  {currentLocale}/{slug}
                </span>{" "}
                →{" "}
                <span className="font-mono text-xs font-medium">
                  {targetLocale}/{slug}
                </span>
              </p>
              <Select value={targetLocale} onValueChange={(v) => v && setTargetLocale(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLocales.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Translates name, summary, and description. Same slug across locales.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleCreate} disabled={translating}>
                {translating ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Languages size={14} className="mr-1" />
                    Create translation
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
