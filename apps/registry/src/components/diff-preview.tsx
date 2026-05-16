import { cn } from "@/lib/utils";

interface DiffPreviewProps {
  before: string;
  after: string;
  label?: string;
  className?: string;
}

export function DiffPreview({ before, after, label, className }: DiffPreviewProps) {
  return (
    <div className={cn("rounded-md border text-sm", className)}>
      {label && (
        <div className="border-b px-3 py-1.5 text-xs font-medium text-stone-500">{label}</div>
      )}
      <div className="grid grid-cols-2 divide-x">
        <div className="p-3">
          <p className="mb-1 text-xs font-medium text-stone-400">Before</p>
          <p className="whitespace-pre-wrap text-stone-600 line-through">{before}</p>
        </div>
        <div className="p-3">
          <p className="mb-1 text-xs font-medium text-stone-400">After</p>
          <p className="whitespace-pre-wrap text-stone-900">{after}</p>
        </div>
      </div>
    </div>
  );
}
