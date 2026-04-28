import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import CompletenessBadge from "./CompletenessBadge.tsx";
import { scoreIngredient } from "@/lib/completeness.ts";
import { slugify } from "@/lib/slugify.ts";

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

function emptyIngredient(): IngredientData {
  return { name: "", category: "spice", origin: [], flavorNotes: [], pairings: [] };
}

export default function IngredientForm({ locale, slug: initialSlug, initialData, isNew }: Props) {
  const data = { ...emptyIngredient(), ...initialData } as IngredientData;
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [saving, setSaving] = useState(false);
  const [origins, setOrigins] = useState<string[]>(data.origin.length > 0 ? data.origin : [""]);
  const [flavorNotes, setFlavorNotes] = useState<string[]>(
    data.flavorNotes.length > 0 ? data.flavorNotes : [""],
  );
  const [pairings, setPairings] = useState(data.pairings);
  const [completeness, setCompleteness] = useState(() => scoreIngredient(data as never));

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LinkButton variant="ghost" size="icon" href="/admin/ingredients">
            <ArrowLeft size={16} />
          </LinkButton>
          <div>
            <h1 className="text-xl font-bold">{isNew ? "New ingredient" : `Edit · ${slug}`}</h1>
            <p className="text-sm text-muted-foreground">Locale: {locale}</p>
          </div>
        </div>
        <CompletenessBadge
          score={completeness.score}
          missing={completeness.missing}
          color={completeness.color}
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        className="space-y-6"
      >
        <Tabs defaultValue="basic">
          <TabsList>
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="profile">Flavor profile</TabsTrigger>
            <TabsTrigger value="pairings">Pairings</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
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
                    <div className="space-y-1.5">
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
                    </div>
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
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Summary</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="One-sentence pitch"
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
                        rows={4}
                        placeholder="Detailed description…"
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="image">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor={field.name}>Image URL</Label>
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
          </TabsContent>

          <TabsContent value="profile" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Origin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {origins.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={o}
                        onChange={(e) =>
                          setOrigins((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                        }
                        placeholder="Iran"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setOrigins((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOrigins((prev) => [...prev, ""])}
                  >
                    <Plus size={14} className="mr-1" /> Add country
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Flavor notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {flavorNotes.map((n, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={n}
                        onChange={(e) =>
                          setFlavorNotes((prev) =>
                            prev.map((v, j) => (j === i ? e.target.value : v)),
                          )
                        }
                        placeholder="floral"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setFlavorNotes((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFlavorNotes((prev) => [...prev, ""])}
                  >
                    <Plus size={14} className="mr-1" /> Add note
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pairings" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Pairings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pairings.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={p.slug}
                        onChange={(e) =>
                          setPairings((prev) =>
                            prev.map((v, j) => (j === i ? { ...v, slug: e.target.value } : v)),
                          )
                        }
                        placeholder="saffron"
                        className="w-32"
                      />
                      <Input
                        value={p.note ?? ""}
                        onChange={(e) =>
                          setPairings((prev) =>
                            prev.map((v, j) => (j === i ? { ...v, note: e.target.value } : v)),
                          )
                        }
                        placeholder="Note (optional)"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setPairings((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPairings((prev) => [...prev, { slug: "" }])}
                  >
                    <Plus size={14} className="mr-1" /> Add pairing
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <LinkButton variant="outline" href="/admin/ingredients">
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
