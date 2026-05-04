import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Link2, Tag, Loader2, Languages, Check, X } from "lucide-react";
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
import { scoreRecipe, RECIPE_REQUIRED, RECIPE_RECOMMENDED } from "@/lib/completeness.ts";
import { slugify } from "@/lib/slugify.ts";
import type { RecipeCollection } from "@/lib/content-store.ts";
import { MIXTURE_KINDS, type MixtureKind } from "@/lib/mixture-schema.ts";
import { useEntityFormState } from "@/hooks/useEntityFormState.ts";
import { buildPayload } from "@/lib/entity-form-payload.ts";
interface AiSuggestion {
  field: string;
  suggestion: string;
  rationale: string;
}

interface AiSuggestions {
  improvements: AiSuggestion[];
  tags: string[];
  ingredientLinks: Array<{ pattern: string; slug: string; confidence: "high" | "medium" | "low" }>;
  relations: Array<{
    kind: "goesWellWith" | "usesBase";
    collection: string;
    slug: string;
    name: string;
  }>;
  detectedLanguage?: string;
}
import SortableArrayField from "./SortableArrayField.tsx";
import TagInput from "./TagInput.tsx";
import EntityCombobox, { type EntityOption } from "./EntityCombobox.tsx";
import EntityMultiCombobox from "./EntityMultiCombobox.tsx";
import QuickCreateDialog from "./QuickCreateDialog.tsx";
import FormActionBar from "./FormActionBar.tsx";
import SectionNav, { type SectionDef } from "./SectionNav.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import RecommendedHint from "./RecommendedHint.tsx";
import EnhanceModal from "./EnhanceModal.tsx";
import TranslateModal from "./TranslateModal.tsx";
import InlineSuggestion from "./InlineSuggestion.tsx";
import IngredientLinkModal from "./IngredientLinkModal.tsx";
import AiAssistPanel from "./AiAssistPanel.tsx";
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
  variantOf?: string;
  region: RegionCode[];
  tags: string[];
  ingredientLinks: IngredientLink[];
  externalSources: Array<{ url: string; title: string; source?: string }>;
  goesWellWith: Array<{ collection: string; slug: string }>;
  usesBase: Array<{ collection: string; slug: string }>;
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
    externalSources: [],
    goesWellWith: [],
    usesBase: [],
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
  { id: "section-relations", label: "Relations" },
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
    initialCompleteness: scoreRecipe(recipe as never, meta as never),
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
  const [externalSources, setExternalSources] = useState(meta.externalSources);
  const [goesWellWith, setGoesWellWith] = useState(meta.goesWellWith);
  const [usesBase, setUsesBase] = useState(meta.usesBase);
  const [tags, setTags] = useState<string[]>(meta.tags);
  const [regions, setRegions] = useState<RegionCode[]>(meta.region ?? []);
  const [keywords, setKeywords] = useState<string[]>(
    Array.isArray(recipe.keywords) ? recipe.keywords : [],
  );
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
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

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
  const [pendingTags, setPendingTags] = useState<string[] | null>(null);
  const [pendingKeywords, setPendingKeywords] = useState<string[] | null>(null);
  const [pendingLinks, setPendingLinks] = useState<Array<{
    pattern: string;
    slug: string;
    confidence: "high" | "medium" | "low";
  }> | null>(null);
  const [aiTagsLoading, setAiTagsLoading] = useState(false);
  const [aiKeywordsLoading, setAiKeywordsLoading] = useState(false);
  const [aiLinksLoading, setAiLinksLoading] = useState(false);

  // Modals
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);

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
    void actions
      .aiRefreshSuggestions({
        collection,
        slug,
        recipe: snap as never,
        meta: metaSnap,
        missingFields: missingKeys,
        locale: (initialMeta?.language ?? "en") as "en" | "de",
      })
      .then((r: { data?: unknown }) =>
        handleRefreshResult(
          r.data as
            | { aiSuggestions: AiSuggestions; autoLinked: number; autoAppliedLinks?: string[] }
            | undefined,
          (s) => setAiSuggestions(s),
          setIngredientLinks,
        ),
      )
      .catch(() => {})
      .finally(() => setAiRefreshing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional mount-only

  // Re-fetch ingredient options when language changes to a different supported locale
  useEffect(() => {
    if (!language) return;
    fetchIngredientOptions(language);
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (keywords.length) recipePayload.keywords = keywords;
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
        tags,
        ingredientLinks,
        externalSources: externalSources.filter((s) => s.url.trim()),
        goesWellWith,
        usesBase,
        kind: collection === "mixtures" ? kind || undefined : (meta.kind ?? undefined),
        imageAttribution: imageAttribution || undefined,
        recipeInstructionsAttribution:
          recipeInstructionsAttribution.length > 0 ? recipeInstructionsAttribution : undefined,
      };

      const { error } = await actions.saveRecipe({
        collection,
        slug,
        locale: (language || "en") as "en" | "de",
        recipe: recipePayload as never,
        meta: metaPayload as never,
      });

      setSaving(false);

      if (error) {
        toast.error("Save failed: " + error.message);
        return;
      }

      setCompleteness(scoreRecipe(recipePayload as never, metaPayload as never));
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
      void actions
        .aiRefreshSuggestions({
          collection,
          slug,
          recipe: recipePayload as never,
          meta: metaPayload as never,
          missingFields: missingKeys,
          locale: (language || "en") as "en" | "de",
          force: true,
        })
        .then((r: { data?: unknown }) =>
          handleRefreshResult(
            r.data as
              | { aiSuggestions: AiSuggestions; autoLinked: number; autoAppliedLinks?: string[] }
              | undefined,
            (s) => setAiSuggestions(s),
            setIngredientLinks,
          ),
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
      keywords,
      datePublished: formValues.datePublished,
      recipeIngredient: ingredients.filter(Boolean),
      recipeInstructions: instructions.filter((s) => s.text.trim()),
    };
    setCompleteness(scoreRecipe(recipeSnap as never, { ingredientLinks } as never));
  }, [formValues, ingredients, instructions, keywords, ingredientLinks]);

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
      keywords: keywords.length > 0,
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

  // Visible AI improvement suggestions (filtered by dismissed)
  const visibleImprovements: AiSuggestion[] = (aiSuggestions?.improvements ?? []).filter(
    (s) => !dismissedSuggestions.has(s.field),
  );

  function handleApplySuggestion(field: string, value: string) {
    const coerced = TIME_FIELDS.has(field) ? toIsoDuration(value) : value;
    if (field === "tags") setTags((prev) => [...new Set([...prev, coerced])]);
    else if (field === "keywords") setKeywords((prev) => [...new Set([...prev, coerced])]);
    else {
      // Clamp totalTime suggestions to at least prep+cook
      if (field === "totalTime") {
        const sumMin =
          parseDurationMinutes(formValues.prepTime ?? "") +
          parseDurationMinutes(formValues.cookTime ?? "");
        const clamped =
          sumMin > 0 && parseDurationMinutes(coerced) < sumMin
            ? minutesToIsoDuration(sumMin)
            : coerced;
        form.setFieldValue("totalTime" as never, clamped as never);
      } else {
        form.setFieldValue(field as never, coerced as never);
        // After applying prepTime/cookTime, cascade to totalTime if needed
        if (field === "prepTime" || field === "cookTime") {
          const prep = field === "prepTime" ? coerced : (formValues.prepTime ?? "");
          const cook = field === "cookTime" ? coerced : (formValues.cookTime ?? "");
          const sumMin = parseDurationMinutes(prep) + parseDurationMinutes(cook);
          if (sumMin > 0 && parseDurationMinutes(formValues.totalTime ?? "") < sumMin) {
            form.setFieldValue("totalTime" as never, minutesToIsoDuration(sumMin) as never);
          }
        }
      }
    }
    setDismissedSuggestions((prev) => new Set([...prev, field]));
  }

  function handleDismissSuggestion(field: string) {
    setDismissedSuggestions((prev) => new Set([...prev, field]));
  }

  async function handleManualRefresh() {
    const missingKeys = RECIPE_RECOMMENDED.filter((k) => !recipeFieldHas(k));
    setAiRefreshing(true);
    setDismissedSuggestions(new Set());
    const snap = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: formValues.name,
      description: formValues.description,
      recipeIngredient: ingredients.filter(Boolean),
      recipeCategory: formValues.recipeCategory,
      recipeCuisine: formValues.recipeCuisine,
      keywords,
    };
    const metaSnap = {
      ...meta,
      language,
      tags,
      ingredientLinks,
    };
    try {
      const { data } = await actions.aiRefreshSuggestions({
        collection,
        slug,
        recipe: snap as never,
        meta: metaSnap as never,
        missingFields: missingKeys,
        locale: (language || "en") as "en" | "de",
        force: true,
      });
      if (data) setAiSuggestions(data.aiSuggestions as unknown as AiSuggestions);
    } catch {
      toast.error("Could not refresh suggestions");
    } finally {
      setAiRefreshing(false);
    }
  }

  // Per-section AI helpers
  async function runProposeTags(forKeywords = false) {
    const setter = forKeywords ? setAiKeywordsLoading : setAiTagsLoading;
    setter(true);
    try {
      const { data, error } = await actions.aiProposeTags({
        recipe: {
          name: formValues.name,
          description: formValues.description,
          recipeCategory: formValues.recipeCategory,
          recipeCuisine: formValues.recipeCuisine,
          recipeIngredient: ingredients.filter(Boolean),
          keywords,
        },
      });
      if (error) throw new Error(error.message);
      if (forKeywords) setPendingKeywords(data?.tags ?? []);
      else setPendingTags(data?.tags ?? []);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setter(false);
    }
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
      setPendingLinks(newLinks);
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
      keywords,
      tags,
    };
  }

  function buildMetaSnapshot(): Record<string, unknown> {
    return {
      ...meta,
      draft,
      language: language || undefined,
      locale: language || undefined,
      tags,
      ingredientLinks,
      externalSources,
      goesWellWith,
      usesBase,
    };
  }

  // Map ingredient string → link for badge display
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

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LinkButton variant="ghost" size="icon" href={`/admin/${collection}`}>
          <ArrowLeft size={16} />
        </LinkButton>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {isNew ? `New ${collection.slice(0, -1)}` : "Edit recipe"}
          </h1>
          {!isNew && <p className="text-sm text-muted-foreground">{slug}</p>}
        </div>
        {!isNew && slug && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEnhanceOpen(true)}>
            <Sparkles size={14} className="mr-1.5" />
            Enhance with AI
          </Button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="flex gap-6">
          {/* Left: section nav */}
          <aside className="sticky top-0 h-fit w-40 shrink-0 pt-1">
            <SectionNav sections={SECTIONS} />
          </aside>

          {/* Center: form body */}
          <div className="min-w-0 flex-1 space-y-8 pb-24">
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
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Name *</Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => {
                            field.handleChange(e.target.value);
                            if (isNew && !slug) setSlug(slugify(e.target.value));
                          }}
                          onBlur={field.handleBlur}
                          placeholder="Ras el Hanout"
                        />
                      </div>
                    )}
                  </form.Field>

                  <form.Field name="description">
                    {(field) => (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={field.name}>
                            Description
                            <RecommendedHint show={!field.state.value} />
                          </Label>
                        </div>
                        <Textarea
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          rows={3}
                          placeholder="A warming North African spice blend…"
                        />
                        {/* Inline suggestion from completeness panel */}
                        {(() => {
                          const s = visibleImprovements.find((s) => s.field === "description");
                          if (!s || field.state.value) return null;
                          return (
                            <InlineSuggestion
                              label="AI suggestion"
                              current={field.state.value}
                              suggested={s.suggestion}
                              rationale={s.rationale}
                              onAccept={(v) => {
                                field.handleChange(v);
                                handleDismissSuggestion("description");
                              }}
                              onDismiss={() => handleDismissSuggestion("description")}
                            />
                          );
                        })()}
                      </div>
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
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>
                          Yield / servings
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="4 servings"
                        />
                      </div>
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
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>
                          Category
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Main Course"
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="recipeCuisine">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>
                          Cuisine
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Moroccan"
                        />
                      </div>
                    )}
                  </form.Field>
                  <div className="col-span-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>
                        Keywords
                        <RecommendedHint show={keywords.length === 0} />
                      </Label>
                      <button
                        type="button"
                        onClick={() => runProposeTags(true)}
                        disabled={aiKeywordsLoading}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {aiKeywordsLoading ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Sparkles size={11} />
                        )}
                        AI suggest
                      </button>
                    </div>
                    <TagInput
                      value={keywords}
                      onChange={setKeywords}
                      suggestions={tagSuggestions}
                      placeholder="vegan, pantry, quick"
                    />
                    {pendingKeywords && pendingKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {pendingKeywords
                          .filter((t) => !keywords.includes(t))
                          .map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setKeywords((prev) => [...prev, t])}
                              className="rounded border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                            >
                              + {t}
                            </button>
                          ))}
                        <button
                          type="button"
                          onClick={() => {
                            const toAdd = pendingKeywords.filter((t) => !keywords.includes(t));
                            setKeywords((prev) => [...new Set([...prev, ...toAdd])]);
                            setPendingKeywords(null);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground px-1"
                        >
                          Add all
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingKeywords(null)}
                          className="text-xs text-muted-foreground hover:text-foreground px-1"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
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
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Tags</Label>
                      <button
                        type="button"
                        onClick={() => runProposeTags(false)}
                        disabled={aiTagsLoading}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {aiTagsLoading ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Tag size={11} />
                        )}
                        AI suggest
                      </button>
                    </div>
                    <TagInput
                      value={tags}
                      onChange={setTags}
                      suggestions={tagSuggestions}
                      placeholder="weeknight, make-ahead"
                    />
                    {pendingTags && pendingTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {pendingTags
                          .filter((t) => !tags.includes(t))
                          .map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setTags((prev) => [...prev, t])}
                              className="rounded border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                            >
                              + {t}
                            </button>
                          ))}
                        <button
                          type="button"
                          onClick={() => {
                            const toAdd = pendingTags.filter((t) => !tags.includes(t));
                            setTags((prev) => [...new Set([...prev, ...toAdd])]);
                            setPendingTags(null);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground px-1"
                        >
                          Add all
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingTags(null)}
                          className="text-xs text-muted-foreground hover:text-foreground px-1"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Language</Label>
                      {!isNew && (
                        <button
                          type="button"
                          onClick={() => setTranslateOpen(true)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Languages size={11} />
                          Create translation
                        </button>
                      )}
                    </div>
                    <Select value={language} onValueChange={(v) => v && setLanguage(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select language…" />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

            {/* ── Relations ── */}
            <section id="section-relations" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Relations</CardTitle>
                    {aiSuggestions?.relations && aiSuggestions.relations.length > 0 && (
                      <span className="text-xs text-primary">
                        {aiSuggestions.relations.length} AI suggestion
                        {aiSuggestions.relations.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* AI relation suggestions */}
                  {aiSuggestions?.relations && aiSuggestions.relations.length > 0 && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1.5">
                      {aiSuggestions.relations.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground capitalize shrink-0">
                            {r.kind === "goesWellWith" ? "Pairs with" : "Uses base"}
                          </span>
                          <span className="font-medium">{r.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const ref = { collection: r.collection, slug: r.slug };
                              if (r.kind === "goesWellWith") {
                                setGoesWellWith((prev) =>
                                  prev.some((x) => x.slug === r.slug) ? prev : [...prev, ref],
                                );
                              } else {
                                setUsesBase((prev) =>
                                  prev.some((x) => x.slug === r.slug) ? prev : [...prev, ref],
                                );
                              }
                            }}
                            className="ml-auto flex items-center gap-1 rounded border border-primary/20 px-1.5 py-0.5 text-primary hover:bg-primary/10"
                          >
                            <Check size={9} />
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Goes well with</Label>
                    <EntityMultiCombobox
                      value={goesWellWith.map((r) => `${r.collection}/${r.slug}`)}
                      onChange={(vals) =>
                        setGoesWellWith(
                          vals.map((v) => {
                            const [col, ...rest] = v.split("/");
                            return { collection: col!, slug: rest.join("/") };
                          }),
                        )
                      }
                      options={recipeOptions}
                      placeholder="Select recipes, mixtures…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Uses base</Label>
                    <EntityMultiCombobox
                      value={usesBase.map((r) => `${r.collection}/${r.slug}`)}
                      onChange={(vals) =>
                        setUsesBase(
                          vals.map((v) => {
                            const [col, ...rest] = v.split("/");
                            return { collection: col!, slug: rest.join("/") };
                          }),
                        )
                      }
                      options={recipeOptions}
                      placeholder="Select base recipes or mixtures…"
                    />
                  </div>
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
                    items={externalSources}
                    onChange={setExternalSources}
                    onAdd={() =>
                      setExternalSources((prev) => [...prev, { url: "", title: "", source: "" }])
                    }
                    addLabel="Add source"
                    getKey={(_, i) => `src-${i}`}
                    renderItem={(src, i) => (
                      <div className="space-y-2 rounded-md border border-border p-3">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Source {i + 1}
                        </span>
                        <Input
                          value={src.url}
                          onChange={(e) =>
                            setExternalSources((prev) =>
                              prev.map((s, j) => (j === i ? { ...s, url: e.target.value } : s)),
                            )
                          }
                          type="url"
                          placeholder="https://…"
                        />
                        <Input
                          value={src.title}
                          onChange={(e) =>
                            setExternalSources((prev) =>
                              prev.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)),
                            )
                          }
                          placeholder="Title"
                        />
                        <Input
                          value={src.source ?? ""}
                          onChange={(e) =>
                            setExternalSources((prev) =>
                              prev.map((s, j) => (j === i ? { ...s, source: e.target.value } : s)),
                            )
                          }
                          placeholder="Source name (e.g. Serious Eats)"
                        />
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
            </section>
          </div>

          {/* Right: completeness + AI assist */}
          <aside className="sticky top-0 h-fit w-56 shrink-0 pt-1 space-y-3">
            <CompletenessPanel
              result={completeness}
              requiredFields={requiredFields}
              recommendedFields={recommendedFields}
              bonusFields={bonusFields}
              aiSuggestions={visibleImprovements}
              aiRefreshing={aiRefreshing}
              onRefreshSuggestions={!isNew ? handleManualRefresh : undefined}
              onApplySuggestion={handleApplySuggestion}
              onDismissSuggestion={handleDismissSuggestion}
            />
            {!isNew && (
              <AiAssistPanel
                mode="recipe"
                snapshot={buildRecipeSnapshot()}
                missingFields={completeness.missing}
                recipeIngredients={ingredients.filter(Boolean)}
                locale={(language || "en") as "en" | "de"}
                targetLocale={(language === "de" ? "en" : "de") as "en" | "de"}
                onApplyIngredientLinks={(links) =>
                  setIngredientLinks((prev) => {
                    const incoming = links.filter(
                      (l) => !prev.some((p) => p.pattern === l.pattern),
                    );
                    return [...prev, ...incoming];
                  })
                }
                onApplyTags={(newTags) => setTags((prev) => [...new Set([...prev, ...newTags])])}
                onApplyField={(field, value) => {
                  if (field === "tags" && Array.isArray(value)) {
                    setTags(value as string[]);
                  } else {
                    handleApplySuggestion(field, String(value));
                  }
                }}
                onApplyTranslation={(fields) => {
                  for (const [f, v] of Object.entries(fields)) {
                    handleApplySuggestion(f, v);
                  }
                }}
              />
            )}
          </aside>
        </div>

        {/* Sticky footer */}
        <FormActionBar
          saving={saving}
          isDraft={draft}
          backHref={`/admin/${collection}`}
          previewHref={!isNew ? `/preview/${collection}/${slug}` : undefined}
          onSave={handleSave}
          saveDisabled={!localeReady}
        />
      </form>

      {/* Enhance modal */}
      <EnhanceModal
        kind="recipe"
        open={enhanceOpen}
        onClose={() => setEnhanceOpen(false)}
        collection={collection}
        locale={(language || "en") as "en" | "de"}
        slug={slug}
        existing={buildRecipeSnapshot()}
        onApplied={() => window.location.reload()}
      />

      {/* Translate modal */}
      <TranslateModal
        open={translateOpen}
        onClose={() => setTranslateOpen(false)}
        collection={collection}
        slug={slug}
        recipe={buildRecipeSnapshot()}
        meta={buildMetaSnapshot()}
        currentLocale={language || "en"}
      />

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
    </div>
  );
}
