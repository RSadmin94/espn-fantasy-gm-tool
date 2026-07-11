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

function CommentatorAvatar({
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
        "flex shrink-0 items-center justify-center rounded-full border-2 font-bold text-white/90",
        meta.bgClass,
        meta.borderClass,
        compact ? "h-8 w-8 text-xs" : "h-12 w-12 text-sm",
      )}
      aria-hidden
    >
      {meta.displayName[0]}
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
        "relative rounded-lg border bg-black/50 shadow-lg animate-in fade-in slide-in-from-right-4 duration-300",
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
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-white"
          aria-label="Dismiss commentary"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex gap-3">
        {!compact && <CommentatorAvatar commentator={card.commentator} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {compact && <CommentatorAvatar commentator={card.commentator} compact />}
            <div>
              <p className={cn("text-sm font-bold", meta.accentClass)}>{meta.displayName}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {card.label}
              </p>
            </div>
          </div>
          <p
            className={cn(
              "mt-2 text-sm leading-relaxed text-white/90",
              card.long && "overflow-y-auto pr-1",
              card.long && (compact ? "max-h-24" : "max-h-32"),
            )}
          >
            {card.text}
          </p>
        </div>
      </div>
    </article>
  );
}
