import { useState, useEffect, useRef, useMemo } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { TextareaField } from "@/components/admin/fields/index.ts";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Sparkles, Loader2, Trash2, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";
import { computeCompletenessFromBlob } from "@/lib/completeness.ts";
import { useEntityFormState } from "@/hooks/useEntityFormState.ts";
import EntityCombobox, { type EntityOption } from "./EntityCombobox.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import { SuggestionFlowProvider } from "./SuggestionFlowProvider.tsx";
import { IngestDialog } from "./IngestDialog.tsx";
import PairingDiff from "./PairingDiff.tsx";
import { TranslateEntityDialog } from "./TranslateEntityDialog.tsx";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog.tsx";
import ImageSearchModal, {
  type ImageAttribution,
  type SelectedImage,
} from "./ImageSearchModal.tsx";
import { useIngestAction } from "@/lib/ai/use-ingest-action.ts";
import {
  useAiSuggestions,
  type RunResult,
  type FieldSuggestion,
  type SiblingLocale,
} from "@/hooks/use-ai-suggestions.tsx";
import { EntityFormLayout } from "./EntityFormLayout.tsx";
import FormActionBar from "./FormActionBar.tsx";
import { useSplitViewPreference } from "@/hooks/use-split-view-preference.ts";
import { getSiblingEntity } from "@/lib/get-sibling-entity.ts";
import type { EndpointRef } from "entity-kind";

interface Props {
  pairingId?: string;
  locale?: string;
  initialEndpoints?: [EndpointRef, EndpointRef];
  initialDescription?: string;
  initialDraft?: boolean;
  initialImage?: string;
  initialImageAttribution?: ImageAttribution;
  existingTranslationLocales?: string[];
  isNew?: boolean;
  /** Set when this locale is a translation of another locale's pairing */
  initialTranslationOf?: string;
}

const ALL_LOCALES = ["en", "de"] as const;

