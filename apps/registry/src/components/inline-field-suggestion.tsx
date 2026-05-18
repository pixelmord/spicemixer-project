import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { useSuggestionFlowContext } from "./suggestion-flow-provider";
import { ConfidenceBadge } from "./confidence-badge";
import { AcceptRejectButtons } from "./accept-reject-buttons";
import { TextSuggestionRow } from "./text-suggestion-row";
import { TagsSuggestionRow } from "./tags-suggestion-row";
import { EnumSuggestionRow } from "./enum-suggestion-row";
import { MultiEnumSuggestionRow } from "./multi-enum-suggestion-row";
import { DateSuggestionRow } from "./date-suggestion-row";
import type { FieldSuggestion, PerFieldAccessor } from "./use-ai-suggestions";

// ── Renderer types ─────────────────────────────────────────────────────────────

export interface RendererProps {
  value: unknown;
  confidence?: "high" | "medium" | "low";
  summary?: string;
  onApply: (value: unknown) => void;
  onReject: () => void;
}

export type SuggestionRenderer = (props: RendererProps) => React.ReactNode;
export type RenderersMap = Record<string, SuggestionRenderer>;

// ── Default renderers ──────────────────────────────────────────────────────────

export const defaultRenderers: RenderersMap = {
  text: ({ value, confidence, summary, onApply, onReject }) => (
    <TextSuggestionRow
      value={String(value ?? "")}
      confidence={confidence}
      summary={summary}
      onApply={(v) => onApply(v)}
      onReject={onReject}
    />
  ),
  array: ({ value, confidence, summary, onApply, onReject }) => (
    <TagsSuggestionRow
      tags={Array.isArray(value) ? value.map(String) : []}
      confidence={confidence}
      summary={summary}
      onApply={(tags) => onApply(tags)}
      onReject={onReject}
    />
  ),
  enum: ({ value, confidence, summary, onApply, onReject }) => (
    <EnumSuggestionRow
      value={String(value ?? "")}
      options={[]}
      confidence={confidence}
      summary={summary}
      onApply={(v) => onApply(v)}
      onReject={onReject}
    />
  ),
  "multi-enum": ({ value, confidence, summary, onApply, onReject }) => (
    <MultiEnumSuggestionRow
      values={Array.isArray(value) ? value.map(String) : []}
      options={[]}
      confidence={confidence}
      summary={summary}
      onApply={(vals) => onApply(vals)}
      onReject={onReject}
    />
  ),
  date: ({ value, confidence, summary, onApply, onReject }) => (
    <DateSuggestionRow
      value={String(value ?? "")}
      confidence={confidence}
      summary={summary}
      onApply={(v) => onApply(v)}
      onReject={onReject}
    />
  ),
};

// ── Choice variant ─────────────────────────────────────────────────────────────

type ChoiceFieldSuggestion = Extract<FieldSuggestion, { kind: "choice" }>;

function ChoiceSuggestionBlock({
  suggestion,
  onApply,
  accessor,
  className,
}: {
  suggestion: ChoiceFieldSuggestion;
  onApply: (value: unknown) => void;
  accessor: PerFieldAccessor;
  className?: string;
}) {
  const isMulti = typeof suggestion.choose !== "number";
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!isMulti) {
    return (
      <div className={cn("space-y-1 rounded-md border p-2 text-sm", className)}>
        <p className="mb-1 text-xs text-stone-500">Choose one:</p>
        {suggestion.candidates.map((candidate) => (
          <div key={candidate.hash} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-words">{String(candidate.value)}</span>
            {candidate.confidence && <ConfidenceBadge confidence={candidate.confidence} />}
            <AcceptRejectButtons
              onAccept={() => {
                onApply(candidate.value);
                accessor.recordAccept(candidate.hash, candidate.value);
              }}
              onReject={() => accessor.recordReject(candidate.hash)}
            />
          </div>
        ))}
      </div>
    );
  }

  const { min, max } =
    typeof suggestion.choose === "object" ? suggestion.choose : { min: 1, max: 1 };
  return (
    <div className={cn("space-y-1 rounded-md border p-2 text-sm", className)}>
      <p className="mb-1 text-xs text-stone-500">
        Choose {min}–{max}:
      </p>
      {suggestion.candidates.map((candidate) => (
        <label key={candidate.hash} className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={selected.has(candidate.hash)}
            onChange={(e) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(candidate.hash);
                else next.delete(candidate.hash);
                return next;
              });
            }}
          />
          <span className="min-w-0 flex-1 break-words">{String(candidate.value)}</span>
          {candidate.confidence && <ConfidenceBadge confidence={candidate.confidence} />}
        </label>
      ))}
      <div className="flex gap-1 pt-1">
        <button
          type="button"
          disabled={selected.size < min}
          onClick={() => {
            const chosen = suggestion.candidates.filter((c) => selected.has(c.hash));
            onApply(chosen.map((c) => c.value));
            for (const c of chosen) {
              accessor.recordAccept(c.hash, c.value);
            }
          }}
          className="inline-flex items-center rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Apply selected
        </button>
        <button
          type="button"
          onClick={() => accessor.recordReject()}
          className="inline-flex items-center rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
        >
          Reject all
        </button>
      </div>
    </div>
  );
}

