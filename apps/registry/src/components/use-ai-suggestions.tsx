import { useState, useCallback } from "react";

// ── Local types (compatible with @pixelmord/content-ai-core) ─────────────────

type FieldPath = string;
type Confidence = "high" | "medium" | "low";
type WritePolicy = "preserve" | "replace" | "fill-if-empty" | "merge-instructions";

export type FieldSuggestion<T = unknown> =
  | {
      kind: "single";
      value: T;
      confidence: Confidence;
      summary: string;
      hash: string;
      traceId: string;
    }
  | {
      kind: "choice";
      candidates: Array<{ value: T; summary: string; hash: string; confidence?: Confidence }>;
      choose: 1 | { min: number; max: number };
      traceId: string;
    };

export interface AppliedSuggestion {
  value: unknown;
  hash: string;
  summary: string;
  confidence: Confidence;
}

export interface TraceSummary {
  traceId: string;
  model: string;
  runtimeMs: number;
  preset?: string;
  userPrompt?: string;
  confidence?: Confidence;
}

export interface AiEvent {
  type: "auto-applied" | "accepted" | "rejected" | "ingested";
  field?: string;
  suggestion: { hash: string; summary: string };
  at: string;
  model: string;
  confidence?: Confidence;
  reason?: string;
  traceId?: string;
}

export interface EntityRef {
  kind: string;
  id: string;
}

export interface AiEventLog {
  read(ref: EntityRef): Promise<AiEvent[]>;
  append(ref: EntityRef, event: AiEvent): Promise<void>;
}

export interface Origin {
  surface: string;
  action: string;
  entityKind?: string;
  entityRef?: string;
  field?: string;
  userInitiated: boolean;
  runId: string;
  parentRunId?: string;
  triggeredBy: "editor" | "system";
  sourceUrl?: string;
  sourceHash?: string;
}

export interface AiPreset {
  id: string;
  label: string;
  description?: string;
}

export interface AiContract {
  presets: AiPreset[];
  fields: Record<string, { writePolicy?: WritePolicy }>;
}

export interface RunParams {
  currentData?: unknown;
  preset?: string;
  userPrompt?: string;
  writePolicy?: WritePolicy;
  entityRef: EntityRef;
  origin: Origin;
}

export interface RunResult {
  suggestions: Record<FieldPath, FieldSuggestion>;
  autoApplied: Record<FieldPath, AppliedSuggestion>;
  traces: Record<FieldPath, TraceSummary>;
}

export interface PerFieldAccessor {
  suggestion: FieldSuggestion | undefined;
  autoApplied: AppliedSuggestion | undefined;
  trace: TraceSummary | undefined;
  recordAccept(hash: string, value: unknown): void;
  recordReject(hash?: string): void;
  revertAutoApply(): void;
  markViewed(): void;
}

export interface UseAiSuggestionsReturn {
  // Internal state
  isRunning: boolean;
  suggestions: Map<FieldPath, FieldSuggestion>;
  autoApplied: Map<FieldPath, AppliedSuggestion>;
  traces: Map<FieldPath, TraceSummary>;
  viewedFields: Set<FieldPath>;
  rejectedHidden: Set<FieldPath>;
  // Controlled-with-default
  preset: string | undefined;
  setPreset(preset: string | undefined): void;
  userPrompt: string;
  setUserPrompt(prompt: string): void;
  writePolicy: WritePolicy;
  setWritePolicy(policy: WritePolicy): void;
  // Actions
  forField(field: FieldPath): PerFieldAccessor;
  acceptAll(): { requiresReview: FieldPath[] } | void;
  run(): Promise<void>;
}

