import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import EntityMultiCombobox from "@/components/admin/EntityMultiCombobox.tsx";
import { REGION_OPTIONS, type RegionCode } from "@/lib/regions.ts";

interface RegionsSectionProps {
  value: RegionCode[];
  onChange: (next: RegionCode[]) => void;
}

export function RegionsSection({ value, onChange }: RegionsSectionProps) {
  return (
    <section id="section-regions" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Regions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label>Macro-regions</Label>
          <EntityMultiCombobox
            value={value}
            onChange={(vals) => onChange(vals as RegionCode[])}
            options={REGION_OPTIONS}
            placeholder="Select culinary macro-regions…"
          />
          <p className="text-xs text-muted-foreground">
            Closed enum — different from <span className="font-mono">origin[]</span> (free-form,
            finer) and <span className="font-mono">recipeCuisine</span> (schema.org cuisine).
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
