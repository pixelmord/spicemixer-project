import { useState } from "react";
import type { ComponentType } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";
import SourcePicker, { type Source, type SourceMode } from "./SourcePicker.tsx";
import DiffPreviewModal from "./DiffPreviewModal.tsx";
import IngredientDiff from "./IngredientDiff.tsx";
import PairingDiff from "./PairingDiff.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";

const TABS: Array<{ id: SourceMode; label: string }> = [
  { id: "prompt", label: "From prompt" },
  { id: "file", label: "From file" },
  { id: "text", label: "From text" },
];

type KindProps =
  | { kind: "recipe"; collection: RecipeCollection; onApplied: () => void }
  | { kind: "ingredient"; locale: "en" | "de"; onApplied: () => void }
  | {
      kind: "pairing";
      pairingId: string;
      locale: string;
      onApplied: (description: string) => void;
    };

type Props = {
  open: boolean;
  onClose: () => void;
  slug: string;
  existing: Record<string, unknown>;
} & KindProps;

function appendSource(formData: FormData, source: Source) {
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
}

export default function EnhanceModal(props: Props) {
  const { open, onClose, slug, existing } = props;
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
      if (props.kind === "recipe") {
        const formData = new FormData();
        formData.append("existing", JSON.stringify(existing));
        appendSource(formData, source);
        const { data, error } = await actions.aiMergeRecipe(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        setProposed(data.recipe as Record<string, unknown>);
        setWarnings(data.warnings);
        setMergeModel(data.model ?? null);
      } else if (props.kind === "ingredient") {
        const formData = new FormData();
        formData.append("existing", JSON.stringify(existing));
        appendSource(formData, source);
        const { data, error } = await actions.aiMergeIngredient(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        setProposed(data.ingredient as Record<string, unknown>);
        setWarnings(data.warnings);
        setMergeModel(data.model ?? null);
      } else {
        const descriptions = (existing["descriptions"] as Record<string, string>) ?? {};
        const currentDesc =
          descriptions[props.locale] ??
          descriptions["en"] ??
          (typeof existing["description"] === "string" ? existing["description"] : "");
        const formData = new FormData();
        formData.append("existing", JSON.stringify({ ...existing, description: currentDesc }));
        formData.append("locale", props.locale);
        appendSource(formData, source);
        const { data, error } = await actions.aiMergePairing(formData);
        if (error || !data) throw new Error(error?.message ?? "Merge failed");
        const proposedDescriptions = { ...descriptions, [props.locale]: data.pairing.description };
        setProposed({ ...existing, descriptions: proposedDescriptions });
        setWarnings(data.warnings);
        setMergeModel(data.model ?? null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!proposed) return;
    setSaving(true);

    if (props.kind === "recipe") {
      const recipePayload = {
        "@context": "https://schema.org",
        "@type": "Recipe",
        ...proposed,
      };
      const { error } = await actions.saveRecipe({
        collection: props.collection,
        slug,
        recipe: recipePayload,
        ...(mergeModel ? { aiMergeModel: mergeModel } : {}),
      });
      setSaving(false);
      if (error) {
        toast.error("Save failed: " + error.message);
        return;
      }
      toast.success("Recipe enhanced!");
      props.onApplied();
    } else if (props.kind === "ingredient") {
      const { error } = await actions.saveIngredient({
        locale: props.locale,
        slug,
        ingredient: proposed,
        ...(mergeModel ? { aiMergeModel: mergeModel } : {}),
      });
      setSaving(false);
      if (error) {
        toast.error("Save failed: " + error.message);
        return;
      }
      toast.success("Ingredient enhanced!");
      props.onApplied();
    } else {
      const descriptions = (proposed["descriptions"] as Record<string, string>) ?? {};
      const newDesc = descriptions[props.locale] ?? "";
      const rawIngredients = existing["ingredients"] as [string, string];
      const { error } = await actions.savePairing({
        id: props.pairingId,
        ingredients: [
          { collection: "ingredients" as const, slug: rawIngredients[0] },
          { collection: "ingredients" as const, slug: rawIngredients[1] },
        ],
        description: newDesc,
        locale: props.locale,
        ...(mergeModel ? { aiMergeModel: mergeModel } : {}),
      });
      setSaving(false);
      if (error) {
        toast.error("Save failed: " + error.message);
        return;
      }
      toast.success("Pairing updated!");
      props.onApplied(newDesc);
    }

    handleClose();
  }

  let title: string;
  if (props.kind === "recipe") {
    title = "Enhance recipe";
  } else if (props.kind === "ingredient") {
    title = "Enhance ingredient";
  } else {
    title = `Enhance pairing description (${props.locale.toUpperCase()})`;
  }

  let DiffComponent:
    | ComponentType<{ existing: Record<string, unknown>; proposed: Record<string, unknown> }>
    | undefined;
  if (props.kind === "ingredient") {
    DiffComponent = IngredientDiff;
  } else if (props.kind === "pairing") {
    const pairingLocale = props.locale;
    DiffComponent = (p) => <PairingDiff {...p} locale={pairingLocale} />;
  }

  if (proposed) {
    return (
      <DiffPreviewModal
        open={open}
        onClose={handleClose}
        title={`Enhance: ${slug}`}
        existing={existing}
        proposed={proposed}
        onApply={handleApply}
        applying={saving}
        onBack={() => {
          setProposed(null);
          setSource(null);
        }}
        backLabel="Try different source"
        warnings={warnings}
        DiffComponent={DiffComponent}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            {title}
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
