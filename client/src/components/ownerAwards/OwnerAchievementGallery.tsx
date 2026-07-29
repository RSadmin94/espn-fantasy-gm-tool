import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Award, ChevronDown, ChevronUp } from "lucide-react";
import {
  buildOwnerAwardComparisonStats,
  buildOwnerEarnedAwards,
  formatOwnerAwardStat,
  type OwnerAwardLike,
} from "@/lib/ownerAwardsDisplay";
import { OwnerAwardTooltip } from "./OwnerAwardTooltip";
import { ownerAwardIcon, rarityCardStyle, RARITY_COLORS } from "./ownerAwardVisuals";
import { cn } from "@/lib/utils";
import { IntelPanel } from "@/components/layout";

export type OwnerAchievementGalleryProps = {
  ownerName: string;
  ownerKey: string | null;
  ownerAwards: OwnerAwardLike[];
  className?: string;
};

/**
 * Complete Achievement Gallery for a selected owner.
 * Shows only awards they currently hold (V1 = one holder per award).
 */
export function OwnerAchievementGallery({
  ownerName,
  ownerKey,
  ownerAwards,
  className,
}: OwnerAchievementGalleryProps) {
  const stats = useMemo(
    () => buildOwnerAwardComparisonStats(ownerAwards, ownerKey, ownerName),
    [ownerAwards, ownerKey, ownerName],
  );
  const earned = useMemo(
    () => buildOwnerEarnedAwards(ownerAwards, ownerKey, ownerName),
    [ownerAwards, ownerKey, ownerName],
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <IntelPanel variant="warm" className={cn("mb-5 overflow-hidden p-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 shrink-0 text-amber-400/90" aria-hidden />
          <h2 className="text-sm font-semibold text-zinc-100">
            {ownerName}&apos;s Achievement Gallery
          </h2>
        </div>
        <Link
          to="/rivals/awards"
          className="text-[11px] font-bold uppercase tracking-wide text-[#a3e635] hover:underline"
        >
          Award Catalog →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-white/[0.06] p-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatChip label="Career Awards" value={stats.totalAwards} />
        <StatChip label="Unique Awards" value={stats.uniqueAwards} />
        <StatChip label="Legendary" value={stats.legendaryCount} tone="Legendary" />
        <StatChip label="Epic" value={stats.epicCount} tone="Epic" />
        <StatChip label="Rare" value={stats.rareCount} tone="Rare" />
        <StatChip label="Common" value={stats.commonCount} tone="Common" />
      </div>

      {earned.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">
          No awards on the board for {ownerName} yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2" role="list">
          {earned.map((item) => {
            const { meta, row, timesEarned, seasonsEarned, holdingNow } = item;
            const Icon = ownerAwardIcon(meta.icon);
            const open = expanded === meta.id;
            const colors = RARITY_COLORS[meta.rarity];
            return (
              <li key={meta.id}>
                <OwnerAwardTooltip awardName={meta.awardName} timesEarned={timesEarned}>
                  <div
                    className="rounded-xl border p-4 transition-colors"
                    style={rarityCardStyle(meta.rarity)}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635]/70"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : meta.id)}
                    >
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
                        style={{ borderColor: colors.border, background: colors.bg, color: colors.fg }}
                        aria-hidden
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-zinc-50">{meta.displayName}</span>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                              colors.chip,
                            )}
                          >
                            {meta.rarity}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-zinc-300">
                          Won {timesEarned} {timesEarned === 1 ? "Time" : "Times"}
                          {holdingNow ? " · Holding now" : ""}
                        </span>
                        {seasonsEarned.length > 0 ? (
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {seasonsEarned.map((y) => (
                              <span
                                key={y}
                                className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-zinc-300"
                              >
                                {y}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="mt-2 block text-[11px] text-zinc-500">
                            Season history not tracked for this award yet.
                          </span>
                        )}
                        <span className="mt-2 block text-xs leading-relaxed text-zinc-400">
                          {meta.shortDescription}
                        </span>
                      </span>
                      {open ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                      )}
                    </button>

                    {open ? (
                      <div className="mt-3 space-y-2 border-t border-white/[0.08] pt-3 text-xs text-zinc-300">
                        <DetailLine label="Description" text={meta.longDescription} />
                        <DetailLine label="How it is earned" text={meta.howEarned} />
                        <DetailLine label="Eligibility" text={meta.eligibility} />
                        <DetailLine
                          label="Stat"
                          text={formatOwnerAwardStat(meta.awardName, row.value)}
                        />
                        {row.reason ? <DetailLine label="Evidence" text={String(row.reason)} /> : null}
                        <Link
                          to={`/rivals/awards/${meta.id}`}
                          className="inline-flex font-bold text-[#a3e635] hover:underline"
                        >
                          Open award detail →
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </OwnerAwardTooltip>
              </li>
            );
          })}
        </ul>
      )}
    </IntelPanel>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: keyof typeof RARITY_COLORS;
}) {
  const color = tone ? RARITY_COLORS[tone].fg : "#e4e4e7";
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-black tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function DetailLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 leading-relaxed text-zinc-300">{text}</p>
    </div>
  );
}
