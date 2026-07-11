import { cn } from "@/lib/utils";
import type { RfsnOrderSlot } from "@/lib/rfsnPresentation";

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
  const onClock = slots.find((s) => s.isOnClock);

  return (
    <nav
      className={cn(
        "flex h-full flex-col rounded-lg border border-white/10 bg-black/30 p-2",
        className,
      )}
      aria-label="Draft order"
    >
      <h2 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Round order
      </h2>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {slots.map((slot) => (
          <li
            key={slot.pickLabel}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
              slot.isOnClock && "border border-emerald-500/50 bg-emerald-500/10",
              slot.isComplete && "opacity-50",
            )}
          >
            <span className="w-8 font-mono text-muted-foreground">{slot.pickLabel}</span>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold",
                slot.isOnClock && "ring-2 ring-emerald-400",
              )}
            >
              {slot.teamAbbr}
            </span>
            <span className="truncate font-medium">{slot.teamName}</span>
          </li>
        ))}
      </ul>
      {onClock && (
        <div className="mt-2 flex flex-col items-center rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <span className="text-[10px] font-bold uppercase text-emerald-400">On the clock</span>
          <span className="mt-1 text-2xl font-black tabular-nums">{formatClock(clockSeconds)}</span>
          <span className="text-[10px] text-muted-foreground">Pick {overallPick}</span>
        </div>
      )}
    </nav>
  );
}
