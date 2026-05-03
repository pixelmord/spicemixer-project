import { Check, X, Maximize2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";

interface AutoAppliedProps {
  autoApplied: true;
  previousValue: string;
  onRevert: () => void;
  className?: string;
}

interface SuggestionProps {
  autoApplied?: false;
  label?: string;
  current: string;
  suggested: string;
  rationale?: string;
  onAccept: (value: string) => void;
  onDismiss: () => void;
  onExpand?: () => void;
  className?: string;
}

type Props = AutoAppliedProps | SuggestionProps;

export default function InlineSuggestion(props: Props) {
  if (props.autoApplied) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-2 py-0.5 text-[11px] text-primary",
          props.className,
        )}
      >
        <span className="font-medium">AI applied</span>
        <span className="text-primary/50">·</span>
        <button
          type="button"
          onClick={props.onRevert}
          className="flex items-center gap-0.5 hover:underline"
          title={`Revert to: ${props.previousValue}`}
        >
          <Undo2 size={9} />
          revert
        </button>
      </div>
    );
  }

  const { label, current, suggested, rationale, onAccept, onDismiss, onExpand, className } = props;

  return (
    <div
      className={cn(
        "rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs space-y-1.5",
        className,
      )}
    >
      {label && (
        <p className="font-semibold text-primary text-[11px] uppercase tracking-wide">{label}</p>
      )}
      <p className="text-foreground/80 leading-relaxed">{suggested}</p>
      {rationale && <p className="text-muted-foreground italic">{rationale}</p>}
      {current && (
        <p className="text-muted-foreground/60 line-through text-[11px]">
          Was: {current.slice(0, 80)}
          {current.length > 80 ? "…" : ""}
        </p>
      )}
      <div className="flex items-center gap-1 pt-0.5">
        <button
          type="button"
          onClick={() => onAccept(suggested)}
          className="flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-primary-foreground hover:opacity-90"
        >
          <Check size={10} />
          Apply
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted"
        >
          <X size={10} />
          Dismiss
        </button>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted"
            title="View in diff modal"
          >
            <Maximize2 size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
