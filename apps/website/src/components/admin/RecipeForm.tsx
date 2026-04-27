import { useForm } from "@tanstack/react-form";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Save, Loader2, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import CompletenessBadge from "./CompletenessBadge.tsx";
import { scoreRecipe } from "@/lib/completeness.ts";
import { slugify } from "@/lib/slugify.ts";
import type { RecipeCollection } from "@/lib/content-store.ts";

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
  const [completeness, setCompleteness] = useState(() =>
    scoreRecipe(recipe as never, meta as never),
  );

  // ── flat form state for ingredients/instructions (controlled arrays) ──
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
      keywords: Array.isArray(recipe.keywords)
        ? recipe.keywords.join(", ")
        : (recipe.keywords ?? ""),
      suitableForDiet: Array.isArray(recipe.suitableForDiet)
        ? recipe.suitableForDiet.join(", ")
        : "",
      prepTime: recipe.prepTime ?? "",
      cookTime: recipe.cookTime ?? "",
      totalTime: recipe.totalTime ?? "",
      datePublished: recipe.datePublished ?? "",
      draft: meta.draft,
      tags: meta.tags.join(", "),
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
      if (value.keywords)
        recipePayload.keywords = value.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      if (value.suitableForDiet)
        recipePayload.suitableForDiet = value.suitableForDiet
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      if (value.prepTime) recipePayload.prepTime = value.prepTime;
      if (value.cookTime) recipePayload.cookTime = value.cookTime;
      if (value.totalTime) recipePayload.totalTime = value.totalTime;
      if (value.datePublished) recipePayload.datePublished = value.datePublished;

      const metaPayload: MetaData = {
        ...meta,
        draft: value.draft,
        tags: value.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        ingredientLinks,
        externalSources,
        goesWellWith: meta.goesWellWith,
        usesBase: meta.usesBase,
        variants: meta.variants,
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
      toast.success("Saved successfully");

      if (isNew) {
        window.location.href = `/admin/${collection}/${slug}/edit`;
      }
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-3">
          <CompletenessBadge
            score={completeness.score}
            missing={completeness.missing}
            color={completeness.color}
          />
          <form.Subscribe selector={(s) => s.values.draft}>
            {(draft) => (
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${draft ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
              >
                {draft ? "Draft" : "Published"}
              </span>
            )}
          </form.Subscribe>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="space-y-6"
      >
        <Tabs defaultValue="content">
          <TabsList>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="meta-sidecar">Links & Meta</TabsTrigger>
          </TabsList>

          {/* ── Content tab ── */}
          <TabsContent value="content" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Basic info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Slug (for new items) */}
                {isNew && (
                  <div className="space-y-1.5">
                    <Label>Slug</Label>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="my-recipe"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL-safe identifier. Will be generated from name if left empty.
                    </p>
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
                      <Label htmlFor={field.name}>Description</Label>
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
                      <Label htmlFor={field.name}>Image URL</Label>
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
                        <Label htmlFor={field.name}>Author</Label>
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

            <Card>
              <CardHeader>
                <CardTitle>Timing & yield</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <form.Field name="prepTime">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Prep time</Label>
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
                      <Label htmlFor={field.name}>Cook time</Label>
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
                      <Label htmlFor={field.name}>Total time</Label>
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
                      <Label htmlFor={field.name}>Yield / servings</Label>
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
          </TabsContent>

          {/* ── Ingredients tab ── */}
          <TabsContent value="ingredients" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Ingredients</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ingredients.map((ing, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={ing}
                        onChange={(e) =>
                          setIngredients((prev) =>
                            prev.map((v, j) => (j === i ? e.target.value : v)),
                          )
                        }
                        placeholder="2 tsp cumin seeds"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setIngredients((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIngredients((prev) => [...prev, ""])}
                  >
                    <Plus size={14} className="mr-1" /> Add ingredient
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Instructions tab ── */}
          <TabsContent value="instructions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {instructions.map((step, i) => (
                    <div key={i} className="border border-border rounded-md p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Step {i + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive h-6 w-6"
                          onClick={() => setInstructions((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
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
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setInstructions((prev) => [...prev, { "@type": "HowToStep", text: "" }])
                    }
                  >
                    <Plus size={14} className="mr-1" /> Add step
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Metadata tab ── */}
          <TabsContent value="metadata" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Classification</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <form.Field name="recipeCategory">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Category</Label>
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
                      <Label htmlFor={field.name}>Cuisine</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Moroccan"
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="keywords">
                  {(field) => (
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor={field.name}>Keywords (comma-separated)</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="vegan, pantry, quick"
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="suitableForDiet">
                  {(field) => (
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor={field.name}>Suitable for diet (comma-separated)</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="VegetarianDiet, VeganDiet"
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="datePublished">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Date published</Label>
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
          </TabsContent>

          {/* ── Meta sidecar tab ── */}
          <TabsContent value="meta-sidecar" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Publishing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form.Field name="draft">
                  {(field) => (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Draft</Label>
                        <p className="text-xs text-muted-foreground">
                          Hidden from public site while enabled
                        </p>
                      </div>
                      <Switch
                        checked={field.state.value}
                        onCheckedChange={(v) => field.handleChange(v)}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="tags">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Tags (comma-separated)</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="weeknight, make-ahead"
                      />
                    </div>
                  )}
                </form.Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ingredient links</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ingredientLinks.map((link, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={link.pattern}
                        onChange={(e) =>
                          setIngredientLinks((prev) =>
                            prev.map((l, j) => (j === i ? { ...l, pattern: e.target.value } : l)),
                          )
                        }
                        placeholder="cumin seeds, ground"
                      />
                      <span className="text-muted-foreground text-sm shrink-0">→</span>
                      <Input
                        value={link.slug}
                        onChange={(e) =>
                          setIngredientLinks((prev) =>
                            prev.map((l, j) => (j === i ? { ...l, slug: e.target.value } : l)),
                          )
                        }
                        placeholder="cumin"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setIngredientLinks((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setIngredientLinks((prev) => [...prev, { pattern: "", slug: "" }])
                    }
                  >
                    <Plus size={14} className="mr-1" /> Add link
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>External sources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {externalSources.map((src, i) => (
                    <div key={i} className="border border-border rounded-md p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Source {i + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setExternalSources((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
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
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExternalSources((prev) => [...prev, { url: "", title: "", source: "" }])
                    }
                  >
                    <Plus size={14} className="mr-1" /> Add source
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Submit bar */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <LinkButton variant="outline" href={`/admin/${collection}`}>
            Cancel
          </LinkButton>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Save size={14} className="mr-2" />
            )}
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}

// Need useState import
import { useState } from "react";
