import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import type { CompletenessResult } from "@/lib/completeness.ts";
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
