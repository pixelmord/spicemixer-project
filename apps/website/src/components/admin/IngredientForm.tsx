import { useState, useEffect } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Loader2, Languages } from "lucide-react";
import LinkButton from "@/components/admin/LinkButton.tsx";
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
  scoreIngredient,
  INGREDIENT_REQUIRED,
  INGREDIENT_RECOMMENDED,
} from "@/lib/completeness.ts";
import {
  INGREDIENT_PARTS,
  INGREDIENT_FLAVOR_PROFILE,
  type IngredientPart,
  type IngredientFlavorProfile,
} from "@/lib/ingredient-schema.ts";
import { slugify } from "@/lib/slugify.ts";
import type { EntityOption } from "./EntityCombobox.tsx";
import SectionNav, { type SectionDef } from "./SectionNav.tsx";
import TagInput from "./TagInput.tsx";
import FormActionBar from "./FormActionBar.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import RecommendedHint from "./RecommendedHint.tsx";
import InlineSuggestion from "./InlineSuggestion.tsx";
import QuickCreateDialog from "./QuickCreateDialog.tsx";
import TranslationCompanion, { FieldWithTranslation } from "./TranslationCompanion.tsx";
import IngredientEnhanceModal from "./IngredientEnhanceModal.tsx";
import IngredientTranslateModal from "./IngredientTranslateModal.tsx";
import PairingEditor, { type Pairing } from "./PairingEditor.tsx";
import ImageSearchModal, {
  type ImageAttribution,
  type SelectedImage,
} from "./ImageSearchModal.tsx";
import EntityMultiCombobox from "./EntityMultiCombobox.tsx";
import { REGION_OPTIONS, type RegionCode } from "@/lib/regions.ts";
import { hasLiabilityScope } from "@/lib/liability.ts";

interface AiSuggestion {
  field: string;
  suggestion: string;
  rationale: string;
}

type Category = "spice" | "herb" | "seed" | "dried-fruit" | "salt" | "acid" | "allium" | "other";

interface IngredientData {
  name: string;
  summary?: string;
  description?: string;
  culinaryUse?: string;
  medicinalUses?: string;
  healthBenefits?: string;
  safetyNotes?: string;
  history?: string;
  storage?: string;
  sourcing?: string;
  images?: string[];
  category: Category;
  origin: string[];
  flavorNotes: string[];
  commonNames?: string[];
  botanicalName?: string;
  family?: string;
  parts?: IngredientPart[];
  seasonality?: string;
  flavorProfile?: IngredientFlavorProfile[];
  safetyFlags?: string[];
  sources?: Array<{ author?: string; title: string; url: string; year?: string }>;
}

interface AiSuggestionsState {
  contentHash?: string;
  improvements: AiSuggestion[];
  pairings: Array<{ slug: string; description: string; confidence: string }>;
  detectedLanguage?: string;
  languageMismatch?: boolean;
}

interface Props {
  locale: "en" | "de";
  slug?: string;
  initialData?: Partial<IngredientData>;
  initialMeta?: Record<string, unknown>;
  initialPairings?: Pairing[];
  isNew?: boolean;
  /** Locale codes for which a translation already exists (e.g. ["de"] if de/slug.json exists) */
  existingTranslationLocales?: string[];
}

const CATEGORIES: Category[] = [
  "spice",
  "herb",
  "seed",
  "dried-fruit",
  "salt",
  "acid",
  "allium",
  "other",
];

const SECTIONS: SectionDef[] = [
  { id: "section-basic", label: "Basic info" },
  { id: "section-taxonomy", label: "Taxonomy" },
  { id: "section-profile", label: "Origin & Flavor" },
  { id: "section-regions", label: "Regions" },
  { id: "section-longform", label: "Long-form" },
  { id: "section-sources", label: "Sources" },
  { id: "section-pairings", label: "Pairings" },
];

const LONGFORM_SECTIONS: {
  key: keyof IngredientData & string;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "culinaryUse",
    label: "Culinary use",
    placeholder: "How this ingredient is used in cooking…",
  },
  {
    key: "medicinalUses",
    label: "Medicinal uses",
    placeholder: "Traditional or documented medicinal applications…",
  },
  {
    key: "healthBenefits",
    label: "Health benefits",
    placeholder: "Nutritional or health-related properties…",
  },
  {
    key: "safetyNotes",
    label: "Safety notes",
    placeholder: "Allergens, contraindications, handling warnings…",
  },
  {
    key: "history",
    label: "History",
    placeholder: "Origin story, cultural history, trade routes…",
  },
  {
    key: "storage",
    label: "Storage",
    placeholder: "How to store, shelf life, container recommendations…",
  },
  {
    key: "sourcing",
    label: "Sourcing",
    placeholder: "Where to buy, quality indicators, forms available…",
  },
];

