import { cn } from "@/lib/utils";
import type { RfsnSignificance } from "@/lib/rfsnPresentation";
import { significanceLabel } from "@/lib/rfsnPresentation";

export type RfsnMomentBannerProps = {
  significance: RfsnSignificance;
  meter?: number;
  compact?: boolean;
  className?: string;
};

const BANNER_ACCENT: Record<RfsnSignificance, string> = {
  routine: "border-white/20 bg-white/5",
  notable: "border-sky-500/40 bg-sky-500/10",
  major: "border-amber-500/40 bg-amber-500/10",
  historic: "border-red-500/50 bg-red-500/10",
};

export function RfsnMomentBanner({
  significance,
  meter,
  compact = false,
  className,
}: RfsnMomentBannerProps) {
  const fill = meter != null ? Math.min(1, Math.max(0, meter)) : null;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        BANNER_ACCENT[significance],
        compact && "py-1.5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Moment
        </span>
        <span className="text-xs font-bold uppercase">{significanceLabel(significance)}</span>
      </div>
      {fill != null && (
        <div
          className="mt-1.5 flex gap-0.5"
          role="presentation"
          aria-hidden
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-sm",
                i / 10 < fill ? "bg-amber-500/80" : "bg-white/10",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
