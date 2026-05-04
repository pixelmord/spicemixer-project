import { useState, useEffect } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Languages, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
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
import type { RecipeCollection } from "@/lib/content-store.ts";

const LOCALES = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  collection: RecipeCollection;
  slug: string;
  recipe: Record<string, unknown>;
  meta: Record<string, unknown>;
  currentLocale: string;
}

export default function TranslateModal({
  open,
  onClose,
  collection,
  slug,
  recipe,
  meta,
  currentLocale,
}: Props) {
  const [targetLocale, setTargetLocale] = useState<string>(() =>
    currentLocale === "en" ? "de" : "en",
  );
  const [translationSlug, setTranslationSlug] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [suggestingSlug, setSuggestingSlug] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Suggest slug whenever target locale changes
  useEffect(() => {
    if (!open) return;
    void suggestSlug();
  }, [open, targetLocale]);

  // Check slug availability with debounce
  useEffect(() => {
    if (!translationSlug) {
      setSlugAvailable(null);
      return;
    }
    setCheckingSlug(true);
    const t = setTimeout(() => {
      void actions
        .checkSlugAvailable({ collection, slug: translationSlug })
        .then(({ data }: { data?: { available: boolean } | null }) => {
          if (data) setSlugAvailable(data.available);
        })
        .finally(() => setCheckingSlug(false));
    }, 400);
    return () => clearTimeout(t);
  }, [translationSlug, collection]);

  async function suggestSlug() {
    const name = typeof recipe["name"] === "string" ? recipe["name"] : "";
    if (!name) return;
    setSuggestingSlug(true);
    try {
      const { data } = await actions.aiSuggestSlug({
        name,
        locale: targetLocale,
        collection,
      });
      if (data) setTranslationSlug(data.slug);
    } catch {
      // fallback to slug-locale derivation
      setTranslationSlug(`${slug}-${targetLocale}`);
    } finally {
      setSuggestingSlug(false);
    }
  }

  async function handleCreate() {
    if (!translationSlug || slugAvailable === false) return;
    setTranslating(true);
    try {
      const { data, error } = await actions.aiCreateTranslation({
        collection,
        slug,
        recipe,
        meta,
        sourceLocale: currentLocale as "en" | "de",
        targetLocale: targetLocale as "en" | "de",
        translationSlug,
      });
      if (error) throw new Error(error.message);
      toast.success(`Translation created: ${translationSlug}`);
      setDone(data?.translationSlug ?? translationSlug);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslating(false);
    }
  }

  function handleClose() {
    setDone(null);
    setTranslationSlug("");
    setSlugAvailable(null);
    onClose();
  }

  const availableLocales = LOCALES.filter((l) => l.value !== currentLocale);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton>
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
                Translation created successfully
              </p>
              <p className="text-muted-foreground">
                A new recipe document <code className="font-mono text-xs">{done}</code> has been
                saved as a draft linked to this recipe.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(`/admin/${collection}/${done}/edit`, "_blank");
                }}
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
              <Label>Target language</Label>
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
            </div>

            <div className="space-y-1.5">
              <Label>Slug for translated recipe</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={translationSlug}
                    onChange={(e) => setTranslationSlug(e.target.value)}
                    placeholder="translated-slug"
                  />
                  {translationSlug && (
                    <span
                      className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium ${
                        checkingSlug
                          ? "text-muted-foreground"
                          : slugAvailable === true
                            ? "text-emerald-600"
                            : slugAvailable === false
                              ? "text-red-500"
                              : ""
                      }`}
                    >
                      {checkingSlug
                        ? "…"
                        : slugAvailable === true
                          ? "✓"
                          : slugAvailable === false
                            ? "taken"
                            : ""}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={suggestSlug}
                  disabled={suggestingSlug}
                  title="Re-suggest slug from name"
                >
                  {suggestingSlug ? <Loader2 size={12} className="animate-spin" /> : "AI"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                AI will translate name, description, category, and cuisine.
              </p>
            </div>

            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={
                  translating ||
                  !translationSlug ||
                  slugAvailable === false ||
                  checkingSlug ||
                  suggestingSlug
                }
              >
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
