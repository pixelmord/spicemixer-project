import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge.tsx";
import { scoreRecipe, RECIPE_REQUIRED, RECIPE_RECOMMENDED } from "@/lib/completeness.ts";
import { slugify } from "@/lib/slugify.ts";
import type { RecipeCollection } from "@/lib/content-store.ts";
import type { AiSuggestions, AiSuggestion } from "@/lib/recipe-augment.ts";
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

type Collection = RecipeCollection;

interface HowToStep {
  "@type": "HowToStep";
  text: string;
  name?: string;
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
  tags: string[];
  ingredientLinks: IngredientLink[];
  externalSources: Array<{ url: string; title: string; source?: string }>;
  goesWellWith: Array<{ collection: string; slug: string }>;
  usesBase: Array<{ collection: string; slug: string }>;
  variants: string[];
  aiSuggestions?: AiSuggestions;
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

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
];

export default function RecipeForm({
  collection,
  slug: initialSlug,
  initialRecipe,
  initialMeta,
  isNew,
}: Props) {
  const recipe = { ...emptyRecipe(), ...initialRecipe } as RecipeData;
  const meta = { ...emptyMeta(), ...initialMeta } as MetaData;
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(initialMeta?.draft ?? (isNew ? true : false));
  const [completeness, setCompleteness] = useState(() =>
    scoreRecipe(recipe as never, meta as never),
  );

  const [ingredients, setIngredients] = useState<string[]>(
    recipe.recipeIngredient.length > 0 ? recipe.recipeIngredient : [""],
  );
  const [instructions, setInstructions] = useState<HowToStep[]>(
    recipe.recipeInstructions.map(
      (s): HowToStep => ({
        "@type": "HowToStep",
        text: stepText(s),
        name: stepName(s) || undefined,
      }),
    ),
  );
  const [ingredientLinks, setIngredientLinks] = useState<IngredientLink[]>(meta.ingredientLinks);
  const [externalSources, setExternalSources] = useState(meta.externalSources);
  const [goesWellWith, setGoesWellWith] = useState(meta.goesWellWith);
  const [usesBase, setUsesBase] = useState(meta.usesBase);
  const [language, setLanguage] = useState(meta.language ?? "");
  const [tags, setTags] = useState<string[]>(meta.tags);
  const [keywords, setKeywords] = useState<string[]>(
    Array.isArray(recipe.keywords) ? recipe.keywords : [],
  );
  const [dietTags, setDietTags] = useState<string[]>(
    Array.isArray(recipe.suitableForDiet) ? recipe.suitableForDiet : [],
  );

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

  // AI suggestions cache
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestions | undefined>(meta.aiSuggestions);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  // Per-section AI state
  const [pendingTags, setPendingTags] = useState<string[] | null>(null);
  const [pendingKeywords, setPendingKeywords] = useState<string[] | null>(null);
  const [pendingLinks, setPendingLinks] = useState<Array<{
    pattern: string;
    slug: string;
    confidence: "high" | "medium" | "low";
  }> | null>(null);
  const [pendingRelations, setPendingRelations] = useState<Array<{
    kind: "goesWellWith" | "usesBase";
    collection: string;
    slug: string;
    name: string;
    rationale: string;
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
    "ingredient" | "recipe" | "spicemix" | "sauce" | null
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
    void actions.listIngredientOptions({ locale: ingredientLocale(lang) }).then(({ data }) => {
      if (data)
        setIngredientOptions(data.map((d) => ({ value: d.slug, label: d.name, sublabel: d.slug })));
    });
  }

  useEffect(() => {
    fetchIngredientOptions(meta.language ?? "en");
    void actions.listRecipeOptions().then(({ data }) => {
      if (data)
        setRecipeOptions(
          data.map((d) => ({
            value: `${d.collection}/${d.slug}`,
            label: d.name,
            sublabel: d.collection,
          })),
        );
    });
    void actions.listAllTags().then(({ data }) => {
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
      .then(({ data }) => {
        if (data) {
          setAiSuggestions(data.aiSuggestions as AiSuggestions);
          if (data.autoLinked > 0) {
            toast.success(
              `Auto-linked ${data.autoLinked} ingredient${data.autoLinked !== 1 ? "s" : ""}`,
            );
            void actions.getItem({ collection, id: slug }).then(({ data: item }) => {
              if (item?.meta) {
                const updatedLinks = (item.meta as Record<string, unknown>)["ingredientLinks"];
                if (Array.isArray(updatedLinks))
                  setIngredientLinks(updatedLinks as IngredientLink[]);
              }
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setAiRefreshing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional mount-only

  // Re-fetch ingredient options when language changes to a different supported locale
  useEffect(() => {
    if (!language) return;
    fetchIngredientOptions(language);
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Slug availability check (new recipes only)
  useEffect(() => {
    if (!isNew || !slug) {
      setSlugAvailable(null);
      return;
    }
    setSlugChecking(true);
    const t = setTimeout(() => {
      void actions
        .checkSlugAvailable({ collection, slug })
        .then(({ data }) => {
          if (data) setSlugAvailable(data.available);
        })
        .finally(() => setSlugChecking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [slug, isNew, collection]);

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
      if (!slug) {
        toast.error("Slug is required");
        return;
      }
      if (isNew && slugAvailable === false) {
        toast.error(`Slug "${slug}" is already taken`);
        return;
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
      if (value.totalTime) recipePayload.totalTime = value.totalTime;
      if (value.datePublished) recipePayload.datePublished = value.datePublished;

      const metaPayload: MetaData = {
        ...meta,
        draft,
        language: language || undefined,
        locale: language || undefined,
        tags,
        ingredientLinks,
        externalSources,
        goesWellWith,
        usesBase,
        kind:
          collection === "recipes" ? "recipe" : collection === "spicemixes" ? "spicemix" : "sauce",
        // Preserve existing aiSuggestions — cleared by aiRefreshSuggestions when content changes
        aiSuggestions,
      };

      const { error } = await actions.saveRecipe({
        collection,
        slug,
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
        })
        .then(({ data }) => {
          if (data) {
            setAiSuggestions(data.aiSuggestions as AiSuggestions);
            // Reload ingredient links if auto-linked
            if (data.autoLinked > 0) {
              toast.success(
                `Auto-linked ${data.autoLinked} ingredient${data.autoLinked !== 1 ? "s" : ""}`,
              );
              // Re-fetch meta to get updated links
              void actions.getItem({ collection, id: slug }).then(({ data: item }) => {
                if (item?.meta) {
                  const updatedLinks = (item.meta as Record<string, unknown>)["ingredientLinks"];
                  if (Array.isArray(updatedLinks)) {
                    setIngredientLinks(updatedLinks as IngredientLink[]);
                  }
                }
              });
            }
          }
        })
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
    kind: "ingredient" | "recipe" | "spicemix" | "sauce",
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
    if (field === "tags") setTags((prev) => [...new Set([...prev, value])]);
    else if (field === "keywords") setKeywords((prev) => [...new Set([...prev, value])]);
    else form.setFieldValue(field as never, value as never);
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
      aiSuggestions,
    };
    try {
      const { data } = await actions.aiRefreshSuggestions({
        collection,
        slug,
        recipe: snap as never,
        meta: metaSnap as never,
        missingFields: missingKeys,
        locale: (language || "en") as "en" | "de",
      });
      if (data) setAiSuggestions(data.aiSuggestions as AiSuggestions);
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
      const newLinks = (data ?? []).filter((l) => !existing.has(l.pattern));
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
      aiSuggestions,
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
                        <Label htmlFor={field.name}>
                          Image URL
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Input
                          id={field.name}
                          type="url"
                          value={field.state.value}
                          onChange={(e) => {
                            field.handleChange(e.target.value);
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
                  <form.Field name="prepTime">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>
                          Prep time
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="PT15M"
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="cookTime">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>
                          Cook time
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="PT30M"
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="totalTime">
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>
                          Total time
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Input
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="PT45M"
                        />
                      </div>
                    )}
                  </form.Field>
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
                        <span className="text-xs font-semibold text-muted-foreground">
                          Step {i + 1}
                        </span>
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
                      placeholder="Select recipes, spicemixes, sauces…"
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
                      placeholder="Select base recipes or spicemixes…"
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

          {/* Right: completeness */}
          <aside className="sticky top-0 h-fit w-56 shrink-0 pt-1">
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
          </aside>
        </div>

        {/* Sticky footer */}
        <FormActionBar
          saving={saving}
          isDraft={draft}
          backHref={`/admin/${collection}`}
          previewHref={!isNew ? `/preview/${collection}/${slug}` : undefined}
          onSave={handleSave}
        />
      </form>

      {/* Enhance modal */}
      <EnhanceModal
        open={enhanceOpen}
        onClose={() => setEnhanceOpen(false)}
        collection={collection}
        slug={slug}
        existingRecipe={buildRecipeSnapshot()}
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
    </div>
  );
}
