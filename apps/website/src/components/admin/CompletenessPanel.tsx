import { CheckCircle2, Circle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import type { CompletenessResult } from "@/lib/completeness.ts";
interface AiSuggestion {
  field: string;
  suggestion: string;
  rationale: string;
}
import { cn } from "@/lib/utils.ts";

interface Field {
  key: string;
  label: string;
  filled: boolean;
  anchorId?: string;
}

interface Props {
  result: CompletenessResult;
  requiredFields: { key: string; label: string; filled: boolean }[];
  recommendedFields: Field[];
  bonusFields?: { key: string; label: string; filled: boolean }[];
  aiSuggestions?: AiSuggestion[];
  aiRefreshing?: boolean;
  activeProposers?: string[];
  onRefreshSuggestions?: () => void;
  onApplySuggestion?: (field: string, value: string) => void;
  onDismissSuggestion?: (field: string) => void;
}

const RING_MAP = { green: "#10b981", amber: "#f59e0b", red: "#ef4444" };
const r = 22;
const cx = r + 3;
const circumference = 2 * Math.PI * r;

export default function CompletenessPanel({
  result,
  requiredFields,
  recommendedFields,
  bonusFields = [],
  aiSuggestions = [],
  aiRefreshing = false,
  activeProposers = [],
  onRefreshSuggestions,
  onApplySuggestion,
  onDismissSuggestion,
}: Props) {
  const offset = circumference - (result.score / 100) * circumference;

  function scrollTo(anchorId?: string) {
    if (!anchorId) return;
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      const input = el.querySelector<HTMLElement>("input,textarea,select,button[role=combobox]");
      input?.focus();
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      {/* Score ring */}
      <div className="flex items-center gap-3">
        <svg width={cx * 2} height={cx * 2} className="-rotate-90 shrink-0">
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.15"
            strokeWidth="3"
          />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={RING_MAP[result.color]}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div>
          <p className="text-xl font-bold tabular-nums">{result.score}%</p>
          <p className="text-xs text-muted-foreground">completeness</p>
        </div>
      </div>

      {/* Required */}
      <FieldGroup title="Required" fields={requiredFields} emptyColor="red" onFocus={scrollTo} />

      {/* Recommended */}
      <FieldGroup
        title="Recommended"
        fields={recommendedFields}
        emptyColor="amber"
        onFocus={scrollTo}
      />

      {/* Bonus */}
      {bonusFields.length > 0 && (
        <FieldGroup title="Bonus" fields={bonusFields} emptyColor="amber" onFocus={scrollTo} />
      )}

      {/* AI suggestions */}
      {(aiSuggestions.length > 0 || aiRefreshing || onRefreshSuggestions) && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              AI suggestions
            </p>
            {onRefreshSuggestions && (
              <button
                type="button"
                onClick={onRefreshSuggestions}
                disabled={aiRefreshing}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh suggestions"
              >
                {aiRefreshing ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
              </button>
            )}
          </div>
          {aiRefreshing && !aiSuggestions.length && (
            <div className="space-y-0.5">
              {activeProposers.length > 0 ? (
                activeProposers.map((name) => (
                  <p
                    key={name}
                    className="flex items-center gap-1 text-xs text-muted-foreground italic"
                  >
                    <Loader2 size={9} className="animate-spin shrink-0" />
                    {name}…
                  </p>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic">Computing…</p>
              )}
            </div>
          )}
          <ul className="space-y-1">
            {aiSuggestions.map((s) => (
              <li key={s.field} className="rounded px-1 py-0.5 text-xs">
                <div className="flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5 text-primary">✦</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{s.field}</span>
                    <p className="text-muted-foreground truncate">{s.suggestion}</p>
                  </div>
                  {(onApplySuggestion || onDismissSuggestion) && (
                    <div className="flex gap-0.5 shrink-0">
                      {onApplySuggestion && (
                        <button
                          type="button"
                          onClick={() => onApplySuggestion(s.field, s.suggestion)}
                          className="text-emerald-500 hover:text-emerald-700"
                          title="Apply"
                        >
                          <CheckCircle2 size={12} />
                        </button>
                      )}
                      {onDismissSuggestion && (
                        <button
                          type="button"
                          onClick={() => onDismissSuggestion(s.field)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Dismiss"
                        >
                          <Circle size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FieldGroup({
  title,
  fields,
  emptyColor,
  onFocus,
}: {
  title: string;
  fields: { key: string; label: string; filled: boolean; anchorId?: string }[];
  emptyColor: "red" | "amber";
  onFocus: (anchorId?: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {fields.map((f) => (
          <li key={f.key}>
            <button
              type="button"
              onClick={() => onFocus(f.anchorId ?? f.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-muted",
                !f.filled && "cursor-pointer",
              )}
            >
              {f.filled ? (
                <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
              ) : emptyColor === "red" ? (
                <AlertCircle size={13} className="shrink-0 text-red-500" />
              ) : (
                <Circle size={13} className="shrink-0 text-amber-400" />
              )}
              <span className={cn(f.filled ? "text-foreground" : "text-muted-foreground")}>
                {f.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
