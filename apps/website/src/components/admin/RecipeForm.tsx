import { useState, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import {
  ArrowLeft,
  Sparkles,
  Link2,
  Loader2,
  Languages,
  Check,
  X,
  Trash2,
  ExternalLink,
} from "lucide-react";
import LinkButton from "@/components/admin/LinkButton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  computeCompletenessFromBlob,
  RECIPE_REQUIRED,
  RECIPE_RECOMMENDED,
} from "@/lib/completeness.ts";
import { slugify } from "@/lib/slugify.ts";
import type { RecipeCollection } from "@/lib/content-store.ts";
import { MIXTURE_KINDS, type MixtureKind } from "@/lib/mixture-schema.ts";
import { useEntityFormState } from "@/hooks/useEntityFormState.ts";
import { buildPayload } from "@/lib/entity-form-payload.ts";
import { readSSE } from "@/lib/sse.ts";
import { EntityFormLayout, type OverflowMenuItem } from "@/components/admin/EntityFormLayout.tsx";
import { useSplitViewPreference } from "@/hooks/use-split-view-preference.ts";
import { getSiblingEntity } from "@/lib/get-sibling-entity.ts";
import { AiBulkSuggestButton } from "@registry/components/ai-bulk-suggest-button";
import { AiBulkTranslateButton } from "@registry/components/ai-bulk-translate-button";
import type { SiblingLocale } from "@registry/components/use-ai-suggestions";
import { TextField, TextareaField, TagInputField } from "@/components/admin/fields/index.ts";
interface AiSuggestion {
  field: string;
  suggestion: unknown;
  rationale?: string;
  summary?: string;
  hash?: string;
  traceId?: string;
  confidence?: "high" | "medium" | "low";
}

interface AiSuggestions {
  improvements: AiSuggestion[];
  tags: string[];
  ingredientLinks: Array<{ pattern: string; slug: string; confidence: "high" | "medium" | "low" }>;
  pairings: Array<{
    otherCollection: string;
    otherSlug: string;
    rationale: string;
    traceId?: string;
  }>;
  detectedLanguage?: string;
}

interface PairingListItem {
  id: string;
  endpoints: [{ collection: string; slug: string }, { collection: string; slug: string }];
  description: string;
}
import SortableArrayField from "./SortableArrayField.tsx";
import TagInput from "./TagInput.tsx";
import EntityCombobox, { type EntityOption } from "./EntityCombobox.tsx";
import EntityMultiCombobox from "./EntityMultiCombobox.tsx";
import { CreatePairingDialog, type PairingAiSuggestion } from "./CreatePairingDialog.tsx";
import QuickCreateDialog from "./QuickCreateDialog.tsx";
import FormActionBar from "./FormActionBar.tsx";
import { type SectionDef } from "./SectionNav.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import RecommendedHint from "./RecommendedHint.tsx";
import { IngestDialog } from "./IngestDialog.tsx";
import RecipeDiff from "./RecipeDiff.tsx";
import { useIngestAction } from "@/lib/ai/use-ingest-action.ts";
import { TranslateEntityDialog } from "./TranslateEntityDialog.tsx";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog.tsx";
import IngredientLinkModal from "./IngredientLinkModal.tsx";
import { useAiSuggestions, type RunResult, type FieldSuggestion } from "@/hooks/use-ai-suggestions";
import { SuggestionFlowProvider } from "./SuggestionFlowProvider.tsx";
import ImageSearchModal, {
  type ImageAttribution,
  type SelectedImage,
} from "./ImageSearchModal.tsx";
import { REGION_OPTIONS, type RegionCode } from "@/lib/regions.ts";

type Collection = RecipeCollection;

interface HowToStep {
  "@type": "HowToStep";
  text: string;
  name?: string;
  image?: string;
}

interface RecipeData {
  "@context": string;
  "@type": string;
  name: string;
  description?: string;
  image?: string | string[];
  author?: { "@type": "Person" | "Organization"; name: string; url?: string };
  recipeYield?: string;
  recipeCategory?: string;
  recipeCuisine?: string;
  keywords?: string[];
  suitableForDiet?: string[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  datePublished?: string;
  recipeIngredient: string[];
  recipeInstructions: (string | HowToStep)[];
}

interface IngredientLink {
  pattern: string;
  slug: string;
  kind?: "ingredient" | "recipe";
  collection?: string;
}

interface MetaData {
  draft: boolean;
  language?: string;
  locale?: string;
  translationOf?: string;
  translations?: Record<string, string>;
  kind?: string;
  region: RegionCode[];
  tags: string[];
  ingredientLinks: IngredientLink[];
  sources: Array<{ title: string; url: string; author?: string; year?: string }>;
  variants: string[];
  imageAttribution?: ImageAttribution;
  recipeInstructionsAttribution?: Array<{ index: number } & ImageAttribution>;
  aiSuggestions?: {
    fingerprint: string;
    at: string;
    model: string;
    data: AiSuggestions;
  };
}

interface Props {
  collection: Collection;
  slug?: string;
  initialRecipe?: Partial<RecipeData>;
  initialMeta?: Partial<MetaData>;
  isNew?: boolean;
}

function emptyRecipe(): RecipeData {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "",
    recipeIngredient: [""],
    recipeInstructions: [{ "@type": "HowToStep", text: "" }],
    keywords: [],
    suitableForDiet: [],
  };
}

function emptyMeta(): MetaData {
  return {
    draft: true,
    region: [],
    tags: [],
    ingredientLinks: [],
    sources: [],
    variants: [],
    translations: {},
  };
}

function getFirstImage(image?: string | string[]): string {
  if (!image) return "";
  return Array.isArray(image) ? (image[0] ?? "") : image;
}

function stepText(step: string | HowToStep): string {
  return typeof step === "string" ? step : step.text;
}
function stepName(step: string | HowToStep): string {
  return typeof step === "string" ? "" : (step.name ?? "");
}
function stepImage(step: string | HowToStep): string {
  return typeof step === "string" ? "" : (step.image ?? "");
}

const SECTIONS: SectionDef[] = [
  { id: "section-basic", label: "Basic info" },
  { id: "section-timing", label: "Timing & yield" },
  { id: "section-ingredients", label: "Ingredients" },
  { id: "section-instructions", label: "Instructions" },
  { id: "section-classification", label: "Classification" },
  { id: "section-publishing", label: "Publishing" },
  { id: "section-relations", label: "Pairings" },
  { id: "section-variants", label: "Variants" },
  { id: "section-sources", label: "External sources" },
];

const TIME_FIELDS = new Set(["prepTime", "cookTime", "totalTime"]);

const ISO_DURATION_RE = /^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/;

function toIsoDuration(raw: string): string {
  if (ISO_DURATION_RE.test(raw.trim())) return raw.trim();
  // Convert plain-English patterns like "30 minutes", "1 hour 15 minutes", "1h30m"
  const s = raw.toLowerCase().trim();
  const hours = /(\d+)\s*(?:h(?:ours?)?|hr?)/.exec(s)?.[1];
  const mins = /(\d+)\s*(?:m(?:in(?:utes?)?)?|min)/.exec(s)?.[1];
  const h = hours ? parseInt(hours, 10) : 0;
  const m = mins ? parseInt(mins, 10) : 0;
  if (h || m) return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
  return raw; // can't parse — return as-is, schema validation will catch it
}

function parseDurationMinutes(iso: string): number {
  if (!ISO_DURATION_RE.test((iso ?? "").trim())) return 0;
  const h = /(\d+)H/.exec(iso)?.[1];
  const m = /(\d+)M/.exec(iso)?.[1];
  return (h ? parseInt(h, 10) * 60 : 0) + (m ? parseInt(m, 10) : 0);
}

