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
  ThumbsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import CapabilityLabel from "./CapabilityLabel.tsx";
import {
  hashSuggestion,
  filterSuggestions,
  recordAiEvent,
  isAllowedAutoApply,
  assertAutoApplyAllowed,
} from "content-ai";
import type { AiEvent } from "content-ai";

// ── Raw proposal types (from API) ──────────────────────────────────────────────

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

// ── Enriched internal types (with hash + summary for event tracking) ───────────

interface EnrichedLink extends IngredientLinkProposal {
  field: "ingredientLinks";
  hash: string;
  summary: string;
}

interface EnrichedTag {
  tag: string;
  field: "tags";
  hash: string;
  summary: string;
}

interface EnrichedImprovement extends ImprovementField {
  hash: string;
  summary: string;
}

interface EnrichedTranslationField {
  field: string;
  value: string;
  hash: string;
  summary: string;
}

interface EnrichedPairing extends PairingProposal {
  field: "pairings";
  hash: string;
  summary: string;
}

// ── Enrichment helpers ─────────────────────────────────────────────────────────

function enrichLink(l: IngredientLinkProposal): EnrichedLink {
  return {
    ...l,
    field: "ingredientLinks",
    hash: hashSuggestion({ pattern: l.pattern, slug: l.slug }),
    summary: `${l.pattern} → ${l.slug}`,
  };
}

function enrichTag(tag: string): EnrichedTag {
  return { tag, field: "tags", hash: hashSuggestion(tag), summary: tag };
}

function enrichImprovement(f: ImprovementField): EnrichedImprovement {
  return { ...f, hash: hashSuggestion(f.suggestion), summary: f.suggestion.slice(0, 120) };
}

function enrichTranslationField(field: string, value: string): EnrichedTranslationField {
  return { field, value, hash: hashSuggestion(value), summary: value.slice(0, 120) };
}

function enrichPairing(p: PairingProposal): EnrichedPairing {
  return {
    ...p,
    field: "pairings",
    hash: hashSuggestion({ slug: p.slug, note: p.note ?? "" }),
    summary: p.slug,
  };
}

// ── Result state ───────────────────────────────────────────────────────────────

type ResultState =
  | { op: "links"; items: EnrichedLink[] }
  | { op: "tags"; items: EnrichedTag[] }
  | { op: "improve"; items: EnrichedImprovement[] }
  | { op: "translate"; items: EnrichedTranslationField[] }
  | { op: "pairings"; items: EnrichedPairing[] };

// ── Panel props ───────────────────────────────────────────────────────────────

interface RecipePanelProps {
  mode: "recipe";
  snapshot: Record<string, unknown>;
  missingFields: string[];
  recipeIngredients: string[];
  locale: "en" | "de";
  targetLocale: "en" | "de";
  aiEvents?: AiEvent[];
  onRecordEvent?: (updatedEvents: AiEvent[]) => void;
  model?: string;
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
  aiEvents?: AiEvent[];
  onRecordEvent?: (updatedEvents: AiEvent[]) => void;
  model?: string;
  onApplyPairings: (pairings: PairingProposal[]) => void;
  onApplyField: (field: string, value: unknown) => void;
  onApplyTranslation: (fields: Record<string, string>) => void;
}

type AiAssistPanelProps = RecipePanelProps | IngredientPanelProps;

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
      {icon}
      {label}
    </div>
  );
}

function AcceptRejectButtons({
  onAccept,
  onReject,
}: {
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex gap-1 shrink-0">
      <button
        type="button"
        onClick={onAccept}
        className="text-emerald-600 hover:opacity-70"
        title="Accept"
      >
        <Check size={12} />
      </button>
      <button
        type="button"
        onClick={onReject}
        className="text-destructive hover:opacity-70"
        title="Reject"
      >
        <ThumbsDown size={12} />
      </button>
    </div>
  );
}

