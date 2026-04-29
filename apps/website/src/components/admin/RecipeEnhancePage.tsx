import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";
import SourcePicker, { type Source, type SourceMode } from "./SourcePicker.tsx";
import RecipeDiff from "./RecipeDiff.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";

type Step = "source" | "diff";

interface Props {
  collection: RecipeCollection;
  slug: string;
  existingRecipe: Record<string, unknown>;
}

const TABS: Array<{ id: SourceMode; label: string }> = [
  { id: "file", label: "From file" },
  { id: "text", label: "From text" },
  { id: "prompt", label: "From prompt" },
];

export default function RecipeEnhancePage({ collection, slug, existingRecipe }: Props) {
  const [step, setStep] = useState<Step>("source");
  const [tab, setTab] = useState<SourceMode>("prompt");
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [proposed, setProposed] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    if (!source) {
      toast.error("Provide a source first");
      return;
    }
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("existing", JSON.stringify(existingRecipe));

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

      const { data, error } = await actions.aiMergeRecipe(formData);
      if (error || !data) throw new Error(error?.message ?? "Merge failed");

      setProposed(data.recipe as Record<string, unknown>);
      setWarnings(data.warnings);
      setStep("diff");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!proposed) return;
    setSaving(true);

    // Build the full recipe payload by merging schema.org fields back
    const recipePayload = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      ...proposed,
    };

    const { error } = await actions.saveRecipe({
      collection,
      slug,
      recipe: recipePayload,
    });
    setSaving(false);

    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }

    toast.success("Recipe updated!");
    window.location.href = `/admin/${collection}/${slug}/edit`;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" type="button" onClick={() => window.history.back()}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            Enhance recipe
          </h1>
          <p className="text-sm text-muted-foreground">{slug}</p>
        </div>
      </div>

      {/* Step 1: source picker */}
      {step === "source" && (
        <div className="space-y-4">
          {/* Mode tabs */}
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

          <Button
            onClick={handleGenerate}
            disabled={!source || loading}
            className="w-full max-w-sm"
          >
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
      )}

      {/* Step 2: diff */}
      {step === "diff" && proposed && (
        <div className="space-y-6">
          {warnings.length > 0 && (
            <div className="space-y-0.5">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}

          <RecipeDiff existing={existingRecipe} proposed={proposed} />

          <div className="flex gap-3">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setStep("source");
                setProposed(null);
                setSource(null);
              }}
            >
              Try different source
            </Button>
            <Button onClick={handleApply} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1" />
                  Saving…
                </>
              ) : (
                <>
                  <Check size={14} className="mr-1" />
                  Apply changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