function minutesToIsoDuration(min: number): string {
  if (min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
];

const RECIPE_AI_CONTRACT = {
  presets: [],
  fields: {
    name: { translation: { mode: "translate" as const } },
    description: { translation: { mode: "translate" as const } },
    recipeCategory: { translation: { mode: "translate" as const } },
    recipeCuisine: { translation: { mode: "translate" as const } },
  },
};

function handleRefreshResult(
  data:
    | { aiSuggestions: AiSuggestions; autoLinked: number; autoAppliedLinks?: string[] }
    | undefined,
  setAiSuggestions: (s: AiSuggestions) => void,
  setIngredientLinks: Dispatch<SetStateAction<IngredientLink[]>>,
) {
  if (!data) return;
  setAiSuggestions(data.aiSuggestions);
  if (data.autoLinked > 0) {
    toast.success(`Auto-linked ${data.autoLinked} ingredient${data.autoLinked !== 1 ? "s" : ""}`);
    const autoAppliedPatterns = new Set(data.autoAppliedLinks ?? []);
    const autoLinks = (data.aiSuggestions.ingredientLinks ?? []).filter((l) =>
      autoAppliedPatterns.has(l.pattern),
    );
    if (autoLinks.length > 0) {
      setIngredientLinks((prev) => {
        const existingPatterns = new Set(prev.map((l) => l.pattern));
        const toAdd = autoLinks
          .filter((l) => !existingPatterns.has(l.pattern))
          .map((l) => ({ pattern: l.pattern, slug: l.slug, kind: "ingredient" as const }));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    }
  }
}

function adaptAiSuggestionsToRunResult(data: AiSuggestions | undefined): RunResult {
  if (!data) return { suggestions: {}, autoApplied: {}, traces: {} };
  const suggestions: Record<string, FieldSuggestion> = {};
  let counter = 0;
  for (const imp of data.improvements ?? []) {
    const value = TIME_FIELDS.has(imp.field)
      ? toIsoDuration(imp.suggestion as string)
      : imp.suggestion;
    suggestions[imp.field] = {
      kind: "single",
      value,
      confidence: imp.confidence ?? "medium",
      summary: imp.summary ?? imp.rationale ?? `AI suggestion for ${imp.field}`,
      hash: imp.hash ?? `${imp.field}-${counter++}`,
      traceId: imp.traceId ?? "legacy",
    };
  }
  if (data.tags && data.tags.length > 0) {
    suggestions.tags = {
      kind: "single",
      value: data.tags,
      confidence: "medium",
      summary: `${data.tags.length} AI-suggested tags`,
      hash: `tags-${counter++}`,
      traceId: "legacy",
    };
  }
  return { suggestions, autoApplied: {}, traces: {} };
}

export default function RecipeForm({
  collection,
  slug: initialSlug,
  initialRecipe,
  initialMeta,
  isNew,
}: Props) {
  const recipe = { ...emptyRecipe(), ...initialRecipe } as RecipeData;
  const meta = { ...emptyMeta(), ...initialMeta } as MetaData;

  const {
    slug,
    setSlug,
    slugChecking,
    slugAvailable,
    draft,
    setDraft,
    saving,
    setSaving,
    locale: language,
    setLocale: setLanguage,
    localeReady,
    completeness,
    setCompleteness,
  } = useEntityFormState({
    kind: "recipe",
    collection,
    isNew: isNew ?? false,
    initialSlug: initialSlug ?? "",
    initialLocale: meta.language ?? "",
    initialDraft: initialMeta?.draft ?? (isNew ? true : false),
    initialCompleteness: computeCompletenessFromBlob("recipe", recipe as never, meta as never),
  });

  const [ingredients, setIngredients] = useState<string[]>(
    recipe.recipeIngredient.length > 0 ? recipe.recipeIngredient : [""],
  );
  const [instructions, setInstructions] = useState<HowToStep[]>(
    recipe.recipeInstructions.map(
      (s): HowToStep => ({
        "@type": "HowToStep",
        text: stepText(s),
        name: stepName(s) || undefined,
        image: stepImage(s) || undefined,
      }),
    ),
  );
  const [ingredientLinks, setIngredientLinks] = useState<IngredientLink[]>(meta.ingredientLinks);
  const [sources, setSources] = useState(meta.sources);
  const [variants, setVariants] = useState<string[]>(meta.variants ?? []);
  const [pendingPairingDialog, setPendingPairingDialog] = useState<PairingAiSuggestion | null>(
    null,
  );
  const [featuredPairings, setFeaturedPairings] = useState<PairingListItem[]>([]);
  const [regions, setRegions] = useState<RegionCode[]>(meta.region ?? []);
  const [dietTags, setDietTags] = useState<string[]>(
    Array.isArray(recipe.suitableForDiet) ? recipe.suitableForDiet : [],
  );
  const [kind, setKind] = useState<MixtureKind | "">((meta.kind as MixtureKind | undefined) ?? "");

  // Image health check
  const [imageBroken, setImageBroken] = useState(false);

  // Ingredient link modal state
  const [linkModalState, setLinkModalState] = useState<
    | { open: false }
    | {
        open: true;
        mode: "view";
        slug: string;
        ingredientIndex: number;
      }
    | {
        open: true;
        mode: "link";
        ingredientIndex: number;
        ingredientString: string;
        aiSuggestion?: { pattern: string; slug: string; confidence: "high" | "medium" | "low" };
      }
  >({ open: false });

  // AI suggestions cache. Hydrate from persisted meta on mount so a remount
  // (e.g. Vite reload after a meta write) doesn't re-fire aiRefreshSuggestions.
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestions | undefined>(
    () => initialMeta?.aiSuggestions?.data,
  );
  const [, setAiRefreshing] = useState(false);
  const [, setActiveProposers] = useState<string[]>([]);

  // Image attribution
  const [imageAttribution, setImageAttribution] = useState<ImageAttribution | undefined>(
    meta.imageAttribution,
  );
  const [stepAttributions, setStepAttributions] = useState<Map<number, ImageAttribution>>(() => {
    const map = new Map<number, ImageAttribution>();
    for (const entry of meta.recipeInstructionsAttribution ?? []) {
      const { index, ...rest } = entry;
      map.set(index, rest as ImageAttribution);
    }
    return map;
  });
  // null = closed; "main" = main image; number = step index
  const [imageSearchTarget, setImageSearchTarget] = useState<"main" | number | null>(null);

  // Per-section AI state
  const [pendingLinks, setPendingLinks] = useState<Array<{
    pattern: string;
    slug: string;
    confidence: "high" | "medium" | "low";
  }> | null>(null);
  const [aiLinksLoading, setAiLinksLoading] = useState(false);

  const [splitView, setSplitView] = useSplitViewPreference();
  const [siblingData, setSiblingData] = useState<SiblingLocale | null>(null);

  // Modals
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateRunId] = useState(() => crypto.randomUUID());
  const translationSlugRef = useRef<string>("");
  const entityKind = collection === "mixtures" ? "mixture" : "recipe";

  // Entity options
  const [ingredientOptions, setIngredientOptions] = useState<EntityOption[]>([]);
  const [recipeOptions, setRecipeOptions] = useState<EntityOption[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [quickCreateKind, setQuickCreateKind] = useState<
    "ingredient" | "recipe" | "mixture" | null
  >(null);
  const [quickCreateName, setQuickCreateName] = useState("");
  const [quickCreateCallback, setQuickCreateCallback] = useState<
    ((slug: string, label: string) => void) | null
  >(null);

  // listIngredientOptions only supports en/de — anything else falls back to en
  function ingredientLocale(lang: string): "en" | "de" {
    return lang === "de" ? "de" : "en";
  }

  function fetchIngredientOptions(lang: string) {
    void actions
      .listIngredientOptions({ locale: ingredientLocale(lang) })
      .then((r: { data?: unknown }) => {
        const data = r.data as { slug: string; name: string }[] | undefined;
        if (data)
          setIngredientOptions(
            data.map((d) => ({ value: d.slug, label: d.name, sublabel: d.slug })),
          );
      });
  }

  useEffect(() => {
    fetchIngredientOptions(meta.language ?? "en");
    void actions.listRecipeOptions().then((r: { data?: unknown }) => {
      const data = r.data as { collection: string; slug: string; name: string }[] | undefined;
      if (data)
        setRecipeOptions(
          data.map((d) => ({
            value: `${d.collection}/${d.slug}`,
            label: d.name,
            sublabel: d.collection,
          })),
        );
    });
    void actions.listAllTags().then((r: { data?: unknown }) => {
      const data = r.data as string[] | undefined;
      if (data) setTagSuggestions(data);
    });
    if (!isNew && slug) {
      void actions.listPairingsFor({ slug }).then((r: { data?: unknown }) => {
        if (r.data) setFeaturedPairings(r.data as PairingListItem[]);
      });
    }
  }, []);

  // Check image URL health on mount
  useEffect(() => {
    const imageUrl = getFirstImage(initialRecipe?.image);
    if (!imageUrl) return;
    const img = new window.Image();
    img.onerror = () => setImageBroken(true);
    img.onload = () => setImageBroken(false);
    img.src = imageUrl;
  }, []);

  // Auto-run AI suggestions on first open if none cached
  useEffect(() => {
    if (isNew || !slug || aiSuggestions) return;
    const snap = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      ...initialRecipe,
    };
    const metaSnap = { ...initialMeta } as Record<string, unknown>;
    const missingKeys = RECIPE_RECOMMENDED.filter((k) => {
      const v = (snap as Record<string, unknown>)[k];
      if (!v) return true;
      if (Array.isArray(v)) return (v as unknown[]).length === 0;
      return false;
    });
    setAiRefreshing(true);
    void refreshViaSSE(
      {
        collection,
        slug,
        recipe: snap,
        meta: metaSnap,
        missingFields: missingKeys,
        locale: initialMeta?.language ?? "en",
      },
      (data) => handleRefreshResult(data, (s) => setAiSuggestions(s), setIngredientLinks),
    )
      .catch(() => {})
      .finally(() => setAiRefreshing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional mount-only

  // Re-fetch ingredient options when language changes to a different supported locale
  useEffect(() => {
    if (!language) return;
    fetchIngredientOptions(language);
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  const siblingLocale = language === "en" ? "de" : "en";
  useEffect(() => {
    if (!splitView || !slug || !language || isNew) {
      setSiblingData(null);
      return;
    }
    void getSiblingEntity({
      kind: entityKind,
      slug,
      locale: siblingLocale,
      currentLocale: language,
    }).then((result) => setSiblingData(result));
  }, [splitView, slug, language]); // eslint-disable-line react-hooks/exhaustive-deps

  const form = useForm({
    defaultValues: {
      name: recipe.name,
      description: recipe.description ?? "",
      image: getFirstImage(recipe.image),
      authorName:
        typeof recipe.author === "object" && !Array.isArray(recipe.author)
          ? (recipe.author?.name ?? "")
          : "",
      authorType:
        (typeof recipe.author === "object" && !Array.isArray(recipe.author)
          ? recipe.author?.["@type"]
          : "Person") ?? "Person",
      recipeYield: recipe.recipeYield ?? "",
      recipeCategory: recipe.recipeCategory ?? "",
      recipeCuisine: recipe.recipeCuisine ?? "",
      prepTime: recipe.prepTime ?? "",
      cookTime: recipe.cookTime ?? "",
      totalTime: recipe.totalTime ?? "",
      datePublished: recipe.datePublished ?? "",
      keywords: Array.isArray(recipe.keywords)
        ? recipe.keywords.filter((k): k is string => typeof k === "string")
        : ([] as string[]),
      tags: meta.tags as string[],
    },
    onSubmit: async ({ value }) => {
      const payloadCheck = buildPayload({
        kind: "recipe",
        collection,
        slug,
        isNew: isNew ?? false,
        slugAvailable,
        locale: language,
        draft,
        mixtureKind: kind || undefined,
        existingSlugs:
          collection === "mixtures" ? { ingredients: ingredientOptions.map((o) => o.value) } : {},
      });
      if (!payloadCheck.ok) {
        const { errors } = payloadCheck;
        if (errors.includes("missing-slug")) toast.error("Slug is required");
        else if (errors.includes("slug-taken")) toast.error(`Slug "${slug}" is already taken`);
        else if (errors.includes("slug-reserved"))
          toast.error(`Slug "${slug}" is a reserved name and cannot be used for a mixture`);
        else if (errors.includes("missing-kind")) toast.error("Kind is required for mixtures");
        else if (errors.includes("missing-locale")) toast.error("Language is required");
        return;
      }
      for (const w of payloadCheck.warnings) {
        if (w.type === "cross-collection-collision")
          toast.warning(
            `Slug "${slug}" also exists in the ${w.otherCollection} collection — cross-collection collision (saving anyway)`,
          );
      }
      setSaving(true);

      const recipePayload: RecipeData = {
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: value.name,
        recipeIngredient: ingredients.filter(Boolean),
        recipeInstructions: instructions.filter((s) => s.text.trim()),
      };
      if (value.description) recipePayload.description = value.description;
      if (value.image) recipePayload.image = value.image;
      if (value.authorName)
        recipePayload.author = {
          "@type": value.authorType as "Person" | "Organization",
          name: value.authorName,
        };
      if (value.recipeYield) recipePayload.recipeYield = value.recipeYield;
      if (value.recipeCategory) recipePayload.recipeCategory = value.recipeCategory;
      if (value.recipeCuisine) recipePayload.recipeCuisine = value.recipeCuisine;
      if (value.keywords.length) recipePayload.keywords = value.keywords;
      if (dietTags.length) recipePayload.suitableForDiet = dietTags;
      if (value.prepTime) recipePayload.prepTime = value.prepTime;
      if (value.cookTime) recipePayload.cookTime = value.cookTime;
      // Ensure totalTime >= prepTime + cookTime
      const minTotal =
        parseDurationMinutes(value.prepTime ?? "") + parseDurationMinutes(value.cookTime ?? "");
      const currentTotal = parseDurationMinutes(value.totalTime ?? "");
      const resolvedTotal =
        minTotal > 0 && currentTotal < minTotal ? minutesToIsoDuration(minTotal) : value.totalTime;
      if (resolvedTotal) recipePayload.totalTime = resolvedTotal;
      if (value.datePublished) recipePayload.datePublished = value.datePublished;

      const recipeInstructionsAttribution: Array<{ index: number } & ImageAttribution> = [];
      stepAttributions.forEach((attr, index) => {
        recipeInstructionsAttribution.push({ index, ...attr });
      });

      const metaPayload: MetaData = {
        ...meta,
        draft,
        region: regions,
        language: language || undefined,
        locale: language || undefined,
        tags: value.tags,
        ingredientLinks,
        sources: sources.filter((s) => s.url.trim()),
        variants,
        kind: collection === "mixtures" ? kind || undefined : (meta.kind ?? undefined),
        imageAttribution: imageAttribution || undefined,
        recipeInstructionsAttribution:
          recipeInstructionsAttribution.length > 0 ? recipeInstructionsAttribution : undefined,
      };

      const pendingAiEvents = pendingAiEventsRef.current;
      const { error } = await actions.saveRecipe({
        collection,
        slug,
        locale: (language || "en") as "en" | "de",
        recipe: recipePayload as never,
        meta: metaPayload as never,
        ...(pendingAiEvents.length > 0 ? { pendingAiEvents } : {}),
      });

      setSaving(false);

      if (error) {
        toast.error("Save failed: " + error.message);
        return;
      }

      // Events were persisted with the save — clear the buffer.
      pendingAiEventsRef.current = [];

      setCompleteness(
        computeCompletenessFromBlob("recipe", recipePayload as never, metaPayload as never),
      );
      toast.success("Saved");

      if (isNew) {
        window.location.href = `/admin/${collection}/${slug}/edit`;
        return;
      }

      // After save: async refresh suggestions
      const missingKeys = RECIPE_RECOMMENDED.filter((k) => {
        const v = (recipePayload as never as Record<string, unknown>)[k];
        if (!v) return true;
        if (Array.isArray(v)) return v.length === 0;
        return false;
      });
      setAiRefreshing(true);
      void refreshViaSSE(
        {
          collection,
          slug,
          recipe: recipePayload as unknown as Record<string, unknown>,
          meta: metaPayload as unknown as Record<string, unknown>,
          missingFields: missingKeys,
          locale: language || "en",
          force: true,
        },
        (data) => handleRefreshResult(data, (s) => setAiSuggestions(s), setIngredientLinks),
      )
        .catch(() => {})
        .finally(() => setAiRefreshing(false));
    },
  });

  function handleSave(asDraft: boolean) {
    setDraft(asDraft);
    setTimeout(() => void form.handleSubmit(), 0);
  }

  // Live completeness
  const formValues = useStore(form.store, (s) => s.values);
  useEffect(() => {
    const recipeSnap = {
      name: formValues.name,
      description: formValues.description,
      image: formValues.image,
      author: formValues.authorName ? { name: formValues.authorName } : undefined,
      recipeYield: formValues.recipeYield,
      prepTime: formValues.prepTime,
      cookTime: formValues.cookTime,
      totalTime: formValues.totalTime,
      recipeCategory: formValues.recipeCategory,
      recipeCuisine: formValues.recipeCuisine,
      keywords: formValues.keywords,
      datePublished: formValues.datePublished,
      recipeIngredient: ingredients.filter(Boolean),
      recipeInstructions: instructions.filter((s) => s.text.trim()),
    };
    setCompleteness(
      computeCompletenessFromBlob("recipe", recipeSnap as never, { ingredientLinks } as never),
    );
  }, [formValues, ingredients, instructions, ingredientLinks]);

  function openQuickCreate(
    kind: "ingredient" | "recipe" | "mixture",
    name: string,
    cb: (slug: string, label: string) => void,
  ) {
    setQuickCreateKind(kind);
    setQuickCreateName(name);
    setQuickCreateCallback(() => cb);
  }

  const recipeFieldHas = (key: string) => {
    const map: Record<string, boolean> = {
      description: !!formValues.description,
      image: !!formValues.image,
      author: !!formValues.authorName,
      recipeYield: !!formValues.recipeYield,
      prepTime: !!formValues.prepTime,
      cookTime: !!formValues.cookTime,
      totalTime: !!formValues.totalTime,
      recipeCategory: !!formValues.recipeCategory,
      recipeCuisine: !!formValues.recipeCuisine,
      keywords: (formValues.keywords ?? []).length > 0,
      datePublished: !!formValues.datePublished,
    };
    return map[key] ?? false;
  };

  const requiredFields = RECIPE_REQUIRED.map((key) => ({
    key,
    label: key,
    filled:
      key === "name"
        ? !!formValues.name
        : key === "recipeIngredient"
          ? ingredients.filter(Boolean).length > 0
          : instructions.filter((s) => s.text.trim()).length > 0,
    anchorId:
      key === "name"
        ? "section-basic"
        : key === "recipeIngredient"
          ? "section-ingredients"
          : "section-instructions",
  }));

  const recommendedFields = RECIPE_RECOMMENDED.map((key) => ({
    key,
    label: key,
    filled: recipeFieldHas(key),
    anchorId: ["description", "image", "author"].includes(key)
      ? "section-basic"
      : ["recipeYield", "prepTime", "cookTime", "totalTime"].includes(key)
        ? "section-timing"
        : "section-classification",
  }));

  const bonusFields = [
    {
      key: "ingredientLinks",
      label: "Ingredient links",
      filled: ingredientLinks.length > 0,
      anchorId: "section-ingredients",
    },
  ];

  // ── useAiSuggestions hook ────────────────────────────────────────────────────
  // Per-field accept/reject events are buffered client-side and flushed only
  // when the form is saved. Persisting them on every click writes a meta sidecar
  // file inside the watched content collection, which triggers Astro's
  // dev-mode HMR full-reload and wipes unsaved form state. Flushing on save
  // bundles all events into the same write the user already expects.
  const pendingAiEventsRef = useRef<Record<string, unknown>[]>([]);
  const aiEventLog = useMemo(
    () => ({
      read: async () => [],
      append: async (_ref: unknown, event: unknown) => {
        pendingAiEventsRef.current.push(event as Record<string, unknown>);
      },
    }),
    [],
  );

  const aiEntityRef = useMemo(() => ({ kind: "recipe", id: slug ?? "" }), [slug]);

  const aiFlow = useAiSuggestions({
    contract: RECIPE_AI_CONTRACT,
    siblingLocale: siblingData ?? undefined,
    onRefine: async (params) => {
      const snap = buildRecipeSnapshot();
      const metaSnap = buildMetaSnapshot();
      // Per-field run: only refresh exactly what the client asked for.
      // Full run: derive missing-recommended-fields from completeness.
      const missingKeys = params.target ?? RECIPE_RECOMMENDED.filter((k) => !recipeFieldHas(k));
      let captured: AiSuggestions | undefined;
      setAiRefreshing(true);
      try {
        await refreshViaSSE(
          {
            collection,
            slug: slug ?? "",
            recipe: snap,
            meta: metaSnap,
            missingFields: missingKeys,
            locale: language ?? "en",
            force: true,
            // Pass through the per-field target so the server skips
            // side-effect proposers + the sidecar.write that would trip
            // Astro's HMR and wipe the just-arrived suggestion.
            ...(params.target ? { target: params.target } : {}),
          },
          (data) => {
            captured = data.aiSuggestions;
            handleRefreshResult(data, (s) => setAiSuggestions(s), setIngredientLinks);
          },
        );
      } finally {
        setAiRefreshing(false);
      }
      return adaptAiSuggestionsToRunResult(captured);
    },
    aiEventLog,
    entityRef: aiEntityRef,
    origin: {
      surface: "admin",
      action: "refine",
      entityKind: "recipe",
      userInitiated: true,
      runId: `recipe-${slug ?? "new"}`,
      triggeredBy: "editor",
    },
  });

  const handleManualRefresh = () => void aiFlow.run();

  const {
    onRun: ingestOnRun,
    proposed: ingestProposed,
    warnings: ingestWarnings,
    clearProposed: clearIngestProposed,
  } = useIngestAction({
    kind: "recipe",
    slug: slug ?? "",
    locale: (language || "en") as "en" | "de",
    collection,
    existing: buildRecipeSnapshot(),
  });

  async function refreshViaSSE(
    params: {
      collection: string;
      slug: string;
      recipe: Record<string, unknown>;
      meta: Record<string, unknown>;
      missingFields: string[];
      locale: string;
      force?: boolean;
      target?: string[];
    },
    onResult: (data: {
      aiSuggestions: AiSuggestions;
      autoLinked: number;
      autoAppliedLinks?: string[];
    }) => void,
  ): Promise<void> {
    setActiveProposers([]);
    const response = await fetch("/api/ai/refresh-suggestions/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok || !response.body) {
      throw new Error("Refresh stream failed");
    }
    for await (const event of readSSE(response.body)) {
      if (event["type"] === "proposer:start") {
        const name = typeof event["name"] === "string" ? event["name"] : "";
        setActiveProposers((prev) => (prev.includes(name) ? prev : [...prev, name]));
      } else if (event["type"] === "proposer:done") {
        const name = typeof event["name"] === "string" ? event["name"] : "";
        setActiveProposers((prev) => prev.filter((p) => p !== name));
      } else if (event["type"] === "complete") {
        const result = event["result"] as
          | { aiSuggestions: AiSuggestions; autoLinked: number; autoAppliedLinks?: string[] }
          | undefined;
        if (result) onResult(result);
      } else if (event["type"] === "error") {
        const msg = typeof event["message"] === "string" ? event["message"] : "Refresh failed";
        throw new Error(msg);
      }
    }
    setActiveProposers([]);
  }

  async function runProposeLinks() {
    setAiLinksLoading(true);
    try {
      const { data, error } = await actions.aiProposeIngredientLinks({
        recipeIngredients: ingredients.filter(Boolean),
        locale: (language || "en") as "en" | "de",
      });
      if (error) throw new Error(error.message);
      // Filter out already-linked
      const existing = new Set(ingredientLinks.map((l) => l.pattern));
      const newLinks = (data ?? []).filter((l: { pattern: string }) => !existing.has(l.pattern));
      setPendingLinks(
        newLinks as { pattern: string; slug: string; confidence: "high" | "low" | "medium" }[],
      );
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setAiLinksLoading(false);
    }
  }

  function applyLinkSuggestion(link: { pattern: string; slug: string }) {
    setIngredientLinks((prev) => {
      if (prev.some((l) => l.pattern === link.pattern)) return prev;
      return [...prev, { pattern: link.pattern, slug: link.slug, kind: "ingredient" as const }];
    });
  }

  function buildRecipeSnapshot(): Record<string, unknown> {
    return {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: formValues.name,
      description: formValues.description,
      recipeIngredient: ingredients.filter(Boolean),
      recipeCategory: formValues.recipeCategory,
      recipeCuisine: formValues.recipeCuisine,
      keywords: formValues.keywords,
      tags: formValues.tags,
    };
  }

  function buildMetaSnapshot(): Record<string, unknown> {
    return {
      ...meta,
      draft,
      language: language || undefined,
      locale: language || undefined,
      tags: formValues.tags,
      ingredientLinks,
      sources,
      variants,
    };
  }

  function applyProposedToForm(p: Record<string, unknown>) {
    const stringFields = [
      "name",
      "description",
      "image",
      "recipeYield",
      "recipeCategory",
      "recipeCuisine",
      "prepTime",
      "cookTime",
      "totalTime",
    ] as const;
    for (const f of stringFields) {
      if (typeof p[f] === "string") form.setFieldValue(f as never, p[f] as never);
    }
    if (p.author && typeof p.author === "object" && !Array.isArray(p.author)) {
      const author = p.author as Record<string, unknown>;
      if (typeof author.name === "string")
        form.setFieldValue("authorName" as never, author.name as never);
      if (typeof author["@type"] === "string")
        form.setFieldValue("authorType" as never, author["@type"] as never);
    }
    if (Array.isArray(p.recipeIngredient)) {
      setIngredients(p.recipeIngredient.filter((i): i is string => typeof i === "string"));
    }
    if (Array.isArray(p.recipeInstructions)) {
      setInstructions(
        p.recipeInstructions.map(
          (s): HowToStep => ({
            "@type": "HowToStep",
            text: stepText(s),
            name: stepName(s) || undefined,
            image: stepImage(s) || undefined,
          }),
        ),
      );
    }
    if (Array.isArray(p.keywords)) {
      form.setFieldValue(
        "keywords",
        p.keywords.filter((k): k is string => typeof k === "string"),
      );
    }
    if (Array.isArray(p.suitableForDiet)) {
      setDietTags(p.suitableForDiet.filter((d): d is string => typeof d === "string"));
    }
  }

  // Map ingredient string → link for badge display
  async function handleCreatePairing(
    locale: string,
    fields: Record<string, unknown>,
    pairingMeta: { draft: boolean; aiEvents: unknown[] },
  ) {
    const endpoints = fields.endpoints as [
      { collection: string; slug: string },
      { collection: string; slug: string },
    ];
    const sorted = [...endpoints].sort((a, b) => a.slug.localeCompare(b.slug));
    const id = sorted.map((e) => e.slug).join("--");
    const { error: saveError } = await actions.savePairing({
      id,
      endpoints: sorted as [
        { collection: "ingredients" | "mixtures" | "recipes"; slug: string },
        { collection: "ingredients" | "mixtures" | "recipes"; slug: string },
      ],
      description: fields.description as string,
      locale: locale as "en" | "de",
      draft: pairingMeta.draft,
    });
    if (saveError) throw new Error(saveError.message);
    if (fields.featured !== undefined) {
      await actions.savePairingMeta({
        id,
        locale: locale as "en" | "de",
        patch: { featured: fields.featured },
      });
    }
    void actions.listPairingsFor({ slug: slug ?? "" }).then((r: { data?: unknown }) => {
      if (r.data) setFeaturedPairings(r.data as PairingListItem[]);
    });
    return { kind: "pairing" as const, id };
  }

  const pairingRunId = useMemo(() => `recipe-pairing-${slug ?? "new"}`, [slug]);

  const linkedPatterns = new Map(ingredientLinks.map((l) => [l.pattern.toLowerCase(), l]));
  function findLinkForIngredient(ing: string): IngredientLink | undefined {
    const lower = ing.toLowerCase();
    for (const [pattern, link] of linkedPatterns.entries()) {
      if (lower.includes(pattern)) return link;
    }
    return undefined;
  }
  function findAiLinkSuggestion(ing: string) {
    if (!pendingLinks) return undefined;
    const lower = ing.toLowerCase();
    return pendingLinks.find((l) => lower.includes(l.pattern.toLowerCase()));
  }

  const overflowMenuItems: OverflowMenuItem[] = [
    ...(slug
      ? [
          {
            label: "View public page",
            icon: <ExternalLink size={14} />,
            onClick: () => window.open(`/${collection}/${slug}`, "_blank"),
          },
        ]
      : []),
    {
      label: "Delete",
      icon: <Trash2 size={14} />,
      onClick: async () => {
        if (!slug || !window.confirm(`Delete this ${entityKind}?`)) return;
        const { error } = await actions.deleteItem({
          collection,
          id: `${language || "en"}/${slug}`,
        });
        if (error) {
          toast.error("Delete failed: " + error.message);
        } else {
          window.location.href = `/admin/${collection}`;
        }
      },
    },
  ];

  function handleSwapLanguage() {
    if (!slug || !language) return;
    window.location.href = `/admin/${collection}/${slug}/edit?locale=${siblingLocale}`;
  }

  const hasExistingTranslation = !!meta.translations?.[siblingLocale];

  const headerAuxiliary =
    !isNew && slug ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          handleManualRefresh();
          setEnhanceOpen(true);
        }}
      >
        <Sparkles size={14} className="mr-1.5" />
        Enhance
      </Button>
    ) : undefined;

  const subHeaderStrip = (
    <div className="flex items-center gap-2">
      {splitView ? (
        <AiBulkTranslateButton contract={RECIPE_AI_CONTRACT} currentData={buildRecipeSnapshot()} />
      ) : (
        <AiBulkSuggestButton />
      )}
    </div>
  );

  const localeChip = language ? (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {language.toUpperCase()}
    </span>
  ) : null;

  return (
    <SuggestionFlowProvider value={aiFlow}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <EntityFormLayout
          title={
            <span className="flex items-center gap-2">
              <LinkButton variant="ghost" size="icon" href={`/admin/${collection}`}>
                <ArrowLeft size={16} />
              </LinkButton>
              {isNew ? `New ${collection.slice(0, -1)}` : (slug ?? "Edit recipe")}
            </span>
          }
          localeChip={localeChip}
          headerAuxiliary={headerAuxiliary}
          overflowMenuItems={overflowMenuItems}
          sections={SECTIONS}
          completenessPanel={
            <CompletenessPanel
              result={completeness}
              requiredFields={requiredFields}
              recommendedFields={recommendedFields}
              bonusFields={bonusFields}
            />
          }
          subHeaderStrip={subHeaderStrip}
          footer={
            <FormActionBar
              saving={saving}
              isDraft={draft}
              backHref={`/admin/${collection}`}
              previewHref={!isNew ? `/preview/${collection}/${slug}` : undefined}
              onSave={handleSave}
              saveDisabled={!localeReady}
            />
          }
          splitView={splitView}
          activeLocale={language ?? undefined}
          siblingLocale={siblingLocale}
          hasExistingTranslation={hasExistingTranslation}
          onAddTranslation={
            !isNew && slug && !hasExistingTranslation ? () => setTranslateOpen(true) : undefined
          }
          onToggleSplitView={() => setSplitView(!splitView)}
          onSwapLanguage={splitView && !isNew && slug ? handleSwapLanguage : undefined}
        >
          <div className="space-y-8">
            {/* ── Basic info ── */}
            <section id="section-basic" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Basic info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isNew && (
                    <div className="space-y-1.5">
                      <Label>Slug</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="my-recipe"
                          />
                          {slug && isNew && (
                            <span
                              className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium ${
                                slugChecking
                                  ? "text-muted-foreground"
                                  : slugAvailable === true
                                    ? "text-emerald-600"
                                    : slugAvailable === false
                                      ? "text-red-500"
                                      : ""
                              }`}
                            >
                              {slugChecking
                                ? "…"
                                : slugAvailable === true
                                  ? "✓ available"
                                  : slugAvailable === false
                                    ? "✗ taken"
                                    : ""}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title="AI suggest slug"
                          onClick={async () => {
                            const name = form.getFieldValue("name" as never) as string;
                            if (!name) return;
                            try {
                              const { data } = await actions.aiSuggestSlug({
                                name,
                                locale: language || "en",
                                collection,
                              });
                              if (data) setSlug(data.slug);
                            } catch {
                              toast.error("Could not suggest slug");
                            }
                          }}
                        >
                          <Sparkles size={12} />
                        </Button>
                      </div>
                    </div>
                  )}

                  <form.Field name="name">
                    {(field) => (
                      <TextField
                        field={field}
                        label="Name *"
                        placeholder="Ras el Hanout"
                        suggestionPath="name"
                        splitView={splitView}
                        siblingValue={siblingData?.data["name"]}
                        siblingLocale={siblingLocale}
                        onValueChange={(v) => {
                          if (isNew && !slug) setSlug(slugify(v));
                        }}
                      />
                    )}
                  </form.Field>

                  <form.Field name="description">
                    {(field) => (
                      <TextareaField
                        field={field}
                        label="Description"
                        rows={3}
                        placeholder="A warming North African spice blend…"
                        suggestionPath="description"
                        splitView={splitView}
                        siblingValue={siblingData?.data["description"]}
                        siblingLocale={siblingLocale}
                        hint={<RecommendedHint show={!field.state.value} />}
                      />
                    )}
                  </form.Field>

                  <form.Field name="image">
                    {(field) => (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={field.name}>
                            Image URL
                            <RecommendedHint show={!field.state.value} />
                          </Label>
                          <button
                            type="button"
                            onClick={() => setImageSearchTarget("main")}
                            className="text-xs text-primary hover:underline"
                          >
                            Search image…
                          </button>
                        </div>
                        <Input
                          id={field.name}
                          type="url"
                          value={field.state.value}
                          onChange={(e) => {
                            field.handleChange(e.target.value);
                            if (!e.target.value) setImageAttribution(undefined);
                            // Re-check broken status when URL changes
                            setImageBroken(false);
                            if (e.target.value) {
                              const img = new window.Image();
                              img.onerror = () => setImageBroken(true);
                              img.onload = () => setImageBroken(false);
                              img.src = e.target.value;
                            }
                          }}
                          onBlur={field.handleBlur}
                          placeholder="https://example.com/image.jpg"
                          className={imageBroken ? "border-amber-400" : ""}
                        />
                        {imageBroken && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            ⚠ Image URL appears broken or unreachable
                          </p>
                        )}
                        {imageAttribution && (
                          <p className="text-[11px] text-muted-foreground">
                            {imageAttribution.attribution}
                          </p>
                        )}
                      </div>
                    )}
                  </form.Field>

                  <div className="grid grid-cols-2 gap-4">
                    <form.Field name="authorName">
                      {(field) => (
                        <div className="space-y-1.5">
                          <Label htmlFor={field.name}>
                            Author
                            <RecommendedHint show={!field.state.value} />
                          </Label>
                          <Input
                            id={field.name}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            placeholder="Jane Smith"
                          />
                        </div>
                      )}
                    </form.Field>
                    <form.Field name="authorType">
                      {(field) => (
                        <div className="space-y-1.5">
                          <Label>Author type</Label>
                          <Select
                            value={field.state.value}
                            onValueChange={(v) =>
                              v && field.handleChange(v as "Person" | "Organization")
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Person">Person</SelectItem>
                              <SelectItem value="Organization">Organization</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </form.Field>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ── Timing & yield ── */}
            <section id="section-timing" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Timing &amp; yield</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  {(["prepTime", "cookTime", "totalTime"] as const).map((name, idx) => (
                    <form.Field key={name} name={name}>
                      {(field) => {
                        const hasValue = !!field.state.value;
                        const invalid = hasValue && !ISO_DURATION_RE.test(field.state.value.trim());
                        const minTotalMin =
                          parseDurationMinutes(formValues.prepTime ?? "") +
                          parseDurationMinutes(formValues.cookTime ?? "");
                        const totalTooShort =
                          name === "totalTime" &&
                          minTotalMin > 0 &&
                          hasValue &&
                          !invalid &&
                          parseDurationMinutes(field.state.value) < minTotalMin;
                        return (
                          <div className="space-y-1.5">
                            <Label htmlFor={field.name}>
                              {["Prep time", "Cook time", "Total time"][idx]}
                              <RecommendedHint show={!hasValue} />
                            </Label>
                            <Input
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              onBlur={(e) => {
                                const coerced = toIsoDuration(e.target.value);
                                if (coerced !== e.target.value) field.handleChange(coerced);
                                field.handleBlur();
                                // Auto-fill totalTime when it's empty or below prep+cook sum
                                if (name !== "totalTime") {
                                  const prep =
                                    name === "prepTime" ? coerced : (formValues.prepTime ?? "");
                                  const cook =
                                    name === "cookTime" ? coerced : (formValues.cookTime ?? "");
                                  const sumMin =
                                    parseDurationMinutes(prep) + parseDurationMinutes(cook);
                                  if (sumMin > 0) {
                                    const currentTotal = formValues.totalTime ?? "";
                                    if (parseDurationMinutes(currentTotal) < sumMin) {
                                      form.setFieldValue(
                                        "totalTime" as never,
                                        minutesToIsoDuration(sumMin) as never,
                                      );
                                    }
                                  }
                                }
                              }}
                              placeholder={["PT15M", "PT30M", "PT45M"][idx]}
                              className={invalid || totalTooShort ? "border-amber-400" : ""}
                            />
                            {invalid && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">
                                Use ISO 8601 format, e.g. PT15M or PT1H30M
                              </p>
                            )}
                            {totalTooShort && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">
                                Must be at least {minutesToIsoDuration(minTotalMin)} (prep + cook)
                              </p>
                            )}
                          </div>
                        );
                      }}
                    </form.Field>
                  ))}
                  <form.Field name="recipeYield">
                    {(field) => (
                      <TextField
                        field={field}
                        label="Yield / servings"
                        placeholder="4 servings"
                        suggestionPath="recipeYield"
                        hint={<RecommendedHint show={!field.state.value} />}
                      />
                    )}
                  </form.Field>
                </CardContent>
              </Card>
            </section>

            {/* ── Ingredients ── */}
            <section id="section-ingredients" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Ingredients</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={runProposeLinks}
                      disabled={aiLinksLoading || ingredients.filter(Boolean).length === 0}
                      className="h-7 text-xs gap-1"
                    >
                      {aiLinksLoading ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Link2 size={11} />
                      )}
                      Auto-link
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <SortableArrayField
                    items={ingredients}
                    onChange={setIngredients}
                    onAdd={() => setIngredients((prev) => [...prev, ""])}
                    addLabel="Add ingredient"
                    renderItem={(ing, i) => {
                      const existingLink = findLinkForIngredient(ing);
                      const aiSuggestion = findAiLinkSuggestion(ing);
                      return (
                        <div className="flex items-center gap-1.5 flex-1">
                          <Input
                            value={ing}
                            onChange={(e) =>
                              setIngredients((prev) =>
                                prev.map((v, j) => (j === i ? e.target.value : v)),
                              )
                            }
                            placeholder="2 tsp cumin seeds"
                            className="flex-1"
                          />
                          {/* Link button — always shown, opens IngredientLinkModal */}
                          {existingLink ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLinkModalState({
                                  open: true,
                                  mode: "view",
                                  slug: existingLink.slug,
                                  ingredientIndex: i,
                                })
                              }
                              className="shrink-0 flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
                              title={`Linked → ${existingLink.slug} · click to view`}
                            >
                              <Link2 size={9} />
                              {existingLink.slug}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setLinkModalState({
                                  open: true,
                                  mode: "link",
                                  ingredientIndex: i,
                                  ingredientString: ing,
                                  aiSuggestion: aiSuggestion ?? undefined,
                                })
                              }
                              className={
                                aiSuggestion
                                  ? "shrink-0 flex items-center gap-1 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                                  : "shrink-0 flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:border-border/80"
                              }
                              title={
                                aiSuggestion
                                  ? `AI suggests → ${aiSuggestion.slug} · click to link`
                                  : "Click to link ingredient"
                              }
                            >
                              {aiSuggestion ? (
                                <>
                                  <Sparkles size={9} />
                                  {aiSuggestion.slug}
                                </>
                              ) : (
                                <Link2 size={9} />
                              )}
                            </button>
                          )}
                        </div>
                      );
                    }}
                  />

                  {/* Pending link suggestions summary */}
                  {pendingLinks && pendingLinks.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-amber-800 dark:text-amber-300">
                          {pendingLinks.length} link{pendingLinks.length !== 1 ? "s" : ""} suggested
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              pendingLinks.forEach(applyLinkSuggestion);
                              setPendingLinks(null);
                            }}
                            className="flex items-center gap-1 rounded bg-amber-700 px-2 py-0.5 text-white hover:opacity-90"
                          >
                            <Check size={9} />
                            Apply all
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingLinks(null)}
                            className="flex items-center gap-1 rounded px-2 py-0.5 text-amber-700 hover:bg-amber-100"
                          >
                            <X size={9} />
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Manual link management */}
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none list-none flex items-center gap-1 pt-1">
                      <Link2 size={11} />
                      Ingredient links ({ingredientLinks.length})
                      <span className="ml-auto group-open:rotate-180 transition-transform">▾</span>
                    </summary>
                    <div className="mt-2">
                      <SortableArrayField
                        items={ingredientLinks}
                        onChange={setIngredientLinks}
                        onAdd={() =>
                          setIngredientLinks((prev) => [
                            ...prev,
                            { pattern: "", slug: "", kind: "ingredient" },
                          ])
                        }
                        addLabel="Add link"
                        getKey={(_, i) => `ilink-${i}`}
                        renderItem={(link, i) => (
                          <div className="flex items-center gap-2">
                            <Input
                              value={link.pattern}
                              onChange={(e) =>
                                setIngredientLinks((prev) =>
                                  prev.map((l, j) =>
                                    j === i ? { ...l, pattern: e.target.value } : l,
                                  ),
                                )
                              }
                              placeholder="cumin seeds"
                              className="flex-1"
                            />
                            <span className="shrink-0 text-sm text-muted-foreground">→</span>
                            <EntityCombobox
                              value={link.slug}
                              onChange={(v) =>
                                setIngredientLinks((prev) =>
                                  prev.map((l, j) => (j === i ? { ...l, slug: v } : l)),
                                )
                              }
                              options={ingredientOptions}
                              placeholder="ingredient"
                              className="flex-1"
                              onCreateNew={(name) =>
                                openQuickCreate("ingredient", name, (newSlug, newLabel) => {
                                  setIngredientOptions((prev) => [
                                    ...prev,
                                    { value: newSlug, label: newLabel, sublabel: newSlug },
                                  ]);
                                  setIngredientLinks((prev) =>
                                    prev.map((l, j) => (j === i ? { ...l, slug: newSlug } : l)),
                                  );
                                })
                              }
                            />
                          </div>
                        )}
                      />
                    </div>
                  </details>
                </CardContent>
              </Card>
            </section>

            {/* ── Instructions ── */}
            <section id="section-instructions" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Instructions</CardTitle>
                </CardHeader>
                <CardContent>
                  <SortableArrayField
                    items={instructions}
                    onChange={setInstructions}
                    onAdd={() =>
                      setInstructions((prev) => [...prev, { "@type": "HowToStep", text: "" }])
                    }
                    addLabel="Add step"
                    getKey={(_, i) => `step-${i}`}
                    renderItem={(step, i) => (
                      <div className="space-y-2 rounded-md border border-border p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground">
                            Step {i + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setImageSearchTarget(i)}
                            className="text-xs text-primary hover:underline"
                          >
                            {step.image ? "Change image" : "Add image"}
                          </button>
                        </div>
                        <Input
                          value={step.name ?? ""}
                          onChange={(e) =>
                            setInstructions((prev) =>
                              prev.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)),
                            )
                          }
                          placeholder="Step name (optional)"
                        />
                        <Textarea
                          value={step.text}
                          onChange={(e) =>
                            setInstructions((prev) =>
                              prev.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)),
                            )
                          }
                          rows={2}
                          placeholder="Description of this step…"
                        />
                        {step.image && (
                          <div className="flex items-center gap-2">
                            <img
                              src={step.image}
                              alt=""
                              className="h-12 w-12 rounded object-cover border border-border"
                            />
                            {stepAttributions.get(i) && (
                              <p className="text-[11px] text-muted-foreground flex-1 truncate">
                                {stepAttributions.get(i)?.attribution}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setInstructions((prev) =>
                                  prev.map((s, j) => (j === i ? { ...s, image: undefined } : s)),
                                );
                                setStepAttributions((prev) => {
                                  const next = new Map(prev);
                                  next.delete(i);
                                  return next;
                                });
                              }}
                              className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
            </section>

            {/* ── Classification ── */}
            <section id="section-classification" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Classification</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  {collection === "mixtures" && (
                    <div className="col-span-2 space-y-1.5">
                      <Label>
                        Kind <span className="text-destructive">*</span>
                      </Label>
                      <Select value={kind} onValueChange={(v) => v && setKind(v as MixtureKind)}>
                        <SelectTrigger data-testid="mixture-kind-select">
                          <SelectValue placeholder="Select mixture kind…" />
                        </SelectTrigger>
                        <SelectContent>
                          {MIXTURE_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {k}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <form.Field name="recipeCategory">
                    {(field) => (
                      <TextField
                        field={field}
                        label="Category"
                        placeholder="Main Course"
                        suggestionPath="recipeCategory"
                        splitView={splitView}
                        siblingValue={siblingData?.data["recipeCategory"]}
                        siblingLocale={siblingLocale}
                        hint={<RecommendedHint show={!field.state.value} />}
                      />
                    )}
                  </form.Field>
                  <form.Field name="recipeCuisine">
                    {(field) => (
                      <TextField
                        field={field}
                        label="Cuisine"
                        placeholder="Moroccan"
                        suggestionPath="recipeCuisine"
                        splitView={splitView}
                        siblingValue={siblingData?.data["recipeCuisine"]}
                        siblingLocale={siblingLocale}
                        hint={<RecommendedHint show={!field.state.value} />}
                      />
                    )}
                  </form.Field>
                  <div className="col-span-2">
                    <form.Field name="keywords">
                      {(field) => (
                        <TagInputField
                          field={field}
                          label={
                            <>
                              Keywords
                              <RecommendedHint show={(field.state.value ?? []).length === 0} />
                            </>
                          }
                          placeholder="vegan, pantry, quick"
                          suggestions={tagSuggestions}
                          suggestionPath="keywords"
                        />
                      )}
                    </form.Field>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Suitable for diet</Label>
                    <TagInput
                      value={dietTags}
                      onChange={setDietTags}
                      suggestions={[
                        "VegetarianDiet",
                        "VeganDiet",
                        "GlutenFreeDiet",
                        "LowCalorieDiet",
                      ]}
                      placeholder="VegetarianDiet, VeganDiet"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Regions</Label>
                    <EntityMultiCombobox
                      value={regions}
                      onChange={(vals) => setRegions(vals as RegionCode[])}
                      options={REGION_OPTIONS}
                      placeholder="Select culinary macro-regions…"
                    />
                    <p className="text-xs text-muted-foreground">
                      Closed enum — different from <span className="font-mono">recipeCuisine</span>{" "}
                      (schema.org cuisine).
                    </p>
                  </div>
                  <form.Field name="datePublished">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>
                          Date published
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Input
                          type="date"
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      </div>
                    )}
                  </form.Field>
                </CardContent>
              </Card>
            </section>

            {/* ── Publishing ── */}
            <section id="section-publishing" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Publishing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form.Field name="tags">
                    {(field) => (
                      <TagInputField
                        field={field}
                        label="Tags"
                        placeholder="weeknight, make-ahead"
                        suggestions={tagSuggestions}
                        suggestionPath="tags"
                      />
                    )}
                  </form.Field>
                  <div className="space-y-1.5">
                    <Label>Language</Label>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-muted-foreground"
                        aria-label="Current language (read-only)"
                      >
                        {language
                          ? (LANGUAGES.find((l) => l.value === language)?.label ?? language)
                          : "—"}
                      </span>
                      {language && (
                        <span className="text-xs font-mono text-muted-foreground/60 select-none">
                          {language.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {/* Show detected language suggestion */}
                    {!language && aiSuggestions?.detectedLanguage && (
                      <button
                        type="button"
                        onClick={() => setLanguage(aiSuggestions.detectedLanguage!)}
                        className="text-xs text-primary hover:underline"
                      >
                        ✦ AI detected: {aiSuggestions.detectedLanguage}
                      </button>
                    )}
                    {/* Show linked translations */}
                    {meta.translations && Object.entries(meta.translations).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(meta.translations).map(([locale, tSlug]) => (
                          <a
                            key={locale}
                            href={`/admin/${collection}/${tSlug}/edit`}
                            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
                          >
                            <Languages size={9} />
                            {locale}: {tSlug}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ── Pairings ── */}
            <section id="section-relations" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Pairings</CardTitle>
                    {aiSuggestions?.pairings && aiSuggestions.pairings.length > 0 && (
                      <span className="text-xs text-primary">
                        {aiSuggestions.pairings.length} AI suggestion
                        {aiSuggestions.pairings.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* AI pairing suggestions */}
                  {aiSuggestions?.pairings && aiSuggestions.pairings.length > 0 && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        AI suggested pairings
                      </p>
                      {aiSuggestions.pairings.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <span className="text-muted-foreground">{p.otherCollection}: </span>
                            <span className="font-medium">{p.otherSlug}</span>
                            {p.rationale && (
                              <p className="text-muted-foreground mt-0.5 truncate">{p.rationale}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingPairingDialog(p)}
                            className="shrink-0 flex items-center gap-1 rounded border border-primary/20 px-1.5 py-0.5 text-primary hover:bg-primary/10"
                          >
                            <Check size={9} />
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Read-only pairings featuring this entity */}
                  {featuredPairings.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Pairings featuring this entity
                      </p>
                      {featuredPairings.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 text-xs rounded border border-border px-2 py-1.5"
                        >
                          <span className="font-medium font-mono">{p.id}</span>
                          {p.description && (
                            <span className="text-muted-foreground truncate">{p.description}</span>
                          )}
                          <a
                            href={`/admin/pairings/${p.id}/edit`}
                            className="ml-auto shrink-0 text-primary hover:underline"
                          >
                            Edit
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                  {!isNew && featuredPairings.length === 0 && (
                    <p className="text-xs text-muted-foreground">No pairings yet.</p>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* ── Variants ── */}
            <section id="section-variants" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Variants</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">
                    Co-equal variant members (same kind). Saving updates the closure across all
                    members.
                  </p>
                  <EntityMultiCombobox
                    value={variants}
                    onChange={setVariants}
                    options={recipeOptions
                      .filter(
                        (o) =>
                          o.value.startsWith(`${collection}/`) && !o.value.endsWith(`/${slug}`),
                      )
                      .map((o) => ({
                        ...o,
                        value: o.value.replace(`${collection}/`, ""),
                      }))}
                    placeholder={`Select other ${collection}…`}
                  />
                </CardContent>
              </Card>
            </section>

            {/* ── External sources ── */}
            <section id="section-sources" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>External sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <SortableArrayField
                    items={sources}
                    onChange={setSources}
                    onAdd={() => setSources((prev) => [...prev, { title: "", url: "" }])}
                    addLabel="Add source"
                    getKey={(_, i) => `src-${i}`}
                    renderItem={(src, i) => (
                      <div className="space-y-2 rounded-md border border-border p-3">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Source {i + 1}
                        </span>
                        <Input
                          value={src.title}
                          onChange={(e) =>
                            setSources((prev) =>
                              prev.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)),
                            )
                          }
                          placeholder="Title"
                        />
                        <Input
                          value={src.url}
                          onChange={(e) =>
                            setSources((prev) =>
                              prev.map((s, j) => (j === i ? { ...s, url: e.target.value } : s)),
                            )
                          }
                          type="url"
                          placeholder="https://…"
                        />
                        <Input
                          value={src.author ?? ""}
                          onChange={(e) =>
                            setSources((prev) =>
                              prev.map((s, j) =>
                                j === i ? { ...s, author: e.target.value || undefined } : s,
                              ),
                            )
                          }
                          placeholder="Author / publisher"
                        />
                        <Input
                          value={src.year ?? ""}
                          onChange={(e) =>
                            setSources((prev) =>
                              prev.map((s, j) =>
                                j === i ? { ...s, year: e.target.value || undefined } : s,
                              ),
                            )
                          }
                          placeholder="Year"
                        />
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
            </section>
          </div>
        </EntityFormLayout>
      </form>

      {/* Enhance dialog */}
      <IngestDialog
        open={enhanceOpen}
        onOpenChange={(o) => {
          if (!o) clearIngestProposed();
          setEnhanceOpen(o);
        }}
        title="Enhance recipe"
        flow={aiFlow}
        onRun={ingestOnRun}
        onReviewBack={clearIngestProposed}
        reviewChildren={
          ingestProposed ? (
            <div className="space-y-4">
              <div className="max-h-[50vh] overflow-y-auto">
                {ingestWarnings.length > 0 && (
                  <div className="mb-3 space-y-0.5">
                    {ingestWarnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                        ⚠ {w}
                      </p>
                    ))}
                  </div>
                )}
                <RecipeDiff existing={buildRecipeSnapshot()} proposed={ingestProposed} />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    applyProposedToForm(ingestProposed);
                    clearIngestProposed();
                    setEnhanceOpen(false);
                    toast.success("Recipe enhanced!");
                  }}
                >
                  <Check size={14} className="mr-1" />
                  Apply changes
                </Button>
              </DialogFooter>
            </div>
          ) : undefined
        }
        generateLabel="Generate enhanced version"
        className="sm:max-w-4xl"
      />

      {/* Translate dialog */}
      <Dialog open={translateOpen} onOpenChange={(o) => !o && setTranslateOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <TranslateEntityDialog
            contract={{
              presets: [],
              fields: {
                name: { translation: { mode: "translate" } },
                description: { translation: { mode: "translate" } },
                recipeCategory: { translation: { mode: "translate" } },
                recipeCuisine: { translation: { mode: "translate" } },
                slug: { translation: { mode: "translate" } },
              },
            }}
            sourceRef={{
              kind: entityKind,
              id: slug ?? "",
            }}
            sourceLocale={language || "en"}
            sourceData={buildRecipeSnapshot()}
            availableLocales={(language || "en") === "en" ? ["de"] : ["en"]}
            onCheckSlugAvailable={async (_kind, candidateSlug) => {
              const { data } = await actions.checkSlugAvailable({
                collection,
                slug: candidateSlug,
                locale: (language || "en") === "en" ? "de" : "en",
              });
              return data?.available ?? false;
            }}
            onCreate={async (targetLocale, translationSlug, fields, meta) => {
              translationSlugRef.current = translationSlug ?? "";
              const sidecarMeta = {
                draft: true,
                kind: entityKind,
                tags: [] as string[],
                ingredientLinks: [] as unknown[],
                sources: [] as unknown[],
                variants: [] as string[],
                language: targetLocale,
                locale: targetLocale,
                translationOf: slug ?? "",
                translations: {},
                aiEvents: meta.aiEvents,
                canonicalLocale: meta.canonicalLocale,
                canonicalFieldHashes: meta.canonicalFieldHashes,
              };
              const { error } = await actions.aiCreateTranslation({
                collection,
                slug: slug ?? "",
                sourceLocale: (language || "en") as "en" | "de",
                targetLocale: targetLocale as "en" | "de",
                translationSlug: translationSlug ?? "",
                fields,
                meta: sidecarMeta as Record<string, unknown>,
              });
              if (error) throw new Error(error.message);
              return { kind: entityKind, id: translationSlug ?? "" };
            }}
            onComplete={() => {
              const ts = translationSlugRef.current;
              const tl = (language || "en") === "en" ? "de" : "en";
              setTranslateOpen(false);
              toast.success("Translation created");
              if (ts) window.open(`/admin/${collection}/${ts}/edit?locale=${tl}`, "_blank");
            }}
            aiEventLog={{ read: async () => [], append: async () => {} }}
            onFill={async (params) => {
              const ctx = params.sourceContext as {
                sourceLocale: string;
                targetLocale: string;
                sourceData: Record<string, unknown>;
              };
              const { data, error } = await actions.aiFillTranslation({
                kind: entityKind,
                sourceRef: { id: slug ?? "", kind: entityKind },
                sourceLocale: ctx.sourceLocale as "en" | "de",
                targetLocale: ctx.targetLocale as "en" | "de",
                sourceData: ctx.sourceData,
                target: params.target,
              });
              if (error) throw new Error(error.message);
              return data!;
            }}
            origin={{
              surface: "admin",
              action: "aiFillTranslation",
              entityKind,
              entityRef: slug ?? "",
              userInitiated: true,
              runId: translateRunId,
              triggeredBy: "editor" as const,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Quick create dialog */}
      {quickCreateKind && (
        <QuickCreateDialog
          open
          onClose={() => setQuickCreateKind(null)}
          kind={quickCreateKind}
          initialName={quickCreateName}
          onCreated={(newSlug, newLabel) => {
            quickCreateCallback?.(newSlug, newLabel);
            setQuickCreateKind(null);
          }}
        />
      )}

      {/* Ingredient link modal */}
      {linkModalState.open && linkModalState.mode === "view" && (
        <IngredientLinkModal
          open
          onClose={() => setLinkModalState({ open: false })}
          mode="view"
          slug={linkModalState.slug}
          locale={language || "en"}
          onUnlink={() => {
            const idx = linkModalState.ingredientIndex;
            const ing = ingredients[idx] ?? "";
            setIngredientLinks((prev) =>
              prev.filter((l) => !ing.toLowerCase().includes(l.pattern.toLowerCase())),
            );
            setLinkModalState({ open: false });
          }}
        />
      )}
      {linkModalState.open && linkModalState.mode === "link" && (
        <IngredientLinkModal
          open
          onClose={() => setLinkModalState({ open: false })}
          mode="link"
          ingredientString={linkModalState.ingredientString}
          aiSuggestion={linkModalState.aiSuggestion}
          ingredientOptions={ingredientOptions}
          locale={language || "en"}
          collection={collection}
          onLinked={(newSlug, pattern) => {
            setIngredientLinks((prev) => {
              if (prev.some((l) => l.pattern === pattern)) return prev;
              return [...prev, { pattern, slug: newSlug, kind: "ingredient" as const }];
            });
            // Also add to ingredientOptions cache if not present
            if (!ingredientOptions.some((o) => o.value === newSlug)) {
              setIngredientOptions((prev) => [
                ...prev,
                { value: newSlug, label: newSlug, sublabel: newSlug },
              ]);
            }
            setLinkModalState({ open: false });
          }}
        />
      )}

      {/* Create pairing dialog */}
      <Dialog
        open={!!pendingPairingDialog}
        onOpenChange={(o) => !o && setPendingPairingDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          {pendingPairingDialog && (
            <CreatePairingDialog
              sourceRef={{
                kind: collection === "mixtures" ? "mixture" : "recipe",
                id: slug ?? "",
              }}
              aiSuggestion={pendingPairingDialog}
              locale={language || "en"}
              onCreate={handleCreatePairing}
              onComplete={() => {
                setPendingPairingDialog(null);
                toast.success("Pairing created");
              }}
              aiEventLog={{ read: async () => [], append: async () => {} }}
              origin={{
                surface: "admin",
                action: "createPairing",
                entityKind: "recipe",
                userInitiated: true,
                runId: pairingRunId,
                triggeredBy: "editor",
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Image search modal */}
      <ImageSearchModal
        open={imageSearchTarget !== null}
        onClose={() => setImageSearchTarget(null)}
        defaultQuery={
          imageSearchTarget === "main" ? (form.getFieldValue("name" as never) as string) : undefined
        }
        onSelect={(selected: SelectedImage) => {
          if (imageSearchTarget === "main") {
            form.setFieldValue("image" as never, selected.url as never);
            setImageBroken(false);
            setImageAttribution(selected.attribution);
          } else if (typeof imageSearchTarget === "number") {
            const i = imageSearchTarget;
            setInstructions((prev) =>
              prev.map((s, j) => (j === i ? { ...s, image: selected.url } : s)),
            );
            setStepAttributions((prev) => new Map(prev).set(i, selected.attribution));
          }
        }}
      />
    </SuggestionFlowProvider>
  );
}
