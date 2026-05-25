import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { TagInputField } from "@/components/admin/fields/index.ts";
import RecommendedHint from "@/components/admin/RecommendedHint.tsx";
import type { AnyForm } from "@/components/admin/forms/_shared/form-types";

interface OriginFlavorSectionProps {
  form: AnyForm;
}

export function OriginFlavorSection({ form }: OriginFlavorSectionProps) {
  return (
    <section id="section-profile" className="scroll-mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Origin</CardTitle>
        </CardHeader>
        <CardContent>
          <form.Field name="origin">
            {(field: any) => (
              <TagInputField
                field={field}
                placeholder="Iran, Guatemala…"
                suggestionPath="origin"
                hint={<RecommendedHint show={(field.state.value ?? []).length === 0} />}
              />
            )}
          </form.Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flavor notes</CardTitle>
        </CardHeader>
        <CardContent>
          <form.Field name="flavorNotes">
            {(field: any) => (
              <TagInputField
                field={field}
                placeholder="floral, earthy, warm…"
                suggestionPath="flavorNotes"
              />
            )}
          </form.Field>
        </CardContent>
      </Card>
    </section>
  );
}