function adaptPairingImprovementsToRunResult(
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

export default function PairingForm({
  pairingId: initialId,
  locale = "en",
  initialEndpoints,
  initialDescription = "",
  initialDraft = false,
  initialImage = "",
  initialImageAttribution,
  existingTranslationLocales = [],
  isNew,
  initialTranslationOf,
}: Props) {
  const { draft, setDraft, saving, setSaving } = useEntityFormState({
    kind: "pairing",
    collection: "pairings",
    isNew: isNew ?? false,
    initialDraft,
    initialCompleteness: { score: 0, missing: [], color: "red" },
  });

  const [ingredientOptions, setIngredientOptions] = useState<EntityOption[]>([]);
  const [imageSearchOpen, setImageSearchOpen] = useState(false);
  const [applyingEnhancement, setApplyingEnhancement] = useState(false);

  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateRunId] = useState(() => crypto.randomUUID());
  const pendingTranslationRef = useRef<{ locale: string; desc: string } | null>(null);

  const [splitView, setSplitView] = useSplitViewPreference();
  const [siblingLocaleData, setSiblingLocaleData] = useState<SiblingLocale | null>(null);
  const siblingLoc = locale === "en" ? "de" : "en";

  useEffect(() => {
    if (initialTranslationOf) {
      setSplitView(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!splitView || !initialId) return;
    void getSiblingEntity({ kind: "pairing", slug: initialId, locale: siblingLoc }).then((result) =>
      setSiblingLocaleData(result),
    );
  }, [splitView, initialId, siblingLoc]);

  const ep0 = initialEndpoints?.[0] ?? { collection: "ingredients" as const, slug: "" };
  const ep1 = initialEndpoints?.[1] ?? { collection: "ingredients" as const, slug: "" };

  // Ref to carry the intended draft state into the tanstack-form onSubmit closure
  const saveDraftRef = useRef(initialDraft);
  useEffect(() => {
    saveDraftRef.current = draft;
  }, [draft]);

  const form = useForm({
    defaultValues: {
      endpoint1Slug: ep0.slug,
      endpoint2Slug: ep1.slug,
      description: initialDescription,
      image: initialImage,
      imageAttribution: initialImageAttribution,
    },
    onSubmit: async ({ value }) => {
      if (!value.endpoint1Slug || !value.endpoint2Slug) {
        toast.error("Both endpoints are required");
        return;
      }
      if (!value.description?.trim()) {
        toast.error(`Description for ${locale.toUpperCase()} is required`);
        return;
      }
      setSaving(true);
      try {
        const id = [value.endpoint1Slug, value.endpoint2Slug].sort().join("--");
        const pendingAiEvents = pendingAiEventsRef.current;
        const effectiveDraft = saveDraftRef.current;
        const { error } = await actions.savePairing({
          id,
          endpoints: [
            { collection: ep0.collection, slug: value.endpoint1Slug },
            { collection: ep1.collection, slug: value.endpoint2Slug },
          ],
          description: value.description,
          locale,
          draft: effectiveDraft,
          image: value.image || "",
          imageAttribution: (value.imageAttribution ?? undefined) as
            | Record<string, unknown>
            | undefined,
          ...(pendingAiEvents.length > 0 ? { pendingAiEvents } : {}),
        });
        if (error) throw new Error(error.message);
        // Events were persisted with the save — clear the buffer.
        pendingAiEventsRef.current = [];
        setDraft(effectiveDraft);
        toast.success("Saved");
        if (isNew) {
          window.location.href = `/admin/pairings/${encodeURIComponent(id)}/edit?locale=${locale}`;
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
  });

  const formValues = useStore(form.store, (s) => s.values);

  useEffect(() => {
    void actions
      .listIngredientOptions({ locale: "en" })
      .then(({ data: opts }: { data?: { slug: string; name: string }[] }) => {
        if (opts)
          setIngredientOptions(
            opts.map((d) => ({ value: d.slug, label: d.name, sublabel: d.slug })),
          );
      });
  }, []);

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

  const aiEntityRef = useMemo(() => ({ kind: "pairing", id: initialId ?? "" }), [initialId]);

  const aiFlow = useAiSuggestions({
    contract: {
      presets: [],
      fields: {
        description: { translation: { mode: "translate" } },
      },
    },
    onRefine: async (params) => {
      if (!initialId) return { suggestions: {}, autoApplied: {}, traces: {} };
      const { data } = await actions.aiRefreshPairingSuggestions({
        id: initialId,
        locale,
        pairing: {
          endpoints: initialEndpoints ?? [],
          description: formValues.description,
        },
        // Per-field scope: tells the server to target exactly this field and
        // skip side-effect proposers / disk writes.
        ...(params.target?.length ? { target: params.target } : {}),
      });
      const block = data?.aiSuggestions?.[locale] as Record<string, unknown> | undefined;
      const improvements =
        (block?.["improvements"] as Array<{
          field: string;
          suggestion: unknown;
          rationale?: string;
          summary?: string;
          hash?: string;
          traceId?: string;
          confidence?: "high" | "medium" | "low";
        }>) ?? [];
      return adaptPairingImprovementsToRunResult(improvements);
    },
    onFill: async (params) => {
      if (!initialId) return { suggestions: {}, autoApplied: {}, traces: {} };
      const ctx = params.sourceContext as {
        sourceLocale: string;
        sourceData: Record<string, unknown>;
      };
      const { data, error } = await actions.aiFillTranslation({
        kind: "pairing",
        sourceRef: { id: initialId, kind: "pairing" },
        sourceLocale: (ctx?.sourceLocale ?? siblingLoc) as "en" | "de",
        targetLocale: locale as "en" | "de",
        sourceData: ctx?.sourceData ?? siblingLocaleData?.data ?? {},
        target: params.target,
      });
      if (error) throw new Error(error.message);
      return data!;
    },
    aiEventLog,
    entityRef: aiEntityRef,
    origin: {
      surface: "admin",
      action: "refine",
      entityKind: "pairing",
      userInitiated: true,
      runId: `pairing-${initialId ?? "new"}`,
      triggeredBy: "editor",
    },
    siblingLocale: siblingLocaleData ?? undefined,
  });

  const ingestAction = useIngestAction({
    kind: "pairing",
    slug: initialId ?? "",
    locale,
    existing: {
      endpoints: initialEndpoints ?? [],
      description: formValues.description,
    },
  });

  async function handleManualRefresh() {
    try {
      await aiFlow.run();
    } catch {
      toast.error("Could not refresh suggestions");
    }
  }

  async function handleDelete() {
    if (!initialId) return;
    if (
      !confirm(
        `Delete ${locale.toUpperCase()} pairing "${formValues.endpoint1Slug} ↔ ${formValues.endpoint2Slug}"? This cannot be undone.`,
      )
    )
      return;
    const { error } = await actions.deletePairing({ id: initialId, locale });
    if (error) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Deleted");
    window.location.href = "/admin/pairings";
  }

  const proposedDescription = ingestAction.proposed
    ? ((ingestAction.proposed["descriptions"] as Record<string, string>)?.[locale] ??
      (ingestAction.proposed["description"] as string) ??
      "")
    : "";

  async function handleApplyEnhancement() {
    if (!ingestAction.proposed || !initialId) return;
    setApplyingEnhancement(true);
    try {
      const { error } = await actions.savePairing({
        id: initialId,
        endpoints: [
          { collection: ep0.collection, slug: formValues.endpoint1Slug },
          { collection: ep1.collection, slug: formValues.endpoint2Slug },
        ],
        description: proposedDescription,
        locale,
        ...(ingestAction.mergeModel ? { aiMergeModel: ingestAction.mergeModel } : {}),
      });
      if (error) {
        toast.error("Save failed: " + error.message);
        return;
      }
      form.setFieldValue("description" as never, proposedDescription as never);
      ingestAction.clearProposed();
      setEnhanceOpen(false);
      toast.success("Pairing updated!");
    } finally {
      setApplyingEnhancement(false);
    }
  }

  const completeness = computeCompletenessFromBlob(
    "pairing",
    {
      endpoints: initialEndpoints ?? [],
      description: formValues.description,
    },
    { locale },
  );

  const completenessFields = [
    {
      key: "endpoint1",
      label: "Endpoint 1",
      filled: !!formValues.endpoint1Slug,
      anchorId: "section-endpoints",
    },
    {
      key: "endpoint2",
      label: "Endpoint 2",
      filled: !!formValues.endpoint2Slug,
      anchorId: "section-endpoints",
    },
    {
      key: "description",
      label: `Description (${locale.toUpperCase()})`,
      filled: !!formValues.description,
      anchorId: "section-description",
    },
  ];

  const requiredFields = completenessFields;
  const recommendedFields: typeof completenessFields = [];

  const availableTranslationLocales = ALL_LOCALES.filter(
    (l) => l !== locale && !existingTranslationLocales.includes(l),
  );

  const pairingExistingForDiff = {
    endpoints: initialEndpoints ?? [],
    description: formValues.description,
  };
  const pairingProposedForDiff = ingestAction.proposed
    ? { ...ingestAction.proposed, description: proposedDescription }
    : null;

  const localeChip = initialId ? (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
        locale === "de"
          ? "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-300"
          : "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300",
      )}
    >
      {locale}
    </span>
  ) : null;

  const overflowMenuItems = initialId
    ? [
        {
          label: "View public page",
          icon: <ExternalLink size={14} />,
          onClick: () => {
            window.open(`/pairings/${encodeURIComponent(initialId)}`, "_blank");
          },
        },
        {
          label: `Delete ${locale.toUpperCase()}`,
          icon: <Trash2 size={14} />,
          onClick: () => void handleDelete(),
        },
      ]
    : [];

  const headerAuxiliary =
    !isNew && initialId ? (
      <button
        type="button"
        onClick={() => {
          void handleManualRefresh();
          setEnhanceOpen(true);
        }}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <Sparkles size={13} />
        Enhance
      </button>
    ) : null;

  function handleSave(asDraft: boolean) {
    saveDraftRef.current = asDraft;
    void form.handleSubmit();
  }

  function handleSwapLanguage() {
    if (!initialId) return;
    window.location.href = `/admin/pairings/${encodeURIComponent(initialId)}/edit?locale=${siblingLoc}`;
  }

  const title = isNew ? "New pairing" : `${formValues.endpoint1Slug} ↔ ${formValues.endpoint2Slug}`;

  return (
    <SuggestionFlowProvider value={aiFlow}>
      <EntityFormLayout
        title={title}
        localeChip={localeChip}
        headerAuxiliary={headerAuxiliary}
        overflowMenuItems={overflowMenuItems}
        subHeaderStrip={null}
        completenessPanel={
          <CompletenessPanel
            result={completeness}
            requiredFields={requiredFields}
            recommendedFields={recommendedFields}
          />
        }
        completenessScore={completeness.score}
        completenessColor={completeness.color}
        splitView={splitView}
        activeLocale={locale}
        siblingLocale={siblingLoc}
        hasExistingTranslation={existingTranslationLocales.includes(siblingLoc)}
        onAddTranslation={
          !isNew && initialId && !existingTranslationLocales.includes(siblingLoc)
            ? () => setTranslateOpen(true)
            : undefined
        }
        onToggleSplitView={() => setSplitView(!splitView)}
        onSwapLanguage={splitView && !isNew && initialId ? handleSwapLanguage : undefined}
        footer={
          <FormActionBar
            saving={saving}
            isDraft={draft}
            backHref="/admin/pairings"
            previewHref={initialId ? `/pairings/${encodeURIComponent(initialId)}` : undefined}
            onSave={handleSave}
          />
        }
      >
        {/* Endpoints */}
        <section id="section-endpoints">
          <Card>
            <CardHeader>
              <CardTitle>Endpoints</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Endpoint 1 *</Label>
                <EntityCombobox
                  value={formValues.endpoint1Slug}
                  onChange={(v) => form.setFieldValue("endpoint1Slug" as never, v as never)}
                  options={ingredientOptions.filter((o) => o.value !== formValues.endpoint2Slug)}
                  placeholder="Select ingredient…"
                  disabled={!isNew}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Endpoint 2 *</Label>
                <EntityCombobox
                  value={formValues.endpoint2Slug}
                  onChange={(v) => form.setFieldValue("endpoint2Slug" as never, v as never)}
                  options={ingredientOptions.filter((o) => o.value !== formValues.endpoint1Slug)}
                  placeholder="Select ingredient…"
                  disabled={!isNew}
                />
              </div>
              {!isNew && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  Endpoints cannot be changed after creation.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Image */}
        <section id="section-image">
          <Card>
            <CardHeader>
              <CardTitle>Image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="pairing-image">Image URL</Label>
                <button
                  type="button"
                  onClick={() => setImageSearchOpen(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Search image…
                </button>
              </div>
              <Input
                id="pairing-image"
                type="url"
                value={formValues.image}
                onChange={(e) => {
                  form.setFieldValue("image" as never, e.target.value as never);
                  if (!e.target.value)
                    form.setFieldValue("imageAttribution" as never, undefined as never);
                }}
                placeholder="https://example.com/image.jpg"
              />
              {formValues.image && (
                <img
                  src={formValues.image}
                  alt=""
                  className="mt-2 h-24 rounded border border-border object-cover"
                />
              )}
              {formValues.imageAttribution && (
                <p className="text-[11px] text-muted-foreground">
                  {formValues.imageAttribution.attribution}
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Description */}
        <section id="section-description">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <form.Field name="description">
                {(field) => (
                  <TextareaField
                    field={field}
                    label={`Description (${locale.toUpperCase()})`}
                    rows={4}
                    placeholder={`Why do ${formValues.endpoint1Slug || "these"} and ${formValues.endpoint2Slug || "these"} pair well? (${locale.toUpperCase()})`}
                    suggestionPath="description"
                    splitView={splitView}
                    siblingValue={siblingLocaleData?.data["description"]}
                    siblingLocale={siblingLoc}
                  />
                )}
              </form.Field>
            </CardContent>
          </Card>
        </section>
      </EntityFormLayout>

      {/* Image search modal */}
      <ImageSearchModal
        open={imageSearchOpen}
        onClose={() => setImageSearchOpen(false)}
        defaultQuery={`${formValues.endpoint1Slug} ${formValues.endpoint2Slug}`.trim()}
        onSelect={(selected: SelectedImage) => {
          form.setFieldValue("image" as never, selected.url as never);
          form.setFieldValue("imageAttribution" as never, selected.attribution as never);
        }}
      />

      {/* Modals */}
      {!isNew && initialId && (
        <>
          <IngestDialog
            open={enhanceOpen}
            onOpenChange={(o) => {
              if (!o) {
                ingestAction.clearProposed();
                setEnhanceOpen(false);
              }
            }}
            title={`Enhance pairing description (${locale.toUpperCase()})`}
            onRun={ingestAction.onRun}
            onReviewBack={ingestAction.clearProposed}
            reviewChildren={
              pairingProposedForDiff ? (
                <div className="space-y-4">
                  <div className="max-h-[50vh] overflow-y-auto">
                    {ingestAction.warnings.length > 0 && (
                      <div className="mb-3 space-y-0.5">
                        {ingestAction.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                            ⚠ {w}
                          </p>
                        ))}
                      </div>
                    )}
                    <PairingDiff
                      existing={pairingExistingForDiff}
                      proposed={pairingProposedForDiff}
                      locale={locale}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => void handleApplyEnhancement()}
                      disabled={applyingEnhancement}
                    >
                      {applyingEnhancement ? (
                        <>
                          <Loader2 size={14} className="animate-spin mr-1" />
                          Applying…
                        </>
                      ) : (
                        <>
                          <Check size={14} className="mr-1" />
                          Apply changes
                        </>
                      )}
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
                contract={{
                  presets: [],
                  fields: { description: { translation: { mode: "translate" } } },
                }}
                sourceRef={{ kind: "pairing", id: initialId }}
                sourceLocale={locale}
                sourceData={{ description: formValues.description }}
                availableLocales={availableTranslationLocales}
                onCreate={async (targetLocale, _slug, fields) => {
                  const description = String(fields["description"] ?? "");
                  pendingTranslationRef.current = { locale: targetLocale, desc: description };
                  const { error } = await actions.aiTranslatePairing({
                    id: initialId,
                    sourceLocale: locale as "en" | "de",
                    targetLocale: targetLocale as "en" | "de",
                    description,
                  });
                  if (error) throw new Error(error.message);
                  return { kind: "pairing", id: initialId };
                }}
                onComplete={() => {
                  pendingTranslationRef.current = null;
                  setTranslateOpen(false);
                  toast.success("Translation saved — switch locale to view");
                }}
                aiEventLog={{ read: async () => [], append: async () => {} }}
                onFill={async (params) => {
                  const ctx = params.sourceContext as {
                    sourceLocale: string;
                    targetLocale: string;
                    sourceData: Record<string, unknown>;
                  };
                  const { data, error } = await actions.aiFillTranslation({
                    kind: "pairing",
                    sourceRef: { id: initialId, kind: "pairing" },
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
                  entityKind: "pairing",
                  entityRef: initialId,
                  userInitiated: true,
                  runId: translateRunId,
                  triggeredBy: "editor" as const,
                }}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </SuggestionFlowProvider>
  );
}
