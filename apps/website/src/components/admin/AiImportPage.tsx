import { useState } from "react";
import { navigate } from "astro:transitions/client";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Bug,
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
import { FileTextPromptSourcePicker } from "./FileTextPromptSourcePicker.tsx";
import type { SourceShape } from "./FileTextPromptSourcePicker.tsx";
import CapabilityLabel from "./CapabilityLabel.tsx";
import { useImportAction, parseActionError } from "@/lib/ai/use-import-action.ts";
import type {
  ContentType,
  RecipeCollection,
  Locale,
  ImportResult,
  AiDebugInfo,
  ParsedActionError,
} from "@/lib/ai/use-import-action.ts";

export type { SourceMeta } from "@/lib/ai/use-import-action.ts";

function detectRecipeLanguage(recipe: Record<string, unknown> | null): Locale | null {
  if (!recipe) return null;
  const fields = [recipe["name"], recipe["description"]];
  if (Array.isArray(recipe["recipeIngredient"])) fields.push(...recipe["recipeIngredient"]);
  if (Array.isArray(recipe["recipeInstructions"])) {
    for (const step of recipe["recipeInstructions"]) {
      if (typeof step === "object" && step !== null && "text" in step) {
        fields.push((step as { text: unknown }).text);
      }
    }
  }
  const text = fields.filter((v) => typeof v === "string").join(" ");
  if (!text) return null;
  if (/[äöüÄÖÜß]/.test(text)) return "de";
  return null;
}

function composeAction(sourceKind: string | undefined, contentType: ContentType): string {
  if (sourceKind === "prompt" && contentType === "recipe") return "aiGenerateRecipe";
  switch (contentType) {
    case "recipe":
      return "aiExtractRecipe";
    case "ingredient":
      return "aiExtractIngredient";
    case "pairing":
      return "aiExtractPairing";
  }
}

