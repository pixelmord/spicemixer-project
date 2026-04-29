import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  X,
  Link2,
  Tag,
  Lightbulb,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

// ── Shared types ──────────────────────────────

interface IngredientLinkProposal {
  pattern: string;
  slug: string;
  confidence: "high" | "medium" | "low";
}

interface ImprovementField {
  field: string;
  suggestion: string;
  rationale: string;
}

interface PairingProposal {
  slug: string;
  note?: string;
}

// ── Panel props ───────────────────────────────

interface RecipePanelProps {
  mode: "recipe";
  snapshot: Record<string, unknown>;
  missingFields: string[];
  recipeIngredients: string[];
  locale: "en" | "de";
  targetLocale: "en" | "de";
  onApplyIngredientLinks: (links: IngredientLinkProposal[]) => void;
  onApplyTags: (tags: string[]) => void;
  onApplyField: (field: string, value: unknown) => void;
  onApplyTranslation: (fields: Record<string, string>) => void;
}

interface IngredientPanelProps {
  mode: "ingredient";
  snapshot: Record<string, unknown>;
  missingFields: string[];
  locale: "en" | "de";
  targetLocale: "en" | "de";
  onApplyPairings: (pairings: PairingProposal[]) => void;
  onApplyField: (field: string, value: unknown) => void;
  onApplyTranslation: (fields: Record<string, string>) => void;
}

type AiAssistPanelProps = RecipePanelProps | IngredientPanelProps;

// ── Sub-components ────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
      {icon}
      {label}
    </div>
  );
}

