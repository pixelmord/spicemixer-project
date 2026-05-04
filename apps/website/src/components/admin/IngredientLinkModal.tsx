import { useState, useEffect } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import {
  Loader2,
  Link2,
  Sparkles,
  ExternalLink,
  Unlink,
  Search,
  Check,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";
import SourcePicker, { type Source, type SourceMode } from "./SourcePicker.tsx";
import { slugify } from "@/lib/slugify.ts";
import type { EntityOption } from "./EntityCombobox.tsx";
import type { RecipeCollection } from "@/lib/content-store.ts";

// ── Types ───────────────────────────────────────────────────────────────────

interface ViewMode {
  mode: "view";
  slug: string;
  locale?: string;
  onUnlink: () => void;
}

interface LinkMode {
  mode: "link";
  ingredientString: string;
  aiSuggestion?: { pattern: string; slug: string; confidence: "high" | "medium" | "low" };
  ingredientOptions: EntityOption[];
  locale?: string;
  collection: RecipeCollection;
  onLinked: (slug: string, pattern: string) => void;
}

type Props = { open: boolean; onClose: () => void } & (ViewMode | LinkMode);

type IngestTab = "search" | "prompt" | "file";

// ── View mode ────────────────────────────────────────────────────────────────

function IngredientViewContent({
  slug,
  locale = "en",
  onUnlink,
  onClose,
}: {
  slug: string;
  locale?: string;
  onUnlink: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const { data: item } = await actions.getItem({
          collection: "ingredients",
          id: `${locale}/${slug}`,
        });
        if (item?.item?.data) setData(item.item.data as Record<string, unknown>);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, locale]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Ingredient not found: <code className="font-mono">{slug}</code>
      </p>
    );
  }

  const name = typeof data["name"] === "string" ? data["name"] : slug;
  const category = typeof data["category"] === "string" ? data["category"] : "";
  const summary =
    typeof data["summary"] === "string"
      ? data["summary"]
      : typeof data["description"] === "string"
        ? data["description"]
        : "";
  const flavorNotes = Array.isArray(data["flavorNotes"]) ? (data["flavorNotes"] as string[]) : [];
  const origin = Array.isArray(data["origin"]) ? (data["origin"] as string[]) : [];
  const image = typeof data["image"] === "string" ? data["image"] : "";

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {image && (
          <img
            src={image}
            alt={name}
            className="w-16 h-16 rounded-lg object-cover shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg">{name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            {category && (
              <Badge variant="secondary" className="text-xs">
                {category}
              </Badge>
            )}
            {origin.length > 0 && (
              <span className="text-xs text-muted-foreground">{origin.join(", ")}</span>
            )}
          </div>
        </div>
      </div>

      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}

      {flavorNotes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {flavorNotes.map((note) => (
            <Badge key={note} variant="outline" className="text-xs">
              {note}
            </Badge>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onUnlink();
            onClose();
          }}
          className="text-destructive hover:text-destructive"
        >
          <Unlink size={12} className="mr-1.5" />
          Unlink
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/ingredients/${slug}/`, "_blank")}
        >
          <ExternalLink size={12} className="mr-1.5" />
          Open page
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Link mode ────────────────────────────────────────────────────────────────

function IngredientLinkContent({
  ingredientString,
  aiSuggestion,
  ingredientOptions,
  locale = "en",
  collection,
  onLinked,
  onClose,
}: {
  ingredientString: string;
  aiSuggestion?: LinkMode["aiSuggestion"];
  ingredientOptions: EntityOption[];
  locale?: string;
  collection: RecipeCollection;
  onLinked: (slug: string, pattern: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<IngestTab>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null);
  const [extractedSlug, setExtractedSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredOptions = searchQuery
    ? ingredientOptions.filter(
        (o) =>
          o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.value.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : ingredientOptions.slice(0, 10);

  function patternFromSlug(slug: string): string {
    const opt = ingredientOptions.find((o) => o.value === slug);
    const name = opt?.label ?? slug.replace(/-/g, " ");
    // Find the best matching substring in the ingredient string
    const lower = ingredientString.toLowerCase();
    const nameLower = name.toLowerCase();
    if (lower.includes(nameLower)) return nameLower;
    // Try slug words
    const slugWords = slug.split("-");
    for (const word of slugWords) {
      if (word.length > 2 && lower.includes(word)) return word;
    }
    return name.toLowerCase();
  }

  function applyExisting(slug: string) {
    const pattern = patternFromSlug(slug);
    onLinked(slug, pattern);
    onClose();
    toast.success(`Linked → ${slug}`);
  }

  async function handleExtract() {
    if (!source) return;
    setLoading(true);
    setExtracted(null);
    try {
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
      const { data, error } = await actions.aiExtractIngredient(formData);
      if (error || !data) throw new Error(error?.message ?? "Extraction failed");
      const ingredient = data.ingredient as Record<string, unknown>;
      setExtracted(ingredient);
      setExtractedSlug(slugify(typeof ingredient["name"] === "string" ? ingredient["name"] : ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAndLink() {
    if (!extracted || !extractedSlug) return;
    setSaving(true);
    try {
      const { error } = await actions.saveIngredient({
        locale: locale as "en" | "de",
        slug: extractedSlug,
        ingredient: extracted,
      });
      if (error) throw new Error(error.message);
      const pattern = patternFromSlug(extractedSlug);
      onLinked(extractedSlug, pattern);
      onClose();
      toast.success(`Created and linked: ${extractedSlug}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const TABS: Array<{ id: IngestTab; label: string; icon: React.ReactNode }> = [
    { id: "search", label: "Search", icon: <Search size={12} /> },
    { id: "prompt", label: "Generate", icon: <Sparkles size={12} /> },
    { id: "file", label: "From file", icon: <Upload size={12} /> },
  ];

  return (
    <div className="space-y-3">
      {/* Hint */}
      <p className="text-xs text-muted-foreground rounded bg-muted/50 px-2 py-1.5 font-mono truncate">
        {ingredientString}
      </p>

      {/* AI suggestion quick-apply */}
      {aiSuggestion && (
        <button
          type="button"
          onClick={() => applyExisting(aiSuggestion.slug)}
          className="flex w-full items-center justify-between rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm hover:bg-amber-100 dark:hover:bg-amber-950/40"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-amber-600 shrink-0" />
            <span>
              AI match: <span className="font-mono font-medium">{aiSuggestion.slug}</span>
            </span>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              {
                high: "text-emerald-600 border-emerald-200",
                medium: "text-amber-600 border-amber-200",
                low: "text-muted-foreground",
              }[aiSuggestion.confidence] ?? "text-muted-foreground",
            )}
          >
            {aiSuggestion.confidence}
          </Badge>
        </button>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setExtracted(null);
              setSource(null);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
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

      {/* Search tab */}
      {tab === "search" && (
        <div className="space-y-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ingredients…"
            autoFocus
          />
          <ul className="max-h-48 overflow-y-auto space-y-0.5">
            {filteredOptions.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => applyExisting(opt.value)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span>{opt.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">{opt.value}</span>
                </button>
              </li>
            ))}
            {filteredOptions.length === 0 && (
              <li className="text-xs text-muted-foreground text-center py-4">
                No matches. Try AI generation below.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Prompt / file tabs */}
      {(tab === "prompt" || tab === "file") && !extracted && (
        <div className="space-y-3">
          <SourcePicker
            key={tab}
            mode={tab === "prompt" ? "prompt" : "file"}
            onChange={setSource}
          />
          <Button
            onClick={handleExtract}
            disabled={!source || loading}
            className="w-full"
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 size={12} className="animate-spin mr-1" />
                Extracting…
              </>
            ) : (
              <>
                <Sparkles size={12} className="mr-1" />
                Extract ingredient
              </>
            )}
          </Button>
        </div>
      )}

      {/* Extracted preview */}
      {extracted && (
        <div className="space-y-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-1.5">
            <p className="font-medium">
              {typeof extracted["name"] === "string" ? extracted["name"] : ""}
            </p>
            {!!extracted["category"] && (
              <Badge variant="secondary" className="text-xs">
                {typeof extracted["category"] === "string" ? extracted["category"] : ""}
              </Badge>
            )}
            {Array.isArray(extracted["flavorNotes"]) && extracted["flavorNotes"].length > 0 && (
              <p className="text-xs text-muted-foreground">
                {(extracted["flavorNotes"] as string[]).join(", ")}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Slug</Label>
            <Input
              value={extractedSlug}
              onChange={(e) => setExtractedSlug(e.target.value)}
              placeholder="ingredient-slug"
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExtracted(null);
                setSource(null);
              }}
            >
              Back
            </Button>
            <Button onClick={handleSaveAndLink} disabled={saving || !extractedSlug} size="sm">
              {saving ? (
                <>
                  <Loader2 size={12} className="animate-spin mr-1" />
                  Saving…
                </>
              ) : (
                <>
                  <Check size={12} className="mr-1" />
                  Save &amp; link
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function IngredientLinkModal(props: Props) {
  const { open, onClose } = props;

  const title =
    props.mode === "view"
      ? `Ingredient: ${props.slug}`
      : props.mode === "link" && props.aiSuggestion
        ? "Link ingredient"
        : "Link ingredient";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 size={15} className="text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {props.mode === "view" ? (
          <IngredientViewContent
            slug={props.slug}
            locale={props.locale}
            onUnlink={props.onUnlink}
            onClose={onClose}
          />
        ) : (
          <IngredientLinkContent
            ingredientString={props.ingredientString}
            aiSuggestion={props.aiSuggestion}
            ingredientOptions={props.ingredientOptions}
            locale={props.locale}
            collection={props.collection}
            onLinked={props.onLinked}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
