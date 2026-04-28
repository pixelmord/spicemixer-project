import { useState } from "react";
import { Loader2, Eye, ChevronDown, Save } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import LinkButton from "@/components/admin/LinkButton.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { cn } from "@/lib/utils.ts";

interface Props {
  saving: boolean;
  isDraft: boolean;
  backHref: string;
  previewHref?: string;
  onSave: (draft: boolean) => void;
}

export default function FormActionBar({ saving, isDraft, backHref, previewHref, onSave }: Props) {
  const [pendingDraft, setPendingDraft] = useState<boolean | null>(null);
  const effectiveDraft = pendingDraft ?? isDraft;

  function handlePrimary() {
    onSave(effectiveDraft);
    setPendingDraft(null);
  }

  return (
    <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-between gap-3 border-t border-border bg-background/80 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <LinkButton variant="ghost" size="sm" href={backHref}>
          Cancel
        </LinkButton>
        {previewHref && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (!saving) window.open(previewHref, "_blank");
            }}
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
            disabled={saving}
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
              disabled={saving}
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
  );
}
