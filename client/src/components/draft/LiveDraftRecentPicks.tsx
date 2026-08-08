/**
 * RFSN-024 — Recent locked picks timeline (presentation only).
 * Reads existing schedule/results; does not create a second commentary feed.
 */
import { cn } from "@/lib/utils";
import type { LiveDraftRecentPick } from "@/lib/liveDraftUx";

const POS_TONE: Record<string, string> = {
  QB: "text-red-300",
  RB: "text-lime-300",
  WR: "text-violet-300",
  TE: "text-orange-300",
  K: "text-zinc-300",
  DEF: "text-violet-300",
  DST: "text-violet-300",
  DP: "text-fuchsia-300",
};

type Props = {
  picks: LiveDraftRecentPick[];
  currentPickNumber?: number | null;
  className?: string;
};

export function LiveDraftRecentPicks({ picks, currentPickNumber, className }: Props) {
  return (
    <div
      className={cn(
        "mb-3 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2",
        className,
      )}
      data-live-draft-timeline
      data-rfsn-024
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Recent activity
        </span>
        {currentPickNumber != null && Number.isFinite(currentPickNumber) ? (
          <span className="text-[10px] text-violet-300/90 tabular-nums">
            On deck · Pick {currentPickNumber}
          </span>
        ) : null}
      </div>

      {picks.length === 0 ? (
        <p className="text-[11px] text-ink-secondary italic" data-live-draft-timeline-empty>
          Waiting for live draft activity
        </p>
      ) : (
        <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
          {picks.map((p) => (
            <li
              key={p.pickNumber}
              className={cn(
                "flex items-center gap-2 rounded px-1.5 py-1 text-[11px]",
                p.isLast
                  ? "bg-emerald-500/10 border border-emerald-500/30"
                  : "border border-transparent",
                currentPickNumber === p.pickNumber && "ring-1 ring-violet-400/40",
              )}
              data-pick={p.pickNumber}
              data-last-pick={p.isLast ? "true" : undefined}
            >
              <span className="text-ink-tertiary tabular-nums w-10 shrink-0">
                {p.round}.{String(p.pickNumber).padStart(2, "0")}
              </span>
              <span className="text-zinc-400 truncate max-w-[5.5rem] shrink-0">{p.ownerName}</span>
              <span className="text-zinc-200 font-semibold truncate flex-1">{p.playerName}</span>
              <span
                className={cn(
                  "font-bold uppercase shrink-0",
                  POS_TONE[p.position] ?? "text-zinc-400",
                )}
              >
                {p.position}
              </span>
              {p.hasReaction ? (
                <span className="text-[9px] font-black uppercase tracking-wide text-[#a3e635] shrink-0">
                  RFSN
                </span>
              ) : null}
              {p.isLast ? (
                <span className="text-[9px] font-black uppercase tracking-wide text-emerald-300 shrink-0">
                  Last
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
