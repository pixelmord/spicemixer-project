import { useState, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { navigate } from "astro:transitions/client";
import { useForm, useStore } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Trash2, ExternalLink } from "lucide-react";
import LinkButton from "@/components/admin/LinkButton.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  computeCompletenessFromBlob,
  RECIPE_REQUIRED,
  RECIPE_RECOMMENDED,
} from "@/lib/completeness.ts";
import { slugify } from "@/lib/slugify.ts";
import type { RecipeCollection } from "@/lib/content-store.ts";
import type { MixtureKind } from "@/lib/mixture-schema.ts";
import { useEntityFormState } from "@/hooks/useEntityFormState.ts";
import { buildPayload } from "@/lib/entity-form-payload.ts";
import { readSSE } from "@/lib/sse.ts";
import { EntityFormLayout, type OverflowMenuItem } from "@/components/admin/EntityFormLayout.tsx";
import { useSplitViewPreference } from "@/hooks/use-split-view-preference.ts";
import { useSiblingEntity } from "@/hooks/use-sibling-entity.ts";
import { AiBulkSuggestButton } from "@registry/components/ai-bulk-suggest-button";
import { AiBulkTranslateButton } from "@registry/components/ai-bulk-translate-button";
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

import type { EntityOption } from "../../EntityCombobox.tsx";
import { SourcesSection } from "./sections/SourcesSection.tsx";
import { VariantsSection } from "./sections/VariantsSection.tsx";
import { PairingsSection } from "../_shared/PairingsSection.tsx";
import type { PairingProposal, PairingListItem } from "../_shared/pairing-proposals.ts";
import { PublishingSection } from "./sections/PublishingSection.tsx";
import { ClassificationSection } from "./sections/ClassificationSection.tsx";
import { TimingYieldSection } from "./sections/TimingYieldSection.tsx";
import QuickCreateDialog from "../../QuickCreateDialog.tsx";
import FormActionBar from "../../FormActionBar.tsx";
import { type SectionDef } from "../../SectionNav.tsx";
import CompletenessPanel from "../../CompletenessPanel.tsx";
import { useIngestAction } from "@/lib/ai/use-ingest-action.ts";
import { useAiSuggestions, type RunResult, type FieldSuggestion } from "@/hooks/use-ai-suggestions";
import { SuggestionFlowProvider } from "../../SuggestionFlowProvider.tsx";
import ImageSearchModal, {
  type ImageAttribution,
  type SelectedImage,
} from "../../ImageSearchModal.tsx";
import type { RegionCode } from "@/lib/regions.ts";

type Collection = RecipeCollection;

import type { HowToStep, IngredientLink, IngredientLinkProposal } from "./recipe-types.ts";
import { InstructionsSection } from "./sections/InstructionsSection.tsx";
import { IngredientsSection } from "./sections/IngredientsSection.tsx";
import { BasicInfoSection } from "./sections/BasicInfoSection.tsx";
import { RecipeEnhanceDialog } from "./sections/modals/RecipeEnhanceDialog.tsx";
import { RecipeTranslateDialog } from "./sections/modals/RecipeTranslateDialog.tsx";
import { RecipeIngredientLinkDialog } from "./sections/modals/RecipeIngredientLinkDialog.tsx";

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
  /** SSR-known split-view preference (from cookie) to avoid hydration flash. */
  initialSplitView?: boolean;
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

import { toIsoDuration, parseDurationMinutes, minutesToIsoDuration } from "./recipe-duration.ts";

