import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { TextareaField } from "@/components/admin/fields/index.ts";
import type { SiblingLocale } from "@/hooks/use-ai-suggestions";
import type { AnyForm } from "@/components/admin/forms/_shared/form-types";

export const LONGFORM_FIELDS = [
  {
    key: "culinaryUse",
    label: "Culinary use",
    placeholder: "How this ingredient is used in cooking…",
  },
  {
    key: "medicinalUses",
    label: "Medicinal uses",
    placeholder: "Traditional or documented medicinal applications…",
  },
  {
    key: "healthBenefits",
    label: "Health benefits",
    placeholder: "Nutritional or health-related properties…",
  },
  {
    key: "safetyNotes",
    label: "Safety notes",
    placeholder: "Allergens, contraindications, handling warnings…",
  },
  {
    key: "history",
    label: "History",
    placeholder: "Origin story, cultural history, trade routes…",
  },
  {
    key: "storage",
    label: "Storage",
    placeholder: "How to store, shelf life, container recommendations…",
  },
  {
    key: "sourcing",
    label: "Sourcing",
    placeholder: "Where to buy, quality indicators, forms available…",
  },
] as const;

interface LongformSectionProps {
  form: AnyForm;
  splitView: boolean;
  siblingData: SiblingLocale | null;
  siblingLocaleCode: "en" | "de";
}

const HINT: ReactNode = (
  <p className="mt-1 text-xs text-muted-foreground">
    Supports inline markdown links: <code>[text](url)</code>
  </p>
);

export function LongformSection({
  form,
  splitView,
  siblingData,
  siblingLocaleCode,
}: LongformSectionProps) {
  return (
    <section id="section-longform" className="scroll-mt-4 space-y-4">
      {LONGFORM_FIELDS.map(({ key, label, placeholder }) => (
        <form.Field key={key} name={key as never}>
          {(field: any) => (
            <Card>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <TextareaField
                  field={{
                    name: field.name,
                    state: { value: field.state.value as string | undefined },
                    handleChange: (v: string) => field.handleChange(v as never),
                    handleBlur: field.handleBlur,
                  }}
                  placeholder={placeholder}
                  rows={5}
                  suggestionPath={key}
                  splitView={splitView}
                  siblingValue={siblingData?.data[key]}
                  siblingLocale={siblingLocaleCode}
                  className="font-mono text-sm"
                  hint={HINT}
                />
              </CardContent>
            </Card>
          )}
        </form.Field>
      ))}
    </section>
  );
}
