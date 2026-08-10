import { cn } from "@/lib/utils";
import type { RfsnOrderSlot } from "@/lib/rfsnPresentation";
import { clockProgress, clockUrgencyLevel } from "@/lib/rfsnBroadcastProduction";

export type RfsnDraftOrderProps = {
  slots: RfsnOrderSlot[];
  clockSeconds: number;
  overallPick: string;
  className?: string;
};

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RfsnDraftOrder({
  slots,
  clockSeconds,
  overallPick,
  className,
}: RfsnDraftOrderProps) {
  const onClockIdx = slots.findIndex((s) => s.isOnClock);
  const progress = clockProgress(clockSeconds);
  const urgency = clockUrgencyLevel(clockSeconds);
  const circumference = 2 * Math.PI * 34;

  return (
    <nav
      className={cn(
        "flex h-full flex-col rounded-md border border-white/10 bg-black/40",
        urgency === "urgent" && "rfsn-clock-urgent",
        className,
      )}
      aria-label="Draft order"
      data-rfsn-focus-dim
    >
      <h2 className="border-b border-white/10 px-2.5 py-2 text-2xs font-black uppercase tracking-[0.22em] text-ink-secondary">
        Draft Order
      </h2>
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {slots.map((slot) => (
          <li
            key={slot.pickLabel}
            className={cn(
              "flex items-center gap-2 rounded px-2 py-1.5 text-label transition-colors duration-500",
              slot.isOnClock &&
                "border border-emerald-400/60 bg-emerald-500/15 shadow-[0_0_16px_rgba(52,211,153,0.12)]",
              slot.isComplete && !slot.isOnClock && "opacity-45",
            )}
          >
            <span className="w-9 shrink-0 font-mono text-label text-ink-secondary">{slot.pickLabel}</span>
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-2xs font-black text-white/80",
                slot.isOnClock && "ring-2 ring-emerald-400 ring-offset-1 ring-offset-[#050508]",
              )}
            >
              {slot.teamAbbr}
            </span>
            <span className="truncate font-semibold text-white/85">{slot.teamName}</span>
          </li>
        ))}
      </ul>

      {onClockIdx >= 0 && (
        <div className="border-t border-white/10 p-3">
          <div className="flex flex-col items-center">
            <span className="text-2xs font-black uppercase tracking-[0.2em] text-emerald-400">
              On the clock
            </span>
            <div className="relative mt-2 flex h-20 w-20 items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80" aria-hidden>
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  className="rfsn-clock-ring"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="4"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  className="rfsn-clock-ring rfsn-clock-ring-progress"
                  stroke="rgba(52,211,153,0.85)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${circumference}`}
                  strokeDashoffset={`${circumference * (1 - progress)}`}
                />
              </svg>
              <span
                className={cn(
                  "text-2xl font-black tabular-nums tracking-tight text-white transition-colors duration-500",
                  urgency === "urgent" && "text-amber-400",
                )}
              >
                {formatClock(clockSeconds)}
              </span>
            </div>
            <span className="mt-1 text-label font-bold uppercase tracking-wider text-white/45">
              Pick {overallPick}
            </span>
          </div>
        </div>
      )}
    </nav>
  );
}