function IngredientLinksResult({
  links,
  onAcceptAll,
  onAcceptOne,
  onRejectOne,
  onDismiss,
}: {
  links: EnrichedLink[];
  onAcceptAll: () => void;
  onAcceptOne: (link: EnrichedLink) => void;
  onRejectOne: (link: EnrichedLink) => void;
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
                {
                  high: "text-emerald-600",
                  medium: "text-amber-600",
                  low: "text-muted-foreground",
                }[l.confidence] ?? "text-muted-foreground",
              )}
            >
              {l.confidence}
            </Badge>
            <AcceptRejectButtons onAccept={() => onAcceptOne(l)} onReject={() => onRejectOne(l)} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onAcceptAll}>
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
  onAcceptAll,
  onAcceptOne,
  onRejectOne,
  onDismiss,
}: {
  tags: EnrichedTag[];
  onAcceptAll: () => void;
  onAcceptOne: (tag: EnrichedTag) => void;
  onRejectOne: (tag: EnrichedTag) => void;
  onDismiss: () => void;
}) {
  if (!tags.length) return <p className="text-xs text-muted-foreground">No tags suggested.</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <div key={t.tag} className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onAcceptOne(t)}
              className="text-xs bg-muted hover:bg-accent rounded-l px-2 py-0.5 flex items-center gap-1"
            >
              {t.tag}
              <Check size={10} className="text-emerald-500" />
            </button>
            <button
              type="button"
              onClick={() => onRejectOne(t)}
              className="text-xs bg-muted hover:bg-accent rounded-r px-1 py-0.5"
              title="Reject"
            >
              <ThumbsDown size={10} className="text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onAcceptAll}>
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
  onAcceptOne,
  onRejectOne,
  onDismiss,
}: {
  fields: EnrichedImprovement[];
  onAcceptOne: (item: EnrichedImprovement) => void;
  onRejectOne: (item: EnrichedImprovement) => void;
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
            <AcceptRejectButtons onAccept={() => onAcceptOne(f)} onReject={() => onRejectOne(f)} />
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
  onAcceptAll,
  onAcceptOne,
  onRejectOne,
  onDismiss,
}: {
  fields: EnrichedTranslationField[];
  targetLocale: string;
  onAcceptAll: () => void;
  onAcceptOne: (item: EnrichedTranslationField) => void;
  onRejectOne: (item: EnrichedTranslationField) => void;
  onDismiss: () => void;
}) {
  if (!fields.length) return <p className="text-xs text-muted-foreground">Nothing to translate.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Draft translation → {targetLocale}</p>
      {fields.map((item) => (
        <div
          key={item.field}
          className="text-xs border border-border rounded p-2 flex items-start gap-2"
        >
          <div className="flex-1">
            <span className="font-medium">{item.field}</span>
            <p className="text-muted-foreground mt-0.5 line-clamp-2">{item.value}</p>
          </div>
          <AcceptRejectButtons
            onAccept={() => onAcceptOne(item)}
            onReject={() => onRejectOne(item)}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onAcceptAll}>
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
  onAcceptAll,
  onAcceptOne,
  onRejectOne,
  onDismiss,
}: {
  pairings: EnrichedPairing[];
  onAcceptAll: () => void;
  onAcceptOne: (p: EnrichedPairing) => void;
  onRejectOne: (p: EnrichedPairing) => void;
  onDismiss: () => void;
}) {
  if (!pairings.length)
    return <p className="text-xs text-muted-foreground">No pairings suggested.</p>;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {pairings.map((p, i) => (
          <div key={i} className="text-xs flex items-center gap-2">
            <code className="font-mono bg-muted px-1 rounded flex-1">{p.slug}</code>
            {p.note && <span className="text-muted-foreground truncate">{p.note}</span>}
            <AcceptRejectButtons onAccept={() => onAcceptOne(p)} onReject={() => onRejectOne(p)} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onAcceptAll}>
          Apply all
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// ── Operation runners ─────────────────────────────────────────────────────────

async function runLinks(
  recipe: RecipePanelProps,
  aiEvents: AiEvent[],
): Promise<{ result: ResultState | null; autoApplied: EnrichedLink[] }> {
  const { data, error } = await actions.aiProposeIngredientLinks({
    recipeIngredients: recipe.recipeIngredients,
    locale: recipe.locale,
  });
  if (error) throw new Error(error.message);
  const enriched = (data as IngredientLinkProposal[]).map(enrichLink);
  const filtered = filterSuggestions(aiEvents, enriched);

  const toAutoApply: EnrichedLink[] = [];
  const toSuggest: EnrichedLink[] = [];
  for (const l of filtered) {
    (isAllowedAutoApply("ingredient-link", l.confidence, "editor") ? toAutoApply : toSuggest).push(
      l,
    );
  }
  return {
    result: toSuggest.length > 0 ? { op: "links", items: toSuggest } : null,
    autoApplied: toAutoApply,
  };
}

async function runTags(
  snapshot: Record<string, unknown>,
  aiEvents: AiEvent[],
): Promise<ResultState> {
  const { data, error } = await actions.aiProposeTags({ recipe: snapshot });
  if (error) throw new Error(error.message);
  const enriched = ((data as { tags: string[] }).tags ?? []).map(enrichTag);
  return { op: "tags", items: filterSuggestions(aiEvents, enriched) };
}

async function runImprove(
  props: AiAssistPanelProps,
  isRecipe: boolean,
  aiEvents: AiEvent[],
): Promise<ResultState> {
  const { data, error } = isRecipe
    ? await actions.aiProposeRecipeImprovements({
        recipe: props.snapshot,
        missingFields: props.missingFields,
      })
    : await actions.aiProposeIngredientImprovements({
        ingredient: props.snapshot,
        missingFields: props.missingFields,
      });
  if (error) throw new Error(error.message);
  const enriched = (data as { fields: ImprovementField[] }).fields.map(enrichImprovement);
  return { op: "improve", items: filterSuggestions(aiEvents, enriched) };
}

async function runTranslate(
  props: AiAssistPanelProps,
  isRecipe: boolean,
  aiEvents: AiEvent[],
): Promise<ResultState> {
  const { data, error } = isRecipe
    ? await actions.aiTranslateRecipe({
        recipe: props.snapshot,
        sourceLocale: props.locale,
        targetLocale: props.targetLocale,
      })
    : await actions.aiTranslateIngredient({
        ingredient: props.snapshot,
        sourceLocale: props.locale,
        targetLocale: props.targetLocale,
      });
  if (error) throw new Error(error.message);
  const raw = data as { fields: Record<string, string> };
  const enriched = Object.entries(raw.fields ?? {}).map(([f, v]) => enrichTranslationField(f, v));
  return { op: "translate", items: filterSuggestions(aiEvents, enriched) };
}

async function runPairings(
  ingredient: IngredientPanelProps,
  aiEvents: AiEvent[],
): Promise<ResultState> {
  const { data, error } = await actions.aiProposeIngredientPairings({
    ingredient: ingredient.snapshot,
    locale: ingredient.locale,
  });
  if (error) throw new Error(error.message);
  const enriched = (data as PairingProposal[]).map(enrichPairing);
  return { op: "pairings", items: filterSuggestions(aiEvents, enriched) };
}

// ── Results sub-component ─────────────────────────────────────────────────────

interface ResultsProps {
  result: ResultState;
  props: AiAssistPanelProps;
  recipe: RecipePanelProps | null;
  ingredient: IngredientPanelProps | null;
  targetLocale: string;
  onAccept: (
    item: { field: string; hash: string; summary: string },
    applyFn: () => void,
    confidence?: "high" | "medium" | "low",
  ) => void;
  onReject: (item: { field: string; hash: string; summary: string }) => void;
  onAcceptAll: (
    items: ReadonlyArray<{
      field: string;
      hash: string;
      summary: string;
      confidence?: "high" | "medium" | "low";
    }>,
    applyFn: () => void,
  ) => void;
  onDismiss: () => void;
}

function AiAssistResults({
  result,
  props,
  recipe,
  ingredient,
  targetLocale,
  onAccept,
  onReject,
  onAcceptAll,
  onDismiss,
}: ResultsProps) {
  return (
    <div className="border-t border-border pt-3 space-y-1">
      {result.op === "links" && recipe && (
        <>
          <SectionHeader icon={<Link2 size={11} />} label="Ingredient links" />
          <IngredientLinksResult
            links={result.items}
            onAcceptAll={() =>
              onAcceptAll(result.items, () => recipe.onApplyIngredientLinks(result.items))
            }
            onAcceptOne={(l) => onAccept(l, () => recipe.onApplyIngredientLinks([l]), l.confidence)}
            onRejectOne={onReject}
            onDismiss={onDismiss}
          />
        </>
      )}

      {result.op === "pairings" && ingredient && (
        <>
          <SectionHeader icon={<Link2 size={11} />} label="Pairings" />
          <PairingsResult
            pairings={result.items}
            onAcceptAll={() =>
              onAcceptAll(result.items, () => ingredient.onApplyPairings(result.items))
            }
            onAcceptOne={(p) => onAccept(p, () => ingredient.onApplyPairings([p]))}
            onRejectOne={onReject}
            onDismiss={onDismiss}
          />
        </>
      )}

      {result.op === "tags" && (
        <>
          <SectionHeader icon={<Tag size={11} />} label="Tags" />
          <TagsResult
            tags={result.items}
            onAcceptAll={() =>
              onAcceptAll(result.items, () =>
                props.onApplyField(
                  "tags",
                  result.items.map((t) => t.tag),
                ),
              )
            }
            onAcceptOne={(t) => {
              const current = Array.isArray(props.snapshot["tags"])
                ? (props.snapshot["tags"] as string[])
                : [];
              onAccept(t, () => {
                if (!current.includes(t.tag)) {
                  props.onApplyField("tags", [...current, t.tag]);
                }
              });
            }}
            onRejectOne={onReject}
            onDismiss={onDismiss}
          />
        </>
      )}

      {result.op === "improve" && (
        <>
          <SectionHeader icon={<Lightbulb size={11} />} label="Suggestions" />
          <ImprovementsResult
            fields={result.items}
            onAcceptOne={(f) => onAccept(f, () => props.onApplyField(f.field, f.suggestion))}
            onRejectOne={onReject}
            onDismiss={onDismiss}
          />
        </>
      )}

      {result.op === "translate" && (
        <>
          <SectionHeader icon={<Languages size={11} />} label="Translation" />
          <TranslationResult
            fields={result.items}
            targetLocale={targetLocale}
            onAcceptAll={() =>
              onAcceptAll(result.items, () =>
                props.onApplyTranslation(
                  Object.fromEntries(result.items.map((item) => [item.field, item.value])),
                ),
              )
            }
            onAcceptOne={(item) => onAccept(item, () => props.onApplyField(item.field, item.value))}
            onRejectOne={onReject}
            onDismiss={onDismiss}
          />
        </>
      )}

      <button
        type="button"
        onClick={onDismiss}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
      >
        <X size={11} />
        Clear
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Op = "links" | "tags" | "improve" | "translate" | "pairings";

function opToAction(op: Op, isRecipe: boolean): string {
  switch (op) {
    case "links":
      return "aiProposeIngredientLinks";
    case "tags":
      return "aiProposeTags";
    case "improve":
      return isRecipe ? "aiProposeRecipeImprovements" : "aiProposeIngredientImprovements";
    case "translate":
      return isRecipe ? "aiTranslateRecipe" : "aiTranslateIngredient";
    case "pairings":
      return "aiProposeIngredientPairings";
  }
}

export default function AiAssistPanel(props: AiAssistPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<Op | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  const isRecipe = props.mode === "recipe";
  const recipe = isRecipe ? (props as RecipePanelProps) : null;
  const ingredient = !isRecipe ? (props as IngredientPanelProps) : null;
  const aiEvents = props.aiEvents ?? [];
  const model = props.model ?? "ai-assist";
  const targetLocale = props.targetLocale;

  function emitEvent(params: Omit<AiEvent, "at">) {
    const updated = recordAiEvent(aiEvents, params);
    props.onRecordEvent?.(updated);
  }

  function removeFromResult(field: string, hash: string) {
    setResult((prev) => {
      if (!prev) return null;
      const filtered = (prev.items as Array<{ field: string; hash: string }>).filter(
        (item) => !(item.field === field && item.hash === hash),
      );
      if (!filtered.length) return null;
      return { ...prev, items: filtered } as ResultState;
    });
  }

  function handleAccept(
    item: { field: string; hash: string; summary: string },
    applyFn: () => void,
    confidence?: "high" | "medium" | "low",
  ) {
    applyFn();
    emitEvent({
      type: "accepted",
      field: item.field,
      suggestion: { hash: item.hash, summary: item.summary },
      model,
      ...(confidence ? { confidence } : {}),
    });
    removeFromResult(item.field, item.hash);
  }

  function handleReject(item: { field: string; hash: string; summary: string }) {
    emitEvent({
      type: "rejected",
      field: item.field,
      suggestion: { hash: item.hash, summary: item.summary },
      model,
    });
    removeFromResult(item.field, item.hash);
  }

  function acceptAllAndDismiss(
    items: ReadonlyArray<{
      field: string;
      hash: string;
      summary: string;
      confidence?: "high" | "medium" | "low";
    }>,
    applyFn: () => void,
  ) {
    applyFn();
    for (const item of items) {
      emitEvent({
        type: "accepted",
        field: item.field,
        suggestion: { hash: item.hash, summary: item.summary },
        model,
        ...(item.confidence ? { confidence: item.confidence } : {}),
      });
    }
    dismiss();
  }

  async function run(op: Op) {
    setLoading(op);
    setResult(null);
    try {
      let next: ResultState | null = null;
      if (op === "links" && recipe) {
        const { result: r, autoApplied } = await runLinks(recipe, aiEvents);
        for (const link of autoApplied) {
          assertAutoApplyAllowed("ingredient-link", link.confidence, "editor");
          recipe.onApplyIngredientLinks([link]);
          emitEvent({
            type: "auto-applied",
            field: link.field,
            suggestion: { hash: link.hash, summary: link.summary },
            model,
            confidence: link.confidence,
          });
        }
        next = r;
      } else if (op === "tags") {
        next = await runTags(props.snapshot, aiEvents);
      } else if (op === "improve") {
        next = await runImprove(props, isRecipe, aiEvents);
      } else if (op === "translate") {
        next = await runTranslate(props, isRecipe, aiEvents);
      } else if (op === "pairings" && ingredient) {
        next = await runPairings(ingredient, aiEvents);
      }
      if (next) setResult(next);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(null);
    }
  }

  function dismiss() {
    setResult(null);
  }

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

          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={11} className="animate-spin shrink-0" />
              <CapabilityLabel action={opToAction(loading, isRecipe)} />
            </div>
          )}

          {result && (
            <AiAssistResults
              result={result}
              props={props}
              recipe={recipe}
              ingredient={ingredient}
              targetLocale={targetLocale}
              onAccept={handleAccept}
              onReject={handleReject}
              onAcceptAll={acceptAllAndDismiss}
              onDismiss={dismiss}
            />
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
