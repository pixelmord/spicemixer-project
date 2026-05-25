import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Sparkles, Loader2, Check, Trash2, ExternalLink } from "lucide-react";
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
  INGREDIENT_REQUIRED,
  INGREDIENT_RECOMMENDED,
} from "@/lib/completeness.ts";
import { useEntityFormState } from "@/hooks/useEntityFormState.ts";
import { buildPayload } from "@/lib/entity-form-payload.ts";
import {
  INGREDIENT_PARTS,
  INGREDIENT_FLAVOR_PROFILE,
  type IngredientPart,
  type IngredientFlavorProfile,
} from "@/lib/ingredient-schema.ts";
import { slugify } from "@/lib/slugify.ts";
import type { SectionDef } from "./SectionNav.tsx";
import TagInput from "./TagInput.tsx";
import FormActionBar from "./FormActionBar.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import RecommendedHint from "./RecommendedHint.tsx";
import QuickCreateDialog from "./QuickCreateDialog.tsx";
import { EntityFormLayout } from "./EntityFormLayout.tsx";
import { FieldWithSibling } from "./FieldWithSibling.tsx";
import { IngestDialog } from "./IngestDialog.tsx";
import IngredientDiff from "./IngredientDiff.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog.tsx";
import { TranslateEntityDialog } from "./TranslateEntityDialog.tsx";
import PairingSuggestionPanel from "./PairingSuggestionPanel.tsx";
import { useIngestAction } from "@/lib/ai/use-ingest-action.ts";
import { CreatePairingDialog, type PairingAiSuggestion } from "./CreatePairingDialog.tsx";
import ImageSearchModal, {
  type ImageAttribution,
  type SelectedImage,
} from "./ImageSearchModal.tsx";
import EntityMultiCombobox from "./EntityMultiCombobox.tsx";
import { REGION_OPTIONS, type RegionCode } from "@/lib/regions.ts";
import { hasLiabilityScope } from "@/lib/liability.ts";
import {
  useAiSuggestions,
  type RunResult,
  type FieldSuggestion,
  type SiblingLocale,
} from "@/hooks/use-ai-suggestions";
import { SuggestionFlowProvider } from "./SuggestionFlowProvider.tsx";
import { InlineFieldSuggestion } from "./InlineFieldSuggestion.tsx";
import { AiBulkSuggestButton } from "@registry/components/ai-bulk-suggest-button";
import { AiBulkTranslateButton } from "@registry/components/ai-bulk-translate-button";
import { AiFieldSuggestButton } from "@registry/components/ai-field-suggest-button";
import { AiFieldTranslateButton } from "@registry/components/ai-field-translate-button";
import { useSplitViewPreference } from "@/hooks/use-split-view-preference.ts";
import { getSiblingEntity } from "@/lib/get-sibling-entity.ts";

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
  region?: RegionCode[];
  imageAttribution?: ImageAttribution;
}

type PairingProposal = {
  otherCollection: "ingredients" | "mixtures" | "recipes";
  otherSlug: string;
  rationale: string;
  traceId?: string;
};

function adaptIngredientImprovementsToRunResult(
  improvements: Array<{ field: string; suggestion: string; rationale: string }>,
): RunResult {
  const suggestions: Record<string, FieldSuggestion> = {};
  let counter = 0;
  for (const imp of improvements) {
    suggestions[imp.field] = {
      kind: "single",
      value: imp.suggestion,
      confidence: "medium",
      summary: imp.rationale,
      hash: `${imp.field}-${counter++}`,
      traceId: "legacy",
    };
  }
  return { suggestions, autoApplied: {}, traces: {} };
}

interface PairingListItem {
  id: string;
  endpoints: [{ collection: string; slug: string }, { collection: string; slug: string }];
  description: string;
}

