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
        "rounded-md border border-amber-500/45 bg-gradient-to-br from-amber-500/15 to-black/50 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-amber-400">
        <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-2xs font-semibold uppercase tracking-wide">
          Run on {position}s
        </span>
      </div>
      <p className="mt-1.5 text-sm font-bold leading-tight text-white md:text-base">
        {count} {position}s taken in the last 9 picks
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1" aria-hidden>
        {Array.from({ length: Math.min(count, 10) }).map((_, i) => (
          <span
            key={i}
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-amber-400/20 text-2xs font-semibold text-amber-300"
          >
            {position[0]}
          </span>
        ))}
      </div>
    </div>
  );
}
