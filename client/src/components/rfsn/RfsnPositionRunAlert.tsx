import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

export type RfsnPositionRunAlertProps = {
  count: number;
  position: string;
  className?: string;
};

export function RfsnPositionRunAlert({ count, position, className }: RfsnPositionRunAlertProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/40 bg-amber-500/10 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-amber-400">
        <TrendingUp className="h-4 w-4" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-widest">
          Run on {position}s
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-white">
        {count} {position}s taken in the last 9 picks
      </p>
      <div className="mt-2 flex gap-1" aria-hidden>
        {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-amber-400/70" />
        ))}
      </div>
    </div>
  );
}
