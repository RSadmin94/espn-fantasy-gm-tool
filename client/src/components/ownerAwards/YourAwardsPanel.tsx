/**
 * Your Awards — My GM / dossier trophy-room section.
 * Presentation only; uses live ownerAwards rows + optional profile progress stats.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Award,
  ChevronDown,
  ChevronUp,
  Crown,
  Gem,
  Medal,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import {
  buildYourAwardsModel,
  formatOwnerAwardStat,
  getOwnerAwardMetaById,
  type OwnerAwardLike,
  type OwnerAwardProgressStats,
  type OwnerAwardRarity,
} from "@/lib/ownerAwardsDisplay";
import { OwnerAwardShareButton } from "./OwnerAwardShareButton";
import { ownerAwardIcon, rarityCardStyle, RARITY_COLORS } from "./ownerAwardVisuals";
import { IntelPanel } from "@/components/layout";
import { cn } from "@/lib/utils";

export type YourAwardsPanelProps = {
  ownerName: string;
  ownerKey: string | null;
  ownerAwards: OwnerAwardLike[];
  leagueName?: string;
  /** Optional profile metrics for honest vs-holder progress only. */
  progressStats?: OwnerAwardProgressStats | null;
  /** Self vs scout section title. */
  title?: string;
  className?: string;
};

