import { Check } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DialogFooter } from "@/components/ui/dialog.tsx";
import { IngestDialog } from "@/components/admin/IngestDialog.tsx";
import RecipeDiff from "@/components/admin/RecipeDiff.tsx";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFlow = any;

interface RecipeEnhanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flow: AnyFlow;
  onRun: Parameters<typeof IngestDialog>[0]["onRun"];
  onReviewBack: () => void;
  snapshot: Record<string, unknown>;
  proposed: Record<string, unknown> | null | undefined;
  warnings: string[];
  onApply: () => void;
}

export function RecipeEnhanceDialog({
  open,
  onOpenChange,
  flow,
  onRun,
  onReviewBack,
  snapshot,
  proposed,
  warnings,
  onApply,
}: RecipeEnhanceDialogProps) {
  return (
    <IngestDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Enhance recipe"
      flow={flow}
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
              <RecipeDiff existing={snapshot} proposed={proposed} />
            </div>
            <DialogFooter>
              <Button type="button" onClick={onApply}>
                <Check size={14} className="mr-1" />
                Apply changes
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
