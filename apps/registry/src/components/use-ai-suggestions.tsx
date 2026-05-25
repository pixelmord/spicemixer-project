import { useState, useCallback } from "react";

// ── Local types (compatible with @pixelmord/content-ai-core) ─────────────────

/** Canonical wording for merge-aware retranslation; matches the constant in content-ai-ingest. */
export const MERGE_INSTRUCTION =
  "Merge the translation with the existing target-language content: preserve the editor's edits and blend in updates from the source rather than replacing the existing text entirely.";

type FieldPath = string;
type Confidence = "high" | "medium" | "low";
type WritePolicy = "preserve" | "replace" | "fill-if-empty" | "merge-instructions";

export type TranslationBehavior =
  | { mode: "translate" }
  | { mode: "copy" }
  | { mode: "localize"; instruction?: string }
  | { mode: "skip" };

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
  fields: Record<string, { writePolicy?: WritePolicy; translation?: TranslationBehavior }>;
}

export interface RunParams {
  currentData?: unknown;
  preset?: string;
  userPrompt?: string;
  writePolicy?: WritePolicy;
  entityRef: EntityRef;
  origin: Origin;
  /** For fill operations: which fields to fill */
  target?: string[];
  /** Source context for sibling-locale translations */
  sourceContext?: unknown;
  /** Prepended to the per-field user-message on merge-aware retranslation runs */
  mergeInstruction?: string;
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
  /** Current source-locale field value (undefined when no siblingLocale provided) */
  source: unknown;
  /** Source locale code (undefined when no siblingLocale provided) */
  sourceLocale: string | undefined;
  /** True when source field changed since translation was made */
  isStale: boolean;
  /** Translation behavior for this field per contract, undefined if not declared */
  translationMode: TranslationBehavior["mode"] | undefined;
  /** Re-run fill for this field using the sibling-locale source */
  retranslate: (opts?: { merge?: boolean }) => Promise<void>;
  /** True while a targeted run() call for this specific field is in progress */
  isRunning: boolean;
  /** Trigger onRefine scoped to this field (passes target: [fieldPath]) */
  run: () => Promise<void>;
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
  /** Trigger a fill/translation run via onFill with optional target field list */
  runTranslation(opts?: { target?: FieldPath[] }): Promise<void>;
}

export interface SiblingLocale {
  ref: EntityRef;
  data: Record<string, unknown>;
  locale: string;
  /** Stored canonical field hashes recorded when translation was last made */
  fieldHashes: Record<string, string>;
}

export interface UseAiSuggestionsInput {
  contract: AiContract;
  currentData?: unknown;
  onRefine: (params: RunParams) => Promise<RunResult>;
  onFill?: (params: RunParams) => Promise<RunResult>;
  aiEventLog: AiEventLog;
  entityRef: EntityRef;
  origin: Origin;
  /** Sibling locale data for translation flows */
  siblingLocale?: SiblingLocale;
  // Controlled-with-default overrides
  presetProp?: string;
  onPresetChange?: (preset: string | undefined) => void;
  userPromptProp?: string;
  onUserPromptChange?: (prompt: string) => void;
  writePolicyProp?: WritePolicy;
  onWritePolicyChange?: (policy: WritePolicy) => void;
}

// ── Hash utility ─────────────────────────────────────────────────────────────

