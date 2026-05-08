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
import { cn } from "@/lib/utils.ts";
import SourcePicker, { type Source, type SourceMode } from "./SourcePicker.tsx";
import CapabilityLabel from "./CapabilityLabel.tsx";

type ContentType = "recipe" | "ingredient" | "pairing";
type RecipeCollection = "recipes" | "mixtures";
type Locale = "en" | "de";

interface AiDebugInfo {
  modelId?: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  rawText?: string;
}

interface SubmitResult {
  result: Record<string, unknown>;
  warnings: string[];
  successMessage: string;
  debug?: AiDebugInfo;
}

interface ErrorState {
  message: string;
  details?: AiDebugInfo & { cause?: string };
}

const AI_DETAILS_MARKER = "__AI_DETAILS__";

/**
 * Server actions wrap AiError details into the message after a sentinel marker.
 * Strip and parse them so the UI can render a structured debug panel.
 */
function parseActionError(message: string): ErrorState {
  const idx = message.indexOf(AI_DETAILS_MARKER);
  if (idx === -1) return { message };
  const head = message.slice(0, idx).trim();
  const tail = message.slice(idx + AI_DETAILS_MARKER.length);
  try {
    const details = JSON.parse(tail) as ErrorState["details"];
    return { message: head || "Action failed", details };
  } catch {
    return { message };
  }
}

/**
 * Best-effort source-language detection from the extracted recipe. Looks for
 * characters that appear in German but not English (ä/ö/ü/ß). Returns null
 * when nothing distinctive is found so callers can fall back to user choice.
 */
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

const TABS: Array<{ id: SourceMode; label: string; icon: React.ReactNode }> = [
  { id: "file", label: "From file", icon: <Upload size={14} /> },
  { id: "text", label: "From text", icon: <AlignLeft size={14} /> },
  { id: "prompt", label: "Generate", icon: <Sparkles size={14} /> },
];

function composeAction(tab: SourceMode, contentType: ContentType): string {
  if (tab === "prompt" && contentType === "recipe") return "aiGenerateRecipe";
  switch (contentType) {
    case "recipe":
      return "aiExtractRecipe";
    case "ingredient":
      return "aiExtractIngredient";
    case "pairing":
      return "aiExtractPairing";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildFormData(source: Source, debug?: boolean): FormData {
  const fd = new FormData();
  if (source.kind === "file") {
    fd.append("file", source.file);
    fd.append("mimeType", source.mimeType);
  } else {
    fd.append(
      "text",
      source.kind === "text" ? source.content : (source as { prompt: string }).prompt,
    );
  }
  if (debug) fd.append("debug", "1");
  return fd;
}

async function generateRecipe(
  prompt: string,
  locale: Locale,
  collection: RecipeCollection,
  _debug: boolean,
  onPartial?: (partial: Record<string, unknown>) => void,
): Promise<SubmitResult> {
  const response = await fetch("/api/ai/generate-recipe/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      locale,
      style: collection === "recipes" ? "recipe" : "mixture",
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Generation failed: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line.slice(6)) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (event["type"] === "partial" && onPartial) {
        onPartial(event["recipe"] as Record<string, unknown>);
      } else if (event["type"] === "complete") {
        const result = event["result"] as { recipe: Record<string, unknown>; warnings: string[] };
        return {
          result: result.recipe,
          warnings: result.warnings ?? [],
          successMessage: "Recipe generated!",
        };
      } else if (event["type"] === "error") {
        const msg = typeof event["message"] === "string" ? event["message"] : "Generation failed";
        throw new Error(msg);
      }
    }
  }

  throw new Error("Stream ended without a complete event");
}

async function extractContent(
  contentType: ContentType,
  source: Source,
  debug: boolean,
): Promise<SubmitResult> {
  const formData = buildFormData(source, debug);
  if (contentType === "recipe") {
    const { data, error } = await actions.aiExtractRecipe(formData);
    if (error || !data) throw new Error(error?.message ?? "Extraction failed");
    return {
      result: data.recipe as Record<string, unknown>,
      warnings: data.warnings,
      successMessage: "Recipe extracted!",
      debug: (data as { debug?: AiDebugInfo }).debug,
    };
  }
  if (contentType === "ingredient") {
    const { data, error } = await actions.aiExtractIngredient(formData);
    if (error || !data) throw new Error(error?.message ?? "Extraction failed");
    return {
      result: data.ingredient as Record<string, unknown>,
      warnings: data.warnings,
      successMessage: "Ingredient extracted!",
      debug: (data as { debug?: AiDebugInfo }).debug,
    };
  }
  const { data, error } = await actions.aiExtractPairing(formData);
  if (error || !data) throw new Error(error?.message ?? "Extraction failed");
  return {
    result: data.pairing as Record<string, unknown>,
    warnings: data.warnings,
    successMessage: "Pairing extracted!",
    debug: (data as { debug?: AiDebugInfo }).debug,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AiComposeForm() {
  const [tab, setTab] = useState<SourceMode>("file");
  const [contentType, setContentType] = useState<ContentType>("recipe");
  const [collection, setCollection] = useState<RecipeCollection>("recipes");
  const [locale, setLocale] = useState<Locale>("en");
  /** Tracks whether the user has explicitly chosen the locale, so auto-detect
   * never overwrites a deliberate selection. */
  const [localeUserSet, setLocaleUserSet] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [partialRecipe, setPartialRecipe] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [debug, setDebug] = useState<AiDebugInfo | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  function reset() {
    setResult(null);
    setPartialRecipe(null);
    setError(null);
    setWarnings([]);
    setDebug(null);
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
    setPartialRecipe(null);
    setDebug(null);
    try {
      const submitted =
        contentType === "recipe" && tab === "prompt"
          ? await generateRecipe(
              (source as { prompt: string }).prompt,
              locale,
              collection,
              debugMode,
              (partial) => setPartialRecipe(partial),
            )
          : await extractContent(contentType, source, debugMode);
      setPartialRecipe(null);
      setResult(submitted.result);
      setWarnings(submitted.warnings);
      if (submitted.debug) setDebug(submitted.debug);
      // Auto-detect source language for recipes when user hasn't picked one.
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
        }),
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

  const loadingAction = composeAction(tab, contentType);

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

          {/* Locale (always shown — required by the editor for save) */}
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
            {contentType === "recipe" && tab !== "prompt" && (
              <p className="text-xs text-muted-foreground">
                Auto-detected from the source. Override if needed before opening the editor.
              </p>
            )}
          </div>

          {/* Source input */}
          <SourcePicker key={tab} mode={tab} onChange={setSource} />

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
      {loading && partialRecipe && tab === "prompt" && contentType === "recipe" && (
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
