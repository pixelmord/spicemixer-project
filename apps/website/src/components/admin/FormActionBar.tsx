import { useState } from "react";
import { Loader2, Eye, ChevronDown, Save, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import LinkButton from "@/components/admin/LinkButton.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Dialog, DialogContent } from "@/components/ui/dialog.tsx";
import { cn } from "@/lib/utils.ts";

interface Props {
  saving: boolean;
  isDraft: boolean;
  backHref: string;
  previewHref?: string;
  onSave: (draft: boolean) => void;
  saveDisabled?: boolean;
}

export default function FormActionBar({
  saving,
  isDraft,
  backHref,
  previewHref,
  onSave,
  saveDisabled,
}: Props) {
  const [pendingDraft, setPendingDraft] = useState<boolean | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const effectiveDraft = pendingDraft ?? isDraft;

  function handlePrimary() {
    onSave(effectiveDraft);
    setPendingDraft(null);
  }

  return (
    <>
      <div
        className="fixed bottom-0 right-0 z-40 border-t border-border bg-background/80 px-6 py-3 backdrop-blur-md"
        style={{ left: "var(--sidebar-w, 0px)", transition: "left 200ms" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LinkButton variant="ghost" size="sm" href={backHref}>
              Cancel
            </LinkButton>
            {previewHref && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                disabled={saving}
              >
                <Eye size={14} className="mr-1" />
                Preview
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium px-2 py-1 rounded-full",
                effectiveDraft
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
              )}
            >
              {effectiveDraft ? "Draft" : "Published"}
            </span>

            {/* Split save button */}
            <div className="flex items-center">
              <Button
                type="button"
                onClick={handlePrimary}
                disabled={saving || saveDisabled}
                className="rounded-r-none border-r-0 pr-2.5"
              >
                {saving ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <Save size={14} className="mr-1" />
                )}
                {effectiveDraft ? "Save as Draft" : "Save & Publish"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={saving || saveDisabled}
                  className={cn(
                    "flex h-8 items-center rounded-l-none rounded-r-lg border border-l border-primary/30 bg-primary px-1.5 text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <ChevronDown size={14} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top">
                  <DropdownMenuItem
                    onClick={() => {
                      setPendingDraft(false);
                      onSave(false);
                    }}
                  >
                    Save &amp; Publish
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setPendingDraft(true);
                      onSave(true);
                    }}
                  >
                    Save as Draft
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Preview modal — full-viewport iframe overlay */}
      {previewHref && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent
            showCloseButton={false}
            className="top-4 translate-y-0 w-[calc(100%-2rem)] max-w-5xl h-[calc(100vh-2rem)] sm:max-w-5xl flex flex-col p-0 gap-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0">
              <span className="text-sm font-medium text-muted-foreground">Preview</span>
              <div className="flex items-center gap-3">
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink size={12} />
                  Open in new tab
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPreviewOpen(false)}
                >
                  <X size={14} />
                </Button>
              </div>
            </div>
            {/* iframe fills remaining height */}
            <iframe
              src={previewHref}
              className="flex-1 w-full rounded-b-xl border-0"
              title="Preview"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