const RECIPE_AI_CONTRACT = {
  presets: [],
  fields: {
    name: { translation: { mode: "translate" as const } },
    description: { translation: { mode: "translate" as const } },
    recipeCategory: { translation: { mode: "translate" as const } },
    recipeCuisine: { translation: { mode: "translate" as const } },
    recipeYield: { translation: { mode: "localize" as const } },
    keywords: { translation: { mode: "localize" as const } },
    tags: { translation: { mode: "localize" as const } },
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
  return { suggestions, autoApplied: {}, traces: {} };
}

export default function RecipeForm({
  collection,
  slug: initialSlug,
  initialRecipe,
  initialMeta,
  isNew,
  initialSplitView = false,
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
  const [featuredPairings, setFeaturedPairings] = useState<PairingListItem[]>([]);
  const [pairingProposals, setPairingProposals] = useState<PairingProposal[]>(
    () => (initialMeta?.aiSuggestions?.data?.pairings as PairingProposal[] | undefined) ?? [],
  );
  const [dismissedPairingProposals, setDismissedPairingProposals] = useState<Set<string>>(
    new Set(),
  );
  const [regions, setRegions] = useState<RegionCode[]>(meta.region ?? []);
  const [dietTags, setDietTags] = useState<string[]>(
    Array.isArray(recipe.suitableForDiet) ? recipe.suitableForDiet : [],
  );
  const [kind, setKind] = useState<MixtureKind | "">((meta.kind as MixtureKind | undefined) ?? "");

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
  const [pendingLinks, setPendingLinks] = useState<IngredientLinkProposal[] | null>(null);
  const [aiLinksLoading, setAiLinksLoading] = useState(false);

  const [splitView, setSplitView] = useSplitViewPreference(initialSplitView);

  // Modals
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateRunId] = useState(() => crypto.randomUUID());
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

  // Sync incoming AI pairing suggestions into proposals state (deduplicate)
  useEffect(() => {
    const incoming = (aiSuggestions?.pairings as PairingProposal[] | undefined) ?? [];
    if (incoming.length === 0) return;
    setPairingProposals((prev) => {
      const existingSlugs = new Set(prev.map((p) => p.otherSlug));
      const fresh = incoming.filter((p) => !existingSlugs.has(p.otherSlug));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }, [aiSuggestions?.pairings]);

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
  const siblingData = useSiblingEntity({
    kind: entityKind,
    slug: slug ?? "",
    locale: siblingLocale,
    currentLocale: language,
    enabled: splitView && !!slug && !!language && !isNew,
  });

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
        void navigate(`/admin/${collection}/${slug}/edit`);
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
    onFill: async (params) => {
      const ctx = params.sourceContext as {
        sourceLocale: string;
        sourceData: Record<string, unknown>;
      };
      const { data: fillData, error } = await actions.aiFillTranslation({
        kind: collection === "mixtures" ? "mixture" : "recipe",
        sourceRef: { id: slug ?? "", kind: collection === "mixtures" ? "mixture" : "recipe" },
        sourceLocale: ctx.sourceLocale as "en" | "de",
        targetLocale: (language || "en") as "en" | "de",
        sourceData: ctx.sourceData,
        target: params.target,
      });
      if (error) throw new Error(error.message);
      return fillData!;
    },
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
    const snap: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: formValues.name,
      description: formValues.description,
      recipeIngredient: ingredients.filter(Boolean),
      recipeInstructions: instructions.filter((s) => s.text.trim()),
      recipeCategory: formValues.recipeCategory,
      recipeCuisine: formValues.recipeCuisine,
      keywords: formValues.keywords,
      tags: formValues.tags,
      slug: slug ?? "",
      region: regions,
    };
    // Include copy-mode fields so the translate dialog can forward them verbatim.
    if (formValues.image) snap.image = formValues.image;
    if (formValues.recipeYield) snap.recipeYield = formValues.recipeYield;
    if (formValues.prepTime) snap.prepTime = formValues.prepTime;
    if (formValues.cookTime) snap.cookTime = formValues.cookTime;
    if (formValues.totalTime) snap.totalTime = formValues.totalTime;
    if (formValues.authorName)
      snap.author = { "@type": formValues.authorType, name: formValues.authorName };
    return snap;
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
          void navigate(`/admin/${collection}`);
        }
      },
    },
  ];

  function handleSwapLanguage() {
    if (!slug || !language) return;
    void navigate(`/admin/${collection}/${slug}/edit?locale=${siblingLocale}`);
  }

  // Derive from form-state translations map OR from a loaded sibling — whichever confirms first.
  // siblingData (async) covers the case where meta.translations was stale at page load.
  const hasExistingTranslation = !!meta.translations?.[siblingLocale] || siblingData != null;

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
            <BasicInfoSection
              form={form}
              isNew={isNew ?? false}
              slug={slug}
              setSlug={setSlug}
              slugChecking={slugChecking}
              slugAvailable={slugAvailable}
              splitView={splitView}
              siblingData={siblingData}
              siblingLocale={siblingLocale}
              language={language}
              collection={collection}
              imageAttribution={imageAttribution}
              onClearImageAttribution={() => setImageAttribution(undefined)}
              onOpenImageSearch={() => setImageSearchTarget("main")}
              onAutoSlug={(v) => setSlug(slugify(v))}
              onAiSuggestSlug={async (name) => {
                const { data } = await actions.aiSuggestSlug({
                  name,
                  locale: language || "en",
                  collection,
                });
                return data?.slug ?? null;
              }}
            />

            {/* ── Timing & yield ── */}
            <TimingYieldSection
              form={form}
              formValues={formValues}
              splitView={splitView}
              siblingData={siblingData}
              siblingLocale={siblingLocale}
            />

            {/* ── Ingredients ── */}
            <IngredientsSection
              ingredients={ingredients}
              setIngredients={setIngredients}
              ingredientLinks={ingredientLinks}
              setIngredientLinks={setIngredientLinks}
              ingredientOptions={ingredientOptions}
              setIngredientOptions={setIngredientOptions}
              pendingLinks={pendingLinks}
              setPendingLinks={setPendingLinks}
              aiLinksLoading={aiLinksLoading}
              onRunProposeLinks={runProposeLinks}
              onApplyLinkSuggestion={applyLinkSuggestion}
              onRequestViewLink={(slug, ingredientIndex) =>
                setLinkModalState({ open: true, mode: "view", slug, ingredientIndex })
              }
              onRequestLinkIngredient={(ingredientIndex, ingredientString, aiSuggestion) =>
                setLinkModalState({
                  open: true,
                  mode: "link",
                  ingredientIndex,
                  ingredientString,
                  aiSuggestion,
                })
              }
              onOpenQuickCreate={openQuickCreate}
              splitView={splitView}
              siblingIngredients={siblingData?.data["recipeIngredient"] as string[] | undefined}
              siblingLocale={siblingLocale}
            />

            {/* ── Instructions ── */}
            <InstructionsSection
              instructions={instructions}
              setInstructions={setInstructions}
              stepAttributions={stepAttributions}
              setStepAttributions={setStepAttributions}
              onRequestImageSearch={(i) => setImageSearchTarget(i)}
              splitView={splitView}
              siblingInstructions={
                siblingData?.data["recipeInstructions"] as HowToStep[] | undefined
              }
              siblingLocale={siblingLocale}
            />

            {/* ── Classification ── */}
            <ClassificationSection
              form={form}
              collection={collection}
              splitView={splitView}
              siblingData={siblingData}
              siblingLocale={siblingLocale}
              tagSuggestions={tagSuggestions}
              kind={kind}
              setKind={setKind}
              dietTags={dietTags}
              setDietTags={setDietTags}
              regions={regions}
              setRegions={setRegions}
            />

            {/* ── Publishing ── */}
            <PublishingSection
              form={form}
              tagSuggestions={tagSuggestions}
              language={language ?? undefined}
              setLanguage={setLanguage}
              detectedLanguage={aiSuggestions?.detectedLanguage}
              translations={meta.translations as Record<string, string> | undefined}
              collection={collection}
              splitView={splitView}
              siblingData={siblingData}
              siblingLocale={siblingLocale}
            />

            {/* ── Pairings ── */}
            <PairingsSection
              entityKind={collection === "mixtures" ? "recipe" : "recipe"}
              slug={slug ?? ""}
              locale={(language || "en") as "en" | "de"}
              isNew={isNew ?? false}
              proposals={pairingProposals}
              setProposals={setPairingProposals}
              dismissed={dismissedPairingProposals}
              setDismissed={setDismissedPairingProposals}
              featuredPairings={featuredPairings}
              setFeaturedPairings={setFeaturedPairings}
              onRemovePairing={async (id, pairingLocale) =>
                actions.deletePairing({ id, locale: pairingLocale })
              }
              onCreatePairing={handleCreatePairing}
              aiEventLog={aiEventLog}
              runIdSeed={pairingRunId}
            />

            {/* ── Variants ── */}
            <VariantsSection
              collection={collection}
              slug={slug}
              value={variants}
              onChange={setVariants}
              recipeOptions={recipeOptions}
            />

            {/* ── External sources ── */}
            <SourcesSection value={sources} onChange={setSources} />
          </div>
        </EntityFormLayout>
      </form>

      {/* Enhance dialog */}
      <RecipeEnhanceDialog
        open={enhanceOpen}
        onOpenChange={(o) => {
          if (!o) clearIngestProposed();
          setEnhanceOpen(o);
        }}
        flow={aiFlow}
        onRun={ingestOnRun}
        onReviewBack={clearIngestProposed}
        snapshot={buildRecipeSnapshot()}
        proposed={ingestProposed}
        warnings={ingestWarnings}
        onApply={() => {
          if (ingestProposed) {
            applyProposedToForm(ingestProposed);
            clearIngestProposed();
            setEnhanceOpen(false);
            toast.success("Recipe enhanced!");
          }
        }}
      />

      {/* Translate dialog */}
      <RecipeTranslateDialog
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        slug={slug ?? ""}
        locale={language || "en"}
        collection={collection}
        entityKind={entityKind}
        snapshot={buildRecipeSnapshot()}
        runId={translateRunId}
        sourceKind={
          collection === "mixtures"
            ? kind || (meta.kind as string | undefined) || undefined
            : "recipe"
        }
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
      <RecipeIngredientLinkDialog
        state={linkModalState}
        onClose={() => setLinkModalState({ open: false })}
        locale={language || "en"}
        collection={collection}
        ingredients={ingredients}
        ingredientOptions={ingredientOptions}
        setIngredientLinks={setIngredientLinks}
        setIngredientOptions={setIngredientOptions}
      />

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
