import { useState, useRef } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  FileText,
  Image,
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

type ContentType = "recipe" | "ingredient";
type RecipeCollection = "recipes" | "spicemixes" | "sauces";
type Locale = "en" | "de";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];

export default function FileIngestionForm() {
  const [contentType, setContentType] = useState<ContentType>("recipe");
  const [collection, setCollection] = useState<RecipeCollection>("recipes");
  const [locale, setLocale] = useState<Locale>("en");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && !ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Unsupported file type. Use PDF or an image (JPEG, PNG, WebP).");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    setWarnings([]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0] ?? null;
    if (f && !ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Unsupported file type. Use PDF or an image (JPEG, PNG, WebP).");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    setWarnings([]);
  }

  async function handleExtract() {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mimeType", file.type);

    if (contentType === "recipe") {
      const { data, error: err } = await actions.aiExtractRecipe(formData);
      setLoading(false);
      if (err || !data) {
        const msg = err?.message ?? "Extraction failed";
        setError(msg);
        toast.error(msg);
        return;
      }
      setResult(data.recipe as Record<string, unknown>);
      setWarnings(data.warnings);
      toast.success("Recipe extracted! Review and open in editor.");
    } else {
      const { data, error: err } = await actions.aiExtractIngredient(formData);
      setLoading(false);
      if (err || !data) {
        const msg = err?.message ?? "Extraction failed";
        setError(msg);
        toast.error(msg);
        return;
      }
      setResult(data.ingredient as Record<string, unknown>);
      setWarnings(data.warnings);
      toast.success("Ingredient extracted! Review and open in editor.");
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
    } else {
      sessionStorage.setItem("import-ingredient", JSON.stringify({ ingredient: result, locale }));
      window.location.href = `/admin/ingredients/new?import=1&locale=${locale}`;
    }
  }

  const fileIcon =
    file?.type === "application/pdf" ? (
      <FileText size={16} className="text-muted-foreground" />
    ) : (
      <Image size={16} className="text-muted-foreground" />
    );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import from file</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload a PDF or image — AI will extract structured recipe or ingredient data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">File & target</CardTitle>
          <CardDescription>
            Supports PDFs with extractable text and images (JPEG, PNG, WebP).
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
                setResult(null);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recipe">Recipe</SelectItem>
                <SelectItem value="ingredient">Ingredient</SelectItem>
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
                  <SelectItem value="spicemixes">Spicemixes</SelectItem>
                  <SelectItem value="sauces">Sauces</SelectItem>
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

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                {fileIcon}
                <span className="text-sm font-medium">{file.name}</span>
                <Badge variant="secondary">{(file.size / 1024).toFixed(0)} KB</Badge>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload size={24} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop a PDF or image here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, WebP · max 10 MB</p>
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button onClick={handleExtract} disabled={!file || loading} className="w-full">
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                Extracting…
              </>
            ) : (
              <>
                <Upload size={14} className="mr-1" />
                Extract with AI
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
                <p className="font-medium text-sm text-destructive">Extraction failed</p>
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
                {contentType === "recipe" ? "Recipe" : "Ingredient"} extracted
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold">{String(result["name"] ?? "Untitled")}</h3>
              {typeof result["description"] === "string" && result["description"] && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {result["description"]}
                </p>
              )}
              {contentType === "recipe" && Array.isArray(result["recipeIngredient"]) && (
                <p className="text-xs text-muted-foreground">
                  {(result["recipeIngredient"] as string[]).length} ingredients detected
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
