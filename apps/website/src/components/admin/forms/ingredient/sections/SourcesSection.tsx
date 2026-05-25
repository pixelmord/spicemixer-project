import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  SourcesArrayField,
  type Source,
} from "@/components/admin/forms/_shared/SourcesArrayField.tsx";

interface SourcesSectionProps {
  sources: Source[];
  onChange: (next: Source[]) => void;
  liabilityWarning: boolean;
}

export function SourcesSection({ sources, onChange, liabilityWarning }: SourcesSectionProps) {
  return (
    <section id="section-sources" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SourcesArrayField value={sources} onChange={onChange} />
          {liabilityWarning && (
            <div
              data-testid="liability-warning"
              className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs text-amber-800 dark:text-amber-300"
            >
              ⚠ This ingredient has medicinal, health, or safety content. Add at least one source to
              support these claims.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
