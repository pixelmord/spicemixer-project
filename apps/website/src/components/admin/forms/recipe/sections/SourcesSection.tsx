import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import SortableArrayField from "@/components/admin/SortableArrayField.tsx";

export interface RecipeSource {
  title: string;
  url: string;
  author?: string;
  year?: string;
}

interface SourcesSectionProps {
  value: RecipeSource[];
  onChange: React.Dispatch<React.SetStateAction<RecipeSource[]>>;
}

export function SourcesSection({ value, onChange }: SourcesSectionProps) {
  return (
    <section id="section-sources" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>External sources</CardTitle>
        </CardHeader>
        <CardContent>
          <SortableArrayField
            items={value}
            onChange={onChange}
            onAdd={() => onChange((prev) => [...prev, { title: "", url: "" }])}
            addLabel="Add source"
            getKey={(_, i) => `src-${i}`}
            renderItem={(src, i) => (
              <div className="space-y-2 rounded-md border border-border p-3">
                <span className="text-xs font-semibold text-muted-foreground">Source {i + 1}</span>
                <Input
                  value={src.title}
                  onChange={(e) =>
                    onChange((prev) =>
                      prev.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)),
                    )
                  }
                  placeholder="Title"
                />
                <Input
                  value={src.url}
                  onChange={(e) =>
                    onChange((prev) =>
                      prev.map((s, j) => (j === i ? { ...s, url: e.target.value } : s)),
                    )
                  }
                  type="url"
                  placeholder="https://…"
                />
                <Input
                  value={src.author ?? ""}
                  onChange={(e) =>
                    onChange((prev) =>
                      prev.map((s, j) =>
                        j === i ? { ...s, author: e.target.value || undefined } : s,
                      ),
                    )
                  }
                  placeholder="Author / publisher"
                />
                <Input
                  value={src.year ?? ""}
                  onChange={(e) =>
                    onChange((prev) =>
                      prev.map((s, j) =>
                        j === i ? { ...s, year: e.target.value || undefined } : s,
                      ),
                    )
                  }
                  placeholder="Year"
                />
              </div>
            )}
          />
        </CardContent>
      </Card>
    </section>
  );
}
