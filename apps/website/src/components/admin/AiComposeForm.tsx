import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  AlignLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import SourcePicker, { type Source, type SourceMode } from "./SourcePicker.tsx";

type ContentType = "recipe" | "ingredient" | "pairing";
type RecipeCollection = "recipes" | "mixtures";
type Locale = "en" | "de";

const TABS: Array<{ id: SourceMode; label: string; icon: React.ReactNode }> = [
  { id: "file", label: "From file", icon: <Upload size={14} /> },
  { id: "text", label: "From text", icon: <AlignLeft size={14} /> },
  { id: "prompt", label: "Generate", icon: <Sparkles size={14} /> },
];

export default function AiComposeForm() {
  const [tab, setTab] = useState<SourceMode>("file");
  const [contentType, setContentType] = useState<ContentType>("recipe");
  const [collection, setCollection] = useState<RecipeCollection>("recipes");
  const [locale, setLocale] = useState<Locale>("en");
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setResult(null);
    setError(null);
    setWarnings([]);
    setSource(null);
  }

  async function handleSubmit() {
    if (!source) {
      toast.error("Provide a source first");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (contentType === "recipe" && tab === "prompt") {
        const { data, error: err } = await actions.aiGenerateRecipe({
          prompt: (source as { prompt: string }).prompt,
          locale,
          style: collection === "recipes" ? "recipe" : "mixture",
        });
        if (err || !data) throw new Error(err?.message ?? "Generation failed");
        setResult(data.recipe as Record<string, unknown>);
        setWarnings(data.warnings);
        toast.success("Recipe generated!");
      } else {
        const formData = new FormData();
        if (source.kind === "file") {
          formData.append("file", source.file);
          formData.append("mimeType", source.mimeType);
        } else {
          formData.append(
            "text",
            source.kind === "text" ? source.content : (source as { prompt: string }).prompt,
          );
        }

        if (contentType === "recipe") {
          const { data, error: err } = await actions.aiExtractRecipe(formData);
          if (err || !data) throw new Error(err?.message ?? "Extraction failed");
          setResult(data.recipe as Record<string, unknown>);
          setWarnings(data.warnings);
          toast.success("Recipe extracted!");
        } else if (contentType === "ingredient") {
          const { data, error: err } = await actions.aiExtractIngredient(formData);
          if (err || !data) throw new Error(err?.message ?? "Extraction failed");
          setResult(data.ingredient as Record<string, unknown>);
          setWarnings(data.warnings);
          toast.success("Ingredient extracted!");
        } else {
          const { data, error: err } = await actions.aiExtractPairing(formData);
          if (err || !data) throw new Error(err?.message ?? "Extraction failed");
          setResult(data.pairing as Record<string, unknown>);
          setWarnings(data.warnings);
          toast.success("Pairing extracted!");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenInEditor() {
    if (!result) return;
    if (contentType === "recipe") {
      sessionStorage.setItem(
        "import-recipe",
        JSON.stringify({ recipe: result, source: { url: "" }, warnings }),
      );
      window.location.href = `/admin/${collection}/new?import=1`;
    } else if (contentType === "pairing") {
      sessionStorage.setItem("import-pairing", JSON.stringify({ pairing: result }));
      window.location.href = `/admin/pairings/new?import=1&locale=${locale}`;
    } else {
      sessionStorage.setItem("import-ingredient", JSON.stringify({ ingredient: result, locale }));
      window.location.href = `/admin/ingredients/new?import=1&locale=${locale}`;
    }
  }

  const submitLabel =
    tab === "prompt" && contentType === "recipe"
      ? "Generate recipe"
      : contentType === "recipe"
        ? "Extract recipe"
        : contentType === "pairing"
          ? "Extract pairing"
          : "Extract ingredient";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI compose</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Extract a recipe or ingredient from a file, pasted text, or generate from a prompt.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              reset();
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Options</CardTitle>
          <CardDescription>
            {tab === "prompt"
              ? "Describe what you want to create."
              : "Choose the content target and source."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Content type */}
          <div className="space-y-1.5">
            <Label>Extract as</Label>
            <Select
              value={contentType}
              onValueChange={(v) => {
                setContentType(v as ContentType);
                reset();
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recipe">Recipe</SelectItem>
                {tab !== "prompt" && <SelectItem value="ingredient">Ingredient</SelectItem>}
                {tab !== "prompt" && <SelectItem value="pairing">Pairing</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Collection / locale */}
          {contentType === "recipe" ? (
            <div className="space-y-1.5">
              <Label>Save to collection</Label>
              <Select
                value={collection}
                onValueChange={(v) => setCollection(v as RecipeCollection)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recipes">Recipes</SelectItem>
                  <SelectItem value="mixtures">Mixtures</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Locale</Label>
              <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Source input */}
          <SourcePicker key={tab} mode={tab} onChange={setSource} />

          <Button onClick={handleSubmit} disabled={!source || loading} className="w-full">
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                Working…
              </>
            ) : (
              <>
                {tab === "prompt" ? (
                  <Sparkles size={14} className="mr-1" />
                ) : (
                  <Upload size={14} className="mr-1" />
                )}
                {submitLabel}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm text-destructive">Failed</p>
                <p className="text-sm text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {result && (
        <Card className="border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">
                {contentType === "recipe"
                  ? "Recipe"
                  : contentType === "pairing"
                    ? "Pairing"
                    : "Ingredient"}{" "}
                ready
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              {contentType === "pairing" ? (
                <>
                  <h3 className="font-semibold">
                    {typeof result["ingredient1"] === "string" ? result["ingredient1"] : "?"} ↔{" "}
                    {typeof result["ingredient2"] === "string" ? result["ingredient2"] : "?"}
                  </h3>
                  {typeof result["description"] === "string" && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {result["description"]}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h3 className="font-semibold">
                    {typeof result["name"] === "string" ? result["name"] : "Untitled"}
                  </h3>
                  {typeof result["description"] === "string" && result["description"] && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {result["description"]}
                    </p>
                  )}
                  {contentType === "recipe" && Array.isArray(result["recipeIngredient"]) && (
                    <p className="text-xs text-muted-foreground">
                      {(result["recipeIngredient"] as string[]).length} ingredients
                    </p>
                  )}
                  {contentType === "ingredient" && Array.isArray(result["flavorNotes"]) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(result["flavorNotes"] as string[]).map((note) => (
                        <Badge key={note} variant="secondary" className="text-xs">
                          {note}
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {warnings.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Warnings:
                </p>
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    · {w}
                  </p>
                ))}
              </div>
            )}
            <Button onClick={handleOpenInEditor} className="w-full">
              Open in editor
              <ArrowRight size={14} className="ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
