import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { navigate } from "astro:transitions/client";
import { useForm, useStore } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Sparkles, Trash2, ExternalLink } from "lucide-react";
import {
  computeCompletenessFromBlob,
  INGREDIENT_REQUIRED,
  INGREDIENT_RECOMMENDED,
} from "@/lib/completeness.ts";
import { useEntityFormState } from "@/hooks/useEntityFormState.ts";
import { buildPayload } from "@/lib/entity-form-payload.ts";
import type { IngredientPart, IngredientFlavorProfile } from "@/lib/ingredient-schema.ts";
import type { SectionDef } from "@/components/admin/SectionNav.tsx";
import FormActionBar from "@/components/admin/FormActionBar.tsx";
import CompletenessPanel from "@/components/admin/CompletenessPanel.tsx";
import QuickCreateDialog from "@/components/admin/QuickCreateDialog.tsx";
import { EntityFormLayout } from "@/components/admin/EntityFormLayout.tsx";
import { PairingsSection } from "@/components/admin/forms/_shared/PairingsSection.tsx";
import type {
  PairingProposal as SharedPairingProposal,
  PairingListItem as SharedPairingListItem,
} from "@/components/admin/forms/_shared/pairing-proposals.ts";
import { BasicInfoSection } from "./sections/BasicInfoSection.tsx";
import { SourcesSection } from "./sections/SourcesSection.tsx";
import { LongformSection } from "./sections/LongformSection.tsx";
import { OriginFlavorSection } from "./sections/OriginFlavorSection.tsx";
import { RegionsSection } from "./sections/RegionsSection.tsx";
import { TaxonomySection } from "./sections/TaxonomySection.tsx";
import { IngredientEnhanceDialog } from "./sections/modals/IngredientEnhanceDialog.tsx";
import { IngredientTranslateDialog } from "./sections/modals/IngredientTranslateDialog.tsx";
import { IngredientDeleteDialog } from "./sections/modals/IngredientDeleteDialog.tsx";
import { useIngestAction } from "@/lib/ai/use-ingest-action.ts";
import ImageSearchModal, {
  type ImageAttribution,
  type SelectedImage,
} from "@/components/admin/ImageSearchModal.tsx";
import type { RegionCode } from "@/lib/regions.ts";
import { hasLiabilityScope } from "@/lib/liability.ts";
import { useAiSuggestions, type RunResult, type FieldSuggestion } from "@/hooks/use-ai-suggestions";
import { SuggestionFlowProvider } from "@/components/admin/SuggestionFlowProvider.tsx";
import { AiBulkSuggestButton } from "@registry/components/ai-bulk-suggest-button";
import { AiBulkTranslateButton } from "@registry/components/ai-bulk-translate-button";
import { useSplitViewPreference } from "@/hooks/use-split-view-preference.ts";
import { useSiblingEntity } from "@/hooks/use-sibling-entity.ts";

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

type PairingProposal = SharedPairingProposal;

function adaptIngredientImprovementsToRunResult(
  improvements: Array<{
    field: string;
    suggestion: unknown;
    rationale?: string;
    summary?: string;
    hash?: string;
    traceId?: string;
    confidence?: "high" | "medium" | "low";
  }>,
): RunResult {
  const suggestions: Record<string, FieldSuggestion> = {};
  let counter = 0;
  for (const imp of improvements) {
    suggestions[imp.field] = {
      kind: "single",
      value: imp.suggestion,
      confidence: imp.confidence ?? "medium",
      summary: imp.summary ?? imp.rationale ?? `AI suggestion for ${imp.field}`,
      hash: imp.hash ?? `${imp.field}-${counter++}`,
      traceId: imp.traceId ?? "legacy",
    };
  }
  return { suggestions, autoApplied: {}, traces: {} };
}

type PairingListItem = SharedPairingListItem;

interface Props {
  locale: "en" | "de";
  slug?: string;
  initialData?: Partial<IngredientData>;
  initialMeta?: Record<string, unknown>;
  isNew?: boolean;
  /** Locale codes for which a translation already exists (e.g. ["de"] if de/slug.json exists) */
  existingTranslationLocales?: string[];
  /** SSR-known split-view preference (from cookie) to avoid hydration flash. */
  initialSplitView?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "section-basic", label: "Basic info" },
  { id: "section-taxonomy", label: "Taxonomy" },
  { id: "section-profile", label: "Origin & Flavor" },
  { id: "section-regions", label: "Regions" },
  { id: "section-longform", label: "Long-form" },
  { id: "section-sources", label: "Sources" },
  { id: "section-pairings", label: "Pairings" },
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

type ImprovementWire = {
  field: string;
  suggestion: unknown;
  rationale?: string;
  summary?: string;
  hash?: string;
  traceId?: string;
  confidence?: "high" | "medium" | "low";
};

