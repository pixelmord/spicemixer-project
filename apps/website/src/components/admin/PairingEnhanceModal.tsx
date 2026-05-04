import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";
import SourcePicker, { type Source, type SourceMode } from "./SourcePicker.tsx";
import DiffPreviewModal from "./DiffPreviewModal.tsx";
import PairingDiff from "./PairingDiff.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  pairingId: string;
  locale: string;
  existingPairing: Record<string, unknown>;
  onApplied: (description: string) => void;
}

const TABS: Array<{ id: SourceMode; label: string }> = [
  { id: "prompt", label: "From prompt" },
  { id: "text", label: "From text" },
  { id: "file", label: "From file" },
];

export default function PairingEnhanceModal({
  open,
  onClose,
  pairingId,
  locale,
  existingPairing,
  onApplied,
}: Props) {
  const [tab, setTab] = useState<SourceMode>("prompt");
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [proposed, setProposed] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [mergeModel, setMergeModel] = useState<string | null>(null);

  function reset() {
    setSource(null);
    setProposed(null);
    setWarnings([]);
    setLoading(false);
    setSaving(false);
    setMergeModel(null);
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
      const descriptions = (existingPairing["descriptions"] as Record<string, string>) ?? {};
      const currentDesc =
        descriptions[locale] ??
        descriptions["en"] ??
        (typeof existingPairing["description"] === "string" ? existingPairing["description"] : "");
      formData.append("existing", JSON.stringify({ ...existingPairing, description: currentDesc }));
      formData.append("locale", locale);
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
      const { data, error } = await actions.aiMergePairing(formData);
      if (error || !data) throw new Error(error?.message ?? "Merge failed");
      // Build a proposed record to show in the diff
      const proposedDescriptions = { ...descriptions, [locale]: data.pairing.description };
      setProposed({ ...existingPairing, descriptions: proposedDescriptions });
      setWarnings(data.warnings);
      setMergeModel(data.model ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!proposed) return;
    setSaving(true);
    const descriptions = (proposed["descriptions"] as Record<string, string>) ?? {};
    const newDesc = descriptions[locale] ?? "";
    const rawIngredients = existingPairing["ingredients"] as [string, string];
    const { error } = await actions.savePairing({
      id: pairingId,
      ingredients: [
        { collection: "ingredients" as const, slug: rawIngredients[0] },
        { collection: "ingredients" as const, slug: rawIngredients[1] },
      ],
      description: newDesc,
      locale,
      ...(mergeModel ? { aiMergeModel: mergeModel } : {}),
    });
    setSaving(false);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    toast.success("Pairing updated!");
    onApplied(newDesc);
    handleClose();
  }

  if (proposed) {
    return (
      <DiffPreviewModal
        open={open}
        onClose={handleClose}
        title={`Enhance pairing (${locale.toUpperCase()})`}
        existing={existingPairing}
        proposed={proposed}
        onApply={handleApply}
        applying={saving}
        onBack={() => {
          setProposed(null);
          setSource(null);
        }}
        backLabel="Try different source"
        warnings={warnings}
        DiffComponent={(props) => <PairingDiff {...props} locale={locale} />}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            Enhance pairing description ({locale.toUpperCase()})
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
                Generating…
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
