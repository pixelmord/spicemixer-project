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
  type: "recipe" | "ingredient";
  collection: string;
  id: string;
  name: string;
  draft: boolean;
  completeness: { score: number; missing: string[]; color: "green" | "amber" | "red" };
  updatedAt?: string;
}

function editHref(row: ContentRow) {
  if (row.type === "ingredient") {
    // id is "en/cardamom" or "de/sumac". Locale goes in a query param so Astro's
    // i18n routing doesn't strip the default locale ("en") from the URL path.
    const slashIdx = row.id.indexOf("/");
    if (slashIdx === -1) return "#"; // malformed id — root-level file, skip
    const locale = row.id.slice(0, slashIdx);
    const slug = row.id.slice(slashIdx + 1);
    return `/admin/ingredients/${slug}/edit?locale=${locale}`;
  }
  return `/admin/${row.collection}/${row.id}/edit`;
}

function collectionLabel(c: string) {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export default function ContentTable({ initialRows }: { initialRows: ContentRow[] }) {
  const [rows, setRows] = useState<ContentRow[]>(initialRows);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  async function handleToggleDraft(row: ContentRow) {
    if (row.type === "ingredient") return; // ingredients have no draft
    const action = row.draft ? actions.publish : actions.unpublish;
    const { error } = await action({
      collection: row.collection as "recipes" | "spicemixes" | "sauces",
      id: row.id,
    });
    if (error) {
      toast.error("Failed to update draft status");
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
    const { error } = await actions.deleteItem({
      collection: row.collection as "recipes" | "spicemixes" | "sauces" | "ingredients",
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
        cell: ({ row }) => (
          <a
            href={editHref(row.original)}
            className="font-medium hover:underline truncate max-w-xs block"
          >
            {row.original.name as string}
          </a>
        ),
      },
      {
        accessorKey: "collection",
        header: "Collection",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {collectionLabel(row.original.collection)}
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
        header: "Last updated",
        cell: ({ row }) =>
          row.original.updatedAt ? (
            <span className="text-muted-foreground text-sm">
              {new Date(row.original.updatedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <LinkButton variant="ghost" size="icon" href={editHref(row.original)} title="Edit">
              <Pencil size={14} />
            </LinkButton>
            {row.original.type === "recipe" && (
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
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search content…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground">
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

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
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
    </div>
  );
}
