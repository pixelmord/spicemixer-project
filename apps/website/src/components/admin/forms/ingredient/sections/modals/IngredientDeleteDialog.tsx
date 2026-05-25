import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog.tsx";

interface IngredientDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  locale: "en" | "de";
  onConfirm: () => Promise<void> | void;
}

export function IngredientDeleteDialog({
  open,
  onOpenChange,
  slug,
  locale,
  onConfirm,
}: IngredientDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <div className="space-y-4">
          <p className="text-sm">
            Delete <strong>{slug}</strong> ({locale.toUpperCase()})? This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void onConfirm()}>
              <Trash2 size={14} className="mr-1" />
              Delete
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
