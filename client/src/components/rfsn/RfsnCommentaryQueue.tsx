import { cn } from "@/lib/utils";
import type { RfsnQueuedMoment } from "@/lib/rfsnPresentation";
import { COMMENTATOR_META, significanceLabel } from "@/lib/rfsnPresentation";
import { Clock } from "lucide-react";

export type RfsnCommentaryQueueProps = {
  queue: RfsnQueuedMoment[];
  compact?: boolean;
  className?: string;
};

export function RfsnCommentaryQueue({ queue, compact = false, className }: RfsnCommentaryQueueProps) {
  if (queue.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-md border border-white/15 bg-white/5",
        compact ? "p-2" : "p-3",
        className,
      )}
      aria-label="Commentary queue"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-widest">Queued</span>
        <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">
          {queue.length}
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {queue.map((moment) => {
          const meta = COMMENTATOR_META[moment.primary.commentator];
          return (
            <li
              key={moment.id}
              className="rounded border border-white/10 bg-black/30 p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("font-semibold", meta.accentClass)}>{meta.displayName}</span>
                <span className="text-[9px] uppercase text-muted-foreground">
                  {significanceLabel(moment.significance)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-white/70">{moment.primary.text}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
