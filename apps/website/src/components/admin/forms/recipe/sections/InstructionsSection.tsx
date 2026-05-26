import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import SortableArrayField from "@/components/admin/SortableArrayField.tsx";
import type { ImageAttribution } from "@/components/admin/ImageSearchModal.tsx";
import type { HowToStep } from "../recipe-types.ts";
import { AiFieldTranslateButton } from "@registry/components/ai-field-translate-button";
import { InlineListSuggestion } from "./InlineListSuggestion.tsx";

interface InstructionsSectionProps {
  instructions: HowToStep[];
  setInstructions: Dispatch<SetStateAction<HowToStep[]>>;
  stepAttributions: Map<number, ImageAttribution>;
  setStepAttributions: Dispatch<SetStateAction<Map<number, ImageAttribution>>>;
  onRequestImageSearch: (stepIndex: number) => void;
  splitView?: boolean;
  siblingInstructions?: HowToStep[];
  siblingLocale?: string;
}

export function InstructionsSection({
  instructions,
  setInstructions,
  stepAttributions,
  setStepAttributions,
  onRequestImageSearch,
  splitView,
  siblingInstructions,
  siblingLocale,
}: InstructionsSectionProps) {
  return (
    <section id="section-instructions" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Instructions</CardTitle>
            {splitView && <AiFieldTranslateButton fieldPath="recipeInstructions" />}
          </div>
        </CardHeader>
        <CardContent>
          <div className={splitView ? "grid grid-cols-2 gap-4" : undefined}>
            {/* Left column: editable steps + inline suggestion */}
            <div className="space-y-2">
              <InlineListSuggestion
                fieldPath="recipeInstructions"
                onApply={(items) =>
                  setInstructions(
                    items.map((item) => {
                      const s = item as Partial<HowToStep>;
                      return {
                        "@type": "HowToStep",
                        text: s.text ?? String(item),
                        name: s.name ?? undefined,
                        image: s.image ?? undefined,
                      };
                    }),
                  )
                }
                renderItem={(item) => {
                  const s = item as Partial<HowToStep>;
                  return (
                    <span>
                      {s.name && <span className="font-medium">{s.name} — </span>}
                      {s.text ?? String(item)}
                    </span>
                  );
                }}
              />
              <SortableArrayField
                items={instructions}
                onChange={setInstructions}
                onAdd={() =>
                  setInstructions((prev) => [...prev, { "@type": "HowToStep", text: "" }])
                }
                addLabel="Add step"
                getKey={(_, i) => `step-${i}`}
                renderItem={(step, i) => (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Step {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRequestImageSearch(i)}
                        className="text-xs text-primary hover:underline"
                      >
                        {step.image ? "Change image" : "Add image"}
                      </button>
                    </div>
                    <Input
                      value={step.name ?? ""}
                      onChange={(e) =>
                        setInstructions((prev) =>
                          prev.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)),
                        )
                      }
                      placeholder="Step name (optional)"
                    />
                    <Textarea
                      value={step.text}
                      onChange={(e) =>
                        setInstructions((prev) =>
                          prev.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)),
                        )
                      }
                      rows={2}
                      placeholder="Description of this step…"
                    />
                    {step.image && (
                      <div className="flex items-center gap-2">
                        <img
                          src={step.image}
                          alt=""
                          className="h-12 w-12 rounded object-cover border border-border"
                        />
                        {stepAttributions.get(i) && (
                          <p className="text-[11px] text-muted-foreground flex-1 truncate">
                            {stepAttributions.get(i)?.attribution}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setInstructions((prev) =>
                              prev.map((s, j) => (j === i ? { ...s, image: undefined } : s)),
                            );
                            setStepAttributions((prev) => {
                              const next = new Map(prev);
                              next.delete(i);
                              return next;
                            });
                          }}
                          className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}
              />
            </div>

            {/* Right column: sibling reference (split view only) */}
            {splitView && (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-muted-foreground">
                  {siblingLocale?.toUpperCase()} reference
                </span>
                {siblingInstructions && siblingInstructions.length > 0 ? (
                  <ol className="space-y-2">
                    {siblingInstructions.map((step, i) => (
                      <li key={i} className="text-xs text-muted-foreground pl-2">
                        <span className="font-semibold mr-1">{i + 1}.</span>
                        {step.name && <span className="font-medium">{step.name} — </span>}
                        {step.text}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-muted-foreground italic opacity-60">—</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
