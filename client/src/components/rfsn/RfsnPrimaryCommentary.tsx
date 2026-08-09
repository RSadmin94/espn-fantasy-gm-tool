import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";

export type RfsnPrimaryCommentaryProps = {
  card: RfsnCommentaryCard;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
};

function CommentatorPortrait({
  commentator,
  compact = false,
}: {
  commentator: RfsnCommentaryCard["commentator"];
  compact?: boolean;
}) {
  const meta = COMMENTATOR_META[commentator];
  return (
    <div
      className={cn(
        "flex shrink-0 items-end justify-center overflow-hidden rounded-md border-2 bg-gradient-to-b from-white/10 to-black/60 font-black uppercase text-white/90",
        meta.borderClass,
        compact ? "h-14 w-11 text-lg" : "h-28 w-[4.5rem] text-3xl",
      )}
      aria-hidden
    >
      <span className={cn("pb-2", meta.accentClass)}>{meta.displayName[0]}</span>
    </div>
  );
}

export function RfsnPrimaryCommentary({
  card,
  onDismiss,
  compact = false,
  className,
}: RfsnPrimaryCommentaryProps) {
  const meta = COMMENTATOR_META[card.commentator];

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-md border bg-gradient-to-br from-black/70 to-black/40 shadow-lg",
        "animate-in fade-in slide-in-from-right-3 duration-500",
        meta.borderClass,
        compact ? "p-3" : "p-4",
        className,
      )}
      aria-label={`${meta.displayName} commentary`}
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-2 top-2 z-10 rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss commentary"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className={cn("flex gap-3", compact ? "items-start" : "items-stretch")}>
        <CommentatorPortrait commentator={card.commentator} compact={compact} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2 pr-6">
            <div>
              <p className={cn("font-black tracking-tight", meta.accentClass, compact ? "text-sm" : "text-lg")}>
                {meta.displayName}
              </p>
              <p className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">
                {card.label}
              </p>
            </div>
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">RFSN</span>
          </div>
          <p
            className={cn(
              "mt-2 flex-1 leading-relaxed text-white/92",
              compact ? "text-xs" : "text-sm md:text-[15px]",
              card.long && "overflow-y-auto pr-1",
              card.long && (compact ? "max-h-24" : "max-h-40"),
            )}
          >
            {card.text}
          </p>
        </div>
      </div>
    </article>
  );
}
