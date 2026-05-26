import type { Dispatch, SetStateAction } from "react";
import { Sparkles, Link2, Loader2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import SortableArrayField from "@/components/admin/SortableArrayField.tsx";
import EntityCombobox from "@/components/admin/EntityCombobox.tsx";
import type { EntityOption } from "@/components/admin/EntityCombobox.tsx";
import type { IngredientLink, IngredientLinkProposal } from "../recipe-types.ts";
import { AiFieldTranslateButton } from "@registry/components/ai-field-translate-button";
import { InlineListSuggestion } from "./InlineListSuggestion.tsx";

interface IngredientsSectionProps {
  ingredients: string[];
  setIngredients: Dispatch<SetStateAction<string[]>>;

  ingredientLinks: IngredientLink[];
  setIngredientLinks: Dispatch<SetStateAction<IngredientLink[]>>;

  ingredientOptions: EntityOption[];
  setIngredientOptions: Dispatch<SetStateAction<EntityOption[]>>;

  pendingLinks: IngredientLinkProposal[] | null;
  setPendingLinks: Dispatch<SetStateAction<IngredientLinkProposal[] | null>>;
  aiLinksLoading: boolean;
  onRunProposeLinks: () => void;
  onApplyLinkSuggestion: (link: IngredientLinkProposal) => void;

  onRequestViewLink: (slug: string, ingredientIndex: number) => void;
  onRequestLinkIngredient: (
    ingredientIndex: number,
    ingredientString: string,
    aiSuggestion?: IngredientLinkProposal,
  ) => void;

  onOpenQuickCreate: (
    kind: "ingredient" | "recipe" | "mixture",
    name: string,
    cb: (slug: string, label: string) => void,
  ) => void;

  splitView?: boolean;
  siblingIngredients?: string[];
  siblingLocale?: string;
}

export function IngredientsSection({
  ingredients,
  setIngredients,
  ingredientLinks,
  setIngredientLinks,
  ingredientOptions,
  setIngredientOptions,
  pendingLinks,
  setPendingLinks,
  aiLinksLoading,
  onRunProposeLinks,
  onApplyLinkSuggestion,
  onRequestViewLink,
  onRequestLinkIngredient,
  onOpenQuickCreate,
  splitView,
  siblingIngredients,
  siblingLocale,
}: IngredientsSectionProps) {
  // Derived look-up helpers (pure, re-computed from props)
  function findLinkForIngredient(ing: string): IngredientLink | undefined {
    const lower = ing.toLowerCase();
    for (const link of ingredientLinks) {
      if (lower.includes(link.pattern.toLowerCase())) return link;
    }
    return undefined;
  }

  function findAiLinkSuggestion(ing: string): IngredientLinkProposal | undefined {
    if (!pendingLinks) return undefined;
    const lower = ing.toLowerCase();
    return pendingLinks.find((l) => lower.includes(l.pattern.toLowerCase()));
  }

  return (
    <section id="section-ingredients" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Ingredients</CardTitle>
            <div className="flex items-center gap-2">
              {splitView && <AiFieldTranslateButton fieldPath="recipeIngredient" />}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRunProposeLinks}
                disabled={aiLinksLoading || ingredients.filter(Boolean).length === 0}
                className="h-7 text-xs gap-1"
              >
                {aiLinksLoading ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Link2 size={11} />
                )}
                Auto-link
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={splitView ? "grid grid-cols-2 gap-4" : "space-y-2"}>
            {/* Left column: editable list + inline suggestion + link tooling */}
            <div className="space-y-2">
              <InlineListSuggestion
                fieldPath="recipeIngredient"
                onApply={(items) => setIngredients(items as string[])}
                renderItem={(item) => <span className="font-mono">{String(item)}</span>}
              />
              <SortableArrayField
                items={ingredients}
                onChange={setIngredients}
                onAdd={() => setIngredients((prev) => [...prev, ""])}
                addLabel="Add ingredient"
                renderItem={(ing, i) => {
                  const existingLink = findLinkForIngredient(ing);
                  const aiSuggestion = findAiLinkSuggestion(ing);
                  return (
                    <div className="flex items-center gap-1.5 flex-1">
                      <Input
                        value={ing}
                        onChange={(e) =>
                          setIngredients((prev) =>
                            prev.map((v, j) => (j === i ? e.target.value : v)),
                          )
                        }
                        placeholder="2 tsp cumin seeds"
                        className="flex-1"
                      />
                      {/* Link button — always shown, opens IngredientLinkModal */}
                      {existingLink ? (
                        <button
                          type="button"
                          onClick={() => onRequestViewLink(existingLink.slug, i)}
                          className="shrink-0 flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
                          title={`Linked → ${existingLink.slug} · click to view`}
                        >
                          <Link2 size={9} />
                          {existingLink.slug}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onRequestLinkIngredient(i, ing, aiSuggestion ?? undefined)}
                          className={
                            aiSuggestion
                              ? "shrink-0 flex items-center gap-1 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                              : "shrink-0 flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:border-border/80"
                          }
                          title={
                            aiSuggestion
                              ? `AI suggests → ${aiSuggestion.slug} · click to link`
                              : "Click to link ingredient"
                          }
                        >
                          {aiSuggestion ? (
                            <>
                              <Sparkles size={9} />
                              {aiSuggestion.slug}
                            </>
                          ) : (
                            <Link2 size={9} />
                          )}
                        </button>
                      )}
                    </div>
                  );
                }}
              />

              {/* Pending link suggestions summary */}
              {pendingLinks && pendingLinks.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-amber-800 dark:text-amber-300">
                      {pendingLinks.length} link{pendingLinks.length !== 1 ? "s" : ""} suggested
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          pendingLinks.forEach(onApplyLinkSuggestion);
                          setPendingLinks(null);
                        }}
                        className="flex items-center gap-1 rounded bg-amber-700 px-2 py-0.5 text-white hover:opacity-90"
                      >
                        <Check size={9} />
                        Apply all
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingLinks(null)}
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-amber-700 hover:bg-amber-100"
                      >
                        <X size={9} />
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual link management */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none list-none flex items-center gap-1 pt-1">
                  <Link2 size={11} />
                  Ingredient links ({ingredientLinks.length})
                  <span className="ml-auto group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="mt-2">
                  <SortableArrayField
                    items={ingredientLinks}
                    onChange={setIngredientLinks}
                    onAdd={() =>
                      setIngredientLinks((prev) => [
                        ...prev,
                        { pattern: "", slug: "", kind: "ingredient" },
                      ])
                    }
                    addLabel="Add link"
                    getKey={(_, i) => `ilink-${i}`}
                    renderItem={(link, i) => (
                      <div className="flex items-center gap-2">
                        <Input
                          value={link.pattern}
                          onChange={(e) =>
                            setIngredientLinks((prev) =>
                              prev.map((l, j) => (j === i ? { ...l, pattern: e.target.value } : l)),
                            )
                          }
                          placeholder="cumin seeds"
                          className="flex-1"
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">→</span>
                        <EntityCombobox
                          value={link.slug}
                          onChange={(v) =>
                            setIngredientLinks((prev) =>
                              prev.map((l, j) => (j === i ? { ...l, slug: v } : l)),
                            )
                          }
                          options={ingredientOptions}
                          placeholder="ingredient"
                          className="flex-1"
                          onCreateNew={(name) =>
                            onOpenQuickCreate("ingredient", name, (newSlug, newLabel) => {
                              setIngredientOptions((prev) => [
                                ...prev,
                                { value: newSlug, label: newLabel, sublabel: newSlug },
                              ]);
                              setIngredientLinks((prev) =>
                                prev.map((l, j) => (j === i ? { ...l, slug: newSlug } : l)),
                              );
                            })
                          }
                        />
                      </div>
                    )}
                  />
                </div>
              </details>
            </div>

            {/* Right column: sibling reference (split view only) */}
            {splitView && (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-muted-foreground">
                  {siblingLocale?.toUpperCase()} reference
                </span>
                {siblingIngredients && siblingIngredients.length > 0 ? (
                  <ol className="space-y-0.5">
                    {siblingIngredients.map((ing, i) => (
                      <li
                        key={i}
                        className="text-xs text-muted-foreground font-mono pl-2 leading-relaxed"
                      >
                        <span className="mr-1 opacity-50">{i + 1}.</span>
                        {ing}
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