/** Consumers must use the same function when storing canonicalFieldHashes. */
export function hashFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAiSuggestions({
  contract,
  currentData,
  onRefine,
  onFill,
  aiEventLog,
  entityRef,
  origin,
  siblingLocale,
  presetProp,
  onPresetChange,
  userPromptProp,
  onUserPromptChange,
  writePolicyProp,
  onWritePolicyChange,
}: UseAiSuggestionsInput): UseAiSuggestionsReturn {
  // Internal state
  const [isRunning, setIsRunning] = useState(false);
  const [runningFields, setRunningFields] = useState<Set<FieldPath>>(new Set());
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

      const source = siblingLocale ? siblingLocale.data[field] : undefined;
      const sourceLocale = siblingLocale ? siblingLocale.locale : undefined;
      const storedHash = siblingLocale?.fieldHashes[field];
      const isStale =
        siblingLocale !== undefined &&
        storedHash !== undefined &&
        hashFieldValue(siblingLocale.data[field]) !== storedHash;

      const fieldConfig = contract.fields[field];
      const translationMode = fieldConfig?.translation?.mode;

      const retranslate = async (opts?: { merge?: boolean }): Promise<void> => {
        if (!siblingLocale || !onFill) return;
        const mode = translationMode ?? "translate";
        if (mode === "copy" || mode === "skip") return;
        const result = await onFill({
          currentData,
          entityRef,
          origin,
          target: [field],
          sourceContext: {
            kind: "sibling-locale",
            sourceRef: siblingLocale.ref,
            sourceData: siblingLocale.data,
            sourceLocale: siblingLocale.locale,
            fieldHashes: siblingLocale.fieldHashes,
          },
          ...(opts?.merge ? { mergeInstruction: MERGE_INSTRUCTION } : {}),
        });
        setSuggestions((prev) => {
          const next = new Map(prev);
          for (const [f, s] of Object.entries(result.suggestions ?? {})) {
            next.set(f, s);
          }
          return next;
        });
        setAutoApplied((prev) => {
          const next = new Map(prev);
          for (const [f, a] of Object.entries(result.autoApplied ?? {})) {
            next.set(f, a);
          }
          return next;
        });
        setTraces((prev) => {
          const next = new Map(prev);
          for (const [f, t] of Object.entries(result.traces ?? {})) {
            next.set(f, t);
          }
          return next;
        });
      };

      const run = async (): Promise<void> => {
        setRunningFields((prev) => new Set([...prev, field]));
        try {
          const result = await onRefine({
            currentData,
            preset,
            userPrompt,
            writePolicy,
            entityRef,
            origin,
            target: [field],
          });
          setSuggestions((prev) => {
            const next = new Map(prev);
            for (const [f, s] of Object.entries(result.suggestions ?? {})) {
              next.set(f, s);
            }
            return next;
          });
          setAutoApplied((prev) => {
            const next = new Map(prev);
            for (const [f, a] of Object.entries(result.autoApplied ?? {})) {
              next.set(f, a);
            }
            return next;
          });
          setTraces((prev) => {
            const next = new Map(prev);
            for (const [f, t] of Object.entries(result.traces ?? {})) {
              next.set(f, t);
            }
            return next;
          });
        } finally {
          setRunningFields((prev) => {
            const next = new Set(prev);
            next.delete(field);
            return next;
          });
        }
      };

      return {
        suggestion,
        autoApplied: appliedSuggestion,
        trace,
        source,
        sourceLocale,
        isStale,
        translationMode,
        retranslate,
        isRunning: runningFields.has(field),
        run,
        recordAccept(hash: string, value: unknown) {
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
              summary: suggestion?.kind === "single" ? suggestion.summary : String(value),
            },
            at: new Date().toISOString(),
            model: trace?.model ?? "unknown",
            confidence: suggestion?.kind === "single" ? suggestion.confidence : undefined,
            traceId: suggestion?.traceId,
          });
        },
        recordReject(hash?: string) {
          const resolvedHash = hash ?? (suggestion?.kind === "single" ? suggestion.hash : "");
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
              summary: suggestion?.kind === "single" ? suggestion.summary : "",
            },
            at: new Date().toISOString(),
            model: trace?.model ?? "unknown",
            traceId: suggestion?.traceId,
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
    [
      suggestions,
      autoApplied,
      traces,
      runningFields,
      aiEventLog,
      entityRef,
      origin,
      siblingLocale,
      contract,
      onRefine,
      onFill,
      currentData,
      preset,
      userPrompt,
      writePolicy,
    ],
  );

  const runTranslation = useCallback(
    async (opts?: { target?: FieldPath[] }): Promise<void> => {
      if (!onFill || !siblingLocale) return;
      setIsRunning(true);
      try {
        const result = await onFill({
          currentData,
          entityRef,
          origin,
          target: opts?.target,
          sourceContext: {
            kind: "sibling-locale",
            sourceRef: siblingLocale.ref,
            sourceData: siblingLocale.data,
            sourceLocale: siblingLocale.locale,
            fieldHashes: siblingLocale.fieldHashes,
          },
        });
        setSuggestions(new Map(Object.entries(result.suggestions ?? {})));
        setAutoApplied(new Map(Object.entries(result.autoApplied ?? {})));
        setTraces(new Map(Object.entries(result.traces ?? {})));
        setViewedFields(new Set());
        setRejectedHidden(new Set());
      } finally {
        setIsRunning(false);
      }
    },
    [onFill, siblingLocale, currentData, entityRef, origin],
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
    runTranslation,
  };
}
