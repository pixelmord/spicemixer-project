import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";
import SourcePicker, { type Source, type SourceMode } from "./SourcePicker.tsx";
import DiffPreviewModal from "./DiffPreviewModal.tsx";
import IngredientDiff from "./IngredientDiff.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  locale: "en" | "de";
  slug: string;
  existingIngredient: Record<string, unknown>;
  onApplied: () => void;
}

const TABS: Array<{ id: SourceMode; label: string }> = [
  { id: "prompt", label: "From prompt" },
  { id: "file", label: "From file" },
  { id: "text", label: "From text" },
];

export default function IngredientEnhanceModal({
  open,
  onClose,
  locale,
  slug,
  existingIngredient,
  onApplied,
}: Props) {
  const [tab, setTab] = useState<SourceMode>("prompt");
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [proposed, setProposed] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function reset() {
    setSource(null);
    setProposed(null);
    setWarnings([]);
    setLoading(false);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleGenerate() {
    if (!source) {
      toast.error("Provide a source first");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("existing", JSON.stringify(existingIngredient));

      if (source.kind === "file") {
        formData.append("sourceKind", "file");
        formData.append("file", source.file);
        formData.append("mimeType", source.mimeType);
      } else if (source.kind === "text") {
        formData.append("sourceKind", "text");
        formData.append("text", source.content);
      } else {
        formData.append("sourceKind", "prompt");
        formData.append("prompt", source.prompt);
      }

      const { data, error } = await actions.aiMergeIngredient(formData);
      if (error || !data) throw new Error(error?.message ?? "Merge failed");

      setProposed(data.ingredient as Record<string, unknown>);
      setWarnings(data.warnings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!proposed) return;
    setSaving(true);
    const { error } = await actions.saveIngredient({
      locale,
      slug,
      ingredient: proposed,
    });
    setSaving(false);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    toast.success("Ingredient enhanced!");
    onApplied();
    handleClose();
  }

  if (proposed) {
    return (
      <DiffPreviewModal
        open={open}
        onClose={handleClose}
        title={`Enhance: ${slug}`}
        existing={existingIngredient}
        proposed={proposed}
        onApply={handleApply}
        applying={saving}
        onBack={() => {
          setProposed(null);
          setSource(null);
        }}
        backLabel="Try different source"
        warnings={warnings}
        DiffComponent={IngredientDiff}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            Enhance ingredient
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setSource(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <SourcePicker key={tab} mode={tab} onChange={setSource} />

          <Button onClick={handleGenerate} disabled={!source || loading} className="w-full">
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                Generating enhanced version…
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-1" />
                Generate enhanced version
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
