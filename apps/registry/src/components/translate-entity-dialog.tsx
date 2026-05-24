import { useState, useMemo, useCallback } from "react";
import { SuggestionFlowProvider } from "./suggestion-flow-provider";
import { InlineFieldSuggestion } from "./inline-field-suggestion";
import {
  hashFieldValue,
  type AiContract,
  type AiEventLog,
  type AiEvent,
  type EntityRef,
  type FieldSuggestion,
  type Origin,
  type PerFieldAccessor,
  type RunParams,
  type RunResult,
  type UseAiSuggestionsReturn,
} from "./use-ai-suggestions";

// ── Public types ──────────────────────────────────────────────────────────────

export interface TranslationMeta {
  translationOf: EntityRef;
  canonicalLocale: string;
  canonicalFieldHashes: Record<string, string>;
  draft: true;
  aiEvents: AiEvent[];
}

export interface TranslateEntityDialogProps {
  contract: AiContract;
  sourceRef: EntityRef;
  /** Locale of sourceData */
  sourceLocale: string;
  sourceData: Record<string, unknown>;
  availableLocales: string[];
  /**
   * When provided, enables two-call mode (slug fill first, then bulk).
   * Returns true if slug is available in the target collection.
   */
  onCheckSlugAvailable?: (collection: string, slug: string) => Promise<boolean>;
  onCreate: (
    targetLocale: string,
    slug: string | undefined,
    fields: Record<string, unknown>,
    meta: TranslationMeta,
  ) => Promise<EntityRef>;
  onComplete: (newRef: EntityRef) => void;
  aiEventLog: AiEventLog;
  onFill: (params: RunParams) => Promise<RunResult>;
  origin: Origin;
}

// ── Dialog step state ──────────────────────────────────────────────────────────

type DialogStep = "setup" | "slug-filling" | "slug-review" | "bulk-filling" | "review" | "saving";