const RECOMMENDED_ANCHOR: Record<string, string> = {
  origin: "section-profile",
  botanicalName: "section-taxonomy",
  family: "section-taxonomy",
  parts: "section-taxonomy",
  flavorProfile: "section-taxonomy",
};

function emptyIngredient(): IngredientData {
  return { name: "", category: "spice", origin: [], flavorNotes: [] };
}

function parseAiSuggestions(result: Record<string, unknown>): AiSuggestionsState {
  const ai = (result["aiSuggestions"] ?? result) as Record<string, unknown>;
  return {
    improvements: (ai["improvements"] as AiSuggestion[]) ?? [],
    pairings: (ai["pairings"] as AiSuggestionsState["pairings"]) ?? [],
    detectedLanguage: ai["detectedLanguage"] as string | undefined,
    languageMismatch: (ai["languageMismatch"] as boolean) ?? false,
  };
}

export default function IngredientForm({
  locale,
  slug: initialSlug,
  initialData,
  initialMeta,
  initialPairings = [],
  isNew,
  existingTranslationLocales = [],
}: Props) {
  const data = { ...emptyIngredient(), ...initialData } as IngredientData;
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<boolean>(
    isNew ? true : !!(initialMeta?.["draft"] as boolean | undefined),
  );
  const [origins, setOrigins] = useState<string[]>(data.origin.length > 0 ? data.origin : []);
  const [flavorNotes, setFlavorNotes] = useState<string[]>(
    data.flavorNotes.length > 0 ? data.flavorNotes : [],
  );
  const [regions, setRegions] = useState<RegionCode[]>(
    (initialMeta?.["region"] as RegionCode[] | undefined) ?? [],
  );
  const [pairings, setPairings] = useState<Pairing[]>(initialPairings);
  const [completeness, setCompleteness] = useState(() => scoreIngredient(data as never));
  const [ingredientOptions, setIngredientOptions] = useState<EntityOption[]>([]);
  const [quickCreateName] = useState("");
  const [quickCreateCallback, setQuickCreateCallback] = useState<
    ((slug: string, label: string) => void) | null
  >(null);

  const [commonNames, setCommonNames] = useState<string[]>(data.commonNames ?? []);
  const [parts, setParts] = useState<IngredientPart[]>(data.parts ?? []);
  const [flavorProfile, setFlavorProfile] = useState<IngredientFlavorProfile[]>(
    data.flavorProfile ?? [],
  );
  const [safetyFlags, setSafetyFlags] = useState<string[]>(data.safetyFlags ?? []);
  const [sources, setSources] = useState<
    Array<{ author?: string; title: string; url: string; year?: string }>
  >(data.sources ?? []);

  // Image health check
  const [imageBroken, setImageBroken] = useState(false);
  const [imageAttribution, setImageAttribution] = useState<ImageAttribution | undefined>(
    initialMeta?.["imageAttribution"] as ImageAttribution | undefined,
  );
  const [imageSearchOpen, setImageSearchOpen] = useState(false);

  // AI state (transient — not persisted in meta)
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionsState>({
    improvements: [],
    pairings: [],
    detectedLanguage: undefined,
    languageMismatch: false,
  });
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [dismissedPairingProposals, setDismissedPairingProposals] = useState<Set<string>>(
    new Set(),
  );

  // Section-level AI states
  const [aiOriginsLoading, setAiOriginsLoading] = useState(false);
  const [pendingOrigins, setPendingOrigins] = useState<string[] | null>(null);
  const [aiFlavorLoading, setAiFlavorLoading] = useState(false);
  const [pendingFlavors, setPendingFlavors] = useState<string[] | null>(null);

  // Modals
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);

  function handleAiRefreshResult(result: Record<string, unknown>, pairingSlug: string) {
    setAiSuggestions(parseAiSuggestions(result));
    const autoLinked = result.autoLinked as number;
    if (autoLinked > 0) {
      toast.success(`Auto-paired ${autoLinked} ingredient${autoLinked !== 1 ? "s" : ""}`);
      void actions.listPairingsFor({ slug: pairingSlug }).then((pr: { data?: unknown }) => {
        if (pr.data) setPairings(pr.data as Pairing[]);
      });
    }
  }

  useEffect(() => {
    void actions.listIngredientOptions({ locale }).then((r: { data?: unknown }) => {
      if (r.data)
        setIngredientOptions(
          (r.data as { slug: string; name: string }[]).map((d) => ({
            value: d.slug,
            label: d.name,
            sublabel: d.slug,
          })),
        );
    });
  }, [locale]);

  // Check image URL health on mount
  useEffect(() => {
    const imageUrl = data.images?.[0];
    if (!imageUrl) return;
    const img = new window.Image();
    img.onerror = () => setImageBroken(true);
    img.onload = () => setImageBroken(false);
    img.src = imageUrl;
  }, []);

  // Auto-run AI suggestions on first open if none cached
  useEffect(() => {
    if (isNew || !initialSlug || aiSuggestions.improvements.length || aiSuggestions.pairings.length)
      return;
    const missingKeys = INGREDIENT_RECOMMENDED.filter((k) => {
      if (k === "origin") return origins.length === 0;
      if (k === "images") return !data.images?.length;
      if (k === "parts") return parts.length === 0;
      if (k === "flavorProfile") return flavorProfile.length === 0;
      const v = (data as unknown as Record<string, unknown>)[k];
      return !v;
    });
    setAiRefreshing(true);
    void actions
      .aiRefreshIngredientSuggestions({
        locale,
        slug: initialSlug,
        ingredient: data as never,
        existingMeta: initialMeta ?? {},
        missingFields: missingKeys,
      })
      .then((r: { data?: unknown }) => {
        const result = r.data as Record<string, unknown> | undefined;
        if (result) handleAiRefreshResult(result, initialSlug);
      })
      .catch(() => {})
      .finally(() => setAiRefreshing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Slug availability check (new ingredients only)
  useEffect(() => {
    if (!isNew || !slug) {
      setSlugAvailable(null);
      return;
    }
    setSlugChecking(true);
    const t = setTimeout(() => {
      void actions
        .checkSlugAvailable({ collection: "ingredients", slug: `${locale}/${slug}` })
        .then((r: { data?: unknown }) => {
          if (r.data) setSlugAvailable((r.data as { available: boolean }).available);
        })
        .finally(() => setSlugChecking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [slug, isNew, locale]);

  const form = useForm({
    defaultValues: {
      name: data.name,
      summary: data.summary ?? "",
      description: data.description ?? "",
      culinaryUse: data.culinaryUse ?? "",
      medicinalUses: data.medicinalUses ?? "",
      healthBenefits: data.healthBenefits ?? "",
      safetyNotes: data.safetyNotes ?? "",
      history: data.history ?? "",
      storage: data.storage ?? "",
      sourcing: data.sourcing ?? "",
      image: data.images?.[0] ?? "",
      category: data.category,
      botanicalName: data.botanicalName ?? "",
      family: data.family ?? "",
      seasonality: data.seasonality ?? "",
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

      const payload: IngredientData = {
        name: value.name,
        category: value.category as Category,
        origin: origins.filter(Boolean),
        flavorNotes: flavorNotes.filter(Boolean),
      };
      if (value.summary) payload.summary = value.summary;
      if (value.description) payload.description = value.description;
      if (value.culinaryUse) payload.culinaryUse = value.culinaryUse;
      if (value.medicinalUses) payload.medicinalUses = value.medicinalUses;
      if (value.healthBenefits) payload.healthBenefits = value.healthBenefits;
      if (value.safetyNotes) payload.safetyNotes = value.safetyNotes;
      if (value.history) payload.history = value.history;
      if (value.storage) payload.storage = value.storage;
      if (value.sourcing) payload.sourcing = value.sourcing;
      if (value.image) payload.images = [value.image];
      if (commonNames.length > 0) payload.commonNames = commonNames;
      if (value.botanicalName) payload.botanicalName = value.botanicalName;
      if (value.family) payload.family = value.family;
      if (parts.length > 0) payload.parts = parts;
      if (value.seasonality) payload.seasonality = value.seasonality;
      if (flavorProfile.length > 0) payload.flavorProfile = flavorProfile;
      if (safetyFlags.length > 0) payload.safetyFlags = safetyFlags;
      if (sources.length > 0) payload.sources = sources;

      const { error } = await actions.saveIngredient({
        locale,
        slug,
        ingredient: payload as never,
        meta: { draft, region: regions },
      });

      if (error) {
        setSaving(false);
        toast.error("Save failed: " + error.message);
        return;
      }

      if (imageAttribution) {
        await actions.saveIngredientMeta({ locale, slug, patch: { imageAttribution } });
      }

      setSaving(false);

      setCompleteness(scoreIngredient(payload as never));
      toast.success("Saved");

      if (isNew) {
        window.location.href = `/admin/ingredients/${slug}/edit?locale=${locale}`;
        return;
      }

      // Post-save async refresh
      const missingKeys = INGREDIENT_RECOMMENDED.filter((k) => {
        if (k === "origin") return origins.filter(Boolean).length === 0;
        if (k === "images") return !payload.images?.length;
        if (k === "parts") return (payload.parts ?? []).length === 0;
        if (k === "flavorProfile") return (payload.flavorProfile ?? []).length === 0;
        return !(payload as unknown as Record<string, unknown>)[k];
      });
      setAiRefreshing(true);
      void actions
        .aiRefreshIngredientSuggestions({
          locale,
          slug,
          ingredient: payload as never,
          existingMeta: {},
          missingFields: missingKeys,
        })
        .then((r: { data?: unknown }) => {
          const result = r.data as Record<string, unknown> | undefined;
          if (result) handleAiRefreshResult(result, slug);
        })
        .catch(() => {})
        .finally(() => setAiRefreshing(false));
    },
  });

  function handleSave(asDraft: boolean) {
    setDraft(asDraft);
    setTimeout(() => void form.handleSubmit(), 0);
  }

  const formValues = useStore(form.store, (s) => s.values);
  useEffect(() => {
    setCompleteness(
      scoreIngredient({
        name: formValues.name,
        summary: formValues.summary,
        category: formValues.category,
        description: formValues.description,
        images: formValues.image ? [formValues.image] : [],
        origin: origins.filter(Boolean),
        botanicalName: formValues.botanicalName || undefined,
        family: formValues.family || undefined,
        parts: parts.length > 0 ? parts : undefined,
        flavorProfile: flavorProfile.length > 0 ? flavorProfile : undefined,
      } as never),
    );
  }, [formValues, origins, parts, flavorProfile]);

  const requiredFields = INGREDIENT_REQUIRED.map((key) => {
    let filled: boolean;
    switch (key) {
      case "name":
        filled = !!formValues.name;
        break;
      case "category":
        filled = !!formValues.category;
        break;
      case "summary":
        filled = !!formValues.summary;
        break;
    }
    return { key, label: key, filled, anchorId: "section-basic" };
  });

  const recommendedFields = INGREDIENT_RECOMMENDED.map((key) => {
    let filled: boolean;
    if (key === "description") filled = !!formValues.description;
    else if (key === "botanicalName") filled = !!formValues.botanicalName;
    else if (key === "family") filled = !!formValues.family;
    else if (key === "origin") filled = origins.filter(Boolean).length > 0;
    else if (key === "parts") filled = parts.length > 0;
    else if (key === "flavorProfile") filled = flavorProfile.length > 0;
    else filled = !!formValues.image;

    return {
      key,
      label: key,
      filled,
      anchorId: RECOMMENDED_ANCHOR[key] ?? "section-basic",
    };
  });

  // Visible AI improvements (filtered by dismissed)
  const visibleImprovements: AiSuggestion[] = aiSuggestions.improvements.filter(
    (s) => !dismissedSuggestions.has(s.field),
  );

  function handleApplySuggestion(field: string, value: string) {
    if (field === "flavorNotes") setFlavorNotes((prev) => [...new Set([...prev, value])]);
    else if (field === "origin") setOrigins((prev) => [...new Set([...prev, value])]);
    else form.setFieldValue(field as never, value as never);
    setDismissedSuggestions((prev) => new Set([...prev, field]));
  }

  function handleDismissSuggestion(field: string) {
    setDismissedSuggestions((prev) => new Set([...prev, field]));
  }

  async function handleManualRefresh() {
    setAiRefreshing(true);
    setDismissedSuggestions(new Set());
    const missingKeys = INGREDIENT_RECOMMENDED.filter((k) => {
      if (k === "origin") return origins.length === 0;
      if (k === "images") return !formValues.image;
      if (k === "parts") return parts.length === 0;
      if (k === "flavorProfile") return flavorProfile.length === 0;
      const v = formValues[k as keyof typeof formValues];
      return !v;
    });
    try {
      const snap = {
        name: formValues.name,
        summary: formValues.summary,
        description: formValues.description,
        category: formValues.category,
        origin: origins.filter(Boolean),
        flavorNotes: flavorNotes.filter(Boolean),
        botanicalName: formValues.botanicalName || undefined,
        family: formValues.family || undefined,
        parts: parts.length > 0 ? parts : undefined,
        flavorProfile: flavorProfile.length > 0 ? flavorProfile : undefined,
      };
      const { data: result } = await actions.aiRefreshIngredientSuggestions({
        locale,
        slug,
        ingredient: snap as never,
        existingMeta: {},
        missingFields: missingKeys,
      });
      if (result) {
        setAiSuggestions(parseAiSuggestions(result));
      }
    } catch {
      toast.error("Could not refresh suggestions");
    } finally {
      setAiRefreshing(false);
    }
  }

  // Per-section: propose origins
  async function runProposeOrigin() {
    setAiOriginsLoading(true);
    try {
      const { data: result, error } = await actions.aiProposeIngredientImprovements({
        ingredient: {
          name: formValues.name,
          category: formValues.category,
          flavorNotes: flavorNotes.filter(Boolean),
        },
        missingFields: ["origin"],
      });
      if (error) throw new Error(error.message);
      const fields = result?.fields as Array<{ field: string; suggestion: string }> | undefined;
      const originField = fields?.find((f) => f.field === "origin");
      if (originField) {
        const vals = originField.suggestion
          .split(/[,;]\s*/)
          .map((s: string) => s.trim())
          .filter(Boolean);
        setPendingOrigins(vals);
      }
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setAiOriginsLoading(false);
    }
  }

  // Per-section: propose flavor notes
  async function runProposeFlavors() {
    setAiFlavorLoading(true);
    try {
      const { data: result, error } = await actions.aiProposeIngredientImprovements({
        ingredient: {
          name: formValues.name,
          category: formValues.category,
          origin: origins.filter(Boolean),
        },
        missingFields: ["flavorNotes"],
      });
      if (error) throw new Error(error.message);
      const flavorFields = result?.fields as
        | Array<{ field: string; suggestion: string }>
        | undefined;
      const field = flavorFields?.find((f) => f.field === "flavorNotes");
      if (field) {
        const vals = field.suggestion
          .split(/[,;]\s*/)
          .map((s: string) => s.trim().toLowerCase())
          .filter(Boolean);
        setPendingFlavors(vals);
      }
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setAiFlavorLoading(false);
    }
  }

  function buildIngredientSnapshot(): Record<string, unknown> {
    return {
      name: formValues.name,
      summary: formValues.summary,
      description: formValues.description,
      category: formValues.category,
      origin: origins.filter(Boolean),
      flavorNotes: flavorNotes.filter(Boolean),
      botanicalName: formValues.botanicalName || undefined,
      family: formValues.family || undefined,
      parts: parts.length > 0 ? parts : undefined,
      flavorProfile: flavorProfile.length > 0 ? flavorProfile : undefined,
    };
  }

  // Pending pairing proposals (non-dismissed, non-accepted)
  const pendingPairingProposals = aiSuggestions.pairings.filter(
    (p) =>
      !dismissedPairingProposals.has(p.slug) &&
      !pairings.some((existing) => {
        const other =
          existing.ingredients[0] === slug ? existing.ingredients[1] : existing.ingredients[0];
        return other === p.slug;
      }),
  );

  function togglePart(part: IngredientPart) {
    setParts((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));
  }

  function toggleFlavorProfile(value: IngredientFlavorProfile) {
    setFlavorProfile((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LinkButton variant="ghost" size="icon" href="/admin/ingredients">
          <ArrowLeft size={16} />
        </LinkButton>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{isNew ? "New ingredient" : `Edit · ${slug}`}</h1>
          <p className="text-sm text-muted-foreground">Locale: {locale.toUpperCase()}</p>
        </div>
        {!isNew && slug && (
          <>
            <button
              type="button"
              onClick={() => setEnhanceOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Sparkles size={13} />
              Enhance
            </button>
            {/* Only show translate button if no translation exists for the other locale */}
            {!existingTranslationLocales.includes(locale === "en" ? "de" : "en") && (
              <button
                type="button"
                onClick={() => setTranslateOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Languages size={13} />
                Translate
              </button>
            )}
          </>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <TranslationCompanion slug={slug} currentLocale={locale}>
          {(companion) => (
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
                    <CardContent className="space-y-4 pt-6">
                      {isNew && (
                        <div className="space-y-1.5">
                          <Label>Slug</Label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="cardamom"
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
                            <button
                              type="button"
                              title="AI suggest slug"
                              onClick={async () => {
                                const name = form.getFieldValue("name" as never) as string;
                                if (!name) return;
                                try {
                                  const { data } = await actions.aiSuggestSlug({
                                    name,
                                    locale,
                                    collection: "recipes", // slug suggestion is locale-aware only
                                  });
                                  if (data) setSlug(data.slug);
                                } catch {
                                  toast.error("Could not suggest slug");
                                }
                              }}
                              className="flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <Sparkles size={12} />
                            </button>
                          </div>
                        </div>
                      )}

                      <form.Field name="name">
                        {(field) => (
                          <FieldWithTranslation label="Name" fieldKey="name" context={companion}>
                            <Label htmlFor={field.name}>Name *</Label>
                            <Input
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => {
                                field.handleChange(e.target.value);
                                if (isNew && !slug) setSlug(slugify(e.target.value));
                              }}
                              placeholder="Cardamom"
                            />
                          </FieldWithTranslation>
                        )}
                      </form.Field>

                      <form.Field name="category">
                        {(field) => (
                          <div className="space-y-1.5">
                            <Label>Category *</Label>
                            <Select
                              value={field.state.value}
                              onValueChange={(v) => v && field.handleChange(v as Category)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </form.Field>

                      <form.Field name="summary">
                        {(field) => (
                          <FieldWithTranslation
                            label="Summary"
                            fieldKey="summary"
                            context={companion}
                          >
                            <Label htmlFor={field.name}>Summary *</Label>
                            <Input
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              placeholder="One-sentence pitch"
                            />
                            {(() => {
                              const s = visibleImprovements.find((s) => s.field === "summary");
                              if (!s || field.state.value) return null;
                              return (
                                <InlineSuggestion
                                  label="AI suggestion"
                                  current={field.state.value}
                                  suggested={s.suggestion}
                                  rationale={s.rationale}
                                  onAccept={(v) => {
                                    field.handleChange(v);
                                    handleDismissSuggestion("summary");
                                  }}
                                  onDismiss={() => handleDismissSuggestion("summary")}
                                />
                              );
                            })()}
                          </FieldWithTranslation>
                        )}
                      </form.Field>

                      <form.Field name="description">
                        {(field) => (
                          <FieldWithTranslation
                            label="Description"
                            fieldKey="description"
                            context={companion}
                          >
                            <Label htmlFor={field.name}>
                              Description
                              <RecommendedHint show={!field.state.value} />
                            </Label>
                            <Textarea
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              rows={4}
                              placeholder="Detailed description…"
                            />
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
                          </FieldWithTranslation>
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
                                onClick={() => setImageSearchOpen(true)}
                                className="text-xs text-primary hover:underline"
                              >
                                Search image…
                              </button>
                            </div>
                            <Input
                              type="url"
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => {
                                field.handleChange(e.target.value);
                                if (!e.target.value) setImageAttribution(undefined);
                                setImageBroken(false);
                                if (e.target.value) {
                                  const img = new window.Image();
                                  img.onerror = () => setImageBroken(true);
                                  img.onload = () => setImageBroken(false);
                                  img.src = e.target.value;
                                }
                              }}
                              placeholder="https://…"
                              className={imageBroken ? "border-amber-400" : ""}
                            />
                            {imageBroken && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">
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

                      {/* Language mismatch warning */}
                      {aiSuggestions.languageMismatch && aiSuggestions.detectedLanguage && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                          ⚠ Content appears to be in{" "}
                          <strong>{aiSuggestions.detectedLanguage.toUpperCase()}</strong> but this
                          file is under the <strong>{locale.toUpperCase()}</strong> locale. Consider
                          moving it or creating a translation.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>

                {/* ── Taxonomy ── */}
                <section id="section-taxonomy" className="scroll-mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Taxonomy</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Common names</Label>
                        <TagInput
                          value={commonNames}
                          onChange={setCommonNames}
                          placeholder="kala zeera, cilantro…"
                        />
                      </div>

                      <form.Field name="botanicalName">
                        {(field) => (
                          <div className="space-y-1.5">
                            <Label htmlFor={field.name}>
                              Botanical name
                              <RecommendedHint show={!field.state.value} />
                            </Label>
                            <Input
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              placeholder="Elettaria cardamomum"
                            />
                          </div>
                        )}
                      </form.Field>

                      <form.Field name="family">
                        {(field) => (
                          <div className="space-y-1.5">
                            <Label htmlFor={field.name}>
                              Family
                              <RecommendedHint show={!field.state.value} />
                            </Label>
                            <Input
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              placeholder="Zingiberaceae"
                            />
                          </div>
                        )}
                      </form.Field>

                      <div className="space-y-1.5">
                        <Label>
                          Parts used
                          <RecommendedHint show={parts.length === 0} />
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {INGREDIENT_PARTS.map((part) => (
                            <button
                              key={part}
                              type="button"
                              onClick={() => togglePart(part)}
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                parts.includes(part)
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                              }`}
                            >
                              {part}
                            </button>
                          ))}
                        </div>
                      </div>

                      <form.Field name="seasonality">
                        {(field) => (
                          <div className="space-y-1.5">
                            <Label htmlFor={field.name}>Seasonality</Label>
                            <Input
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                              placeholder="Spring, late summer…"
                            />
                          </div>
                        )}
                      </form.Field>

                      <div className="space-y-1.5">
                        <Label>
                          Flavor profile
                          <RecommendedHint show={flavorProfile.length === 0} />
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {INGREDIENT_FLAVOR_PROFILE.map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => toggleFlavorProfile(value)}
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                flavorProfile.includes(value)
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                              }`}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Safety flags</Label>
                        <TagInput
                          value={safetyFlags}
                          onChange={setSafetyFlags}
                          placeholder="allergen, contraindication…"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </section>

                {/* ── Profile ── */}
                <section id="section-profile" className="scroll-mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Origin</CardTitle>
                        <button
                          type="button"
                          onClick={runProposeOrigin}
                          disabled={aiOriginsLoading}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {aiOriginsLoading ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Sparkles size={11} />
                          )}
                          AI suggest
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <TagInput
                        value={origins}
                        onChange={setOrigins}
                        placeholder="Iran, Guatemala…"
                      />
                      {pendingOrigins && pendingOrigins.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {pendingOrigins
                            .filter((o) => !origins.includes(o))
                            .map((o) => (
                              <button
                                key={o}
                                type="button"
                                onClick={() => setOrigins((prev) => [...prev, o])}
                                className="rounded border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                              >
                                + {o}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => {
                              setOrigins((prev) => [...new Set([...prev, ...pendingOrigins])]);
                              setPendingOrigins(null);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground px-1"
                          >
                            Add all
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingOrigins(null)}
                            className="text-xs text-muted-foreground hover:text-foreground px-1"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Flavor notes</CardTitle>
                        <button
                          type="button"
                          onClick={runProposeFlavors}
                          disabled={aiFlavorLoading}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {aiFlavorLoading ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Sparkles size={11} />
                          )}
                          AI suggest
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <TagInput
                        value={flavorNotes}
                        onChange={setFlavorNotes}
                        placeholder="floral, earthy, warm…"
                      />
                      {pendingFlavors && pendingFlavors.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {pendingFlavors
                            .filter((f) => !flavorNotes.includes(f))
                            .map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setFlavorNotes((prev) => [...prev, f])}
                                className="rounded border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                              >
                                + {f}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => {
                              setFlavorNotes((prev) => [...new Set([...prev, ...pendingFlavors])]);
                              setPendingFlavors(null);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground px-1"
                          >
                            Add all
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingFlavors(null)}
                            className="text-xs text-muted-foreground hover:text-foreground px-1"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>

                {/* ── Regions ── */}
                <section id="section-regions" className="scroll-mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Regions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      <Label>Macro-regions</Label>
                      <EntityMultiCombobox
                        value={regions}
                        onChange={(vals) => setRegions(vals as RegionCode[])}
                        options={REGION_OPTIONS}
                        placeholder="Select culinary macro-regions…"
                      />
                      <p className="text-xs text-muted-foreground">
                        Closed enum — different from <span className="font-mono">origin[]</span>{" "}
                        (free-form, finer) and <span className="font-mono">recipeCuisine</span>{" "}
                        (schema.org cuisine).
                      </p>
                    </CardContent>
                  </Card>
                </section>

                {/* ── Long-form sections ── */}
                <section id="section-longform" className="scroll-mt-4 space-y-4">
                  {LONGFORM_SECTIONS.map(({ key, label, placeholder }) => (
                    <form.Field key={key} name={key as never}>
                      {(field) => (
                        <Card>
                          <CardHeader>
                            <CardTitle>{label}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <Textarea
                              id={field.name}
                              value={field.state.value as string}
                              onChange={(e) => field.handleChange(e.target.value as never)}
                              rows={5}
                              placeholder={placeholder}
                              className="font-mono text-sm"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              Supports inline markdown links: <code>[text](url)</code>
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </form.Field>
                  ))}
                </section>

                {/* ── Sources ── */}
                <section id="section-sources" className="scroll-mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Sources</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {sources.map((src, i) => (
                        <div
                          key={i}
                          className="rounded-md border border-border p-3 space-y-2 relative"
                        >
                          <button
                            type="button"
                            onClick={() => setSources((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-destructive"
                            aria-label="Remove source"
                          >
                            ✕
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Title *</Label>
                              <Input
                                value={src.title}
                                onChange={(e) =>
                                  setSources((prev) =>
                                    prev.map((s, idx) =>
                                      idx === i ? { ...s, title: e.target.value } : s,
                                    ),
                                  )
                                }
                                placeholder="Source title"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">URL *</Label>
                              <Input
                                type="url"
                                value={src.url}
                                onChange={(e) =>
                                  setSources((prev) =>
                                    prev.map((s, idx) =>
                                      idx === i ? { ...s, url: e.target.value } : s,
                                    ),
                                  )
                                }
                                placeholder="https://…"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Author</Label>
                              <Input
                                value={src.author ?? ""}
                                onChange={(e) =>
                                  setSources((prev) =>
                                    prev.map((s, idx) =>
                                      idx === i ? { ...s, author: e.target.value || undefined } : s,
                                    ),
                                  )
                                }
                                placeholder="Author name"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Year</Label>
                              <Input
                                value={src.year ?? ""}
                                onChange={(e) =>
                                  setSources((prev) =>
                                    prev.map((s, idx) =>
                                      idx === i ? { ...s, year: e.target.value || undefined } : s,
                                    ),
                                  )
                                }
                                placeholder="2024"
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSources((prev) => [...prev, { title: "", url: "" }])}
                        className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground w-full"
                      >
                        + Add source
                      </button>
                      {hasLiabilityScope({
                        medicinalUses: formValues.medicinalUses,
                        healthBenefits: formValues.healthBenefits,
                        safetyNotes: formValues.safetyNotes,
                      }) &&
                        sources.length === 0 && (
                          <div
                            data-testid="liability-warning"
                            className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs text-amber-800 dark:text-amber-300"
                          >
                            ⚠ This ingredient has medicinal, health, or safety content. Add at least
                            one source to support these claims.
                          </div>
                        )}
                    </CardContent>
                  </Card>
                </section>

                {/* ── Pairings ── */}
                <section id="section-pairings" className="scroll-mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Pairings</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PairingEditor
                        currentSlug={slug}
                        locale={locale}
                        pairings={pairings}
                        pendingProposals={pendingPairingProposals}
                        ingredientOptions={ingredientOptions}
                        onPairingsChange={setPairings}
                        onDismissProposal={(s) =>
                          setDismissedPairingProposals((prev) => new Set([...prev, s]))
                        }
                        onApplyProposal={() => {
                          /* proposals automatically accepted via PairingEditor */
                        }}
                      />
                    </CardContent>
                  </Card>
                </section>
              </div>

              {/* Right: completeness */}
              <aside className="sticky top-0 h-fit w-52 shrink-0 pt-1">
                <CompletenessPanel
                  result={completeness}
                  requiredFields={requiredFields}
                  recommendedFields={recommendedFields}
                  aiSuggestions={visibleImprovements}
                  aiRefreshing={aiRefreshing}
                  onRefreshSuggestions={!isNew ? handleManualRefresh : undefined}
                  onApplySuggestion={handleApplySuggestion}
                  onDismissSuggestion={handleDismissSuggestion}
                />
              </aside>
            </div>
          )}
        </TranslationCompanion>

        {/* Sticky footer */}
        <FormActionBar
          saving={saving}
          isDraft={draft}
          backHref="/admin/ingredients"
          onSave={handleSave}
        />
      </form>

      {/* Modals */}
      <IngredientEnhanceModal
        open={enhanceOpen}
        onClose={() => setEnhanceOpen(false)}
        locale={locale}
        slug={slug}
        existingIngredient={buildIngredientSnapshot()}
        onApplied={() => window.location.reload()}
      />

      <IngredientTranslateModal
        open={translateOpen}
        onClose={() => setTranslateOpen(false)}
        slug={slug}
        ingredient={buildIngredientSnapshot()}
        currentLocale={locale}
      />

      {/* Quick create dialog */}
      {quickCreateCallback && (
        <QuickCreateDialog
          open
          onClose={() => setQuickCreateCallback(null)}
          kind="ingredient"
          initialName={quickCreateName}
          onCreated={(newSlug, newLabel) => {
            quickCreateCallback(newSlug, newLabel);
            setQuickCreateCallback(null);
          }}
        />
      )}

      {/* Image search modal */}
      <ImageSearchModal
        open={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        defaultQuery={form.getFieldValue("name" as never) as string}
        onSelect={(selected: SelectedImage) => {
          form.setFieldValue("image" as never, selected.url as never);
          setImageBroken(false);
          setImageAttribution(selected.attribution);
        }}
      />
    </div>
  );
}
