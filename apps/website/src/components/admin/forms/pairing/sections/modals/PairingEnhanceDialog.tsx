import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DialogFooter } from "@/components/ui/dialog.tsx";
import { IngestDialog, type SourceShape } from "@/components/admin/IngestDialog.tsx";
import PairingDiff from "@/components/admin/PairingDiff.tsx";

interface PairingEnhanceDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  locale: string;
  onRun: (source: SourceShape) => Promise<void>;
  onReviewBack: () => void;
  warnings: string[];
  existing: Record<string, unknown>;
  proposed: (Record<string, unknown> & { description: string }) | null;
  applying: boolean;
  onApply: () => Promise<void>;
}

export function PairingEnhanceDialog({
  open,
  onOpenChange,
  locale,
  onRun,
  onReviewBack,
  warnings,
  existing,
  proposed,
  applying,
  onApply,
}: PairingEnhanceDialogProps) {
  return (
    <IngestDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Enhance pairing description (${locale.toUpperCase()})`}
      onRun={onRun}
      onReviewBack={onReviewBack}
      reviewChildren={
        proposed ? (
          <div className="space-y-4">
            <div className="max-h-[50vh] overflow-y-auto">
              {warnings.length > 0 && (
                <div className="mb-3 space-y-0.5">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                      ⚠ {w}
                    </p>
                  ))}
                </div>
              )}
              <PairingDiff existing={existing} proposed={proposed} locale={locale} />
            </div>
            <DialogFooter>
              <Button onClick={() => void onApply()} disabled={applying}>
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
          </div>
        ) : undefined
      }
      generateLabel="Generate enhanced version"
      className="sm:max-w-4xl"
    />
  );
}
