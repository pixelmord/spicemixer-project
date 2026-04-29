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
import PairingEditor from "./PairingEditor.tsx";

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
  image?: string;
  category: Category;
  origin: string[];
  flavorNotes: string[];
}

interface Pairing {
  id: string;
  ingredients: [string, string];
  description: string;
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
  { id: "section-profile", label: "Origin & Flavor" },
  { id: "section-pairings", label: "Pairings" },
];

const ISO_DURATION_RE = /^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/;

function emptyIngredient(): IngredientData {
  return { name: "", category: "spice", origin: [], flavorNotes: [] };
}

export default function IngredientForm({
  locale,
  slug: initialSlug,
  initialData,
  initialMeta,
  initialPairings = [],
  isNew,
}: Props) {
  const data = { ...emptyIngredient(), ...initialData } as IngredientData;
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [origins, setOrigins] = useState<string[]>(data.origin.length > 0 ? data.origin : []);
  const [flavorNotes, setFlavorNotes] = useState<string[]>(
    data.flavorNotes.length > 0 ? data.flavorNotes : [],
  );
  const [pairings, setPairings] = useState<Pairing[]>(initialPairings);
  const [completeness, setCompleteness] = useState(() => scoreIngredient(data as never));
  const [ingredientOptions, setIngredientOptions] = useState<EntityOption[]>([]);
  const [quickCreateName, setQuickCreateName] = useState("");
  const [quickCreateCallback, setQuickCreateCallback] = useState<
    ((slug: string, label: string) => void) | null
  >(null);

  // Image health check
  const [imageBroken, setImageBroken] = useState(false);

  // AI state
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionsState>(() => {
    const s = initialMeta?.["aiSuggestions"] as Record<string, unknown> | undefined;
    return {
      improvements: (s?.["improvements"] as AiSuggestion[]) ?? [],
      pairings: (s?.["pairings"] as AiSuggestionsState["pairings"]) ?? [],
      detectedLanguage: s?.["detectedLanguage"] as string | undefined,
      languageMismatch: (s?.["languageMismatch"] as boolean) ?? false,
    };
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

  useEffect(() => {
    void actions.listIngredientOptions({ locale }).then(({ data: opts }) => {
      if (opts)
        setIngredientOptions(opts.map((d) => ({ value: d.slug, label: d.name, sublabel: d.slug })));
    });
  }, [locale]);

  // Check image URL health on mount
  useEffect(() => {
    const imageUrl = data.image;
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
      if (k === "flavorNotes") return flavorNotes.length === 0;
      if (k === "pairings") return pairings.length === 0;
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
      .then(({ data: result }) => {
        if (result) {
          setAiSuggestions({
            improvements: (result.aiSuggestions as Record<string, unknown>)[
              "improvements"
            ] as AiSuggestion[],
            pairings: (result.aiSuggestions as Record<string, unknown>)[
              "pairings"
            ] as AiSuggestionsState["pairings"],
            detectedLanguage: (result.aiSuggestions as Record<string, unknown>)[
              "detectedLanguage"
            ] as string | undefined,
            languageMismatch: (result.aiSuggestions as Record<string, unknown>)[
              "languageMismatch"
            ] as boolean,
          });
          if (result.autoLinked > 0) {
            toast.success(
              `Auto-paired ${result.autoLinked} ingredient${result.autoLinked !== 1 ? "s" : ""}`,
            );
            // Reload pairings from server
            void actions.listPairingsFor({ slug: initialSlug }).then(({ data: ps }) => {
              if (ps) setPairings(ps as Pairing[]);
            });
          }
        }
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
        .then(({ data }) => {
          if (data) setSlugAvailable(data.available);
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
      image: data.image ?? "",
      category: data.category,
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
      if (value.image) payload.image = value.image;

      const { error } = await actions.saveIngredient({
        locale,
        slug,
        ingredient: payload as never,
      });
      setSaving(false);

      if (error) {
        toast.error("Save failed: " + error.message);
        return;
      }

      setCompleteness(scoreIngredient(payload as never));
      toast.success("Saved");

      if (isNew) {
        window.location.href = `/admin/ingredients/${slug}/edit?locale=${locale}`;
        return;
      }

      // Post-save async refresh
      const missingKeys = INGREDIENT_RECOMMENDED.filter((k) => {
        if (k === "origin") return origins.filter(Boolean).length === 0;
        if (k === "flavorNotes") return flavorNotes.filter(Boolean).length === 0;
        if (k === "pairings") return pairings.length === 0;
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
        .then(({ data: result }) => {
          if (result) {
            setAiSuggestions({
              improvements: (result.aiSuggestions as Record<string, unknown>)[
                "improvements"
              ] as AiSuggestion[],
              pairings: (result.aiSuggestions as Record<string, unknown>)[
                "pairings"
              ] as AiSuggestionsState["pairings"],
              detectedLanguage: (result.aiSuggestions as Record<string, unknown>)[
                "detectedLanguage"
              ] as string | undefined,
              languageMismatch: (result.aiSuggestions as Record<string, unknown>)[
                "languageMismatch"
              ] as boolean,
            });
            if (result.autoLinked > 0) {
              toast.success(
                `Auto-paired ${result.autoLinked} ingredient${result.autoLinked !== 1 ? "s" : ""}`,
              );
              void actions.listPairingsFor({ slug }).then(({ data: ps }) => {
                if (ps) setPairings(ps as Pairing[]);
              });
            }
          }
        })
        .catch(() => {})
        .finally(() => setAiRefreshing(false));
    },
  });

  function handleSave(_asDraft: boolean) {
    void form.handleSubmit();
  }

  const formValues = useStore(form.store, (s) => s.values);
  useEffect(() => {
    setCompleteness(
      scoreIngredient({
        name: formValues.name,
        category: formValues.category,
        summary: formValues.summary,
        description: formValues.description,
        image: formValues.image,
        origin: origins.filter(Boolean),
        flavorNotes: flavorNotes.filter(Boolean),
        pairings: pairings.map((p) => ({
          slug: p.ingredients[0] === slug ? p.ingredients[1] : p.ingredients[0],
        })),
      } as never),
    );
  }, [formValues, origins, flavorNotes, pairings]);

  const requiredFields = INGREDIENT_REQUIRED.map((key) => ({
    key,
    label: key,
    filled: key === "name" ? !!formValues.name : !!formValues.category,
    anchorId: "section-basic",
  }));

  const recommendedFields = INGREDIENT_RECOMMENDED.map((key) => ({
    key,
    label: key,
    filled:
      key === "summary"
        ? !!formValues.summary
        : key === "description"
          ? !!formValues.description
          : key === "image"
            ? !!formValues.image
            : key === "origin"
              ? origins.filter(Boolean).length > 0
              : key === "flavorNotes"
                ? flavorNotes.filter(Boolean).length > 0
                : pairings.length > 0,
    anchorId:
      key === "origin" || key === "flavorNotes"
        ? "section-profile"
        : key === "pairings"
          ? "section-pairings"
          : "section-basic",
  }));

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
      if (k === "flavorNotes") return flavorNotes.length === 0;
      if (k === "pairings") return pairings.length === 0;
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
      };
      const { data: result } = await actions.aiRefreshIngredientSuggestions({
        locale,
        slug,
        ingredient: snap as never,
        existingMeta: {},
        missingFields: missingKeys,
      });
      if (result) {
        setAiSuggestions({
          improvements: (result.aiSuggestions as Record<string, unknown>)[
            "improvements"
          ] as AiSuggestion[],
          pairings: (result.aiSuggestions as Record<string, unknown>)[
            "pairings"
          ] as AiSuggestionsState["pairings"],
          detectedLanguage: (result.aiSuggestions as Record<string, unknown>)[
            "detectedLanguage"
          ] as string | undefined,
          languageMismatch: (result.aiSuggestions as Record<string, unknown>)[
            "languageMismatch"
          ] as boolean,
        });
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
      const originField = result?.fields.find((f) => f.field === "origin");
      if (originField) {
        const vals = originField.suggestion
          .split(/[,;]\s*/)
          .map((s) => s.trim())
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
      const field = result?.fields.find((f) => f.field === "flavorNotes");
      if (field) {
        const vals = field.suggestion
          .split(/[,;]\s*/)
          .map((s) => s.trim().toLowerCase())
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
            <button
              type="button"
              onClick={() => setTranslateOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Languages size={13} />
              Translate
            </button>
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
                            <Label htmlFor={field.name}>
                              Summary
                              <RecommendedHint show={!field.state.value} />
                            </Label>
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
                            <Label htmlFor={field.name}>
                              Image URL
                              <RecommendedHint show={!field.state.value} />
                            </Label>
                            <Input
                              type="url"
                              id={field.name}
                              value={field.state.value}
                              onChange={(e) => {
                                field.handleChange(e.target.value);
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
          isDraft={false}
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
    </div>
  );
}
