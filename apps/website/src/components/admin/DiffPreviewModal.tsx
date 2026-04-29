import { Loader2, Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import RecipeDiff from "./RecipeDiff.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  existing: Record<string, unknown>;
  proposed: Record<string, unknown>;
  onApply: () => void | Promise<void>;
  applying?: boolean;
  onBack?: () => void;
  backLabel?: string;
  warnings?: string[];
}

export default function DiffPreviewModal({
  open,
  onClose,
  title,
  existing,
  proposed,
  onApply,
  applying = false,
  onBack,
  backLabel = "Back",
  warnings = [],
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {warnings.length > 0 && (
            <div className="mb-3 space-y-0.5">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}
          <RecipeDiff existing={existing} proposed={proposed} />
        </div>

        <DialogFooter>
          {onBack && (
            <Button variant="outline" type="button" onClick={onBack}>
              <ChevronLeft size={14} className="mr-1" />
              {backLabel}
            </Button>
          )}
          <Button onClick={onApply} disabled={applying}>
            {applying ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                Applying…
              </>
            ) : (
              <>
                <Check size={14} className="mr-1" />
                Apply changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
