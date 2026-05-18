import { Info } from "lucide-react";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface TraceSummary {
  traceId: string;
  model: string;
  runtimeMs: number;
  preset?: string;
  userPrompt?: string;
  confidence?: "high" | "medium" | "low";
}

interface SuggestionTraceInfoProps {
  trace: TraceSummary;
  className?: string;
}

export function SuggestionTraceInfo({ trace, className }: SuggestionTraceInfoProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Show trace info"
          className={cn("rounded p-0.5 text-stone-400 hover:text-stone-600", className)}
        >
          <Info size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-xs">
        <p className="mb-2 font-medium text-stone-700">Trace info</p>
        <dl className="space-y-1">
          <TraceRow label="Model" value={trace.model} />
          <TraceRow label="Runtime" value={`${trace.runtimeMs}ms`} />
          {trace.preset && <TraceRow label="Preset" value={trace.preset} />}
          {trace.userPrompt && <TraceRow label="Prompt" value={trace.userPrompt} />}
          {trace.confidence && <TraceRow label="Confidence" value={trace.confidence} />}
          <TraceRow label="Trace ID" value={trace.traceId} mono />
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function TraceRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-stone-400">{label}</dt>
      <dd className={cn("flex-1 break-all text-stone-700", mono && "font-mono text-[10px]")}>
        {value}
      </dd>
    </div>
  );
}