export function YourAwardsPanel({
  ownerName,
  ownerKey,
  ownerAwards,
  leagueName,
  progressStats = null,
  title = "Your Awards",
  className,
}: YourAwardsPanelProps) {
  const model = useMemo(
    () => buildYourAwardsModel(ownerAwards, ownerKey, ownerName, progressStats),
    [ownerAwards, ownerKey, ownerName, progressStats],
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  const summaryCards: Array<{
    key: string;
    label: string;
    value: number;
    hint: string;
    icon: typeof Trophy;
    tone?: OwnerAwardRarity;
  }> = [
    {
      key: "career",
      label: "Career Awards",
      value: model.stats.totalAwards,
      hint: "Total awards held now",
      icon: Trophy,
    },
    {
      key: "unique",
      label: "Unique Awards",
      value: model.stats.uniqueAwards,
      hint: "Distinct award types",
      icon: Award,
    },
    {
      key: "legendary",
      label: "Legendary",
      value: model.stats.legendaryCount,
      hint: "Highest rarity tier",
      icon: Crown,
      tone: "Legendary",
    },
    {
      key: "epic",
      label: "Epic",
      value: model.stats.epicCount,
      hint: "Elite accomplishments",
      icon: Gem,
      tone: "Epic",
    },
    {
      key: "rare",
      label: "Rare",
      value: model.stats.rareCount,
      hint: "Standout badges",
      icon: Medal,
      tone: "Rare",
    },
    {
      key: "common",
      label: "Common",
      value: model.stats.commonCount,
      hint: "Foundational marks",
      icon: Sparkles,
      tone: "Common",
    },
  ];

  if (model.earned.length === 0 && model.missing.length === model.quick.catalogSize) {
    return (
      <IntelPanel
        id="dossier-awards"
        variant="warm"
        className={cn("scroll-mt-24 overflow-hidden p-0", className)}
      >
        <SectionHead title={title} />
        <EmptyTrophyShelf />
      </IntelPanel>
    );
  }

  const chaseRows = model.inProgress.filter((r) => r.kind === "vs_holder").slice(0, 4);
  const progressComingSoon = model.inProgress.every((r) => r.kind === "coming_soon");

  return (
    <IntelPanel
      id="dossier-awards"
      variant="warm"
      className={cn("scroll-mt-24 overflow-hidden p-0", className)}
    >
      <SectionHead title={title} />

      {/* 1 — Achievement Summary */}
      <div className="grid grid-cols-2 gap-2 border-b border-white/[0.06] p-4 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          const color = c.tone ? RARITY_COLORS[c.tone].fg : "#e4e4e7";
          return (
            <div
              key={c.key}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3"
            >
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden />
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {c.label}
                </p>
              </div>
              <p className="mt-1 text-2xl font-black tabular-nums" style={{ color }}>
                {c.value}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{c.hint}</p>
            </div>
          );
        })}
      </div>

      {/* 7 — Quick Stats */}
      <div className="grid gap-2 border-b border-white/[0.06] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStat
          label="Collected"
          value={`${model.quick.collected} / ${model.quick.catalogSize}`}
          sub={`${model.quick.completionPct}% complete`}
        />
        <QuickStat
          label="Highest rarity"
          value={model.quick.highestRarity ?? "—"}
        />
        <QuickStat
          label="Favorite category"
          value={model.quick.favoriteCategory ?? "—"}
        />
        <QuickStat
          label="Awards remaining"
          value={String(model.quick.awardsRemaining)}
        />
      </div>

      {/* 5 — Award DNA */}
      {model.dna.length > 0 ? (
        <div className="border-b border-white/[0.06] p-4">
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/90">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> My Award DNA
          </h3>
          <ul className="mt-3 space-y-2">
            {model.dna.map((line) => (
              <li
                key={line.text}
                className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-zinc-300"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a3e635]" aria-hidden />
                <span>
                  {line.text}
                  <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                    {line.category}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 2 — Trophy Case */}
      <div className="border-b border-white/[0.06] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/90">
          <Trophy className="h-3.5 w-3.5" aria-hidden /> Trophy Case
        </h3>
        {model.earned.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No awards in the trophy case yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="list">
            {model.earned.map((item) => {
              const { meta, row, timesEarned, holdingNow } = item;
              const Icon = ownerAwardIcon(meta.icon);
              const open = expanded === meta.id;
              const colors = RARITY_COLORS[meta.rarity];
              return (
                <li key={meta.id}>
                  <div
                    className="rounded-xl border p-4"
                    style={rarityCardStyle(meta.rarity)}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635]/70"
                      aria-expanded={open}
                      aria-controls={`award-expand-${meta.id}`}
                      onClick={() => setExpanded(open ? null : meta.id)}
                    >
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
                        style={{
                          borderColor: colors.border,
                          background: colors.bg,
                          color: colors.fg,
                        }}
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
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
                            {meta.category}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-zinc-400">
                          {meta.shortDescription}
                        </span>
                        <span className="mt-1.5 block text-[11px] font-semibold text-zinc-300">
                          {meta.howEarned}
                        </span>
                        <span className="mt-2 block text-xs text-zinc-400">
                          {holdingNow ? (
                            <span className="font-bold text-[#a3e635]">Holding Now</span>
                          ) : null}
                          {" · "}
                          Won {timesEarned} {timesEarned === 1 ? "time" : "times"}
                          {" · "}
                          {formatOwnerAwardStat(meta.awardName, row.value)}
                        </span>
                      </span>
                      {open ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                      )}
                    </button>

                    {open ? (
                      <div
                        id={`award-expand-${meta.id}`}
                        className="mt-3 space-y-2 border-t border-white/[0.08] pt-3 text-xs text-zinc-300"
                      >
                        <DetailLine label="Description" text={meta.longDescription} />
                        <DetailLine label="Eligibility" text={meta.eligibility} />
                        {row.reason ? (
                          <DetailLine label="Evidence" text={String(row.reason)} />
                        ) : null}
                        {meta.relatedAwardIds.length > 0 ? (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                              Related awards
                            </p>
                            <ul className="mt-1 flex flex-wrap gap-2">
                              {meta.relatedAwardIds.map((rid) => {
                                const related = getOwnerAwardMetaById(rid);
                                return (
                                  <li key={rid}>
                                    <Link
                                      to={`/rivals/awards/${rid}`}
                                      className="font-bold text-[#a3e635] hover:underline"
                                    >
                                      {related?.displayName ?? rid}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Link
                            to={`/rivals/awards/${meta.id}`}
                            className="inline-flex rounded-lg border border-[#a3e635]/40 bg-[#a3e635]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#a3e635] hover:bg-[#a3e635]/20"
                          >
                            View Details
                          </Link>
                          <OwnerAwardShareButton
                            awardId={meta.id}
                            leagueName={leagueName}
                            currentHolderName={ownerName}
                            currentValue={row.value ?? null}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                        <Link
                          to={`/rivals/awards/${meta.id}`}
                          className="inline-flex rounded-lg border border-[#a3e635]/40 bg-[#a3e635]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#a3e635] hover:bg-[#a3e635]/20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Details
                        </Link>
                        <OwnerAwardShareButton
                          awardId={meta.id}
                          leagueName={leagueName}
                          currentHolderName={ownerName}
                          currentValue={row.value ?? null}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 6 — Achievement Timeline (V1 placeholder) */}
      <div className="border-b border-white/[0.06] p-4">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/90">
          Achievement Timeline
        </h3>
        <p className="rounded-lg border border-dashed border-white/[0.1] bg-white/[0.02] px-3 py-4 text-sm text-zinc-400">
          {model.earned.length > 0 ? (
            <>
              <span className="font-semibold text-[#a3e635]">Holding Now</span>
              <span className="mx-2 text-zinc-600">·</span>
              Season history not tracked yet.
            </>
          ) : (
            <>Season history not tracked yet.</>
          )}
        </p>
        <p className="mt-2 text-[11px] text-zinc-600">
          Historical award ledgers will appear here in a future update.
        </p>
      </div>

      {/* 3 — Awards in Progress */}
      <div className="border-b border-white/[0.06] p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/90">
          <Target className="h-3.5 w-3.5" aria-hidden /> Awards in Progress
        </h3>
        {progressComingSoon || chaseRows.length === 0 ? (
          <p className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-4 text-sm text-zinc-400">
            Progress tracking coming soon.
          </p>
        ) : (
          <ul className="space-y-2" role="list">
            {chaseRows.map((row) => {
              const Icon = ownerAwardIcon(row.meta.icon);
              const pct =
                row.target && row.target > 0
                  ? Math.min(100, Math.round(((row.current ?? 0) / row.target) * 100))
                  : 0;
              return (
                <li
                  key={row.meta.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/rivals/awards/${row.meta.id}`}
                          className="text-sm font-bold text-zinc-100 hover:underline"
                        >
                          {row.meta.displayName}
                        </Link>
                        {row.holderName ? (
                          <span className="text-[11px] text-zinc-500">
                            Held by {row.holderName}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{row.label}</p>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${row.meta.displayName} progress ${pct}%`}
                      >
                        <div
                          className="h-full rounded-full bg-[#a3e635]/80"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 4 — Missing Awards */}
      <div className="p-4">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-amber-400/90">
          Missing Awards
        </h3>
        {model.missing.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            Full set — every award is in your trophy case.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list">
            {model.missing.map((m) => {
              const Icon = ownerAwardIcon(m.meta.icon);
              const colors = RARITY_COLORS[m.meta.rarity];
              return (
                <li key={m.meta.id}>
                  <Link
                    to={`/rivals/awards/${m.meta.id}`}
                    className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635]/70"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border grayscale"
                      style={{
                        borderColor: colors.border,
                        background: colors.bg,
                        color: colors.fg,
                      }}
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-zinc-200">{m.meta.displayName}</span>
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                            colors.chip,
                          )}
                        >
                          {m.meta.rarity}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                        {m.meta.category}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                        {m.meta.shortDescription}
                      </span>
                      <span className="mt-1 block text-[11px] text-zinc-600">{m.meta.howEarned}</span>
                      <span className="mt-1.5 block text-[11px] text-zinc-500">
                        Current holder:{" "}
                        <strong className="text-zinc-400">{m.currentHolderName ?? "—"}</strong>
                        {m.progress?.kind === "vs_holder" ? (
                          <>
                            {" · "}
                            <span className="text-zinc-400">{m.progress.label}</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </IntelPanel>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 shrink-0 text-amber-400/90" aria-hidden />
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      </div>
      <Link
        to="/rivals/awards"
        className="text-[11px] font-bold uppercase tracking-wide text-[#a3e635] hover:underline"
      >
        Award Catalog →
      </Link>
    </div>
  );
}

function QuickStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-zinc-100">{value}</p>
      {sub ? <p className="text-[11px] text-zinc-500">{sub}</p> : null}
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

function EmptyTrophyShelf() {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div
        className="relative mb-5 flex h-28 w-full max-w-sm items-end justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-gradient-to-b from-white/[0.04] to-transparent px-6 pb-4 pt-8"
        aria-hidden
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex h-14 w-12 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] opacity-40"
            style={{ transform: `translateY(${(i % 2) * 6}px)` }}
          >
            <Trophy className="h-6 w-6 text-zinc-600" />
          </div>
        ))}
      </div>
      <h3 className="text-lg font-black text-zinc-100">No awards yet.</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
        Every championship begins somewhere. Keep competing and your trophy case will grow.
      </p>
      <Link
        to="/rivals/awards"
        className="mt-5 inline-flex rounded-[10px] bg-[#a3e635] px-5 py-2.5 text-sm font-extrabold text-[#0b0809] hover:brightness-110"
      >
        Explore Awards
      </Link>
    </div>
  );
}
