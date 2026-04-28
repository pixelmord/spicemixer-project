import { useState, useEffect } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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
import SortableArrayField from "./SortableArrayField.tsx";
import TagInput from "./TagInput.tsx";
import EntityCombobox, { type EntityOption } from "./EntityCombobox.tsx";
import QuickCreateDialog from "./QuickCreateDialog.tsx";
import FormActionBar from "./FormActionBar.tsx";
import SectionNav, { type SectionDef } from "./SectionNav.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import RecommendedHint from "./RecommendedHint.tsx";
import TranslationCompanion, { FieldWithTranslation } from "./TranslationCompanion.tsx";

type Category = "spice" | "herb" | "seed" | "dried-fruit" | "salt" | "acid" | "allium" | "other";

interface IngredientData {
  name: string;
  summary?: string;
  description?: string;
  image?: string;
  category: Category;
  origin: string[];
  flavorNotes: string[];
  pairings: Array<{ slug: string; note?: string }>;
}

interface Props {
  locale: "en" | "de";
  slug?: string;
  initialData?: Partial<IngredientData>;
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

function emptyIngredient(): IngredientData {
  return { name: "", category: "spice", origin: [], flavorNotes: [], pairings: [] };
}

export default function IngredientForm({ locale, slug: initialSlug, initialData, isNew }: Props) {
  const data = { ...emptyIngredient(), ...initialData } as IngredientData;
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [saving, setSaving] = useState(false);
  const [origins, setOrigins] = useState<string[]>(data.origin.length > 0 ? data.origin : []);
  const [flavorNotes, setFlavorNotes] = useState<string[]>(
    data.flavorNotes.length > 0 ? data.flavorNotes : [],
  );
  const [pairings, setPairings] = useState(data.pairings);
  const [completeness, setCompleteness] = useState(() => scoreIngredient(data as never));
  const [ingredientOptions, setIngredientOptions] = useState<EntityOption[]>([]);
  const [quickCreateName, setQuickCreateName] = useState("");
  const [quickCreateCallback, setQuickCreateCallback] = useState<
    ((slug: string, label: string) => void) | null
  >(null);

  useEffect(() => {
    void actions.listIngredientOptions({ locale }).then(({ data: opts }) => {
      if (opts)
        setIngredientOptions(opts.map((d) => ({ value: d.slug, label: d.name, sublabel: d.slug })));
    });
  }, [locale]);

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
      setSaving(true);

      const payload: IngredientData = {
        name: value.name,
        category: value.category as Category,
        origin: origins.filter(Boolean),
        flavorNotes: flavorNotes.filter(Boolean),
        pairings: pairings.filter((p) => p.slug),
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
      if (isNew) window.location.href = `/admin/ingredients/${slug}/edit?locale=${locale}`;
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
        pairings: pairings.filter((p) => p.slug),
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
                : pairings.filter((p) => p.slug).length > 0,
    anchorId:
      key === "origin" || key === "flavorNotes"
        ? "section-profile"
        : key === "pairings"
          ? "section-pairings"
          : "section-basic",
  }));

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LinkButton variant="ghost" size="icon" href="/admin/ingredients">
          <ArrowLeft size={16} />
        </LinkButton>
        <div>
          <h1 className="text-xl font-bold">{isNew ? "New ingredient" : `Edit · ${slug}`}</h1>
          <p className="text-sm text-muted-foreground">Locale: {locale.toUpperCase()}</p>
        </div>
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
                          <Input
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="cardamom"
                          />
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
                              onValueChange={(v) => field.handleChange(v as Category)}
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
                              onChange={(e) => field.handleChange(e.target.value)}
                              placeholder="https://…"
                            />
                          </div>
                        )}
                      </form.Field>
                    </CardContent>
                  </Card>
                </section>

                {/* ── Profile ── */}
                <section id="section-profile" className="scroll-mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Origin</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TagInput
                        value={origins}
                        onChange={setOrigins}
                        placeholder="Iran, Guatemala…"
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Flavor notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TagInput
                        value={flavorNotes}
                        onChange={setFlavorNotes}
                        placeholder="floral, earthy, warm…"
                      />
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
                      <SortableArrayField
                        items={pairings}
                        onChange={setPairings}
                        onAdd={() => setPairings((prev) => [...prev, { slug: "" }])}
                        addLabel="Add pairing"
                        getKey={(_, i) => `pair-${i}`}
                        renderItem={(p, i) => (
                          <div className="flex items-center gap-2">
                            <EntityCombobox
                              value={p.slug}
                              onChange={(v) =>
                                setPairings((prev) =>
                                  prev.map((x, j) => (j === i ? { ...x, slug: v } : x)),
                                )
                              }
                              options={ingredientOptions}
                              placeholder="ingredient"
                              className="w-40 shrink-0"
                              onCreateNew={(name) => {
                                setQuickCreateName(name);
                                setQuickCreateCallback(
                                  () => (newSlug: string, newLabel: string) => {
                                    setIngredientOptions((prev) => [
                                      ...prev,
                                      { value: newSlug, label: newLabel, sublabel: newSlug },
                                    ]);
                                    setPairings((prev) =>
                                      prev.map((x, j) => (j === i ? { ...x, slug: newSlug } : x)),
                                    );
                                  },
                                );
                              }}
                            />
                            <Input
                              value={p.note ?? ""}
                              onChange={(e) =>
                                setPairings((prev) =>
                                  prev.map((x, j) =>
                                    j === i ? { ...x, note: e.target.value } : x,
                                  ),
                                )
                              }
                              placeholder="Note (optional)"
                            />
                          </div>
                        )}
                      />
                    </CardContent>
                  </Card>
                </section>
              </div>

              {/* Right: completeness panel */}
              <aside className="sticky top-0 h-fit w-52 shrink-0 pt-1">
                <CompletenessPanel
                  result={completeness}
                  requiredFields={requiredFields}
                  recommendedFields={recommendedFields}
                />
              </aside>
            </div>
          )}
        </TranslationCompanion>

        {/* Sticky footer — ingredients have no draft concept */}
        <FormActionBar
          saving={saving}
          isDraft={false}
          backHref="/admin/ingredients"
          onSave={handleSave}
        />
      </form>

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