interface Props {
  locale: "en" | "de";
  slug?: string;
  initialData?: Partial<IngredientData>;
  initialMeta?: Record<string, unknown>;
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
  key: keyof IngredientData;
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

const TRANSLATABLE_FIELDS = [
  "name",
  "summary",
  "description",
  "culinaryUse",
  "medicinalUses",
  "healthBenefits",
  "safetyNotes",
  "history",
  "storage",
  "sourcing",
  "seasonality",
] as const;

const AI_CONTRACT = {
  presets: [],
  fields: Object.fromEntries(
    TRANSLATABLE_FIELDS.map((key) => [key, { translation: { mode: "translate" as const } }]),
  ),
};

function emptyIngredient(): IngredientData {
  return { name: "", category: "spice", origin: [], flavorNotes: [] };
}

function parseApiResult(result: Record<string, unknown>): {
  improvements: Array<{ field: string; suggestion: string; rationale: string }>;
  pairings: PairingProposal[];
  detectedLanguage?: string;
  languageMismatch?: boolean;
  errors: Array<{ field: string; message: string }>;
} {
  const ai = (result["aiSuggestions"] ?? result) as Record<string, unknown>;
  return {
    improvements:
      (ai["improvements"] as Array<{ field: string; suggestion: string; rationale: string }>) ?? [],
    pairings: (ai["pairings"] as PairingProposal[]) ?? [],
    detectedLanguage: ai["detectedLanguage"] as string | undefined,
    languageMismatch: (ai["languageMismatch"] as boolean) ?? false,
    errors: (result["errors"] as Array<{ field: string; message: string }>) ?? [],
  };
}

export default function IngredientForm({
  locale,
  slug: initialSlug,
  initialData,
  initialMeta,
  isNew,
  existingTranslationLocales = [],
}: Props) {
  const data = { ...emptyIngredient(), ...initialData } as IngredientData;

  const {
    slug,
    setSlug,
    slugChecking,
    slugAvailable,
    draft,
    setDraft,
    saving,
    setSaving,
    completeness,
    setCompleteness,
  } = useEntityFormState({
    kind: "ingredient",
    collection: "ingredients",
    isNew: isNew ?? false,
    initialSlug: initialSlug ?? "",
    initialLocale: locale,
    initialDraft: isNew ? true : !!(initialMeta?.["draft"] as boolean | undefined),
    initialCompleteness: computeCompletenessFromBlob("ingredient", data as never, {}),
  });
  const [origins, setOrigins] = useState<string[]>(data.origin.length > 0 ? data.origin : []);
  const [flavorNotes, setFlavorNotes] = useState<string[]>(
    data.flavorNotes.length > 0 ? data.flavorNotes : [],
  );
  const [regions, setRegions] = useState<RegionCode[]>(
    (initialData?.["region"] as RegionCode[] | undefined) ?? [],
  );
  const [featuredPairings, setFeaturedPairings] = useState<PairingListItem[]>([]);
  const [pendingPairingDialog, setPendingPairingDialog] = useState<PairingAiSuggestion | null>(
    null,
  );
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
    data.imageAttribution,
  );
  const [imageSearchOpen, setImageSearchOpen] = useState(false);

  // AI state — pairings, language mismatch (not managed by useAiSuggestions)
  const [pairingProposals, setPairingProposals] = useState<PairingProposal[]>([]);
  const [dismissedPairingProposals, setDismissedPairingProposals] = useState<Set<string>>(
    new Set(),
  );
  const [detectedLanguage, setDetectedLanguage] = useState<string | undefined>();
  const [languageMismatch, setLanguageMismatch] = useState(false);

  // Section-level AI states
  const [aiOriginsLoading, setAiOriginsLoading] = useState(false);
  const [pendingOrigins, setPendingOrigins] = useState<string[] | null>(null);
  const [aiFlavorLoading, setAiFlavorLoading] = useState(false);
  const [pendingFlavors, setPendingFlavors] = useState<string[] | null>(null);

