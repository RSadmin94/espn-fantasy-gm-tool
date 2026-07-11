import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";

export type RfsnSecondaryReactionProps = {
  card: RfsnCommentaryCard;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
};

export function RfsnSecondaryReaction({
  card,
  onDismiss,
  compact = false,
  className,
}: RfsnSecondaryReactionProps) {
  const meta = COMMENTATOR_META[card.commentator];

  return (
    <article
      className={cn(
        "relative rounded-md border bg-black/40 animate-in fade-in slide-in-from-bottom-2 duration-300",
        meta.borderClass,
        compact ? "p-2.5" : "p-3",
        className,
      )}
      aria-label={`${meta.displayName} reaction`}
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:bg-white/10"
          aria-label="Dismiss reaction"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
            meta.bgClass,
            meta.borderClass,
          )}
        >
          {meta.displayName[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-semibold", meta.accentClass)}>{meta.displayName}</p>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
          <p className="mt-1 text-xs leading-snug text-white/85">{card.text}</p>
        </div>
      </div>
    </article>
  );
}