function inferKind(value: unknown): string {
  if (Array.isArray(value)) return "array";
  return "text";
}

// ── RetranslateButton ──────────────────────────────────────────────────────────

function RetranslateButton({
  sourceLocale,
  isStale,
  onRetranslate,
}: {
  sourceLocale: string;
  isStale: boolean;
  onRetranslate: () => void;
}) {
  return (
    <button
      type="button"
      data-stale={isStale ? "true" : undefined}
      onClick={onRetranslate}
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs",
        isStale
          ? "bg-amber-100 font-medium text-amber-800 hover:bg-amber-200"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      Retranslate from {sourceLocale}
    </button>
  );
}

// ── InlineFieldSuggestion ──────────────────────────────────────────────────────

export interface InlineFieldSuggestionProps {
  fieldPath: string;
  currentValue: unknown;
  onApply: (value: unknown) => void;
  renderers?: RenderersMap;
  /** Renderer kind key. Inferred from suggestion value type if omitted. */
  kind?: string;
  className?: string;
  /** Read-only rendering of the source-locale value for translation flows */
  sourceSlot?: React.ReactNode;
}

export function InlineFieldSuggestion({
  fieldPath,
  onApply,
  renderers = defaultRenderers,
  kind,
  className,
  sourceSlot,
}: InlineFieldSuggestionProps) {
  const flow = useSuggestionFlowContext();
  const accessor = flow.forField(fieldPath);
  const suggestion = accessor.suggestion;

  let suggestionKey: string | null = null;
  if (suggestion?.kind === "single") suggestionKey = suggestion.hash;
  else if (suggestion) suggestionKey = suggestion.traceId;

  useEffect(() => {
    if (suggestionKey !== null) {
      // Safe: accessor.markViewed only calls a stable set-state setter
      flow.forField(fieldPath).markViewed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldPath, suggestionKey]);

  const showRetranslate =
    accessor.sourceLocale !== undefined &&
    accessor.translationMode !== undefined &&
    accessor.translationMode !== "copy" &&
    accessor.translationMode !== "skip";

  const retranslateBlock = showRetranslate ? (
    <div className="mt-1">
      <RetranslateButton
        sourceLocale={accessor.sourceLocale!}
        isStale={accessor.isStale}
        onRetranslate={() => void accessor.retranslate()}
      />
    </div>
  ) : null;

  if (!suggestion) {
    if (!showRetranslate) return null;
    return (
      <div className={cn("mt-1.5", className)}>
        <RetranslateButton
          sourceLocale={accessor.sourceLocale!}
          isStale={accessor.isStale}
          onRetranslate={() => void accessor.retranslate()}
        />
      </div>
    );
  }

  if (suggestion.kind === "choice") {
    return (
      <div className={cn("mt-1.5", className)}>
        {sourceSlot && (
          <div className="mb-1.5 rounded-md border border-dashed bg-muted/40 p-2 text-xs text-muted-foreground">
            {sourceSlot}
          </div>
        )}
        <ChoiceSuggestionBlock suggestion={suggestion} onApply={onApply} accessor={accessor} />
        {retranslateBlock}
      </div>
    );
  }

  const resolvedKind = kind ?? inferKind(suggestion.value);
  const renderer = renderers[resolvedKind] ?? renderers.text;

  if (!renderer) return null;

  const suggestionContent = renderer({
    value: suggestion.value,
    confidence: suggestion.confidence,
    summary: suggestion.summary,
    onApply: (v) => {
      onApply(v);
      accessor.recordAccept(suggestion.hash, v);
    },
    onReject: () => {
      accessor.recordReject(suggestion.hash);
    },
  });

  if (sourceSlot) {
    return (
      <div className={cn("mt-1.5 grid grid-cols-[1fr_1fr_2fr] gap-2", className)}>
        <div className="rounded-md border border-dashed bg-muted/40 p-2 text-xs text-muted-foreground">
          {sourceSlot}
        </div>
        <div className="text-xs text-muted-foreground" />
        <div>
          {suggestionContent}
          {retranslateBlock}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-1.5", className)}>
      {suggestionContent}
      {retranslateBlock}
    </div>
  );
}
