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
import { scoreRecipe, RECIPE_REQUIRED, RECIPE_RECOMMENDED } from "@/lib/completeness.ts";
import { slugify } from "@/lib/slugify.ts";
import type { RecipeCollection } from "@/lib/content-store.ts";
import SortableArrayField from "./SortableArrayField.tsx";
import TagInput from "./TagInput.tsx";
import EntityCombobox, { type EntityOption } from "./EntityCombobox.tsx";
import EntityMultiCombobox from "./EntityMultiCombobox.tsx";
import QuickCreateDialog from "./QuickCreateDialog.tsx";
import FormActionBar from "./FormActionBar.tsx";
import SectionNav, { type SectionDef } from "./SectionNav.tsx";
import CompletenessPanel from "./CompletenessPanel.tsx";
import RecommendedHint from "./RecommendedHint.tsx";

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

interface MetaData {
  draft: boolean;
  language?: string;
  kind?: string;
  variantOf?: string;
  tags: string[];
  ingredientLinks: Array<{ pattern: string; slug: string }>;
  externalSources: Array<{ url: string; title: string; source?: string }>;
  goesWellWith: Array<{ collection: string; slug: string }>;
  usesBase: Array<{ collection: string; slug: string }>;
  variants: string[];
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
  { id: "section-links", label: "Ingredient links" },
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
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(meta.draft);
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
  const [ingredientLinks, setIngredientLinks] = useState(meta.ingredientLinks);
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

  // Entity options loaded from server
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

  useEffect(() => {
    void actions.listIngredientOptions({ locale: "en" }).then(({ data }) => {
      if (data)
        setIngredientOptions(data.map((d) => ({ value: d.slug, label: d.name, sublabel: d.slug })));
    });
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
        tags,
        ingredientLinks,
        externalSources,
        goesWellWith,
        usesBase,
        kind:
          collection === "recipes" ? "recipe" : collection === "spicemixes" ? "spicemix" : "sauce",
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

      if (isNew) window.location.href = `/admin/${collection}/${slug}/edit`;
    },
  });

  function handleSave(asDraft: boolean) {
    setDraft(asDraft);
    // Let state update propagate then submit
    setTimeout(() => void form.handleSubmit(), 0);
  }

  // Live completeness — re-score on key state changes
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
      anchorId: "section-links",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LinkButton variant="ghost" size="icon" href={`/admin/${collection}`}>
          <ArrowLeft size={16} />
        </LinkButton>
        <div>
          <h1 className="text-xl font-bold">
            {isNew ? `New ${collection.slice(0, -1)}` : "Edit recipe"}
          </h1>
          {!isNew && <p className="text-sm text-muted-foreground">{slug}</p>}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        {/* 3-col layout */}
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
                      <Input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="my-recipe"
                      />
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
                        <Label htmlFor={field.name}>
                          Description
                          <RecommendedHint show={!field.state.value} />
                        </Label>
                        <Textarea
                          id={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          rows={3}
                          placeholder="A warming North African spice blend…"
                        />
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
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="https://example.com/image.jpg"
                        />
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
                  <CardTitle>Ingredients</CardTitle>
                </CardHeader>
                <CardContent>
                  <SortableArrayField
                    items={ingredients}
                    onChange={setIngredients}
                    onAdd={() => setIngredients((prev) => [...prev, ""])}
                    addLabel="Add ingredient"
                    renderItem={(ing, i) => (
                      <Input
                        value={ing}
                        onChange={(e) =>
                          setIngredients((prev) =>
                            prev.map((v, j) => (j === i ? e.target.value : v)),
                          )
                        }
                        placeholder="2 tsp cumin seeds"
                      />
                    )}
                  />
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
                    <Label>
                      Keywords
                      <RecommendedHint show={keywords.length === 0} />
                    </Label>
                    <TagInput
                      value={keywords}
                      onChange={setKeywords}
                      suggestions={tagSuggestions}
                      placeholder="vegan, pantry, quick"
                    />
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
                    <Label>Tags</Label>
                    <TagInput
                      value={tags}
                      onChange={setTags}
                      suggestions={tagSuggestions}
                      placeholder="weeknight, make-ahead"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Language</Label>
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
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ── Ingredient links ── */}
            <section id="section-links" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Ingredient links</CardTitle>
                </CardHeader>
                <CardContent>
                  <SortableArrayField
                    items={ingredientLinks}
                    onChange={setIngredientLinks}
                    onAdd={() => setIngredientLinks((prev) => [...prev, { pattern: "", slug: "" }])}
                    addLabel="Add link"
                    getKey={(_, i) => `ilink-${i}`}
                    renderItem={(link, i) => (
                      <div className="flex items-center gap-2">
                        <Input
                          value={link.pattern}
                          onChange={(e) =>
                            setIngredientLinks((prev) =>
                              prev.map((l, j) => (j === i ? { ...l, pattern: e.target.value } : l)),
                            )
                          }
                          placeholder="cumin seeds, ground"
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
                </CardContent>
              </Card>
            </section>

            {/* ── Relations ── */}
            <section id="section-relations" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Relations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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

          {/* Right: completeness panel */}
          <aside className="sticky top-0 h-fit w-56 shrink-0 pt-1">
            <CompletenessPanel
              result={completeness}
              requiredFields={requiredFields}
              recommendedFields={recommendedFields}
              bonusFields={bonusFields}
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
    </div>
  );
}