function parseApiResult(result: Record<string, unknown>): {
  improvements: ImprovementWire[];
  pairings: PairingProposal[];
  detectedLanguage?: string;
  languageMismatch?: boolean;
  errors: Array<{ field: string; message: string }>;
} {
  const ai = (result["aiSuggestions"] ?? result) as Record<string, unknown>;
  return {
    improvements: (ai["improvements"] as ImprovementWire[]) ?? [],
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
  initialSplitView = false,
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
  const [regions, setRegions] = useState<RegionCode[]>(
    (initialData?.["region"] as RegionCode[] | undefined) ?? [],
  );
  const [featuredPairings, setFeaturedPairings] = useState<PairingListItem[]>([]);
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

  // Modals
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateRunId] = useState(() => crypto.randomUUID());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Split view
  const [splitView, setSplitView] = useSplitViewPreference(initialSplitView);
  const siblingLocaleCode = locale === "en" ? "de" : "en";

  // Auto-enable split view when editing a translation
  useEffect(() => {
    if (initialMeta?.["translationOf"] && !splitView) {
      setSplitView(true);
    }
  }, []);

  const siblingData = useSiblingEntity({
    kind: "ingredient",
    slug: slug ?? "",
    locale: siblingLocaleCode,
    enabled: splitView,
  });

  useEffect(() => {
    if (!isNew && slug) {
      void actions.listPairingsFor({ slug }).then((r: { data?: unknown }) => {
        if (r.data) setFeaturedPairings(r.data as PairingListItem[]);
      });
    }
  }, [locale]);

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
      origin: data.origin,
      flavorNotes: data.flavorNotes,
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
        origin: value.origin.filter(Boolean),
        flavorNotes: value.flavorNotes.filter(Boolean),
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
        void navigate(`/admin/ingredients/${slug}/edit?locale=${locale}`);
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
          if (k === "origin") return formValues.origin.length === 0;
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
          // Pass through the per-field target so the server skips pairings
          // auto-apply + language detection (both write to disk and would
          // trigger an HMR reload that wipes the just-arrived suggestion).
          ...(params.target ? { target: params.target } : {}),
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
          origin: formValues.origin.filter(Boolean),
          botanicalName: formValues.botanicalName || undefined,
          family: formValues.family || undefined,
          parts: parts.length > 0 ? parts : undefined,
          flavorProfile: flavorProfile.length > 0 ? flavorProfile : undefined,
        } as never,
        {},
      ),
    );
  }, [formValues, parts, flavorProfile]);

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
    else if (key === "origin") filled = formValues.origin.filter(Boolean).length > 0;
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

  function buildIngredientSnapshot(): Record<string, unknown> {
    return {
      name: formValues.name,
      summary: formValues.summary,
      description: formValues.description,
      category: formValues.category,
      origin: formValues.origin.filter(Boolean),
      flavorNotes: formValues.flavorNotes.filter(Boolean),
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
    if (p.origin !== undefined) form.setFieldValue("origin" as never, p.origin as never);
    if (p.flavorNotes !== undefined)
      form.setFieldValue("flavorNotes" as never, p.flavorNotes as never);
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
    void navigate("/admin/ingredients");
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
    void navigate(`/admin/ingredients/${slug}/edit?locale=${siblingLocaleCode}`);
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
          <BasicInfoSection
            form={form}
            isNew={isNew ?? false}
            locale={locale}
            splitView={splitView}
            siblingData={siblingData}
            siblingLocaleCode={siblingLocaleCode}
            slug={slug}
            setSlug={setSlug}
            slugChecking={slugChecking}
            slugAvailable={slugAvailable}
            imageAttribution={imageAttribution}
            setImageAttribution={setImageAttribution}
            onOpenImageSearch={() => setImageSearchOpen(true)}
            languageMismatch={languageMismatch}
            detectedLanguage={detectedLanguage}
          />

          <TaxonomySection
            form={form}
            splitView={splitView}
            siblingData={siblingData}
            siblingLocaleCode={siblingLocaleCode}
            commonNames={commonNames}
            setCommonNames={setCommonNames}
            parts={parts}
            setParts={setParts}
            flavorProfile={flavorProfile}
            setFlavorProfile={setFlavorProfile}
            safetyFlags={safetyFlags}
            setSafetyFlags={setSafetyFlags}
          />

          <OriginFlavorSection form={form} />

          <RegionsSection value={regions} onChange={setRegions} />

          <LongformSection
            form={form}
            splitView={splitView}
            siblingData={siblingData}
            siblingLocaleCode={siblingLocaleCode}
          />

          <SourcesSection
            sources={sources}
            onChange={setSources}
            liabilityWarning={hasLiabilityScope(formValues) && sources.length === 0}
          />

          {/* ── Pairings ── */}
          <PairingsSection
            entityKind="ingredient"
            slug={slug ?? ""}
            locale={locale}
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
            onSuggestPairings={async () => {
              const { data, error } = await actions.aiProposeIngredientPairings({
                ingredient: buildIngredientSnapshot(),
                locale,
              });
              if (error) throw new Error(error.message);
              const items =
                (data as Array<{ slug: string; description: string; confidence?: string }>) ?? [];
              return items.map((it) => ({
                otherCollection: "ingredients" as const,
                otherSlug: it.slug,
                rationale: it.description ?? "",
              }));
            }}
            onCreatePairing={handleCreatePairing}
            aiEventLog={aiEventLog}
            runIdSeed={pairingRunId}
          />
        </EntityFormLayout>
      </form>

      <IngredientEnhanceDialog
        open={enhanceOpen}
        onOpenChange={(o) => {
          if (!o) {
            clearIngestProposed();
            setEnhanceOpen(false);
          }
        }}
        onRun={onIngestRun}
        onReviewBack={clearIngestProposed}
        snapshot={buildIngredientSnapshot()}
        proposed={ingestProposed}
        warnings={ingestWarnings}
        onApply={handleApplyEnhancement}
      />

      <IngredientTranslateDialog
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        slug={slug}
        locale={locale}
        contract={AI_CONTRACT}
        snapshot={buildIngredientSnapshot()}
        runId={translateRunId}
      />

      <IngredientDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        slug={slug}
        locale={locale}
        onConfirm={handleDelete}
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
          setImageAttribution(selected.attribution);
        }}
      />
    </SuggestionFlowProvider>
  );
}