export default function AiImportPage() {
  const [contentType, setContentType] = useState<ContentType>("recipe");
  const [collection, setCollection] = useState<RecipeCollection>("recipes");
  const [locale, setLocale] = useState<Locale>("en");
  const [localeUserSet, setLocaleUserSet] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [source, setSource] = useState<SourceShape | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [partialRecipe, setPartialRecipe] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [debug, setDebug] = useState<AiDebugInfo | null>(null);
  const [error, setError] = useState<ParsedActionError | null>(null);
  const [sourceMeta, setSourceMeta] = useState<ImportResult["sourceMeta"] | null>(null);

  const run = useImportAction(contentType, locale, collection, (partial) =>
    setPartialRecipe(partial),
  );

  function reset() {
    setResult(null);
    setPartialRecipe(null);
    setError(null);
    setWarnings([]);
    setDebug(null);
    setSourceMeta(null);
  }

  function handleSourceChange(s: SourceShape | null) {
    setSource(s);
    if (!s) reset();
  }

  async function handleSubmit() {
    if (!source) {
      toast.error("Provide a source first");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setPartialRecipe(null);
    setDebug(null);
    try {
      const submitted = await run(source, debugMode);
      setPartialRecipe(null);
      setResult(submitted.result);
      setWarnings(submitted.warnings);
      if (submitted.debug) setDebug(submitted.debug);
      if (submitted.sourceMeta) setSourceMeta(submitted.sourceMeta);
      if (contentType === "recipe" && !localeUserSet) {
        const detected = detectRecipeLanguage(submitted.result);
        if (detected) setLocale(detected);
      }
      toast.success(submitted.successMessage);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const parsed = parseActionError(raw);
      setError(parsed);
      toast.error(parsed.message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenInEditor() {
    if (!result) return;
    if (contentType === "recipe") {
      sessionStorage.setItem(
        "import-recipe",
        JSON.stringify({
          recipe: result,
          source: { url: "" },
          warnings,
          meta: { language: locale },
          sourceMeta: sourceMeta ?? undefined,
        }),
      );
      void navigate(`/admin/${collection}/new?import=1`);
    } else if (contentType === "pairing") {
      sessionStorage.setItem("import-pairing", JSON.stringify({ pairing: result }));
      void navigate(`/admin/pairings/new?import=1&locale=${locale}`);
    } else {
      sessionStorage.setItem("import-ingredient", JSON.stringify({ ingredient: result, locale }));
      void navigate(`/admin/ingredients/new?import=1&locale=${locale}`);
    }
  }

  const sourceKind = source?.kind;
  const isPromptMode = sourceKind === "prompt";

  let submitLabel: string;
  if (isPromptMode && contentType === "recipe") {
    submitLabel = "Generate recipe";
  } else if (contentType === "recipe") {
    submitLabel = "Extract recipe";
  } else if (contentType === "pairing") {
    submitLabel = "Extract pairing";
  } else {
    submitLabel = "Extract ingredient";
  }

  const loadingAction = composeAction(sourceKind, contentType);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI import</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Extract a recipe or ingredient from a file, pasted text, or generate from a prompt.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Options</CardTitle>
          <CardDescription>Choose the content target and source.</CardDescription>
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
                {!isPromptMode && <SelectItem value="ingredient">Ingredient</SelectItem>}
                {!isPromptMode && <SelectItem value="pairing">Pairing</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Collection (recipes only) */}
          {contentType === "recipe" && (
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
          )}

          {/* Locale */}
          <div className="space-y-1.5">
            <Label>Locale</Label>
            <Select
              value={locale}
              onValueChange={(v) => {
                setLocale(v as Locale);
                setLocaleUserSet(true);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="de">German</SelectItem>
              </SelectContent>
            </Select>
            {contentType === "recipe" && !isPromptMode && (
              <p className="text-xs text-muted-foreground">
                Auto-detected from the source. Override if needed before opening the editor.
              </p>
            )}
          </div>

          {/* Source input via registry primitive */}
          <FileTextPromptSourcePicker onChange={handleSourceChange} />

          {/* Debug toggle */}
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Bug size={14} />
            <span>Debug mode — show model output, finish reason, and raw text on failure</span>
          </label>

          <Button onClick={handleSubmit} disabled={!source || loading} className="w-full">
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                <CapabilityLabel action={loadingAction} />
              </>
            ) : (
              <>
                {isPromptMode ? (
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
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-destructive">Failed</p>
                <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">
                  {error.message}
                </p>
                {error.details && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-medium text-foreground/80 hover:text-foreground">
                      Diagnostic details
                    </summary>
                    <div className="mt-2 space-y-2">
                      {(error.details.modelId || error.details.finishReason) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                          {error.details.modelId && (
                            <span>
                              <span className="font-medium">model:</span> {error.details.modelId}
                            </span>
                          )}
                          {error.details.finishReason && (
                            <span>
                              <span className="font-medium">finishReason:</span>{" "}
                              {error.details.finishReason}
                            </span>
                          )}
                          {error.details.usage?.totalTokens !== undefined && (
                            <span>
                              <span className="font-medium">tokens:</span>{" "}
                              {error.details.usage.totalTokens}
                            </span>
                          )}
                        </div>
                      )}
                      {error.details.cause && (
                        <div>
                          <p className="font-medium text-foreground/80 mb-0.5">Cause</p>
                          <pre className="whitespace-pre-wrap break-words rounded bg-muted/60 p-2 text-[11px]">
                            {error.details.cause}
                          </pre>
                        </div>
                      )}
                      {error.details.rawText && (
                        <div>
                          <p className="font-medium text-foreground/80 mb-0.5">Raw model output</p>
                          <pre className="whitespace-pre-wrap break-words rounded bg-muted/60 p-2 max-h-80 overflow-auto text-[11px]">
                            {error.details.rawText}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug panel (success path) */}
      {debug && (
        <Card className="border-blue-500/40 bg-blue-50/30 dark:bg-blue-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bug size={14} className="text-blue-600" />
              <CardTitle className="text-sm text-blue-700 dark:text-blue-400">Debug info</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {debug.modelId && (
                <span>
                  <span className="font-medium">model:</span> {debug.modelId}
                </span>
              )}
              {debug.finishReason && (
                <span>
                  <span className="font-medium">finishReason:</span> {debug.finishReason}
                </span>
              )}
              {debug.usage?.totalTokens !== undefined && (
                <span>
                  <span className="font-medium">tokens:</span> {debug.usage.totalTokens}
                  {debug.usage.inputTokens !== undefined &&
                    ` (in: ${debug.usage.inputTokens}, out: ${debug.usage.outputTokens ?? "?"})`}
                </span>
              )}
            </div>
            {debug.rawText && (
              <details>
                <summary className="cursor-pointer font-medium text-foreground/80 hover:text-foreground">
                  Raw model output
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted/60 p-2 max-h-80 overflow-auto text-[11px]">
                  {debug.rawText}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Live recipe preview while generating */}
      {loading && partialRecipe && isPromptMode && contentType === "recipe" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              Generating…
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {typeof partialRecipe["name"] === "string" && partialRecipe["name"] && (
              <p className="font-semibold">{partialRecipe["name"]}</p>
            )}
            {typeof partialRecipe["description"] === "string" && partialRecipe["description"] && (
              <p className="text-muted-foreground line-clamp-3">{partialRecipe["description"]}</p>
            )}
            {Array.isArray(partialRecipe["recipeIngredient"]) &&
              (partialRecipe["recipeIngredient"] as string[]).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {(partialRecipe["recipeIngredient"] as string[]).length} ingredients so far…
                </p>
              )}
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
