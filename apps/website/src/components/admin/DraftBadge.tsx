import { Badge } from "@/components/ui/badge.tsx";

interface Props {
  draft: boolean;
}

export default function DraftBadge({ draft }: Props) {
  return draft ? (
    <Badge
      variant="outline"
      className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950"
    >
      Draft
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="text-emerald-600 border-emerald-400 bg-emerald-50 dark:bg-emerald-950"
    >
      Published
    </Badge>
  );
}
