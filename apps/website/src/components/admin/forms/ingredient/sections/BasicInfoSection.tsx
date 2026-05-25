import { actions } from "astro:actions";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Label } from "@/components/ui/label.tsx";
import { TextField, TextareaField } from "@/components/admin/fields/index.ts";
import RecommendedHint from "@/components/admin/RecommendedHint.tsx";
import { SlugField } from "@/components/admin/forms/_shared/SlugField.tsx";
import { ImageField } from "@/components/admin/forms/_shared/ImageField.tsx";
import { slugify } from "@/lib/slugify.ts";
import type { SiblingLocale } from "@/hooks/use-ai-suggestions";
import type { ImageAttribution } from "@/components/admin/ImageSearchModal.tsx";

const CATEGORIES = [
  "spice",
  "herb",
  "seed",
  "dried-fruit",
  "salt",
  "acid",
  "allium",
  "other",
] as const;

import type { AnyForm } from "@/components/admin/forms/_shared/form-types";

interface BasicInfoSectionProps {
  form: AnyForm;
  isNew: boolean;
  locale: "en" | "de";

  splitView: boolean;
  siblingData: SiblingLocale | null;
  siblingLocaleCode: "en" | "de";

  // Slug
  slug: string;
  setSlug: (next: string) => void;
  slugChecking: boolean;
  slugAvailable: boolean | null;

  // Image
  imageAttribution?: ImageAttribution;
  setImageAttribution: (next: ImageAttribution | undefined) => void;
  onOpenImageSearch: () => void;

  // Language-mismatch banner
  languageMismatch: boolean;
  detectedLanguage?: string;
}

export function BasicInfoSection({
  form,
  isNew,
  locale,
  splitView,
  siblingData,
  siblingLocaleCode,
  slug,
  setSlug,
  slugChecking,
  slugAvailable,
  imageAttribution,
  setImageAttribution,
  onOpenImageSearch,
  languageMismatch,
  detectedLanguage,
}: BasicInfoSectionProps) {
  return (
    <section id="section-basic" className="scroll-mt-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          {isNew && (
            <SlugField
              slug={slug}
              onChange={setSlug}
              name={(form.getFieldValue("name" as never) as string) ?? ""}
              available={slugAvailable}
              checking={slugChecking}
              onAiSuggest={async (name) => {
                const { data } = await actions.aiSuggestSlug({
                  name,
                  locale,
                  collection: "recipes",
                });
                return data?.slug ?? null;
              }}
              onAiSuggestError={() => toast.error("Could not suggest slug")}
            />
          )}

          <form.Field name="name">
            {(field: any) => (
              <TextField
                field={field}
                label="Name *"
                placeholder="Cardamom"
                suggestionPath="name"
                hideSuggest
                splitView={splitView}
                siblingValue={siblingData?.data["name"]}
                siblingLocale={siblingLocaleCode}
                onValueChange={(v) => {
                  if (isNew && !slug) setSlug(slugify(v));
                }}
              />
            )}
          </form.Field>

          <form.Field name="category">
            {(field: any) => (
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select
                  value={field.state.value as string}
                  onValueChange={(v) => v && field.handleChange(v as never)}
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
            {(field: any) => (
              <TextField
                field={field}
                label="Summary *"
                placeholder="One-sentence pitch"
                suggestionPath="summary"
                splitView={splitView}
                siblingValue={siblingData?.data["summary"]}
                siblingLocale={siblingLocaleCode}
              />
            )}
          </form.Field>

          <form.Field name="description">
            {(field: any) => (
              <TextareaField
                field={field}
                label="Description"
                rows={4}
                placeholder="Detailed description…"
                suggestionPath="description"
                splitView={splitView}
                siblingValue={siblingData?.data["description"]}
                siblingLocale={siblingLocaleCode}
                hint={<RecommendedHint show={!field.state.value} />}
              />
            )}
          </form.Field>

          <form.Field name="image">
            {(field: any) => (
              <ImageField
                value={(field.state.value as string) ?? ""}
                onChange={(v) => field.handleChange(v as never)}
                attribution={imageAttribution}
                onClearAttribution={() => setImageAttribution(undefined)}
                onOpenSearch={onOpenImageSearch}
                label="Image URL"
                id={field.name}
                hint={<RecommendedHint show={!field.state.value} />}
              />
            )}
          </form.Field>

          {languageMismatch && detectedLanguage && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              ⚠ Content appears to be in <strong>{detectedLanguage.toUpperCase()}</strong> but this
              file is under the <strong>{locale.toUpperCase()}</strong> locale. Consider moving it
              or creating a translation.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
