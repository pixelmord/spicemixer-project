import { useState, useEffect, useRef } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Languages, Loader2, Trash2, Eye, EyeOff } from "lucide-react";
import LinkButton from "@/components/admin/LinkButton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";
import { computeCompletenessFromBlob } from "@/lib/completeness.ts";
import { useEntityFormState } from "@/hooks/useEntityFormState.ts";
import EntityCombobox, { type EntityOption } from "./EntityCombobox.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import InlineSuggestion from "./InlineSuggestion.tsx";
import EnhanceModal from "./EnhanceModal.tsx";
import { TranslateEntityDialog } from "./TranslateEntityDialog.tsx";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import ImageSearchModal, {
  type ImageAttribution,
  type SelectedImage,
} from "./ImageSearchModal.tsx";
import type { EndpointRef } from "entity-kind";

interface AiSuggestion {
  field: string;
  suggestion: string;
  rationale: string;
}

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
}

const ALL_LOCALES = ["en", "de"] as const;

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

  // AI state (transient — not persisted in meta)
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  // Modals
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateRunId] = useState(() => crypto.randomUUID());
  const pendingTranslationRef = useRef<{ locale: string; desc: string } | null>(null);

  const ep0 = initialEndpoints?.[0] ?? { collection: "ingredients" as const, slug: "" };
  const ep1 = initialEndpoints?.[1] ?? { collection: "ingredients" as const, slug: "" };

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
        const { error } = await actions.savePairing({
          id,
          endpoints: [
            { collection: ep0.collection, slug: value.endpoint1Slug },
            { collection: ep1.collection, slug: value.endpoint2Slug },
          ],
          description: value.description,
          locale,
          draft,
          image: value.image || "",
          imageAttribution: value.imageAttribution ?? undefined,
        });
        if (error) throw new Error(error.message);
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

  // Auto-run suggestions on mount
  useEffect(() => {
    if (isNew || !initialId || !initialDescription) return;
    setAiRefreshing(true);
    void actions
      .aiRefreshPairingSuggestions({
        id: initialId,
        locale,
        pairing: {
          endpoints: initialEndpoints ?? [],
          description: initialDescription,
        },
      })
      .then(({ data }: { data?: { aiSuggestions?: Record<string, unknown> } }) => {
        if (data?.aiSuggestions) {
          const s = data.aiSuggestions;
          const block = s[locale] as Record<string, unknown> | undefined;
          if (block?.["improvements"]) {
            setAiSuggestions(block["improvements"] as AiSuggestion[]);
          }
        }
      })
      .catch(() => {})
      .finally(() => setAiRefreshing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggleDraft() {
    if (!initialId) return;
    const newDraft = !draft;
    const { error } = await actions.togglePairingDraft({ id: initialId, locale, draft: newDraft });
    if (error) {
      toast.error("Failed to update draft status");
      return;
    }
    setDraft(newDraft);
    toast.success(newDraft ? "Moved to drafts" : "Published");
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

  const currentDesc = formValues.description;

  const visibleSuggestions = aiSuggestions.filter(
    (s) => !dismissedSuggestions.has(`${locale}:${s.field}`),
  );

  function handleApplySuggestion(field: string, value: string) {
    form.setFieldValue("description" as never, value as never);
    setDismissedSuggestions((prev) => new Set([...prev, `${locale}:${field}`]));
  }

  function handleDismissSuggestion(field: string) {
    setDismissedSuggestions((prev) => new Set([...prev, `${locale}:${field}`]));
  }

  const availableTranslationLocales = ALL_LOCALES.filter(
    (l) => l !== locale && !existingTranslationLocales.includes(l),
  );

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LinkButton variant="ghost" size="icon" href="/admin/pairings">
          <ArrowLeft size={16} />
        </LinkButton>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {isNew ? "New pairing" : `${formValues.endpoint1Slug} ↔ ${formValues.endpoint2Slug}`}
          </h1>
          {!isNew && initialId && (
            <p className="text-sm text-muted-foreground font-mono">
              {initialId}{" "}
              <span className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300">
                {locale}
              </span>
            </p>
          )}
        </div>
        {!isNew && initialId && (
          <>
            <button
              type="button"
              onClick={handleToggleDraft}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                draft
                  ? "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400",
              )}
              title={draft ? "Click to publish" : "Click to unpublish"}
            >
              {draft ? <EyeOff size={13} /> : <Eye size={13} />}
              {draft ? "Draft" : "Published"}
            </button>
            <button
              type="button"
              onClick={() => setEnhanceOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Sparkles size={13} />
              Enhance
            </button>
            {availableTranslationLocales.length > 0 && (
              <button
                type="button"
                onClick={() => setTranslateOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Languages size={13} />
                Translate
              </button>
            )}
            {existingTranslationLocales.map((tl) => (
              <a
                key={tl}
                href={`/admin/pairings/${encodeURIComponent(initialId)}/edit?locale=${tl}`}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                {tl.toUpperCase()} →
              </a>
            ))}
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 hover:border-destructive/30"
            >
              <Trash2 size={13} />
              Delete {locale.toUpperCase()}
            </button>
          </>
        )}
      </div>

      <div className="flex gap-6">
        {/* Main form */}
        <div className="flex-1 space-y-6 pb-16">
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
                <div className="flex items-center justify-between">
                  <CardTitle>Description ({locale.toUpperCase()})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Textarea
                    value={currentDesc}
                    onChange={(e) =>
                      form.setFieldValue("description" as never, e.target.value as never)
                    }
                    rows={4}
                    placeholder={`Why do ${formValues.endpoint1Slug || "these"} and ${formValues.endpoint2Slug || "these"} pair well? (${locale.toUpperCase()})`}
                  />
                </div>

                {/* Inline AI suggestions */}
                {visibleSuggestions.map((s) => (
                  <InlineSuggestion
                    key={s.field}
                    label={`AI suggestion (${locale.toUpperCase()})`}
                    current={currentDesc}
                    suggested={s.suggestion}
                    rationale={s.rationale}
                    onAccept={(v) => handleApplySuggestion(s.field, v)}
                    onDismiss={() => handleDismissSuggestion(s.field)}
                  />
                ))}
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
            aiSuggestions={visibleSuggestions.map((s) => ({
              field: s.field,
              suggestion: s.suggestion,
              rationale: s.rationale,
            }))}
            aiRefreshing={aiRefreshing}
            onRefreshSuggestions={
              !isNew && initialId
                ? async () => {
                    setAiRefreshing(true);
                    setDismissedSuggestions(new Set());
                    try {
                      const { data } = await actions.aiRefreshPairingSuggestions({
                        id: initialId,
                        locale,
                        pairing: {
                          endpoints: initialEndpoints ?? [],
                          description: formValues.description,
                        },
                      });
                      if (data?.aiSuggestions) {
                        const s = data.aiSuggestions;
                        const block = s[locale] as Record<string, unknown> | undefined;
                        if (block?.["improvements"]) {
                          setAiSuggestions(block["improvements"] as AiSuggestion[]);
                        }
                      }
                    } catch {
                      toast.error("Could not refresh suggestions");
                    } finally {
                      setAiRefreshing(false);
                    }
                  }
                : undefined
            }
            onApplySuggestion={(field, value) => handleApplySuggestion(field, value)}
            onDismissSuggestion={(field) => handleDismissSuggestion(field)}
          />
        </aside>
      </div>

      {/* Save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur px-6 py-3">
        <div className="mx-auto max-w-4xl flex items-center justify-end gap-3">
          <Button onClick={() => void form.handleSubmit()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

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
          <EnhanceModal
            kind="pairing"
            open={enhanceOpen}
            onClose={() => setEnhanceOpen(false)}
            pairingId={initialId}
            locale={locale}
            slug={initialId}
            existing={{
              endpoints: initialEndpoints ?? [],
              description: formValues.description,
            }}
            onApplied={(desc) => form.setFieldValue("description" as never, desc as never)}
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
    </div>
  );
}