  // Modals
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateRunId] = useState(() => crypto.randomUUID());
  const translationTargetLocaleRef = useRef<string>("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Split view
  const [splitView, setSplitView] = useSplitViewPreference();
  const [siblingData, setSiblingData] = useState<SiblingLocale | null>(null);
  const siblingLocaleCode = locale === "en" ? "de" : "en";

  // Auto-enable split view when editing a translation
  useEffect(() => {
    if (initialMeta?.["translationOf"] && !splitView) {
      setSplitView(true);
    }
  }, []);

  // Fetch sibling entity when split view is toggled or on mount if split view is on
  useEffect(() => {
    if (!splitView || !slug) {
      setSiblingData(null);
      return;
    }
    void getSiblingEntity({ kind: "ingredient", slug, locale: siblingLocaleCode }).then((result) =>
      setSiblingData(result),
    );
  }, [splitView, slug]);

  useEffect(() => {
    if (!isNew && slug) {
      void actions.listPairingsFor({ slug }).then((r: { data?: unknown }) => {
        if (r.data) setFeaturedPairings(r.data as PairingListItem[]);
      });
    }
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
      const payloadCheck = buildPayload({
        kind: "ingredient",
        collection: "ingredients",
        slug,
        isNew: isNew ?? false,
        slugAvailable,
        locale,
        draft,
      });
      if (!payloadCheck.ok) {
        const { errors } = payloadCheck;
        if (errors.includes("missing-slug")) toast.error("Slug is required");
        else if (errors.includes("slug-taken")) toast.error(`Slug "${slug}" is already taken`);
        else if (errors.includes("missing-locale")) toast.error("Locale is required");
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
      if (regions.length > 0) payload.region = regions;
      if (imageAttribution) payload.imageAttribution = imageAttribution;

      const pendingAiEvents = pendingAiEventsRef.current;
      const { error } = await actions.saveIngredient({
        locale,
        slug,
        ingredient: payload as never,
        meta: { draft },
        ...(pendingAiEvents.length > 0 ? { pendingAiEvents } : {}),
      });

      if (error) {
        setSaving(false);
        toast.error("Save failed: " + error.message);
        return;
      }

      // Events were persisted with the save — clear the buffer.
      pendingAiEventsRef.current = [];
      setSaving(false);

      setCompleteness(computeCompletenessFromBlob("ingredient", payload as never, {}));
      toast.success("Saved");

      if (isNew) {
        window.location.href = `/admin/ingredients/${slug}/edit?locale=${locale}`;
        return;
      }
    },
  });

  function handleSave(asDraft: boolean) {
    setDraft(asDraft);
    setTimeout(() => void form.handleSubmit(), 0);
  }

  const formValues = useStore(form.store, (s) => s.values);

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

  const aiEntityRef = useMemo(() => ({ kind: "ingredient", id: slug ?? "" }), [slug]);

  const aiFlow = useAiSuggestions({
    contract: AI_CONTRACT,
    onRefine: async (params) => {
      const snap = buildIngredientSnapshot();
      // Per-field run: use params.target directly.
      // Full refresh: derive missing keys from recommended field completeness.
      const missingKeys =
        params.target ??
        INGREDIENT_RECOMMENDED.filter((k) => {
          if (k === "origin") return origins.length === 0;
          if (k === "images[0]") return !formValues.image;
          if (k === "parts") return parts.length === 0;
          if (k === "flavorProfile") return flavorProfile.length === 0;
          const v = formValues[k as keyof typeof formValues];
          return !v;
        });

      let result: unknown;
      try {
        const response = await actions.aiRefreshIngredientSuggestions({
          locale,
          slug,
          ingredient: snap as never,
          existingMeta: {},
          missingFields: missingKeys,
        });
        if (response.error) throw response.error;
        result = response.data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`AI suggest failed: ${msg}`);
        return { suggestions: {}, autoApplied: {}, traces: {} };
      }

      const parsed = parseApiResult(result as Record<string, unknown>);

      // Surface any per-field errors that affected the user's targeted fields.
      const targetedFields = params.target ?? [];
      const fulfilledFields = new Set(parsed.improvements.map((i) => i.field));
      const failedTargets = targetedFields.filter(
        (f) => !fulfilledFields.has(f) || parsed.errors.some((e) => e.field === f),
      );
      if (failedTargets.length > 0) {
        const detail =
          parsed.errors.find((e) => failedTargets.includes(e.field))?.message ??
          "the model returned no value";
        toast.error(
          `AI suggest could not generate a value for ${failedTargets.join(", ")}: ${detail}`,
        );
      }

      // Side-effects (language detection, pairing proposals) only on full refreshes —
      // a per-field run won't include those and would incorrectly clear existing state.
      if (!params.target) {
        setDetectedLanguage(parsed.detectedLanguage);
        setLanguageMismatch(parsed.languageMismatch ?? false);
        if (parsed.pairings.length > 0) {
          setPairingProposals(parsed.pairings);
          const autoLinked = (result as Record<string, unknown>)?.autoLinked as number;
          if (autoLinked > 0) {
            toast.success(`Auto-paired ${autoLinked} ingredient${autoLinked !== 1 ? "s" : ""}`);
            void actions.listPairingsFor({ slug }).then((pr: { data?: unknown }) => {
              if (pr.data) setFeaturedPairings(pr.data as PairingListItem[]);
            });
          }
        }
      }
      return adaptIngredientImprovementsToRunResult(parsed.improvements);
    },
    onFill: async (params) => {
      const ctx = params.sourceContext as {
        sourceLocale: string;
        sourceData: Record<string, unknown>;
        targetLocale?: string;
      };
      const { data: fillData, error } = await actions.aiFillTranslation({
        kind: "ingredient",
        sourceRef: { id: slug ?? "", kind: "ingredient" },
        sourceLocale: ctx.sourceLocale as "en" | "de",
        targetLocale: locale as "en" | "de",
        sourceData: ctx.sourceData,
        target: params.target,
      });
      if (error) throw new Error(error.message);
      return fillData!;
    },
    siblingLocale: siblingData ?? undefined,
    aiEventLog,
    entityRef: aiEntityRef,
    origin: {
      surface: "admin",
      action: "refine",
      entityKind: "ingredient",
      userInitiated: true,
      runId: `ingredient-${slug ?? "new"}`,
      triggeredBy: "editor",
    },
  });

  const handleManualRefresh = () => void aiFlow.run();

  useEffect(() => {
    setCompleteness(
      computeCompletenessFromBlob(
        "ingredient",
        {
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
        } as never,
        {},
      ),
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

  const pairingRunId = useMemo(() => `ingredient-pairing-${slug ?? "new"}`, [slug]);

  async function handleCreatePairing(
    pairingLocale: string,
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
      locale: pairingLocale as "en" | "de",
      draft: pairingMeta.draft,
    });
    if (saveError) throw new Error(saveError.message);
    if (fields.featured !== undefined) {
      await actions.savePairingMeta({
        id,
        locale: pairingLocale as "en" | "de",
        patch: { featured: fields.featured },
      });
    }
    void actions.listPairingsFor({ slug: slug ?? "" }).then((r: { data?: unknown }) => {
      if (r.data) setFeaturedPairings(r.data as PairingListItem[]);
    });
    return { kind: "pairing" as const, id };
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

  const {
    onRun: onIngestRun,
    proposed: ingestProposed,
    warnings: ingestWarnings,
    clearProposed: clearIngestProposed,
  } = useIngestAction({
    kind: "ingredient",
    slug: slug ?? "",
    locale,
    existing: buildIngredientSnapshot(),
  });

  function handleApplyEnhancement() {
    if (!ingestProposed) return;
    const p = ingestProposed as Partial<IngredientData>;

    const textFields = [
      "name",
      "summary",
      "description",
      "culinaryUse",
      "medicinalUses",
      "healthBenefits",
      "safetyNotes",
      "history",
      "storage",
      "sourcing",
      "botanicalName",
      "family",
      "seasonality",
    ] as const;
    for (const key of textFields) {
      if (p[key] !== undefined) {
        form.setFieldValue(key as never, (p[key] ?? "") as never);
      }
    }
    if (p.category !== undefined) form.setFieldValue("category" as never, p.category as never);
    if (p.images?.[0] !== undefined)
      form.setFieldValue("image" as never, (p.images[0] ?? "") as never);
    if (p.origin !== undefined) setOrigins(p.origin);
    if (p.flavorNotes !== undefined) setFlavorNotes(p.flavorNotes);
    if (p.commonNames !== undefined) setCommonNames(p.commonNames);
    if (p.parts !== undefined) setParts(p.parts);
    if (p.flavorProfile !== undefined) setFlavorProfile(p.flavorProfile);
    if (p.safetyFlags !== undefined) setSafetyFlags(p.safetyFlags);
    if (p.sources !== undefined) setSources(p.sources);
    clearIngestProposed();
    setEnhanceOpen(false);
    toast.success("Enhancement applied — review and save");
  }

  async function handleDelete() {
    if (!slug) return;
    const { error } = await actions.deleteItem({
      collection: "ingredients",
      id: `${locale}/${slug}`,
    });
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    toast.success("Ingredient deleted");
    window.location.href = "/admin/ingredients";
  }

  // Visible pairing proposals (non-dismissed, not already in featured pairings)
  const visiblePairingProposals = pairingProposals.filter(
    (p) =>
      !dismissedPairingProposals.has(p.otherSlug) &&
      !featuredPairings.some((fp) => fp.endpoints.some((ep) => ep.slug === p.otherSlug)),
  );

  function togglePart(part: IngredientPart) {
    setParts((prev) => (prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]));
  }

  function toggleFlavorProfile(value: IngredientFlavorProfile) {
    setFlavorProfile((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  const overflowMenuItems = useMemo(() => {
    if (isNew || !slug) return [];
    return [
      {
        label: "View public page",
        icon: <ExternalLink size={14} />,
        onClick: () => window.open(`/ingredients/${slug}`, "_blank"),
      },
      {
        label: "Delete",
        icon: <Trash2 size={14} />,
        onClick: () => setDeleteConfirmOpen(true),
      },
    ];
  }, [isNew, slug]);

  function handleSwapLanguage() {
    if (!slug) return;
    window.location.href = `/admin/ingredients/${slug}/edit?locale=${siblingLocaleCode}`;
  }

  const headerAuxiliary =
    !isNew && slug ? (
      <button
        type="button"
        onClick={() => {
          handleManualRefresh();
          setEnhanceOpen(true);
        }}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <Sparkles size={13} />
        Enhance
      </button>
    ) : undefined;

  let subHeaderStrip: ReactNode;
  if (!isNew && splitView) {
    subHeaderStrip = (
      <AiBulkTranslateButton contract={AI_CONTRACT} currentData={buildIngredientSnapshot()} />
    );
  } else if (!isNew) {
    subHeaderStrip = <AiBulkSuggestButton />;
  }

  const localeChip = (
    <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {locale.toUpperCase()}
    </span>
  );

  return (
    <SuggestionFlowProvider value={aiFlow}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <EntityFormLayout
          title={isNew ? "New ingredient" : `Edit · ${slug}`}
          localeChip={localeChip}
          headerAuxiliary={headerAuxiliary}
          overflowMenuItems={overflowMenuItems}
          sections={SECTIONS}
          completenessPanel={
            <CompletenessPanel
              result={completeness}
              requiredFields={requiredFields}
              recommendedFields={recommendedFields}
            />
          }
          completenessScore={completeness.score}
          completenessColor={completeness.color}
          extraSidebarBlocks={
            !isNew && !splitView ? (
              <PairingSuggestionPanel
                snapshot={buildIngredientSnapshot()}
                missingFields={completeness.missing}
                locale={locale}
                onApplyPairings={(proposals) => {
                  setPairingProposals((prev) => [
                    ...prev,
                    ...proposals
                      .filter((p) => !prev.some((x) => x.otherSlug === p.slug))
                      .map((p) => ({
                        otherCollection: "ingredients" as const,
                        otherSlug: p.slug,
                        rationale: p.note ?? "",
                      })),
                  ]);
                }}
                onApplyField={(field, value) => {
                  if (!Array.isArray(value)) {
                    if (field === "flavorNotes")
                      setFlavorNotes((prev) => [...new Set([...prev, String(value)])]);
                    else if (field === "origin")
                      setOrigins((prev) => [...new Set([...prev, String(value)])]);
                    else form.setFieldValue(field as never, String(value) as never);
                  }
                }}
              />
            ) : undefined
          }
          subHeaderStrip={subHeaderStrip}
          footer={
            <FormActionBar
              saving={saving}
              isDraft={draft}
              backHref="/admin/ingredients"
              previewHref={!isNew && slug ? `/ingredients/${slug}` : undefined}
              onSave={handleSave}
            />
          }
          splitView={splitView}
          activeLocale={locale}
          siblingLocale={siblingLocaleCode}
          hasExistingTranslation={existingTranslationLocales.includes(siblingLocaleCode)}
          onAddTranslation={!isNew && slug ? () => setTranslateOpen(true) : undefined}
          onToggleSplitView={() => setSplitView(!splitView)}
          onSwapLanguage={splitView && !isNew && slug ? handleSwapLanguage : undefined}
        >
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
                    <FieldWithSibling
                      label="Name"
                      fieldKey="name"
                      siblingValue={siblingData?.data["name"]}
                      siblingLocale={siblingLocaleCode}
                      splitView={splitView}
                    >
                      <div className="flex items-center justify-between">
                        <Label htmlFor={field.name}>Name *</Label>
                        {splitView && <AiFieldTranslateButton fieldPath="name" />}
                      </div>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => {
                          field.handleChange(e.target.value);
                          if (isNew && !slug) setSlug(slugify(e.target.value));
                        }}
                        placeholder="Cardamom"
                      />
                    </FieldWithSibling>
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
                    <FieldWithSibling
                      label="Summary"
                      fieldKey="summary"
                      siblingValue={siblingData?.data["summary"]}
                      siblingLocale={siblingLocaleCode}
                      splitView={splitView}
                    >
                      <div className="flex items-center justify-between">
                        <Label htmlFor={field.name}>Summary *</Label>
                        <div className="flex items-center gap-1.5">
                          {splitView ? (
                            <AiFieldTranslateButton fieldPath="summary" />
                          ) : (
                            !aiFlow.forField("summary").suggestion && (
                              <AiFieldSuggestButton fieldPath="summary" />
                            )
                          )}
                        </div>
                      </div>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="One-sentence pitch"
                      />
                      <InlineFieldSuggestion
                        fieldPath="summary"
                        currentValue={field.state.value}
                        onApply={(v) => field.handleChange(String(v))}
                        kind="text"
                      />
                    </FieldWithSibling>
                  )}
                </form.Field>

                <form.Field name="description">
                  {(field) => (
                    <FieldWithSibling
                      label="Description"
                      fieldKey="description"
                      siblingValue={siblingData?.data["description"]}
                      siblingLocale={siblingLocaleCode}
                      splitView={splitView}
                    >
                      <div className="flex items-center justify-between">
                        <Label htmlFor={field.name}>
                          Description
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <div className="flex items-center gap-1.5">
                          {splitView ? (
                            <AiFieldTranslateButton fieldPath="description" />
                          ) : (
                            !aiFlow.forField("description").suggestion && (
                              <AiFieldSuggestButton fieldPath="description" />
                            )
                          )}
                        </div>
                      </div>
                      <Textarea
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        rows={4}
                        placeholder="Detailed description…"
                      />
                      <InlineFieldSuggestion
                        fieldPath="description"
                        currentValue={field.state.value}
                        onApply={(v) => field.handleChange(String(v))}
                        kind="text"
                      />
                    </FieldWithSibling>
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
                {languageMismatch && detectedLanguage && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                    ⚠ Content appears to be in <strong>{detectedLanguage.toUpperCase()}</strong> but
                    this file is under the <strong>{locale.toUpperCase()}</strong> locale. Consider
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
                    <FieldWithSibling
                      label="Seasonality"
                      fieldKey="seasonality"
                      siblingValue={siblingData?.data["seasonality"]}
                      siblingLocale={siblingLocaleCode}
                      splitView={splitView}
                    >
                      <div className="flex items-center justify-between">
                        <Label htmlFor={field.name}>Seasonality</Label>
                        <div className="flex items-center gap-1.5">
                          {splitView ? (
                            <AiFieldTranslateButton fieldPath="seasonality" />
                          ) : (
                            !aiFlow.forField("seasonality").suggestion && (
                              <AiFieldSuggestButton fieldPath="seasonality" />
                            )
                          )}
                        </div>
                      </div>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Spring, late summer…"
                      />
                      <InlineFieldSuggestion
                        fieldPath="seasonality"
                        currentValue={field.state.value ?? ""}
                        onApply={(v) => field.handleChange(String(v))}
                        kind="text"
                      />
                    </FieldWithSibling>
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
                <TagInput value={origins} onChange={setOrigins} placeholder="Iran, Guatemala…" />
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
                      <div className="flex items-center justify-between">
                        <CardTitle>{label}</CardTitle>
                        <div className="flex items-center gap-1.5">
                          {splitView ? (
                            <AiFieldTranslateButton fieldPath={key} />
                          ) : (
                            !aiFlow.forField(key).suggestion && (
                              <AiFieldSuggestButton fieldPath={key} />
                            )
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <FieldWithSibling
                        label={label}
                        fieldKey={key}
                        siblingValue={siblingData?.data[key]}
                        siblingLocale={siblingLocaleCode}
                        splitView={splitView}
                      >
                        <Textarea
                          id={field.name}
                          value={field.state.value as string}
                          onChange={(e) => field.handleChange(e.target.value as never)}
                          rows={5}
                          placeholder={placeholder}
                          className="font-mono text-sm"
                        />
                        <InlineFieldSuggestion
                          fieldPath={key}
                          currentValue={(field.state.value as string) ?? ""}
                          onApply={(v) => field.handleChange(String(v) as never)}
                          kind="text"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Supports inline markdown links: <code>[text](url)</code>
                        </p>
                      </FieldWithSibling>
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
                  <div key={i} className="rounded-md border border-border p-3 space-y-2 relative">
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
                              prev.map((s, idx) => (idx === i ? { ...s, url: e.target.value } : s)),
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
                {hasLiabilityScope(formValues) && sources.length === 0 && (
                  <div
                    data-testid="liability-warning"
                    className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs text-amber-800 dark:text-amber-300"
                  >
                    ⚠ This ingredient has medicinal, health, or safety content. Add at least one
                    source to support these claims.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ── Pairings ── */}
          <section id="section-pairings" className="scroll-mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Pairings</CardTitle>
                  {visiblePairingProposals.length > 0 && (
                    <span className="text-xs text-primary">
                      {visiblePairingProposals.length} AI suggestion
                      {visiblePairingProposals.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* AI pairing suggestions */}
                {visiblePairingProposals.length > 0 && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      AI suggested pairings
                    </p>
                    {visiblePairingProposals.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="text-muted-foreground">{p.otherCollection}: </span>
                          <span className="font-medium">{p.otherSlug}</span>
                          {p.rationale && (
                            <p className="text-muted-foreground mt-0.5 truncate">{p.rationale}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPendingPairingDialog(p)}
                            className="flex items-center gap-1 rounded border border-primary/20 px-1.5 py-0.5 text-primary hover:bg-primary/10"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDismissedPairingProposals(
                                (prev) => new Set([...prev, p.otherSlug]),
                              )
                            }
                            className="rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                          >
                            ✕
                          </button>
                        </div>
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
                {!isNew &&
                  featuredPairings.length === 0 &&
                  visiblePairingProposals.length === 0 && (
                    <p className="text-xs text-muted-foreground">No pairings yet.</p>
                  )}
              </CardContent>
            </Card>
          </section>
        </EntityFormLayout>
      </form>

      {/* Enhance dialog */}
      <IngestDialog
        open={enhanceOpen}
        onOpenChange={(o) => {
          if (!o) {
            clearIngestProposed();
            setEnhanceOpen(false);
          }
        }}
        title="Enhance ingredient"
        onRun={onIngestRun}
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
                <IngredientDiff existing={buildIngredientSnapshot()} proposed={ingestProposed} />
              </div>
              <DialogFooter>
                <Button onClick={handleApplyEnhancement}>
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

      <Dialog open={translateOpen} onOpenChange={(o) => !o && setTranslateOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <TranslateEntityDialog
            contract={AI_CONTRACT}
            sourceRef={{ kind: "ingredient", id: slug }}
            sourceLocale={locale}
            sourceData={buildIngredientSnapshot()}
            availableLocales={locale === "en" ? ["de"] : ["en"]}
            onCreate={async (targetLocale, _slug, fields, meta) => {
              translationTargetLocaleRef.current = targetLocale;
              const { error } = await actions.aiCreateIngredientTranslation({
                slug,
                sourceLocale: locale,
                targetLocale: targetLocale as "en" | "de",
                fields,
                meta: meta as unknown as Record<string, unknown>,
              });
              if (error) throw new Error(error.message);
              return { kind: "ingredient", id: slug };
            }}
            onComplete={() => {
              const tl = translationTargetLocaleRef.current;
              setTranslateOpen(false);
              toast.success("Translation created");
              if (tl) window.open(`/admin/ingredients/${slug}/edit?locale=${tl}`, "_blank");
            }}
            aiEventLog={{ read: async () => [], append: async () => {} }}
            onFill={async (params) => {
              const ctx = params.sourceContext as {
                sourceLocale: string;
                targetLocale: string;
                sourceData: Record<string, unknown>;
              };
              const { data, error } = await actions.aiFillTranslation({
                kind: "ingredient",
                sourceRef: { id: slug, kind: "ingredient" },
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
              entityKind: "ingredient",
              entityRef: slug,
              userInitiated: true,
              runId: translateRunId,
              triggeredBy: "editor" as const,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <div className="space-y-4">
            <p className="text-sm">
              Delete <strong>{slug}</strong> ({locale.toUpperCase()})? This cannot be undone.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete()}>
                <Trash2 size={14} className="mr-1" />
                Delete
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create pairing dialog */}
      <Dialog
        open={!!pendingPairingDialog}
        onOpenChange={(o) => !o && setPendingPairingDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          {pendingPairingDialog && (
            <CreatePairingDialog
              sourceRef={{ kind: "ingredient", id: slug ?? "" }}
              aiSuggestion={pendingPairingDialog}
              locale={locale}
              onCreate={handleCreatePairing}
              onComplete={() => {
                setPendingPairingDialog(null);
                toast.success("Pairing created");
              }}
              aiEventLog={{ read: async () => [], append: async () => {} }}
              origin={{
                surface: "admin",
                action: "createPairing",
                entityKind: "ingredient",
                userInitiated: true,
                runId: pairingRunId,
                triggeredBy: "editor",
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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
    </SuggestionFlowProvider>
  );
}
