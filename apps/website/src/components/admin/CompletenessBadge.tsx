import { cn } from "@/lib/utils.ts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip.tsx";

interface Props {
  score: number;
  missing?: string[];
  color: "green" | "amber" | "red";
  size?: "sm" | "md";
}

const COLOR_MAP = {
  green: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950",
  amber: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950",
  red: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950",
};

const RING_MAP = {
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
};

export default function CompletenessBadge({ score, missing = [], color, size = "md" }: Props) {
  const r = size === "sm" ? 10 : 13;
  const cx = r + 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium tabular-nums",
        COLOR_MAP[color],
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
      )}
    >
      <svg width={cx * 2} height={cx * 2} className="shrink-0 -rotate-90">
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="2"
        />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={RING_MAP[color]}
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      {score}%
    </span>
  );

  if (missing.length === 0) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="inline-flex">{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold mb-1 text-xs">Missing recommended fields:</p>
          <ul className="text-xs space-y-0.5">
            {missing.map((f) => (
              <li key={f} className="text-muted-foreground">
                · {f}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
