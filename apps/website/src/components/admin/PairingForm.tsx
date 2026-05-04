import { useState, useEffect } from "react";
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
import { scorePairing, resolvePairingDescription } from "@/lib/completeness.ts";
import { useEntityFormState } from "@/hooks/useEntityFormState.ts";
import EntityCombobox, { type EntityOption } from "./EntityCombobox.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import InlineSuggestion from "./InlineSuggestion.tsx";
import EnhanceModal from "./EnhanceModal.tsx";
import PairingTranslateModal from "./PairingTranslateModal.tsx";
import ImageSearchModal, {
  type ImageAttribution,
  type SelectedImage,
} from "./ImageSearchModal.tsx";

interface AiSuggestion {
  field: string;
  suggestion: string;
  rationale: string;
}

interface Props {
  pairingId?: string;
  initialIngredients?: [string, string];
  initialDescriptions?: Record<string, string>;
  initialMeta?: Record<string, unknown>;
  initialDraft?: boolean;
  initialImage?: string;
  isNew?: boolean;
}

const SUPPORTED_LOCALES = [
  { value: "en", label: "EN" },
  { value: "de", label: "DE" },
];

export default function PairingForm({
  pairingId: initialId,
  initialIngredients,
  initialDescriptions = {},
  initialMeta = {},
  initialDraft = false,
  initialImage = "",
  isNew,
}: Props) {
  const [ingredient1, setIngredient1] = useState(initialIngredients?.[0] ?? "");
  const [ingredient2, setIngredient2] = useState(initialIngredients?.[1] ?? "");
  const [descriptions, setDescriptions] = useState<Record<string, string>>(initialDescriptions);
  const [activeLocale, setActiveLocale] = useState<string>("en");

  const { draft, setDraft, saving, setSaving } = useEntityFormState({
    kind: "pairing",
    collection: "pairings",
    isNew: isNew ?? false,
    initialDraft,
    initialCompleteness: { score: 0, missing: [], color: "red" },
  });
  const [ingredientOptions, setIngredientOptions] = useState<EntityOption[]>([]);
  const [image, setImage] = useState(initialImage);
  const [imageAttribution, setImageAttribution] = useState<ImageAttribution | undefined>(
    initialMeta["imageAttribution"] as ImageAttribution | undefined,
  );
  const [imageSearchOpen, setImageSearchOpen] = useState(false);

  // AI state (transient — not persisted in meta)
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AiSuggestion[]>>({});
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  // Modals
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);

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
    if (isNew || !initialId) return;
    const localeAiSuggestions = aiSuggestions[activeLocale];
    if (localeAiSuggestions && localeAiSuggestions.length > 0) return;
    const currentDesc = descriptions[activeLocale] ?? descriptions["en"] ?? "";
    if (!currentDesc) return;
    setAiRefreshing(true);
    void actions
      .aiRefreshPairingSuggestions({
        id: initialId,
        locale: activeLocale,
        pairing: { ingredients: [ingredient1, ingredient2], descriptions },
      })
      .then(({ data }: { data?: Record<string, unknown> }) => {
        if (data?.["aiSuggestions"]) {
          const s = data["aiSuggestions"] as Record<string, unknown>;
          const block = s[activeLocale] as Record<string, unknown> | undefined;
          if (block?.["improvements"]) {
            setAiSuggestions((prev) => ({
              ...prev,
              [activeLocale]: block["improvements"] as AiSuggestion[],
            }));
          }
        }
      })
      .catch(() => {})
      .finally(() => setAiRefreshing(false));
  }, [activeLocale]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!ingredient1 || !ingredient2) {
      toast.error("Both ingredients are required");
      return;
    }
    const currentDesc = descriptions[activeLocale];
    if (!currentDesc?.trim()) {
      toast.error(`Description for ${activeLocale.toUpperCase()} is required`);
      return;
    }
    setSaving(true);
    try {
      const id = [ingredient1, ingredient2].sort().join("--");
      // Save all locales that have descriptions; include draft on first save
      let first = true;
      for (const [locale, desc] of Object.entries(descriptions)) {
        if (!desc) continue;
        const { error } = await actions.savePairing({
          id,
          ingredients: [
            { collection: "ingredients" as const, slug: ingredient1 },
            { collection: "ingredients" as const, slug: ingredient2 },
          ],
          description: desc,
          locale,
          draft: first ? draft : undefined,
          image: image || "",
        });
        if (error) throw new Error(error.message);
        first = false;
      }
      if (imageAttribution) {
        await actions.savePairingMeta({ id, patch: { imageAttribution } });
      }
      toast.success("Saved");
      if (isNew) {
        window.location.href = `/admin/pairings/${encodeURIComponent(id)}/edit`;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDraft() {
    if (!initialId) return;
    const newDraft = !draft;
    const { error } = await actions.togglePairingDraft({ id: initialId, draft: newDraft });
    if (error) {
      toast.error("Failed to update draft status");
      return;
    }
    setDraft(newDraft);
    toast.success(newDraft ? "Moved to drafts" : "Published");
  }

  async function handleDelete() {
    if (!initialId) return;
    if (!confirm(`Delete pairing "${ingredient1} ↔ ${ingredient2}"? This cannot be undone.`))
      return;
    const { error } = await actions.deletePairing({ id: initialId });
    if (error) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Deleted");
    window.location.href = "/admin/pairings";
  }

  const completeness = scorePairing(
    { ingredients: [ingredient1, ingredient2], descriptions },
    activeLocale,
  );

  const completenessFields = [
    {
      key: "ingredient1",
      label: "Ingredient 1",
      filled: !!ingredient1,
      anchorId: "section-ingredients",
    },
    {
      key: "ingredient2",
      label: "Ingredient 2",
      filled: !!ingredient2,
      anchorId: "section-ingredients",
    },
    ...SUPPORTED_LOCALES.map((l) => ({
      key: `description.${l.value}`,
      label: `Description (${l.label})`,
      filled: !!descriptions[l.value],
      anchorId: "section-description",
    })),
  ];

  const requiredFields = completenessFields.slice(0, 2);
  const recommendedFields = completenessFields.slice(2);

  const currentDesc = descriptions[activeLocale] ?? "";
  const { isFallback, locale: fallbackLocale } = resolvePairingDescription(
    { descriptions, ingredients: [ingredient1, ingredient2] },
    activeLocale,
  );

  const visibleSuggestions = (aiSuggestions[activeLocale] ?? []).filter(
    (s) => !dismissedSuggestions.has(`${activeLocale}:${s.field}`),
  );

  function handleApplySuggestion(field: string, value: string) {
    // Pairings only have a description field — always apply to it
    setDescriptions((prev) => ({ ...prev, [activeLocale]: value }));
    setDismissedSuggestions((prev) => new Set([...prev, `${activeLocale}:${field}`]));
  }

  function handleDismissSuggestion(field: string) {
    setDismissedSuggestions((prev) => new Set([...prev, `${activeLocale}:${field}`]));
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LinkButton variant="ghost" size="icon" href="/admin/pairings">
          <ArrowLeft size={16} />
        </LinkButton>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {isNew ? "New pairing" : `${ingredient1} ↔ ${ingredient2}`}
          </h1>
          {!isNew && initialId && (
            <p className="text-sm text-muted-foreground font-mono">{initialId}</p>
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
            <button
              type="button"
              onClick={() => setTranslateOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Languages size={13} />
              Translate
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 hover:border-destructive/30"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </>
        )}
      </div>

      <div className="flex gap-6">
        {/* Main form */}
        <div className="flex-1 space-y-6 pb-16">
          {/* Ingredients */}
          <section id="section-ingredients">
            <Card>
              <CardHeader>
                <CardTitle>Ingredients</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Ingredient 1 *</Label>
                  <EntityCombobox
                    value={ingredient1}
                    onChange={setIngredient1}
                    options={ingredientOptions.filter((o) => o.value !== ingredient2)}
                    placeholder="Select ingredient…"
                    disabled={!isNew}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ingredient 2 *</Label>
                  <EntityCombobox
                    value={ingredient2}
                    onChange={setIngredient2}
                    options={ingredientOptions.filter((o) => o.value !== ingredient1)}
                    placeholder="Select ingredient…"
                    disabled={!isNew}
                  />
                </div>
                {!isNew && (
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Ingredients cannot be changed after creation.
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
                  value={image}
                  onChange={(e) => {
                    setImage(e.target.value);
                    if (!e.target.value) setImageAttribution(undefined);
                  }}
                  placeholder="https://example.com/image.jpg"
                />
                {image && (
                  <img
                    src={image}
                    alt=""
                    className="mt-2 h-24 rounded border border-border object-cover"
                  />
                )}
                {imageAttribution && (
                  <p className="text-[11px] text-muted-foreground">
                    {imageAttribution.attribution}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Description with locale tabs */}
          <section id="section-description">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Description</CardTitle>
                  {/* Locale tabs */}
                  <div className="flex gap-1 rounded-lg bg-muted p-1">
                    {SUPPORTED_LOCALES.map((l) => (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => setActiveLocale(l.value)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                          activeLocale === l.value
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {l.label}
                        {descriptions[l.value] ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Language mismatch / fallback warning */}
                {!isNew && isFallback && !descriptions[activeLocale] && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                    ⚠ No {activeLocale.toUpperCase()} translation yet — showing{" "}
                    {fallbackLocale.toUpperCase()} fallback
                    <button
                      type="button"
                      onClick={() => setTranslateOpen(true)}
                      className="ml-auto text-primary hover:underline font-medium"
                    >
                      Translate from {fallbackLocale.toUpperCase()} →
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Textarea
                    value={currentDesc}
                    onChange={(e) =>
                      setDescriptions((prev) => ({ ...prev, [activeLocale]: e.target.value }))
                    }
                    rows={4}
                    placeholder={`Why do ${ingredient1 || "these"} and ${ingredient2 || "these"} pair well? (${activeLocale.toUpperCase()})`}
                  />
                </div>

                {/* Inline AI suggestions */}
                {visibleSuggestions.map((s) => (
                  <InlineSuggestion
                    key={s.field}
                    label={`AI suggestion (${activeLocale.toUpperCase()})`}
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
                        locale: activeLocale,
                        pairing: { ingredients: [ingredient1, ingredient2], descriptions },
                      });
                      if ((data as Record<string, unknown> | undefined)?.["aiSuggestions"]) {
                        const s = (data as Record<string, unknown>)["aiSuggestions"] as Record<
                          string,
                          unknown
                        >;
                        const block = s[activeLocale] as Record<string, unknown> | undefined;
                        if (block?.["improvements"]) {
                          setAiSuggestions((prev) => ({
                            ...prev,
                            [activeLocale]: block["improvements"] as AiSuggestion[],
                          }));
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
          <Button onClick={handleSave} disabled={saving}>
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
        defaultQuery={`${ingredient1} ${ingredient2}`.trim()}
        onSelect={(selected: SelectedImage) => {
          setImage(selected.url);
          setImageAttribution(selected.attribution);
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
            locale={activeLocale}
            slug={initialId}
            existing={{ ingredients: [ingredient1, ingredient2], descriptions }}
            onApplied={(desc) => setDescriptions((prev) => ({ ...prev, [activeLocale]: desc }))}
          />
          <PairingTranslateModal
            open={translateOpen}
            onClose={() => setTranslateOpen(false)}
            pairingId={initialId}
            currentLocale={activeLocale}
            hasDescriptionForLocale={(l) => !!descriptions[l]}
            onTranslated={(locale, desc) => {
              setDescriptions((prev) => ({ ...prev, [locale]: desc }));
              setTranslateOpen(false);
              toast.success(`${locale.toUpperCase()} translation added`);
            }}
          />
        </>
      )}
    </div>
  );
}