function IngredientLinksResult({
  links,
  onApplyAll,
  onApplyOne,
  onDismiss,
}: {
  links: IngredientLinkProposal[];
  onApplyAll: () => void;
  onApplyOne: (link: IngredientLinkProposal) => void;
  onDismiss: () => void;
}) {
  if (!links.length)
    return <p className="text-xs text-muted-foreground">No matches found in inventory.</p>;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground flex-1 truncate">{l.pattern}</span>
            <span className="text-muted-foreground">→</span>
            <code className="font-mono bg-muted px-1 rounded">{l.slug}</code>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1 py-0",
                l.confidence === "high"
                  ? "text-emerald-600"
                  : l.confidence === "medium"
                    ? "text-amber-600"
                    : "text-muted-foreground",
              )}
            >
              {l.confidence}
            </Badge>
            <button
              type="button"
              onClick={() => onApplyOne(l)}
              className="text-primary hover:opacity-70"
              title="Apply this link"
            >
              <Check size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onApplyAll}>
          Apply all
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function TagsResult({
  tags,
  onApplyAll,
  onApplyOne,
  onDismiss,
}: {
  tags: string[];
  onApplyAll: () => void;
  onApplyOne: (tag: string) => void;
  onDismiss: () => void;
}) {
  if (!tags.length) return <p className="text-xs text-muted-foreground">No tags suggested.</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onApplyOne(t)}
            className="text-xs bg-muted hover:bg-accent rounded px-2 py-0.5 flex items-center gap-1"
          >
            {t}
            <Check size={10} className="text-emerald-500" />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onApplyAll}>
          Apply all
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function ImprovementsResult({
  fields,
  onApplyOne,
  onDismiss,
}: {
  fields: ImprovementField[];
  onApplyOne: (field: string, value: string) => void;
  onDismiss: () => void;
}) {
  if (!fields.length)
    return <p className="text-xs text-muted-foreground">No improvements suggested.</p>;

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="text-xs space-y-0.5 border border-border rounded p-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-medium">{f.field}</span>
              <p className="text-muted-foreground mt-0.5">{f.suggestion}</p>
              <p className="text-muted-foreground/70 italic mt-0.5">{f.rationale}</p>
            </div>
            <button
              type="button"
              onClick={() => onApplyOne(f.field, f.suggestion)}
              className="text-primary shrink-0 mt-0.5 hover:opacity-70"
              title="Apply"
            >
              <Check size={13} />
            </button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

function TranslationResult({
  fields,
  targetLocale,
  onApplyAll,
  onApplyOne,
  onDismiss,
}: {
  fields: Record<string, string>;
  targetLocale: string;
  onApplyAll: () => void;
  onApplyOne: (field: string, value: string) => void;
  onDismiss: () => void;
}) {
  const entries = Object.entries(fields);
  if (!entries.length)
    return <p className="text-xs text-muted-foreground">Nothing to translate.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Draft translation → {targetLocale}</p>
      {entries.map(([field, value]) => (
        <div
          key={field}
          className="text-xs border border-border rounded p-2 flex items-start gap-2"
        >
          <div className="flex-1">
            <span className="font-medium">{field}</span>
            <p className="text-muted-foreground mt-0.5 line-clamp-2">{value}</p>
          </div>
          <button
            type="button"
            onClick={() => onApplyOne(field, value)}
            className="text-primary shrink-0 hover:opacity-70"
          >
            <Check size={13} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onApplyAll}>
          Apply all
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function PairingsResult({
  pairings,
  onApplyAll,
  onDismiss,
}: {
  pairings: PairingProposal[];
  onApplyAll: () => void;
  onDismiss: () => void;
}) {
  if (!pairings.length)
    return <p className="text-xs text-muted-foreground">No pairings suggested.</p>;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {pairings.map((p, i) => (
          <div key={i} className="text-xs flex items-center gap-2">
            <code className="font-mono bg-muted px-1 rounded">{p.slug}</code>
            {p.note && <span className="text-muted-foreground truncate">{p.note}</span>}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onApplyAll}>
          Apply all
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────

type Op = "links" | "tags" | "improve" | "translate" | "pairings";

export default function AiAssistPanel(props: AiAssistPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<Op | null>(null);
  const [result, setResult] = useState<{ op: Op; data: unknown } | null>(null);

  const isRecipe = props.mode === "recipe";
  const recipe = isRecipe ? (props as RecipePanelProps) : null;
  const ingredient = !isRecipe ? (props as IngredientPanelProps) : null;

  async function run(op: Op) {
    setLoading(op);
    setResult(null);

    try {
      if (op === "links" && recipe) {
        const { data, error } = await actions.aiProposeIngredientLinks({
          recipeIngredients: recipe.recipeIngredients,
          locale: recipe.locale,
        });
        if (error) throw new Error(error.message);
        setResult({ op, data });
      } else if (op === "tags") {
        const { data, error } = await actions.aiProposeTags({ recipe: props.snapshot });
        if (error) throw new Error(error.message);
        setResult({ op, data });
      } else if (op === "improve") {
        if (isRecipe) {
          const { data, error } = await actions.aiProposeRecipeImprovements({
            recipe: props.snapshot,
            missingFields: props.missingFields,
          });
          if (error) throw new Error(error.message);
          setResult({ op, data });
        } else {
          const { data, error } = await actions.aiProposeIngredientImprovements({
            ingredient: props.snapshot,
            missingFields: props.missingFields,
          });
          if (error) throw new Error(error.message);
          setResult({ op, data });
        }
      } else if (op === "translate") {
        if (isRecipe && recipe) {
          const { data, error } = await actions.aiTranslateRecipe({
            recipe: props.snapshot,
            sourceLocale: recipe.locale,
            targetLocale: recipe.targetLocale,
          });
          if (error) throw new Error(error.message);
          setResult({ op, data });
        } else if (!isRecipe && ingredient) {
          const { data, error } = await actions.aiTranslateIngredient({
            ingredient: props.snapshot,
            sourceLocale: ingredient.locale,
            targetLocale: ingredient.targetLocale,
          });
          if (error) throw new Error(error.message);
          setResult({ op, data });
        }
      } else if (op === "pairings" && ingredient) {
        const { data, error } = await actions.aiProposeIngredientPairings({
          ingredient: props.snapshot,
          locale: ingredient.locale,
        });
        if (error) throw new Error(error.message);
        setResult({ op, data });
      }
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(null);
    }
  }

  function dismiss() {
    setResult(null);
  }

  const targetLocale = isRecipe
    ? (props as RecipePanelProps).targetLocale
    : (props as IngredientPanelProps).targetLocale;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Sparkles size={14} className="text-primary" />
          AI Assist
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
          {/* Action buttons */}
          <div className="space-y-1.5">
            {isRecipe && (
              <ActionButton
                icon={<Link2 size={12} />}
                label="Propose ingredient links"
                op="links"
                loading={loading}
                active={result?.op === "links"}
                onClick={() => run("links")}
              />
            )}
            {!isRecipe && (
              <ActionButton
                icon={<Link2 size={12} />}
                label="Propose pairings"
                op="pairings"
                loading={loading}
                active={result?.op === "pairings"}
                onClick={() => run("pairings")}
              />
            )}
            <ActionButton
              icon={<Tag size={12} />}
              label="Propose tags"
              op="tags"
              loading={loading}
              active={result?.op === "tags"}
              onClick={() => run("tags")}
            />
            <ActionButton
              icon={<Lightbulb size={12} />}
              label="Suggest improvements"
              op="improve"
              loading={loading}
              active={result?.op === "improve"}
              onClick={() => run("improve")}
            />
            <ActionButton
              icon={<Languages size={12} />}
              label={`Draft translation → ${targetLocale.toUpperCase()}`}
              op="translate"
              loading={loading}
              active={result?.op === "translate"}
              onClick={() => run("translate")}
            />
          </div>

          {/* Results */}
          {result && (
            <div className="border-t border-border pt-3 space-y-1">
              {result.op === "links" && recipe && (
                <>
                  <SectionHeader icon={<Link2 size={11} />} label="Ingredient links" />
                  <IngredientLinksResult
                    links={result.data as IngredientLinkProposal[]}
                    onApplyAll={() => {
                      recipe.onApplyIngredientLinks(result.data as IngredientLinkProposal[]);
                      dismiss();
                    }}
                    onApplyOne={(l) => {
                      recipe.onApplyIngredientLinks([l]);
                    }}
                    onDismiss={dismiss}
                  />
                </>
              )}

              {result.op === "pairings" && ingredient && (
                <>
                  <SectionHeader icon={<Link2 size={11} />} label="Pairings" />
                  <PairingsResult
                    pairings={result.data as PairingProposal[]}
                    onApplyAll={() => {
                      ingredient.onApplyPairings(result.data as PairingProposal[]);
                      dismiss();
                    }}
                    onDismiss={dismiss}
                  />
                </>
              )}

              {result.op === "tags" && (
                <>
                  <SectionHeader icon={<Tag size={11} />} label="Tags" />
                  <TagsResult
                    tags={(result.data as { tags: string[] }).tags}
                    onApplyAll={() => {
                      props.onApplyField("tags", (result.data as { tags: string[] }).tags);
                      dismiss();
                    }}
                    onApplyOne={(tag) => {
                      // add single tag — the form handles deduplication
                      const current = Array.isArray(props.snapshot["tags"])
                        ? (props.snapshot["tags"] as string[])
                        : [];
                      if (!current.includes(tag)) {
                        props.onApplyField("tags", [...current, tag]);
                      }
                    }}
                    onDismiss={dismiss}
                  />
                </>
              )}

              {result.op === "improve" && (
                <>
                  <SectionHeader icon={<Lightbulb size={11} />} label="Suggestions" />
                  <ImprovementsResult
                    fields={(result.data as { fields: ImprovementField[] }).fields}
                    onApplyOne={(field, value) => props.onApplyField(field, value)}
                    onDismiss={dismiss}
                  />
                </>
              )}

              {result.op === "translate" && (
                <>
                  <SectionHeader icon={<Languages size={11} />} label="Translation" />
                  <TranslationResult
                    fields={(result.data as { fields: Record<string, string> }).fields}
                    targetLocale={targetLocale}
                    onApplyAll={() => {
                      props.onApplyTranslation(
                        (result.data as { fields: Record<string, string> }).fields,
                      );
                      dismiss();
                    }}
                    onApplyOne={(field, value) => props.onApplyField(field, value)}
                    onDismiss={dismiss}
                  />
                </>
              )}

              {/* Dismiss all */}
              <button
                type="button"
                onClick={dismiss}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
              >
                <X size={11} />
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  op,
  loading,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  op: Op;
  loading: Op | null;
  active: boolean;
  onClick: () => void;
}) {
  const isLoading = loading === op;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading !== null}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors text-left",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        loading !== null && !isLoading && "opacity-50 cursor-not-allowed",
      )}
    >
      {isLoading ? <Loader2 size={12} className="animate-spin shrink-0" /> : icon}
      {label}
    </button>
  );
}
