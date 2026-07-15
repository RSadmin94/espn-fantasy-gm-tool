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
        "relative flex h-full flex-col rounded-md border bg-black/50",
        "animate-in fade-in slide-in-from-bottom-2 duration-400",
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
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-white/40 hover:bg-white/10"
          aria-label="Dismiss reaction"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-sm font-black",
            meta.bgClass,
            meta.borderClass,
            meta.accentClass,
          )}
        >
          {meta.displayName[0]}
        </span>
        <div className="min-w-0 flex-1 pr-4">
          <p className={cn("font-bold", meta.accentClass, compact ? "text-xs" : "text-sm")}>
            {meta.displayName}
          </p>
          <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-white/40">{card.label}</p>
          <p className={cn("mt-1.5 leading-snug text-white/88", compact ? "text-[11px]" : "text-xs")}>
            {card.text}
          </p>
        </div>
      </div>
    </article>
  );
}
