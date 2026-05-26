import { useState } from "react";
import { navigate } from "astro:transitions/client";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Link, Loader2, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
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

type Collection = "recipes" | "mixtures";

interface IngestResult {
  recipe: Record<string, unknown>;
  source: { url: string; canonical?: string; siteName?: string; fetchedAt: string };
  warnings: Array<{ code: string; field?: string; message: string }>;
  /** BCP-47 primary subtag derived from JSON-LD inLanguage or <html lang>. */
  language?: string;
}

export default function ImportFromUrl() {
  const [url, setUrl] = useState("");
  const [collection, setCollection] = useState<Collection>("recipes");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const { data, error: err } = await actions.ingestUrl({ url: url.trim() });
    setLoading(false);

    if (err || !data) {
      const msg = err?.message ?? "Failed to fetch recipe";
      setError(msg);
      toast.error(msg);
      return;
    }

    setResult(data as IngestResult);
    toast.success("Recipe fetched! Review the details and proceed to edit.");
  }

  function handleEditInForm() {
    if (!result) return;
    // Forward the detected language under `meta.language` — NewRecipePage maps
    // that into the form's locale, which gates the Save button.
    const payload = {
      recipe: result.recipe,
      source: result.source,
      warnings: result.warnings,
      ...(result.language ? { meta: { language: result.language } } : {}),
    };
    sessionStorage.setItem("import-recipe", JSON.stringify(payload));
    void navigate(`/admin/${collection}/new?import=1`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import recipe from URL</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Paste a recipe URL and we'll extract the schema.org JSON-LD data automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source URL</CardTitle>
          <CardDescription>
            Works with sites that embed JSON-LD Recipe markup (BBC Good Food, AllRecipes, NYT
            Cooking, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="url">Recipe URL</Label>
            <div className="flex gap-2">
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                placeholder="https://www.bbcgoodfood.com/recipes/…"
                className="flex-1"
              />
              <Button onClick={handleFetch} disabled={loading} className="shrink-0">
                {loading ? (
                  <Loader2 size={14} className="animate-spin mr-1" />
                ) : (
                  <Link size={14} className="mr-1" />
                )}
                Fetch
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Save to collection</Label>
            <Select value={collection} onValueChange={(v) => setCollection(v as Collection)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recipes">Recipes</SelectItem>
                <SelectItem value="mixtures">Mixtures</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm text-destructive">Fetch failed</p>
                <p className="text-sm text-muted-foreground mt-0.5">{error}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Make sure the site publishes schema.org JSON-LD Recipe markup. Microdata-only
                  sites are not currently supported.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success state */}
      {result && (
        <Card className="border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">
                Recipe found
              </CardTitle>
            </div>
            {result.source.siteName && (
              <CardDescription>from {result.source.siteName}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {(result.recipe.name as string | undefined) ?? "Untitled"}
                </h3>
              </div>
              {!!result.recipe.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {result.recipe.description as string}
                </p>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                {!!result.recipe.recipeCategory && (
                  <Badge variant="secondary">{result.recipe.recipeCategory as string}</Badge>
                )}
                {!!result.recipe.recipeCuisine && (
                  <Badge variant="secondary">{result.recipe.recipeCuisine as string}</Badge>
                )}
                {!!result.recipe.recipeYield && (
                  <Badge variant="outline">{result.recipe.recipeYield as string}</Badge>
                )}
              </div>
              {Array.isArray(result.recipe.recipeIngredient) && (
                <p className="text-xs text-muted-foreground">
                  {(result.recipe.recipeIngredient as string[]).length} ingredients detected
                </p>
              )}
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Warnings:
                </p>
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    · {w.field ? `[${w.field}] ` : ""}
                    {w.message}
                  </p>
                ))}
              </div>
            )}

            {/* Source */}
            <div className="text-xs text-muted-foreground">
              Source:{" "}
              <a
                href={result.source.canonical ?? result.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {result.source.canonical ?? result.source.url}
              </a>
            </div>

            <Button onClick={handleEditInForm} className="w-full">
              Open in editor
              <ArrowRight size={14} className="ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
