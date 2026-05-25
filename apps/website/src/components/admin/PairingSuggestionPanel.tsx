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
  ThumbsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import CapabilityLabel from "./CapabilityLabel.tsx";
import { hashSuggestion, filterSuggestions } from "@pixelmord/content-ai-core";
import type { AiEvent } from "@pixelmord/content-ai-core";

// ── Raw proposal types (from API) ──────────────────────────────────────────────

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

interface EnrichedPairing extends PairingProposal {
  field: "pairings";
  hash: string;
  summary: string;
}

// ── Enrichment helpers ─────────────────────────────────────────────────────────

function enrichTag(tag: string): EnrichedTag {
  return { tag, field: "tags", hash: hashSuggestion(tag), summary: tag };
}

function enrichImprovement(f: ImprovementField): EnrichedImprovement {
  return { ...f, hash: hashSuggestion(f.suggestion), summary: f.suggestion.slice(0, 120) };
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
  | { op: "tags"; items: EnrichedTag[] }
  | { op: "improve"; items: EnrichedImprovement[] }
  | { op: "pairings"; items: EnrichedPairing[] };

// ── Panel props ───────────────────────────────────────────────────────────────

interface EntityRef {
  collection: string;
  locale?: string;
  slug: string;
}

export interface PairingSuggestionPanelProps {
  snapshot: Record<string, unknown>;
  missingFields: string[];
  locale: "en" | "de";
  aiEvents?: AiEvent[];
  /** When provided, each accepted/rejected event is persisted immediately via aiRecordEvent. */
  entityRef?: EntityRef;
  onRecordEvent?: (updatedEvents: AiEvent[]) => void;
  model?: string;
  onApplyPairings: (pairings: PairingProposal[]) => void;
  onApplyField: (field: string, value: unknown) => void;
}

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
  snapshot: Record<string, unknown>,
  missingFields: string[],
  aiEvents: AiEvent[],
): Promise<ResultState> {
  const { data, error } = await actions.aiProposeIngredientImprovements({
    ingredient: snapshot,
    missingFields,
  });
  if (error) throw new Error(error.message);
  const enriched = (data as { fields: ImprovementField[] }).fields.map(enrichImprovement);
  return { op: "improve", items: filterSuggestions(aiEvents, enriched) };
}

async function runPairings(
  snapshot: Record<string, unknown>,
  locale: "en" | "de",
  aiEvents: AiEvent[],
): Promise<ResultState> {
  const { data, error } = await actions.aiProposeIngredientPairings({
    ingredient: snapshot,
    locale,
  });
  if (error) throw new Error(error.message);
  const enriched = (data as PairingProposal[]).map(enrichPairing);
  return { op: "pairings", items: filterSuggestions(aiEvents, enriched) };
}

// ── Results sub-component ─────────────────────────────────────────────────────

interface ResultsProps {
  result: ResultState;
  props: PairingSuggestionPanelProps;
  onAccept: (item: { field: string; hash: string; summary: string }, applyFn: () => void) => void;
  onReject: (item: { field: string; hash: string; summary: string }) => void;
  onAcceptAll: (
    items: ReadonlyArray<{ field: string; hash: string; summary: string }>,
    applyFn: () => void,
  ) => void;
  onDismiss: () => void;
}

function PairingSuggestionResults({
  result,
  props,
  onAccept,
  onReject,
  onAcceptAll,
  onDismiss,
}: ResultsProps) {
  return (
    <div className="border-t border-border pt-3 space-y-1">
      {result.op === "pairings" && (
        <>
          <SectionHeader icon={<Link2 size={11} />} label="Pairings" />
          <PairingsResult
            pairings={result.items}
            onAcceptAll={() => onAcceptAll(result.items, () => props.onApplyPairings(result.items))}
            onAcceptOne={(p) => onAccept(p, () => props.onApplyPairings([p]))}
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

type Op = "tags" | "improve" | "pairings";

function opToAction(op: Op): string {
  switch (op) {
    case "tags":
      return "aiProposeTags";
    case "improve":
      return "aiProposeIngredientImprovements";
    case "pairings":
      return "aiProposeIngredientPairings";
  }
}

export default function PairingSuggestionPanel(props: PairingSuggestionPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<Op | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  const aiEvents = props.aiEvents ?? [];
  const model = props.model ?? "ai-assist";
  const entityRef = props.entityRef;

  function emitEvent(params: Omit<AiEvent, "at" | "id">) {
    const at = new Date().toISOString();
    const id = crypto.randomUUID();
    const event: AiEvent = { ...params, at, id };
    if (entityRef) {
      void actions.aiRecordEvent({ ...entityRef, event: event as Record<string, unknown> });
    }
    const updated = [...aiEvents, event];
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
  ) {
    applyFn();
    emitEvent({
      type: "accepted",
      field: item.field,
      suggestion: { hash: item.hash, summary: item.summary },
      model,
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
    items: ReadonlyArray<{ field: string; hash: string; summary: string }>,
    applyFn: () => void,
  ) {
    applyFn();
    for (const item of items) {
      emitEvent({
        type: "accepted",
        field: item.field,
        suggestion: { hash: item.hash, summary: item.summary },
        model,
      });
    }
    dismiss();
  }

  async function run(op: Op) {
    setLoading(op);
    setResult(null);
    try {
      let next: ResultState | null = null;
      if (op === "tags") {
        next = await runTags(props.snapshot, aiEvents);
      } else if (op === "improve") {
        next = await runImprove(props.snapshot, props.missingFields, aiEvents);
      } else if (op === "pairings") {
        next = await runPairings(props.snapshot, props.locale, aiEvents);
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
            <ActionButton
              icon={<Link2 size={12} />}
              label="Propose pairings"
              op="pairings"
              loading={loading}
              active={result?.op === "pairings"}
              onClick={() => run("pairings")}
            />
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
          </div>

          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={11} className="animate-spin shrink-0" />
              <CapabilityLabel action={opToAction(loading)} />
            </div>
          )}

          {result && (
            <PairingSuggestionResults
              result={result}
              props={props}
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
