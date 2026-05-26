import { useState, useMemo, useCallback } from "react";
import {
  createAiEvent,
  hashFieldValue,
  type AiContract,
  type AiEventLog,
  type AiEvent,
  type EntityRef,
  type FieldSuggestion,
  type Origin,
  type RunParams,
  type RunResult,
} from "./use-ai-suggestions";

// ── Public types ──────────────────────────────────────────────────────────────

export interface TranslationMeta {
  translationOf: EntityRef;
  canonicalLocale: string;
  canonicalFieldHashes: Record<string, string>;
  draft: true;
  aiEvents: AiEvent[];
}

export interface TranslationFailureMetadata {
  failedFields: string[];
  errors: Record<string, string>;
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
  onComplete: (newRef: EntityRef, failure?: TranslationFailureMetadata) => void;
  aiEventLog: AiEventLog;
  onFill: (params: RunParams) => Promise<RunResult>;
  origin: Origin;
}

// ── Dialog step state ──────────────────────────────────────────────────────────

type DialogStep = "setup" | "slug-filling" | "slug-review" | "bulk-filling" | "saving";

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
  const [fillProgress, setFillProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const twoCallMode = onCheckSlugAvailable !== undefined;

  const translatableFields = useMemo(
    () =>
      Object.entries(contract.fields)
        .filter(([, cfg]) => cfg.translation?.mode !== "skip" && cfg.translation?.mode !== "copy")
        .map(([k]) => k),
    [contract.fields],
  );

  const translatableFieldCount = translatableFields.length;

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

  // ── Save helper ──────────────────────────────────────────────────────────────

  const saveTranslation = useCallback(
    async (suggestions: Map<string, FieldSuggestion>, slug: string | undefined): Promise<void> => {
      setStep("saving");
      setError(null);
      try {
        const fields: Record<string, unknown> = {};

        for (const [field, sug] of suggestions) {
          if (sug.kind === "single") {
            fields[field] = sug.value;
          } else if (sug.kind === "choice" && sug.candidates.length > 0) {
            fields[field] = sug.candidates[0].value;
          }
        }

        // Include copy-mode fields from source
        for (const [field, config] of Object.entries(contract.fields)) {
          if (config.translation?.mode === "copy" && !(field in fields)) {
            const srcVal = sourceData[field];
            if (srcVal !== undefined) fields[field] = srcVal;
          }
        }

        const failedFields = translatableFields.filter((f) => !suggestions.has(f));

        // Compute canonicalFieldHashes from source
        const canonicalFieldHashes: Record<string, string> = {};
        for (const field of Object.keys(contract.fields)) {
          const val = sourceData[field];
          if (val !== undefined) canonicalFieldHashes[field] = hashFieldValue(val);
        }

        const ingestedEvent = createAiEvent({
          type: "ingested",
          suggestion: { hash: origin.runId, summary: `Translation to ${targetLocale}` },
          model: "translation",
          traceId: origin.runId,
        });

        const meta: TranslationMeta = {
          translationOf: sourceRef,
          canonicalLocale: sourceLocale,
          canonicalFieldHashes,
          draft: true,
          aiEvents: [ingestedEvent],
        };

        const newRef = await onCreate(targetLocale, slug, fields, meta);
        await aiEventLog.append(newRef, ingestedEvent);

        const failure: TranslationFailureMetadata | undefined =
          failedFields.length > 0
            ? {
                failedFields,
                errors: Object.fromEntries(failedFields.map((f) => [f, "not filled"])),
              }
            : undefined;

        onComplete(newRef, failure);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        setStep("bulk-filling");
      }
    },
    [
      contract.fields,
      translatableFields,
      sourceData,
      origin.runId,
      targetLocale,
      sourceRef,
      sourceLocale,
      onCreate,
      aiEventLog,
      onComplete,
    ],
  );

  // ── Step handlers ──────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setError(null);

    if (twoCallMode) {
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
      setStep("bulk-filling");
      setFillProgress({ done: 0, total: translatableFieldCount });
      try {
        const result = await onFill({
          entityRef: sourceRef,
          origin,
          sourceContext,
        });
        setFillProgress({
          done: result.suggestions ? Object.keys(result.suggestions).length : 0,
          total: translatableFieldCount,
        });
        await saveTranslation(new Map(Object.entries(result.suggestions)), undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fill failed");
        setStep("setup");
        setFillProgress(null);
      }
    }
  }, [
    twoCallMode,
    onFill,
    sourceRef,
    origin,
    sourceContext,
    checkSlug,
    translatableFieldCount,
    saveTranslation,
  ]);

  const handleContinueAfterSlug = useCallback(async () => {
    setError(null);
    setStep("bulk-filling");
    const nonSlugFields = Object.keys(contract.fields).filter((f) => f !== "slug");
    setFillProgress({ done: 0, total: nonSlugFields.length });
    try {
      const result = await onFill({
        entityRef: sourceRef,
        origin,
        target: nonSlugFields,
        sourceContext,
      });
      setFillProgress({
        done: result.suggestions ? Object.keys(result.suggestions).length : 0,
        total: nonSlugFields.length,
      });
      await saveTranslation(new Map(Object.entries(result.suggestions)), slugInput);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fill failed");
      setStep("slug-review");
      setFillProgress(null);
    }
  }, [contract.fields, onFill, sourceRef, origin, sourceContext, slugInput, saveTranslation]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">
        Translate to {targetLocale ? targetLocale.toUpperCase() : "…"}
      </h2>

      {error && (
        <p className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ── Setup step ── */}
      {step === "setup" && (
        <div className="space-y-4">
          {availableLocales.length > 1 && (
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
          )}
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
        <p className="text-sm text-muted-foreground">
          {fillProgress !== null
            ? `Translating ${fillProgress.done} of ${fillProgress.total} fields…`
            : "Translating fields…"}
        </p>
      )}

      {/* ── Saving ── */}
      {step === "saving" && <p className="text-sm text-muted-foreground">Saving draft…</p>}
    </div>
  );
}
