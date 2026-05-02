import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import { Loader2, Search, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";

export interface ImageAttribution {
  source: string;
  sourceUrl: string;
  creator: string;
  creatorUrl?: string;
  license: string;
  licenseUrl: string;
  attribution: string;
}

export interface SelectedImage {
  url: string;
  attribution: ImageAttribution;
}

interface ImageResult {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  creator: string;
  creatorUrl: string;
  source: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (image: SelectedImage) => void;
  defaultQuery?: string;
}

export default function ImageSearchModal({ open, onClose, onSelect, defaultQuery = "" }: Props) {
  const [query, setQuery] = useState(defaultQuery);
  const [commercial, setCommercial] = useState(false);
  const [modifications, setModifications] = useState(false);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(count / PAGE_SIZE);

  function licenseType(): "commercial" | "modification" | "commercial,modification" | undefined {
    if (commercial && modifications) return "commercial,modification";
    if (commercial) return "commercial";
    if (modifications) return "modification";
    return undefined;
  }

  async function handleSearch(nextPage = 1) {
    if (!query.trim()) return;
    setLoading(true);
    setPage(nextPage);
    try {
      const { data, error } = await actions.searchImages({
        query: query.trim(),
        page: nextPage,
        licenseType: licenseType(),
      });
      if (error || !data) throw new Error(error?.message ?? "Search failed");
      setResults(data.results as ImageResult[]);
      setCount(data.count);
      setSearched(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(r: ImageResult) {
    onSelect({
      url: r.url,
      attribution: {
        source: r.source,
        sourceUrl: r.sourceUrl,
        creator: r.creator,
        creatorUrl: r.creatorUrl || undefined,
        license: r.license,
        licenseUrl: r.licenseUrl,
        attribution: r.attribution,
      },
    });
    onClose();
  }

  function handleClose() {
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-3xl flex flex-col max-h-[90vh]" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon size={16} className="text-primary" />
            Search CC-licensed images
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSearch(1)}
            placeholder="Search Openverse (Flickr CC, Wikimedia Commons, …)"
            autoFocus
          />
          <Button onClick={() => void handleSearch(1)} disabled={loading || !query.trim()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </Button>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={commercial}
              onChange={(e) => setCommercial(e.target.checked)}
              className="rounded"
            />
            Commercial use
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={modifications}
              onChange={(e) => setModifications(e.target.checked)}
              className="rounded"
            />
            Allow modifications
          </label>
          {count > 0 && (
            <span className="ml-auto text-muted-foreground">{count.toLocaleString()} results</span>
          )}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {loading && results.length === 0 && (
            <div className="flex justify-center p-8">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {searched && !loading && results.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No results found</p>
          )}
          {results.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelect(r)}
                  title={r.attribution}
                  className="group relative aspect-square overflow-hidden rounded border border-border hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                >
                  <img
                    src={r.thumbnail}
                    alt={r.title}
                    className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white p-1 text-[10px] leading-tight opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="truncate">{r.creator || r.source}</p>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 border-white/30 text-white/80 uppercase tracking-wide mt-0.5"
                    >
                      {r.license}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleSearch(page - 1)}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft size={14} />
              Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleSearch(page + 1)}
              disabled={page >= totalPages || loading}
            >
              Next
              <ChevronRight size={14} />
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Images sourced from{" "}
          <a
            href="https://openverse.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Openverse
          </a>{" "}
          (Flickr CC, Wikimedia Commons, and more). All images are CC-licensed or public domain.
        </p>
      </DialogContent>
    </Dialog>
  );
}