function slugStatusLabel(isChecking: boolean, available: boolean | null): string | null {
  if (isChecking) return "Checking availability…";
  if (available === true) return "✓ Available";
  if (available === false) return "✗ Not available";
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TranslateEntityDialog({
  contract,
  sourceRef,
  sourceLocale,
  sourceData,
  availableLocales,
  onCheckSlugAvailable,
  onCreate,
  onComplete,
  aiEventLog,
  onFill,
  origin,
}: TranslateEntityDialogProps) {
  const [step, setStep] = useState<DialogStep>("setup");
  const [targetLocale, setTargetLocale] = useState(availableLocales[0] ?? "");
  const [slugInput, setSlugInput] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [suggestions, setSuggestions] = useState<Map<string, FieldSuggestion>>(new Map());
  const [appliedValues, setAppliedValues] = useState<Record<string, unknown>>({});
  const [viewedFields, setViewedFields] = useState<Set<string>>(new Set());
  const [showFieldReview, setShowFieldReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const twoCallMode = onCheckSlugAvailable !== undefined;

  const sourceContext = useMemo(
    () => ({
      kind: "sibling-locale" as const,
      sourceRef,
      sourceData,
      sourceLocale,
      targetLocale,
      fieldHashes: {} as Record<string, string>,
    }),
    [sourceRef, sourceData, sourceLocale, targetLocale],
  );

  // ── Slug check ───────────────────────────────────────────────────────────────

  const checkSlug = useCallback(
    async (slug: string) => {
      if (!onCheckSlugAvailable || !slug) return;
      setIsCheckingSlug(true);
      setSlugAvailable(null);
      try {
        const available = await onCheckSlugAvailable(sourceRef.kind, slug);
        setSlugAvailable(available);
      } finally {
        setIsCheckingSlug(false);
      }
    },
    [onCheckSlugAvailable, sourceRef.kind],
  );

  // ── Step handlers ──────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setError(null);

    if (twoCallMode) {
      // Step 1: fill slug only
      setStep("slug-filling");
      try {
        const result = await onFill({
          entityRef: sourceRef,
          origin,
          target: ["slug"],
          sourceContext,
        });
        const slugSug = result.suggestions["slug"];
        const initialSlug = slugSug?.kind === "single" ? String(slugSug.value) : "";
        setSlugInput(initialSlug);
        setStep("slug-review");
        void checkSlug(initialSlug);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Slug fill failed");
        setStep("setup");
      }
    } else {
      // One-call mode: fill all fields
      setStep("bulk-filling");
      try {
        const result = await onFill({
          entityRef: sourceRef,
          origin,
          sourceContext,
        });
        setSuggestions(new Map(Object.entries(result.suggestions)));
        setAppliedValues({});
        setViewedFields(new Set());
        setStep("review");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fill failed");
        setStep("setup");
      }
    }
  }, [twoCallMode, onFill, sourceRef, origin, sourceContext, checkSlug]);

  const handleContinueAfterSlug = useCallback(async () => {
    setError(null);
    setStep("bulk-filling");
    try {
      const nonSlugFields = Object.keys(contract.fields).filter((f) => f !== "slug");
      const result = await onFill({
        entityRef: sourceRef,
        origin,
        target: nonSlugFields,
        sourceContext,
      });
      setSuggestions(new Map(Object.entries(result.suggestions)));
      setAppliedValues({});
      setViewedFields(new Set());
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fill failed");
      setStep("slug-review");
    }
  }, [contract.fields, onFill, sourceRef, origin, sourceContext]);

  const handleAcceptAll = useCallback(async () => {
    setStep("saving");
    setError(null);
    try {
      // Collect fields: already-applied values + remaining suggestions + copy fields
      const fields: Record<string, unknown> = { ...appliedValues };

      for (const [field, sug] of suggestions) {
        if (!(field in fields)) {
          if (sug.kind === "single") {
            fields[field] = sug.value;
          } else if (sug.kind === "choice" && sug.candidates.length > 0) {
            // Take first candidate for bulk accept
            fields[field] = sug.candidates[0].value;
          }
        }
      }

      // Include copy-mode fields from source
      for (const [field, config] of Object.entries(contract.fields)) {
        if (config.translation?.mode === "copy" && !(field in fields)) {
          const srcVal = sourceData[field];
          if (srcVal !== undefined) fields[field] = srcVal;
        }
      }

      // Compute canonicalFieldHashes from source
      const canonicalFieldHashes: Record<string, string> = {};
      for (const field of Object.keys(contract.fields)) {
        const val = sourceData[field];
        if (val !== undefined) canonicalFieldHashes[field] = hashFieldValue(val);
      }

      // Build single ingested aiEvent
      const ingestedEvent: AiEvent = {
        type: "ingested",
        suggestion: { hash: origin.runId, summary: `Translation to ${targetLocale}` },
        at: new Date().toISOString(),
        model: "translation",
        traceId: origin.runId,
      };

      const meta: TranslationMeta = {
        translationOf: sourceRef,
        canonicalLocale: sourceLocale,
        canonicalFieldHashes,
        draft: true,
        aiEvents: [ingestedEvent],
      };

      const newRef = await onCreate(
        targetLocale,
        twoCallMode ? slugInput : undefined,
        fields,
        meta,
      );

      // Append ingested event to the new entity's event log
      await aiEventLog.append(newRef, ingestedEvent);

      onComplete(newRef);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setStep("review");
    }
  }, [
    appliedValues,
    suggestions,
    contract.fields,
    sourceData,
    origin.runId,
    targetLocale,
    sourceRef,
    sourceLocale,
    twoCallMode,
    slugInput,
    onCreate,
    aiEventLog,
    onComplete,
  ]);

  // ── SuggestionFlowProvider value ───────────────────────────────────────────

  const flowValue: UseAiSuggestionsReturn = useMemo(() => {
    const forField = (field: string): PerFieldAccessor => ({
      suggestion: suggestions.get(field),
      autoApplied: undefined,
      trace: undefined,
      source: sourceData[field],
      sourceLocale,
      isStale: false,
      translationMode: contract.fields[field]?.translation?.mode,
      retranslate: async () => {},
      recordAccept(hash: string, value: unknown) {
        setAppliedValues((prev) => ({ ...prev, [field]: value }));
        setSuggestions((prev) => {
          const next = new Map(prev);
          next.delete(field);
          return next;
        });
        setViewedFields((prev) => new Set([...prev, field]));
      },
      recordReject() {
        setSuggestions((prev) => {
          const next = new Map(prev);
          next.delete(field);
          return next;
        });
      },
      revertAutoApply() {},
      markViewed() {
        setViewedFields((prev) => new Set([...prev, field]));
      },
      isRunning: false,
      run: async () => {},
    });

    return {
      isRunning: step === "bulk-filling",
      suggestions,
      autoApplied: new Map(),
      traces: new Map(),
      viewedFields,
      rejectedHidden: new Set(),
      preset: undefined,
      setPreset: () => {},
      userPrompt: "",
      setUserPrompt: () => {},
      writePolicy: "fill-if-empty",
      setWritePolicy: () => {},
      run: async () => {},
      acceptAll: () => {},
      forField,
    };
  }, [suggestions, viewedFields, sourceData, sourceLocale, contract.fields, step]);

  const pendingSuggestionCount = suggestions.size;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border bg-background p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Translate to…</h2>

      {error && (
        <p className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ── Setup step ── */}
      {step === "setup" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label htmlFor="target-locale" className="text-sm font-medium">
              Target locale
            </label>
            <select
              id="target-locale"
              value={targetLocale}
              onChange={(e) => setTargetLocale(e.target.value)}
              className="rounded border px-2 py-1 text-sm"
            >
              {availableLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleStart()}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Start translation
          </button>
        </div>
      )}

      {/* ── Slug filling ── */}
      {step === "slug-filling" && <p className="text-sm text-muted-foreground">Suggesting slug…</p>}

      {/* ── Slug review ── */}
      {step === "slug-review" && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Step 1: Confirm slug</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(e.target.value);
                  void checkSlug(e.target.value);
                }}
                className="flex-1 rounded border px-2 py-1 text-sm font-mono"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {slugStatusLabel(isCheckingSlug, slugAvailable)}
            </p>
          </div>
          <button
            type="button"
            disabled={!slugInput || slugAvailable === false}
            onClick={() => void handleContinueAfterSlug()}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {/* ── Bulk filling ── */}
      {step === "bulk-filling" && (
        <p className="text-sm text-muted-foreground">Translating fields…</p>
      )}

      {/* ── Review step ── */}
      {step === "review" && (
        <SuggestionFlowProvider value={flowValue}>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => void handleAcceptAll()}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Accept all &amp; save draft
              </button>
              {pendingSuggestionCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFieldReview((v) => !v)}
                  className="rounded border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {showFieldReview
                    ? "Hide field review"
                    : `Review ${pendingSuggestionCount} fields →`}
                </button>
              )}
            </div>

            {showFieldReview && (
              <div className="space-y-4 rounded-lg border p-4">
                {Object.keys(contract.fields)
                  .filter((field) => field !== "slug")
                  .map((field) => {
                    const sourceVal = sourceData[field];
                    return (
                      <div key={field} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{field}</p>
                        <InlineFieldSuggestion
                          fieldPath={field}
                          currentValue={appliedValues[field]}
                          onApply={(value) => {
                            setAppliedValues((prev) => ({ ...prev, [field]: value }));
                          }}
                          sourceSlot={
                            sourceVal !== undefined ? (
                              <span className="break-words">
                                {Array.isArray(sourceVal)
                                  ? sourceVal.join(", ")
                                  : String(sourceVal)}
                              </span>
                            ) : undefined
                          }
                        />
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </SuggestionFlowProvider>
      )}

      {/* ── Saving ── */}
      {step === "saving" && <p className="text-sm text-muted-foreground">Saving draft…</p>}
    </div>
  );
}
