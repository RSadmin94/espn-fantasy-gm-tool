import { cn } from "@/lib/utils";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";
import type { RfsnCommentaryLogEntry } from "@/lib/rfsnCommentaryLog";

export type RfsnCommentaryLogProps = {
  entries: RfsnCommentaryLogEntry[];
  className?: string;
};

export function RfsnCommentaryLog({ entries, className }: RfsnCommentaryLogProps) {
  return (
    <div
      className={cn("mt-3 rounded-md border border-white/[0.06] bg-black/30 px-2.5 py-2", className)}
      data-rfsn-commentary-log
      aria-label="RFSN written commentary log"
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-white/45">Running log</p>
      {entries.length === 0 ? (
        <p className="mt-1 text-[11px] italic text-white/30">Waiting for written commentary…</p>
      ) : (
        <ul className="mt-1.5 max-h-40 space-y-1.5 overflow-y-auto pr-1">
          {[...entries].reverse().map((entry) => {
            const meta = COMMENTATOR_META[entry.commentator];
            return (
              <li key={entry.id} className="border-b border-white/[0.04] pb-1.5 last:border-0 last:pb-0">
                <div className="flex items-baseline gap-1.5">
                  <span className={cn("text-[10px] font-black uppercase tracking-wide", meta.accentClass)}>
                    {meta.displayName}
                  </span>
                  <span className="text-[9px] tabular-nums text-white/30">{entry.pickLabel}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-white/75">{entry.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
