import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { TextField, TextareaField } from "@/components/admin/fields/index.ts";
import { SlugField } from "@/components/admin/forms/_shared/SlugField.tsx";
import { ImageField } from "@/components/admin/forms/_shared/ImageField.tsx";
import RecommendedHint from "@/components/admin/RecommendedHint.tsx";
import type { ImageAttribution } from "@/components/admin/ImageSearchModal.tsx";
import type { AnyForm } from "@/components/admin/forms/_shared/form-types.ts";
import type { SiblingLocale } from "@registry/components/use-ai-suggestions";

interface BasicInfoSectionProps {
  form: AnyForm;
  isNew: boolean;
  slug: string;
  setSlug: (next: string) => void;
  slugChecking: boolean;
  slugAvailable: boolean | null;
  splitView: boolean;
  siblingData: SiblingLocale | null;
  siblingLocale: string;
  language: string | undefined;
  collection: string;
  imageAttribution: ImageAttribution | undefined;
  onClearImageAttribution: () => void;
  onOpenImageSearch: () => void;
  /** Called from name field onChange when isNew + no slug yet. */
  onAutoSlug: (name: string) => void;
  onAiSuggestSlug: (name: string) => Promise<string | null>;
}

export function BasicInfoSection({
  form,
  isNew,
  slug,
  setSlug,
  slugChecking,
  slugAvailable,
  splitView,
  siblingData,
  siblingLocale,
  imageAttribution,
  onClearImageAttribution,
  onOpenImageSearch,
  onAutoSlug,
  onAiSuggestSlug,
}: BasicInfoSectionProps) {
  return (
    <section id="section-basic" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Basic info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isNew && (
            <SlugField
              slug={slug}
              onChange={setSlug}
              name={form.getFieldValue("name" as never) as string}
              available={slugAvailable}
              checking={slugChecking}
              onAiSuggest={onAiSuggestSlug}
              placeholder="my-recipe"
            />
          )}

          <form.Field name="name">
            {(field: any) => (
              <TextField
                field={field}
                label="Name *"
                placeholder="Ras el Hanout"
                suggestionPath="name"
                splitView={splitView}
                siblingValue={siblingData?.data["name"]}
                siblingLocale={siblingLocale}
                onValueChange={(v: string) => {
                  if (isNew && !slug) onAutoSlug(v);
                }}
              />
            )}
          </form.Field>

          <form.Field name="description">
            {(field: any) => (
              <TextareaField
                field={field}
                label="Description"
                rows={3}
                placeholder="A warming North African spice blend…"
                suggestionPath="description"
                splitView={splitView}
                siblingValue={siblingData?.data["description"]}
                siblingLocale={siblingLocale}
                hint={<RecommendedHint show={!field.state.value} />}
              />
            )}
          </form.Field>

          <form.Field name="image">
            {(field: any) => (
              <ImageField
                value={field.state.value}
                onChange={(next: string) => {
                  field.handleChange(next);
                  if (!next) onClearImageAttribution();
                }}
                attribution={imageAttribution}
                onClearAttribution={onClearImageAttribution}
                onOpenSearch={onOpenImageSearch}
                hint={<RecommendedHint show={!field.state.value} />}
              />
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-4">
            <form.Field name="authorName">
              {(field: any) => {
                const siblingAuthor = siblingData?.data["author"] as { name?: string } | undefined;
                return (
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
                    {splitView && siblingAuthor?.name && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          {siblingLocale?.toUpperCase()}: {siblingAuthor.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => field.handleChange(siblingAuthor.name!)}
                          className="text-xs text-primary hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                );
              }}
            </form.Field>
            <form.Field name="authorType">
              {(field: any) => {
                const siblingAuthor = siblingData?.data["author"] as
                  | { "@type"?: string }
                  | undefined;
                const siblingType = siblingAuthor?.["@type"];
                return (
                  <div className="space-y-1.5">
                    <Label>Author type</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(v) => v && field.handleChange(v as "Person" | "Organization")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Person">Person</SelectItem>
                        <SelectItem value="Organization">Organization</SelectItem>
                      </SelectContent>
                    </Select>
                    {splitView && siblingType && siblingType !== field.state.value && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          {siblingLocale?.toUpperCase()}: {siblingType}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            field.handleChange(siblingType as "Person" | "Organization")
                          }
                          className="text-xs text-primary hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                );
              }}
            </form.Field>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
