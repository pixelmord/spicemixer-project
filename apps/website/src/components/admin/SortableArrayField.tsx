import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

interface SortableItemProps<T> {
  id: string;
  item: T;
  index: number;
  onRemove: () => void;
  renderItem: (item: T, index: number) => React.ReactNode;
}

function SortableItem<T>({ id, item, index, onRemove, renderItem }: SortableItemProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-start gap-2"
    >
      <button
        type="button"
        className="mt-2 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1">{renderItem(item, index)}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

interface Props<T> {
  items: T[];
  onChange: (items: T[]) => void;
  onAdd: () => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey?: (item: T, index: number) => string;
  addLabel?: string;
  className?: string;
}

export default function SortableArrayField<T>({
  items,
  onChange,
  onAdd,
  renderItem,
  getKey,
  addLabel = "Add item",
  className,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map((item, i) => getKey?.(item, i) ?? `item-${i}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      onChange(arrayMove(items, oldIndex, newIndex));
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item, i) => (
              <SortableItem
                key={ids[i]}
                id={ids[i]!}
                item={item}
                index={i}
                onRemove={() => onChange(items.filter((_, j) => j !== i))}
                renderItem={renderItem}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus size={14} className="mr-1" />
        {addLabel}
      </Button>
    </div>
  );
}
