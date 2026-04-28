import { Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip.tsx";

interface Props {
  show: boolean;
}

export default function RecommendedHint({ show }: Props) {
  if (!show) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="inline-flex ml-1.5 align-middle">
          <Sparkles size={12} className="text-amber-500" />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">Recommended — helps improve content quality</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
