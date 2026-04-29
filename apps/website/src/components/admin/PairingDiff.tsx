import { cn } from "@/lib/utils.ts";
import {
  diffPairings,
  diffWords,
  hasPairingChanges,
  type FieldDiff,
  type ChangeKind,
} from "@/lib/pairing-diff.ts";

function InlineWordDiff({ before, after }: { before: string; after: string }) {
  const tokens = diffWords(before, after);
  return (
    <span>
      {tokens.map((tok, i) => {
        if (tok.kind === "unchanged") return <span key={i}>{tok.text}</span>;
        if (tok.kind === "added")
          return (
            <mark key={i} className="bg-emerald-200 dark:bg-emerald-800/60 rounded-sm">
              {tok.text}
            </mark>
          );
        return (
          <del
            key={i}
            className="bg-red-100 dark:bg-red-900/40 text-muted-foreground line-through rounded-sm"
          >
            {tok.text}
          </del>
        );
      })}
    </span>
  );
}

const KIND_ROW_BG: Record<ChangeKind, string> = {
  added: "bg-emerald-50 dark:bg-emerald-950/30",
  removed: "bg-red-50 dark:bg-red-950/30",
  changed: "bg-amber-50 dark:bg-amber-950/30",
  unchanged: "",
};
const KIND_BADGE_COLOR: Record<ChangeKind, string> = {
  added: "text-emerald-700",
  removed: "text-red-700",
  changed: "text-amber-700",
  unchanged: "text-muted-foreground",
};
const KIND_BADGE_LABEL: Record<ChangeKind, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "",
};

function FieldRow({ diff }: { diff: FieldDiff }) {
  if (diff.kind === "unchanged") return null;
  return (
    <tr className={cn("border-b border-border", KIND_ROW_BG[diff.kind])}>
      <td className="py-2 px-3 align-top w-32">
        <div className="text-xs font-medium">{diff.label}</div>
        <div className={cn("text-[10px]", KIND_BADGE_COLOR[diff.kind])}>
          {KIND_BADGE_LABEL[diff.kind]}
        </div>
      </td>
      <td className="py-2 px-3 align-top text-xs whitespace-pre-wrap">
        {diff.oldValue ? (
          <span className="text-muted-foreground">{String(diff.oldValue)}</span>
        ) : (
          <span className="italic text-muted-foreground/50">(empty)</span>
        )}
      </td>
      <td className="py-2 px-3 align-top text-xs whitespace-pre-wrap">
        {diff.newValue ? (
          diff.kind === "changed" && typeof diff.oldValue === "string" ? (
            <InlineWordDiff before={diff.oldValue} after={String(diff.newValue)} />
          ) : (
            <span>{String(diff.newValue)}</span>
          )
        ) : (
          <span className="italic text-muted-foreground/50">(empty)</span>
        )}
      </td>
    </tr>
  );
}

interface Props {
  existing: Record<string, unknown>;
  proposed: Record<string, unknown>;
  locale?: string;
}

export default function PairingDiff({ existing, proposed, locale = "en" }: Props) {
  const diffs = diffPairings(existing, proposed, locale);

  if (!hasPairingChanges(diffs)) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No differences detected.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="py-2 px-3 text-left font-medium w-32">Field</th>
            <th className="py-2 px-3 text-left font-medium text-muted-foreground">Before</th>
            <th className="py-2 px-3 text-left font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((d) => (
            <FieldRow key={d.field} diff={d} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
