import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { actions } from "astro:actions";
import { toast } from "sonner";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import LinkButton from "@/components/admin/LinkButton.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import CompletenessBadge from "./CompletenessBadge.tsx";
import DraftBadge from "./DraftBadge.tsx";
import { cn } from "@/lib/utils.ts";

export interface ContentRow {
  type: "recipe" | "ingredient" | "pairing";
  collection: string;
  id: string;
  name: string;
  draft: boolean;
  completeness: { score: number; missing: string[]; color: "green" | "amber" | "red" };
  updatedAt?: string;
  /** ISO-639-1 language code shown for recipes that have meta.language set */
  language?: string;
  /** Available locale codes for multi-locale content (e.g. ["en", "de"]) */
  translations?: string[];
  /** Optional sub-line displayed below the name (e.g. truncated description) */
  subtitle?: string;
}

/** Return the locale prefix for un-deduplicated ingredient rows (no translations[] set). */
function getLocale(row: ContentRow): string | null {
  if (row.type !== "ingredient" || row.translations) return null;
  const slashIdx = row.id.indexOf("/");
  return slashIdx !== -1 ? row.id.slice(0, slashIdx) : null;
}

function editHref(row: ContentRow) {
  if (row.type === "ingredient") {
    const slashIdx = row.id.indexOf("/");
    if (slashIdx === -1) return "#";
    const locale = row.id.slice(0, slashIdx);
    const slug = row.id.slice(slashIdx + 1);
    return `/admin/ingredients/${slug}/edit?locale=${locale}`;
  }
  if (row.type === "pairing") {
    return `/admin/pairings/${encodeURIComponent(row.id)}/edit`;
  }
  const slashIdx = row.id.indexOf("/");
  if (slashIdx !== -1) {
    const locale = row.id.slice(0, slashIdx);
    const slug = row.id.slice(slashIdx + 1);
    return `/admin/${row.collection}/${slug}/edit?locale=${locale}`;
  }
  return `/admin/${row.collection}/${row.id}/edit`;
}

const LOCALE_COLORS: Record<string, string> = {
  en: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300",
  de: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-300",
};

function LocaleBadge({ locale }: { locale: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
        LOCALE_COLORS[locale] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {locale}
    </span>
  );
}

function TranslationPills({ translations }: { translations: string[] }) {
  return (
    <div className="flex gap-0.5 mt-0.5">
      {(["en", "de"] as const).map((l) => (
        <span
          key={l}
          className={cn(
            "text-[9px] font-mono px-1 py-0.5 rounded uppercase",
            translations.includes(l)
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-muted text-muted-foreground/60",
          )}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

export default function ContentTable({ initialRows }: { initialRows: ContentRow[] }) {
  const [rows, setRows] = useState<ContentRow[]>(initialRows);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  async function handleToggleDraft(row: ContentRow) {
    if (row.type === "ingredient") return;

    if (row.type === "pairing") {
      const { error } = await actions.togglePairingDraft({ id: row.id, draft: !row.draft });
      if (error) {
        toast.error("Failed to update status");
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, draft: !r.draft } : r)));
      toast.success(row.draft ? "Published" : "Moved to drafts");
      return;
    }

    const action = row.draft ? actions.publish : actions.unpublish;
    const slashIdx = row.id.indexOf("/");
    const locale = (slashIdx !== -1 ? row.id.slice(0, slashIdx) : "en") as "en" | "de";
    const slug = slashIdx !== -1 ? row.id.slice(slashIdx + 1) : row.id;
    const { error } = await action({
      collection: row.collection as "recipes" | "mixtures",
      locale,
      slug,
    });
    if (error) {
      toast.error("Failed to update status");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id && r.collection === row.collection ? { ...r, draft: !r.draft } : r,
      ),
    );
    toast.success(row.draft ? "Published" : "Moved to drafts");
  }

  async function handleDelete(row: ContentRow) {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;

    if (row.type === "pairing") {
      const { error } = await actions.deletePairing({ id: row.id });
      if (error) {
        toast.error("Delete failed");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Deleted");
      return;
    }

    const { error } = await actions.deleteItem({
      collection: row.collection as "recipes" | "mixtures" | "ingredients",
      id: row.id,
    });
    if (error) {
      toast.error("Delete failed");
      return;
    }
    setRows((prev) => prev.filter((r) => !(r.id === row.id && r.collection === row.collection)));
    toast.success("Deleted");
  }

  const columns = useMemo<ColumnDef<ContentRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            {column.getIsSorted() === "asc" ? (
              <ArrowUp size={14} />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown size={14} />
            ) : (
              <ArrowUpDown size={14} />
            )}
          </button>
        ),
        cell: ({ row }) => {
          const locale = getLocale(row.original);
          const lang = row.original.language;
          const trans = row.original.translations;
          const sub = row.original.subtitle;
          return (
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <a href={editHref(row.original)} className="font-medium hover:underline truncate">
                  {row.original.name}
                </a>
                {locale && <LocaleBadge locale={locale} />}
                {!locale && lang && <LocaleBadge locale={lang} />}
              </div>
              {trans && <TranslationPills translations={trans} />}
              {sub && <p className="text-xs text-muted-foreground truncate max-w-xs">{sub}</p>}
            </div>
          );
        },
      },
      {
        accessorKey: "collection",
        header: "Type",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs capitalize">
            {row.original.collection === "pairings"
              ? "Pairing"
              : row.original.collection.replace(/s$/, "")}
          </span>
        ),
      },
      {
        accessorKey: "draft",
        header: "Status",
        cell: ({ row }) => <DraftBadge draft={row.original.draft} />,
      },
      {
        id: "completeness",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Complete
            {column.getIsSorted() === "asc" ? (
              <ArrowUp size={14} />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown size={14} />
            ) : (
              <ArrowUpDown size={14} />
            )}
          </button>
        ),
        accessorFn: (row) => row.completeness.score,
        cell: ({ row }) => (
          <CompletenessBadge
            score={row.original.completeness.score}
            missing={row.original.completeness.missing}
            color={row.original.completeness.color}
            size="sm"
          />
        ),
      },
      {
        accessorKey: "updatedAt",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Updated
            {column.getIsSorted() === "asc" ? (
              <ArrowUp size={14} />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown size={14} />
            ) : (
              <ArrowUpDown size={14} />
            )}
          </button>
        ),
        cell: ({ row }) =>
          row.original.updatedAt ? (
            <span className="text-muted-foreground text-xs">
              {new Date(row.original.updatedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5 justify-end">
            <LinkButton variant="ghost" size="icon" href={editHref(row.original)} title="Edit">
              <Pencil size={14} />
            </LinkButton>
            {(row.original.type === "recipe" || row.original.type === "pairing") && (
              <Button
                variant="ghost"
                size="icon"
                title={row.original.draft ? "Publish" : "Unpublish"}
                onClick={() => handleToggleDraft(row.original)}
              >
                {row.original.draft ? <Eye size={14} /> : <EyeOff size={14} />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              title="Delete"
              onClick={() => handleDelete(row.original)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 }, sorting: [{ id: "updatedAt", desc: true }] },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input
          placeholder="Search…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-56"
        />
        <span className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} items
        </span>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40">
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs text-muted-foreground">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-12"
                >
                  No content found
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn("hover:bg-muted/30", row.original.draft && "opacity-60")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
