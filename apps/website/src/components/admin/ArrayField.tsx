import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

interface Props<T> {
  label: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  addLabel?: string;
  className?: string;
}

export default function ArrayField<T>({
  label,
  items,
  onAdd,
  onRemove,
  renderItem,
  addLabel = "Add item",
  className,
}: Props<T>) {
  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="text-sm font-medium text-foreground mb-2">{label}</legend>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 group">
            <GripVertical size={16} className="text-muted-foreground mt-2.5 shrink-0 cursor-grab" />
            <div className="flex-1">{renderItem(item, i)}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive mt-0.5"
              onClick={() => onRemove(i)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAdd} className="mt-1">
        <Plus size={14} className="mr-1" />
        {addLabel}
      </Button>
    </fieldset>
  );
}
