import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { levelLabel, type CommentaryLevel } from "@/lib/sofiaPresentation";

const LEVEL_CLASS: Record<CommentaryLevel, string> = {
  routine: "border-border/70 bg-muted/40 text-muted-foreground",
  notable: "border-primary/35 bg-primary/10 text-primary",
  major: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  historic: "border-lime-500/45 bg-lime-500/10 text-lime-500",
};

type SofiaMomentBadgeProps = {
  level: CommentaryLevel;
  className?: string;
};

export function SofiaMomentBadge({ level, className }: SofiaMomentBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-bold uppercase tracking-widest",
        LEVEL_CLASS[level],
        className,
      )}
    >
      {levelLabel(level)}
    </Badge>
  );
}
