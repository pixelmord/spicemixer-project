import { useState } from "react";
import { Code2, Eye } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  getConfig,
  diffWords,
  hasChanges,
  type FieldDiff,
  type ChangeKind,
  type EntityKind,
} from "entity-kind";
import RecipePreview from "./RecipePreview.tsx";

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

function ItemListDiff({
  items,
  kind,
}: {
  items: Array<{ value: string; kind: string }>;
  kind: ChangeKind;
}) {
  if (kind === "unchanged") return <span className="text-muted-foreground">(unchanged)</span>;
  return (
    <ul className="space-y-0.5">
      {items.map((item, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-1 text-xs",
            item.kind === "added" && "text-emerald-700 dark:text-emerald-300",
            item.kind === "removed" && "text-red-600 dark:text-red-400 line-through opacity-60",
          )}
        >
          <span className="shrink-0 font-bold w-3">
            {item.kind === "added" ? "+" : item.kind === "removed" ? "−" : " "}
          </span>
          <span>{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

const KIND_ROW_BG: Record<ChangeKind, string> = {
  added: "bg-emerald-50 dark:bg-emerald-950/30",
  removed: "bg-red-50 dark:bg-red-950/30",
  changed: "bg-amber-50 dark:bg-amber-950/30",
  unchanged: "",
};

const KIND_BADGE_LABEL: Record<ChangeKind, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "",
};

const KIND_BADGE_COLOR: Record<ChangeKind, string> = {
  added: "text-emerald-700 dark:text-emerald-400",
  removed: "text-red-700 dark:text-red-400",
  changed: "text-amber-700 dark:text-amber-400",
  unchanged: "text-muted-foreground",
};

function FieldCell({ diff, side }: { diff: FieldDiff; side: "old" | "new" }) {
  const value = side === "old" ? diff.oldValue : diff.newValue;
  const isEmpty =
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty) {
    return <span className="text-muted-foreground/50 italic text-xs">(empty)</span>;
  }

  if (diff.itemDiffs) {
    const items =
      side === "old"
        ? diff.itemDiffs.filter((d) => d.kind === "unchanged" || d.kind === "removed")
        : diff.itemDiffs.filter((d) => d.kind === "unchanged" || d.kind === "added");
    return <ItemListDiff items={items} kind={diff.kind} />;
  }

  const str = typeof value === "string" ? value : "";
  if (side === "new" && diff.kind === "changed" && typeof diff.oldValue === "string") {
    return <InlineWordDiff before={diff.oldValue} after={str} />;
  }
  return <span className={side === "old" ? "text-muted-foreground" : ""}>{str}</span>;
}

function FieldRow({ diff }: { diff: FieldDiff }) {
  if (diff.kind === "unchanged") return null;
  return (
    <tr className={cn("border-b border-border", KIND_ROW_BG[diff.kind])}>
      <td className="py-2 px-3 align-top w-32">
        <div className="text-xs font-medium">{diff.label}</div>
        <div className={cn("text-[10px] font-normal mt-0.5", KIND_BADGE_COLOR[diff.kind])}>
          {KIND_BADGE_LABEL[diff.kind]}
        </div>
      </td>
      <td className="py-2 px-3 align-top text-xs max-w-48 whitespace-pre-wrap">
        <FieldCell diff={diff} side="old" />
      </td>
      <td className="py-2 px-3 align-top text-xs max-w-48 whitespace-pre-wrap">
        <FieldCell diff={diff} side="new" />
      </td>
    </tr>
  );
}

function FieldsTable({ diffs }: { diffs: FieldDiff[] }) {
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

interface Props {
  kind: EntityKind;
  existing: Record<string, unknown>;
  proposed: Record<string, unknown>;
  locale?: string;
}

export default function EntityDiff({ kind, existing, proposed, locale }: Props) {
  const [tab, setTab] = useState<"source" | "preview">("source");
  const ctx = locale ? { locale } : undefined;
  const diffs = getConfig(kind).diff(existing, proposed, ctx);
  const changed = diffs.filter((d) => d.kind !== "unchanged");

  if (!hasChanges(diffs)) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No differences detected between the existing and proposed {kind}.
      </div>
    );
  }

  const hasPreview = kind === "recipe";

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {changed.length} field{changed.length !== 1 ? "s" : ""} changed
      </p>

      {hasPreview ? (
        <>
          <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
            {(
              [
                ["source", <Code2 size={12} />, "Source"],
                ["preview", <Eye size={12} />, "Preview"],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  tab === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {tab === "source" && <FieldsTable diffs={diffs} />}

          {tab === "preview" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Before
                </p>
                <RecipePreview recipe={existing as Parameters<typeof RecipePreview>[0]["recipe"]} />
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-3">
                  After
                </p>
                <RecipePreview
                  recipe={proposed as Parameters<typeof RecipePreview>[0]["recipe"]}
                  diffs={diffs}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
            <div className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium bg-background text-foreground shadow-sm">
              <Code2 size={12} />
              Fields
            </div>
          </div>
          <FieldsTable diffs={diffs} />
        </>
      )}
    </div>
  );
}
