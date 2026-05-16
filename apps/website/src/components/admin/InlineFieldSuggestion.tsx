import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useSuggestionFlowContext } from "./SuggestionFlowProvider";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { AcceptRejectButtons } from "@/components/ui/accept-reject-buttons";
import type { FieldSuggestion, PerFieldAccessor } from "@/hooks/use-ai-suggestions";

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
    <div className="flex items-start gap-2 rounded-md border p-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="break-words">{String(value ?? "")}</p>
        {summary && <p className="mt-0.5 text-xs text-stone-500">{summary}</p>}
      </div>
      {confidence && <ConfidenceBadge confidence={confidence} />}
      <AcceptRejectButtons onAccept={() => onApply(value)} onReject={onReject} />
    </div>
  ),
  array: ({ value, confidence, summary, onApply, onReject }) => {
    const tags = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="flex items-start gap-2 rounded-md border p-2 text-sm">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
              >
                {tag}
              </span>
            ))}
          </div>
          {summary && <p className="mt-1 text-xs text-stone-500">{summary}</p>}
        </div>
        {confidence && <ConfidenceBadge confidence={confidence} />}
        <AcceptRejectButtons onAccept={() => onApply(tags)} onReject={onReject} />
      </div>
    );
  },
  enum: ({ value, confidence, summary, onApply, onReject }) => (
    <div className="flex items-start gap-2 rounded-md border p-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{String(value ?? "")}</p>
        {summary && <p className="mt-0.5 text-xs text-stone-500">{summary}</p>}
      </div>
      {confidence && <ConfidenceBadge confidence={confidence} />}
      <AcceptRejectButtons onAccept={() => onApply(value)} onReject={onReject} />
    </div>
  ),
  "multi-enum": ({ value, confidence, summary, onApply, onReject }) => {
    const values = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="flex items-start gap-2 rounded-md border p-2 text-sm">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1">
            {values.map((v) => (
              <span
                key={v}
                className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
              >
                {v}
              </span>
            ))}
          </div>
          {summary && <p className="mt-1 text-xs text-stone-500">{summary}</p>}
        </div>
        {confidence && <ConfidenceBadge confidence={confidence} />}
        <AcceptRejectButtons onAccept={() => onApply(values)} onReject={onReject} />
      </div>
    );
  },
  date: ({ value, confidence, summary, onApply, onReject }) => {
    let formatted = String(value ?? "");
    try {
      formatted = new Date(formatted).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      // keep as-is
    }
    return (
      <div className="flex items-start gap-2 rounded-md border p-2 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{formatted}</p>
          {summary && <p className="mt-0.5 text-xs text-stone-500">{summary}</p>}
        </div>
        {confidence && <ConfidenceBadge confidence={confidence} />}
        <AcceptRejectButtons onAccept={() => onApply(value)} onReject={onReject} />
      </div>
    );
  },
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

// ── InlineFieldSuggestion ──────────────────────────────────────────────────────

export interface InlineFieldSuggestionProps {
  fieldPath: string;
  currentValue: unknown;
  onApply: (value: unknown) => void;
  renderers?: RenderersMap;
  /** Renderer kind key. Inferred from suggestion value type if omitted. */
  kind?: string;
  className?: string;
}

export function InlineFieldSuggestion({
  fieldPath,
  currentValue: _currentValue,
  onApply,
  renderers = defaultRenderers,
  kind,
  className,
}: InlineFieldSuggestionProps) {
  const flow = useSuggestionFlowContext();
  const accessor = flow.forField(fieldPath);
  const suggestion = accessor.suggestion;

  const suggestionKey =
    suggestion === undefined
      ? null
      : suggestion.kind === "single"
        ? suggestion.hash
        : suggestion.traceId;

  useEffect(() => {
    if (suggestionKey !== null) {
      flow.forField(fieldPath).markViewed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldPath, suggestionKey]);

  if (!suggestion) return null;

  if (suggestion.kind === "choice") {
    return (
      <ChoiceSuggestionBlock
        suggestion={suggestion}
        onApply={onApply}
        accessor={accessor}
        className={cn("mt-1.5", className)}
      />
    );
  }

  const resolvedKind = kind ?? inferKind(suggestion.value);
  const renderer = renderers[resolvedKind] ?? renderers.text;

  if (!renderer) return null;

  return (
    <div className={cn("mt-1.5", className)}>
      {renderer({
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
      })}
    </div>
  );
}
