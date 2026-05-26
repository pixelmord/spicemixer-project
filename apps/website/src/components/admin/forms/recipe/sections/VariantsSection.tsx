import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import EntityMultiCombobox, { type EntityOption } from "@/components/admin/EntityMultiCombobox.tsx";

interface VariantsSectionProps {
  collection: string;
  slug?: string;
  value: string[];
  onChange: (next: string[]) => void;
  recipeOptions: EntityOption[];
}

export function VariantsSection({
  collection,
  slug,
  value,
  onChange,
  recipeOptions,
}: VariantsSectionProps) {
  return (
    <section id="section-variants" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Co-equal variant members (same kind). Saving updates the closure across all members.
          </p>
          <EntityMultiCombobox
            value={value}
            onChange={onChange}
            options={recipeOptions
              .filter(
                (o) => o.value.startsWith(`${collection}/`) && !o.value.endsWith(`/${slug ?? ""}`),
              )
              .map((o) => ({
                ...o,
                value: o.value.replace(`${collection}/`, ""),
              }))}
            placeholder={`Select other ${collection}…`}
          />
        </CardContent>
      </Card>
    </section>
  );
}