export interface UseAiSuggestionsInput {
  contract: AiContract;
  currentData?: unknown;
  onRefine: (params: RunParams) => Promise<RunResult>;
  onFill?: (params: RunParams) => Promise<RunResult>;
  aiEventLog: AiEventLog;
  entityRef: EntityRef;
  origin: Origin;
  // Controlled-with-default overrides
  presetProp?: string;
  onPresetChange?: (preset: string | undefined) => void;
  userPromptProp?: string;
  onUserPromptChange?: (prompt: string) => void;
  writePolicyProp?: WritePolicy;
  onWritePolicyChange?: (policy: WritePolicy) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAiSuggestions({
  currentData,
  onRefine,
  aiEventLog,
  entityRef,
  origin,
  presetProp,
  onPresetChange,
  userPromptProp,
  onUserPromptChange,
  writePolicyProp,
  onWritePolicyChange,
}: UseAiSuggestionsInput): UseAiSuggestionsReturn {
  // Internal state
  const [isRunning, setIsRunning] = useState(false);
  const [suggestions, setSuggestions] = useState<Map<FieldPath, FieldSuggestion>>(new Map());
  const [autoApplied, setAutoApplied] = useState<Map<FieldPath, AppliedSuggestion>>(new Map());
  const [traces, setTraces] = useState<Map<FieldPath, TraceSummary>>(new Map());
  const [viewedFields, setViewedFields] = useState<Set<FieldPath>>(new Set());
  const [rejectedHidden, setRejectedHidden] = useState<Set<FieldPath>>(new Set());

  // Controlled-with-default internal state
  const [presetInternal, setPresetInternal] = useState<string | undefined>(undefined);
  const [userPromptInternal, setUserPromptInternal] = useState<string>("");
  const [writePolicyInternal, setWritePolicyInternal] = useState<WritePolicy>("fill-if-empty");

  // Resolve controlled vs internal value
  const preset = presetProp !== undefined ? presetProp : presetInternal;
  const userPrompt = userPromptProp !== undefined ? userPromptProp : userPromptInternal;
  const writePolicy = writePolicyProp !== undefined ? writePolicyProp : writePolicyInternal;

  const setPreset = useCallback(
    (p: string | undefined) => {
      if (onPresetChange) onPresetChange(p);
      else setPresetInternal(p);
    },
    [onPresetChange],
  );

  const setUserPrompt = useCallback(
    (p: string) => {
      if (onUserPromptChange) onUserPromptChange(p);
      else setUserPromptInternal(p);
    },
    [onUserPromptChange],
  );

  const setWritePolicy = useCallback(
    (p: WritePolicy) => {
      if (onWritePolicyChange) onWritePolicyChange(p);
      else setWritePolicyInternal(p);
    },
    [onWritePolicyChange],
  );

  const run = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await onRefine({
        currentData,
        preset,
        userPrompt,
        writePolicy,
        entityRef,
        origin,
      });
      setSuggestions(new Map(Object.entries(result.suggestions ?? {})));
      setAutoApplied(new Map(Object.entries(result.autoApplied ?? {})));
      setTraces(new Map(Object.entries(result.traces ?? {})));
      setViewedFields(new Set());
      setRejectedHidden(new Set());
    } finally {
      setIsRunning(false);
    }
  }, [onRefine, currentData, preset, userPrompt, writePolicy, entityRef, origin]);

  const forField = useCallback(
    (field: FieldPath): PerFieldAccessor => {
      const suggestion = suggestions.get(field);
      const appliedSuggestion = autoApplied.get(field);
      const trace = traces.get(field);

      return {
        suggestion,
        autoApplied: appliedSuggestion,
        trace,
        recordAccept(hash: string, value: unknown) {
          const sug = suggestions.get(field);
          setSuggestions((prev) => {
            const next = new Map(prev);
            next.delete(field);
            return next;
          });
          void aiEventLog.append(entityRef, {
            type: "accepted",
            field,
            suggestion: {
              hash,
              summary: sug?.kind === "single" ? sug.summary : String(value),
            },
            at: new Date().toISOString(),
            model: trace?.model ?? "unknown",
            confidence: sug?.kind === "single" ? sug.confidence : undefined,
            traceId: sug?.traceId,
          });
        },
        recordReject(hash?: string) {
          const sug = suggestions.get(field);
          const resolvedHash = hash ?? (sug?.kind === "single" ? sug.hash : "");
          setSuggestions((prev) => {
            const next = new Map(prev);
            next.delete(field);
            return next;
          });
          setRejectedHidden((prev) => new Set([...prev, field]));
          void aiEventLog.append(entityRef, {
            type: "rejected",
            field,
            suggestion: {
              hash: resolvedHash,
              summary: sug?.kind === "single" ? sug.summary : "",
            },
            at: new Date().toISOString(),
            model: trace?.model ?? "unknown",
            traceId: sug?.traceId,
          });
        },
        revertAutoApply() {
          setAutoApplied((prev) => {
            const next = new Map(prev);
            next.delete(field);
            return next;
          });
        },
        markViewed() {
          setViewedFields((prev) => new Set([...prev, field]));
        },
      };
    },
    [suggestions, autoApplied, traces, aiEventLog, entityRef],
  );

  const acceptAll = useCallback((): { requiresReview: FieldPath[] } | void => {
    const unviewed = [...suggestions.keys()].filter((field) => !viewedFields.has(field));
    if (unviewed.length > 0) {
      return { requiresReview: unviewed };
    }
    for (const [field, sug] of suggestions) {
      const trace = traces.get(field);
      void aiEventLog.append(entityRef, {
        type: "accepted",
        field,
        suggestion:
          sug.kind === "single"
            ? { hash: sug.hash, summary: sug.summary }
            : { hash: sug.traceId, summary: "" },
        at: new Date().toISOString(),
        model: trace?.model ?? "unknown",
        confidence: sug.kind === "single" ? sug.confidence : undefined,
        traceId: sug.traceId,
      });
    }
    setSuggestions(new Map());
  }, [suggestions, viewedFields, traces, aiEventLog, entityRef]);

  return {
    isRunning,
    suggestions,
    autoApplied,
    traces,
    viewedFields,
    rejectedHidden,
    preset,
    setPreset,
    userPrompt,
    setUserPrompt,
    writePolicy,
    setWritePolicy,
    forField,
    acceptAll,
    run,
  };
}
