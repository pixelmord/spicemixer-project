import { useState } from "react";
import type { ComponentType } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DialogFooter } from "@/components/ui/dialog.tsx";
import { IngestDialog } from "./IngestDialog.tsx";
import type { SourceShape } from "./IngestDialog.tsx";
import IngredientDiff from "./IngredientDiff.tsx";
import PairingDiff from "./PairingDiff.tsx";
import RecipeDiff from "./RecipeDiff.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";

type KindProps =
  | { kind: "recipe"; collection: RecipeCollection; locale: "en" | "de"; onApplied: () => void }
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

function appendSource(formData: FormData, source: SourceShape) {
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
  const [proposed, setProposed] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [mergeModel, setMergeModel] = useState<string | null>(null);

  function handleClose() {
    setProposed(null);
    setWarnings([]);
    setSaving(false);
    setMergeModel(null);
    onClose();
  }

  function handleReviewBack() {
    setProposed(null);
    setWarnings([]);
    setMergeModel(null);
  }

  async function handleRun(source: SourceShape) {
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
        locale: props.locale,
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
  if (props.kind === "recipe") {
    DiffComponent = RecipeDiff;
  } else if (props.kind === "ingredient") {
    DiffComponent = IngredientDiff;
  } else {
    const pairingLocale = props.locale;
    DiffComponent = (p) => <PairingDiff {...p} locale={pairingLocale} />;
  }

  const reviewContent =
    proposed && DiffComponent ? (
      <div className="space-y-4">
        <div className="max-h-[50vh] overflow-y-auto">
          {warnings.length > 0 && (
            <div className="mb-3 space-y-0.5">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}
          <DiffComponent existing={existing} proposed={proposed} />
        </div>
        <DialogFooter>
          <Button onClick={() => void handleApply()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                Applying…
              </>
            ) : (
              <>
                <Check size={14} className="mr-1" />
                Apply changes
              </>
            )}
          </Button>
        </DialogFooter>
      </div>
    ) : undefined;

  return (
    <IngestDialog
      open={open}
      onOpenChange={(o) => !o && handleClose()}
      title={title}
      onRun={handleRun}
      onReviewBack={handleReviewBack}
      reviewChildren={reviewContent}
      generateLabel="Generate enhanced version"
      className="sm:max-w-4xl"
    />
  );
}
