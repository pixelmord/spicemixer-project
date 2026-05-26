import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { TextField, TagInputField } from "@/components/admin/fields/index.ts";
import TagInput from "@/components/admin/TagInput.tsx";
import EntityMultiCombobox from "@/components/admin/EntityMultiCombobox.tsx";
import RecommendedHint from "@/components/admin/RecommendedHint.tsx";
import { MIXTURE_KINDS, type MixtureKind } from "@/lib/mixture-schema.ts";
import { REGION_OPTIONS, type RegionCode } from "@/lib/regions.ts";
import type { AnyForm } from "@/components/admin/forms/_shared/form-types.ts";
import type { SiblingLocale } from "@/hooks/use-ai-suggestions";

interface ClassificationSectionProps {
  form: AnyForm;
  collection: string;
  splitView: boolean;
  siblingData: SiblingLocale | null;
  siblingLocale: string | undefined;
  tagSuggestions: string[];

  // Mixture kind
  kind: MixtureKind | "";
  setKind: (k: MixtureKind) => void;

  // Diet tags
  dietTags: string[];
  setDietTags: (tags: string[]) => void;

  // Regions
  regions: RegionCode[];
  setRegions: (regions: RegionCode[]) => void;
}

export function ClassificationSection({
  form,
  collection,
  splitView,
  siblingData,
  siblingLocale,
  tagSuggestions,
  kind,
  setKind,
  dietTags,
  setDietTags,
  regions,
  setRegions,
}: ClassificationSectionProps) {
  return (
    <section id="section-classification" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Classification</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {collection === "mixtures" && (
            <div className="col-span-2 space-y-1.5">
              <Label>
                Kind <span className="text-destructive">*</span>
              </Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as MixtureKind)}>
                <SelectTrigger data-testid="mixture-kind-select">
                  <SelectValue placeholder="Select mixture kind…" />
                </SelectTrigger>
                <SelectContent>
                  {MIXTURE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <form.Field name="recipeCategory">
            {(field: any) => (
              <TextField
                field={field}
                label="Category"
                placeholder="Main Course"
                suggestionPath="recipeCategory"
                splitView={splitView}
                siblingValue={siblingData?.data["recipeCategory"]}
                siblingLocale={siblingLocale}
                hint={<RecommendedHint show={!field.state.value} />}
              />
            )}
          </form.Field>
          <form.Field name="recipeCuisine">
            {(field: any) => (
              <TextField
                field={field}
                label="Cuisine"
                placeholder="Moroccan"
                suggestionPath="recipeCuisine"
                splitView={splitView}
                siblingValue={siblingData?.data["recipeCuisine"]}
                siblingLocale={siblingLocale}
                hint={<RecommendedHint show={!field.state.value} />}
              />
            )}
          </form.Field>
          <div className="col-span-2">
            <form.Field name="keywords">
              {(field: any) => (
                <TagInputField
                  field={field}
                  label={
                    <>
                      Keywords
                      <RecommendedHint show={(field.state.value ?? []).length === 0} />
                    </>
                  }
                  placeholder="vegan, pantry, quick"
                  suggestions={tagSuggestions}
                  suggestionPath="keywords"
                  splitView={splitView}
                  siblingValue={siblingData?.data["keywords"] as string[] | undefined}
                  siblingLocale={siblingLocale}
                />
              )}
            </form.Field>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Suitable for diet</Label>
            <TagInput
              value={dietTags}
              onChange={setDietTags}
              suggestions={["VegetarianDiet", "VeganDiet", "GlutenFreeDiet", "LowCalorieDiet"]}
              placeholder="VegetarianDiet, VeganDiet"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Regions</Label>
            <EntityMultiCombobox
              value={regions}
              onChange={(vals) => setRegions(vals as RegionCode[])}
              options={REGION_OPTIONS}
              placeholder="Select culinary macro-regions…"
            />
            <p className="text-xs text-muted-foreground">
              Closed enum — different from <span className="font-mono">recipeCuisine</span>{" "}
              (schema.org cuisine).
            </p>
            {splitView &&
              Array.isArray(siblingData?.data["region"]) &&
              (siblingData!.data["region"] as string[]).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {siblingLocale?.toUpperCase()}:{" "}
                  {(siblingData!.data["region"] as string[]).join(", ")}
                </p>
              )}
          </div>
          <form.Field name="datePublished">
            {(field: any) => (
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
  );
}
