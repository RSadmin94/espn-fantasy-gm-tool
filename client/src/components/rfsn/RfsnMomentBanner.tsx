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
  routine: "border-white/15 bg-white/[0.03]",
  notable: "border-sky-500/35 bg-sky-500/10",
  major: "border-amber-500/40 bg-amber-500/10",
  historic: "border-red-500/45 bg-red-500/10",
};

export function RfsnMomentBanner({
  significance,
  meter,
  compact = false,
  className,
}: RfsnMomentBannerProps) {
  const fill = meter != null ? Math.min(1, Math.max(0, meter)) : null;
  const score = fill != null ? Math.round(fill * 100) : null;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 rfsn-broadcast-enter",
        BANNER_ACCENT[significance],
        compact && "py-1.5",
        className,
      )}
      data-rfsn-focus-target
    >
      <div className="flex items-center justify-between gap-3">
        {score != null && (
          <div>
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">
              Moment score
            </span>
            <p className="text-lg font-black tabular-nums leading-none text-white">{score}</p>
          </div>
        )}
        <div className="text-right">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-tertiary">
            {score == null ? "Moment" : "Pick tier"}
          </span>
          <p className="text-xs font-black uppercase tracking-wide text-white">
            {significanceLabel(significance)} pick
          </p>
        </div>
      </div>
      {fill != null && (
        <div className="mt-2 flex gap-0.5" role="presentation" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-sm",
                i / 5 < fill ? "bg-amber-400/90" : "bg-white/10",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
