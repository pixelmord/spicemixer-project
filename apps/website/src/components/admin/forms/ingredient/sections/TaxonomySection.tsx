import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { TextField } from "@/components/admin/fields/index.ts";
import TagInput from "@/components/admin/TagInput.tsx";
import RecommendedHint from "@/components/admin/RecommendedHint.tsx";
import { PillToggleGroup } from "@/components/admin/forms/_shared/PillToggleGroup.tsx";
import type { SiblingLocale } from "@/hooks/use-ai-suggestions";
import type { AnyForm } from "@/components/admin/forms/_shared/form-types";
import {
  INGREDIENT_PARTS,
  INGREDIENT_FLAVOR_PROFILE,
  type IngredientPart,
  type IngredientFlavorProfile,
} from "@/lib/ingredient-schema.ts";

interface TaxonomySectionProps {
  form: AnyForm;
  splitView: boolean;
  siblingData: SiblingLocale | null;
  siblingLocaleCode: "en" | "de";

  commonNames: string[];
  setCommonNames: (next: string[]) => void;

  parts: IngredientPart[];
  setParts: (next: IngredientPart[]) => void;

  flavorProfile: IngredientFlavorProfile[];
  setFlavorProfile: (next: IngredientFlavorProfile[]) => void;

  safetyFlags: string[];
  setSafetyFlags: (next: string[]) => void;
}

export function TaxonomySection({
  form,
  splitView,
  siblingData,
  siblingLocaleCode,
  commonNames,
  setCommonNames,
  parts,
  setParts,
  flavorProfile,
  setFlavorProfile,
  safetyFlags,
  setSafetyFlags,
}: TaxonomySectionProps) {
  return (
    <section id="section-taxonomy" className="scroll-mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Taxonomy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Common names</Label>
            <TagInput
              value={commonNames}
              onChange={setCommonNames}
              placeholder="kala zeera, cilantro…"
            />
          </div>

          <form.Field name="botanicalName">
            {(field: any) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>
                  Botanical name
                  <RecommendedHint show={!field.state.value} />
                </Label>
                <Input
                  id={field.name}
                  value={field.state.value as string}
                  onChange={(e) => field.handleChange(e.target.value as never)}
                  placeholder="Elettaria cardamomum"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="family">
            {(field: any) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>
                  Family
                  <RecommendedHint show={!field.state.value} />
                </Label>
                <Input
                  id={field.name}
                  value={field.state.value as string}
                  onChange={(e) => field.handleChange(e.target.value as never)}
                  placeholder="Zingiberaceae"
                />
              </div>
            )}
          </form.Field>

          <div className="space-y-1.5">
            <Label>
              Parts used
              <RecommendedHint show={parts.length === 0} />
            </Label>
            <PillToggleGroup
              ariaLabel="Parts used"
              options={INGREDIENT_PARTS}
              value={parts}
              onChange={(next) => setParts(next as IngredientPart[])}
            />
          </div>

          <form.Field name="seasonality">
            {(field: any) => (
              <TextField
                field={field}
                label="Seasonality"
                placeholder="Spring, late summer…"
                suggestionPath="seasonality"
                splitView={splitView}
                siblingValue={siblingData?.data["seasonality"]}
                siblingLocale={siblingLocaleCode}
              />
            )}
          </form.Field>

          <div className="space-y-1.5">
            <Label>
              Flavor profile
              <RecommendedHint show={flavorProfile.length === 0} />
            </Label>
            <PillToggleGroup
              ariaLabel="Flavor profile"
              options={INGREDIENT_FLAVOR_PROFILE}
              value={flavorProfile}
              onChange={(next) => setFlavorProfile(next as IngredientFlavorProfile[])}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Safety flags</Label>
            <TagInput
              value={safetyFlags}
              onChange={setSafetyFlags}
              placeholder="allergen, contraindication…"
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
