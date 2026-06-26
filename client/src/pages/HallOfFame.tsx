import { useMemo, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { Loader2, Trophy, Medal, Crown, Landmark, ChevronDown, Skull, ArrowLeftRight, ScrollText, History, Archive, BookOpen } from "lucide-react";
import {
  CinematicPageHeader,
  IntelPageShell,
  IntelPanel,
  PageError,
  PageLoading,
  ProGate,
  SectionLoading,
  EmptyState,
} from "@/components/layout";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type MaybeAvail<T> = { available: true; value: T } | { available: false; reason: string };

function unwrapMaybe<T>(m: MaybeAvail<T> | undefined | null): T | null {
  if (m && m.available) return m.value;
  return null;
}

function UnavailableBlock({ title }: { title: string }) {
  return (
    <IntelPanel variant="profile" className="p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-zinc-300">Unavailable</p>
      <p className="mt-1 text-xs text-zinc-600">Data not yet imported.</p>
    </IntelPanel>
  );
}

const ARCHIVE_NAV_ITEMS = [
  { id: "archive-overview", label: "Overview" },
  { id: "archive-hof", label: "Hall of Fame" },
  { id: "archive-championships", label: "Championships" },
  { id: "archive-records", label: "Records" },
  { id: "archive-dynasty", label: "Dynasties" },
  { id: "archive-trades", label: "Notorious Trades" },
  { id: "archive-milestones", label: "Milestones" },
] as const;

function archiveScrollTo(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ArchiveSectionHeader({
  icon,
  title,
  accent = "#f5c65a",
}: {
  icon: ReactNode;
  title: string;
  accent?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
      <span style={{ color: accent }}>{icon}</span>
      {title}
    </div>
  );
}

function ArchiveSectionNav() {
  return (
    <nav
      aria-label="League History sections"
      className="sticky top-16 z-10 overflow-x-auto rounded-xl border border-white/[0.08] bg-[#110c14]/95 px-2 py-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
    >
      <ul className="flex min-w-max gap-1">
        {ARCHIVE_NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => archiveScrollTo(item.id)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ArchiveExplorerCards() {
  const cards = [
    { id: "archive-hof", label: "Hall of Fame", icon: Trophy, accent: "#f5c65a" },
    { id: "archive-championships", label: "Championship History", icon: Crown, accent: "#c4b5fd" },
    { id: "archive-records", label: "Records", icon: Medal, accent: "#38bdf8" },
    { id: "archive-dynasty", label: "Dynasties", icon: Landmark, accent: "#a3e635" },
    { id: "archive-trades", label: "Notorious Trades", icon: ArrowLeftRight, accent: "#f472b6" },
    { id: "archive-milestones", label: "Milestones", icon: History, accent: "#fbbf24" },
  ] as const;

  return (
    <IntelPanel id="archive-explorer" variant="profile" className="scroll-mt-24 overflow-hidden p-4 sm:p-5">
      <ArchiveSectionHeader icon={<Archive className="h-4 w-4" />} title="Archive Explorer" accent="#94a3b8" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => archiveScrollTo(card.id)}
              className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-3 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03]" style={{ color: card.accent }}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-zinc-100">{card.label}</span>
            </button>
          );
        })}
      </div>
    </IntelPanel>
  );
}

type ArchiveMilestone = { season: number; label: string; detail: string; sortKey: number };

function buildHistoricMilestones(
  data: {
    championships: {
      leaderboard: Array<{ displayName: string; titles: number; titleSeasons: number[] }>;
      history: Array<{ season: number; resolvedChampionDisplay: string | null }>;
    };
    seasonRecords: { mostPointsInSeason: MaybeAvail<{ season: number; displayName: string; pointsFor: number }> };
  },
  notoriousReport?: { biggestValueGap?: { season: number; sideA: { ownerName?: string }; sideB: { ownerName?: string }; margin: number } | null } | null,
): ArchiveMilestone[] {
  const events: ArchiveMilestone[] = [];
  const hist = [...data.championships.history].sort((a, b) => a.season - b.season);
  const first = hist.find((h) => h.resolvedChampionDisplay);
  if (first?.resolvedChampionDisplay) {
    events.push({
      season: first.season,
      label: "First championship",
      detail: first.resolvedChampionDisplay,
      sortKey: first.season * 100,
    });
  }

  for (const row of data.championships.leaderboard) {
    const seasons = [...row.titleSeasons].sort((a, b) => a - b);
    for (let i = 1; i < seasons.length; i++) {
      if (seasons[i] === seasons[i - 1]! + 1) {
        events.push({
          season: seasons[i]!,
          label: "Repeat champion",
          detail: `${row.displayName} · ${seasons[i - 1]}–${seasons[i]}`,
          sortKey: seasons[i]! * 100 + 1,
        });
        break;
      }
    }
  }

  const leader = data.championships.leaderboard[0];
  if (leader && leader.titles >= 2) {
    const peak = Math.max(...leader.titleSeasons);
    events.push({
      season: peak,
      label: "Dynasty benchmark",
      detail: `${leader.displayName} · ${leader.titles} title${leader.titles === 1 ? "" : "s"}`,
      sortKey: peak * 100 + 2,
    });
  }

  const hiPf = unwrapMaybe(data.seasonRecords.mostPointsInSeason);
  if (hiPf) {
    events.push({
      season: hiPf.season,
      label: "Record season points",
      detail: `${hiPf.displayName} · ${hiPf.pointsFor.toFixed(1)} RS pts`,
      sortKey: hiPf.season * 100 + 5,
    });
  }

  const trade = notoriousReport?.biggestValueGap;
  if (trade) {
    events.push({
      season: trade.season,
      label: "Biggest trade",
      detail: `${trade.sideA.ownerName ?? "—"} vs ${trade.sideB.ownerName ?? "—"} · +${Math.round(trade.margin)} value`,
      sortKey: trade.season * 100 + 6,
    });
  }

  return events.sort((a, b) => a.sortKey - b.sortKey);
}

function GoldGlowCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <IntelPanel variant="profile" accent="gold" className={className}>
      {children}
    </IntelPanel>
  );
}

/** Joins focal ownerKeyA with `owners.rivalryDossier` to show RS H2H win % and record vs ownerKeyB (same source as Rivalry Dossier). */
function RivalryPairWithDossier({
  title,
  displayA,
  displayB,
  ownerKeyA,
  ownerKeyB,
  metricLabel,
  metricValue,
  sub,
}: {
  title: string;
  displayA: string;
  displayB: string;
  ownerKeyA: string;
  ownerKeyB: string;
  metricLabel: string;
  metricValue: number;
  sub?: string;
}) {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const dossierQ = trpc.owners.rivalryDossier.useQuery(
    withLeagueSalt({ ownerKey: ownerKeyA }, leagueContextKey),
    { enabled: leagueKeyReady && Boolean(ownerKeyA && ownerKeyB), staleTime: 60_000 },
  );
  const row = dossierQ.data?.opponents.find((o) => o.opponentOwnerKey === ownerKeyB);
  const hasH2h = row != null && row.gamesPlayed > 0;
  const joinMsg = "Available from Rivalry Dossier, not yet joined here.";

  return (
    <GoldGlowCard className="p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="text-center">
          <p className="text-lg font-bold text-zinc-100">{displayA}</p>
        </div>
        <div className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-red-300">
          vs
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-zinc-100">{displayB}</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4 text-center text-xs">
        <div>
          <p className="text-zinc-600">{metricLabel}</p>
          <p className="mt-1 font-semibold tabular-nums text-zinc-200">{metricValue}</p>
        </div>
        <div>
          <p className="text-zinc-600">Win %</p>
          <p className="mt-1 text-zinc-400">
            {dossierQ.isLoading ? (
              <span className="text-zinc-600">…</span>
            ) : hasH2h && row ? (
              <span className="font-semibold tabular-nums text-zinc-200">{row.winPct.toFixed(1)}%</span>
            ) : (
              <span className="text-zinc-500">{joinMsg}</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-zinc-600">Record</p>
          <p className="mt-1 text-zinc-400">
            {dossierQ.isLoading ? (
              <span className="text-zinc-600">…</span>
            ) : hasH2h && row ? (
              <span className="font-semibold tabular-nums text-zinc-200">
                {row.wins}-{row.losses}
                {row.ties > 0 ? `-${row.ties}` : ""}{" "}
                <span className="font-normal text-zinc-600">(focal: {displayA})</span>
              </span>
            ) : (
              <span className="text-zinc-500">{joinMsg}</span>
            )}
          </p>
        </div>
      </div>
      {sub ? <p className="mt-3 text-center text-xs text-zinc-500">{sub}</p> : null}
      {hasH2h ? (
        <p className="mt-3 text-center text-[10px] text-zinc-600">
          Win % and record from completed regular-season gmMatchups (Rivalry Dossier), focal {displayA}.
        </p>
      ) : null}
    </GoldGlowCard>
  );
}

function ClosestChampionshipCard({ hasPlayoffGmMatchups }: { hasPlayoffGmMatchups: boolean }) {
  return (
    <GoldGlowCard className="p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Closest championship</p>
      {hasPlayoffGmMatchups ? (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Playoff matchups are present in <code className="text-[11px] text-zinc-300">gmMatchups</code>. Smallest championship
          margin is still <span className="font-medium text-zinc-300">not included in the Hall of Fame payload</span> for
          this view.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          <span className="font-medium text-zinc-300">Not included in Hall of Fame payload.</span> No completed playoff
          matchup rows were found in <code className="text-[11px] text-zinc-300">gmMatchups</code> coverage for this league
          (see Data Coverage &amp; Diagnostics).
        </p>
      )}
    </GoldGlowCard>
  );
}

function formatTradeProcessedDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function tradeOwnersLine(trade: {
  sideA: { ownerName?: string };
  sideB: { ownerName?: string };
}): string {
  return `${trade.sideA.ownerName ?? "Owner A"} vs ${trade.sideB.ownerName ?? "Owner B"}`;
}

function tradeWinnerName(trade: {
  winnerOwnerKey: string | null;
  sideA: { ownerKey?: string | null; ownerName?: string };
  sideB: { ownerKey?: string | null; ownerName?: string };
}): string {
  if (!trade.winnerOwnerKey) return "Even";
  if (trade.winnerOwnerKey === trade.sideA.ownerKey) return String(trade.sideA.ownerName ?? "Owner A");
  if (trade.winnerOwnerKey === trade.sideB.ownerKey) return String(trade.sideB.ownerName ?? "Owner B");
  return "—";
}

function TradeHighlightCard({
  title,
  trade,
}: {
  title: string;
  trade: {
    season: number;
    processedDate: number;
    margin: number;
    verdictLabel: string;
    sideA: { ownerKey?: string | null; ownerName?: string };
    sideB: { ownerKey?: string | null; ownerName?: string };
    winnerOwnerKey: string | null;
    receiptText?: string;
  } | null;
}) {
  if (!trade) return null;
  return (
    <GoldGlowCard className="p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <p className="mt-2 text-sm font-semibold text-zinc-100">{tradeOwnersLine(trade)}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {trade.season} · {formatTradeProcessedDate(trade.processedDate)}
      </p>
      <p className="mt-3 text-lg font-bold tabular-nums text-amber-200">+{Math.round(trade.margin)} value</p>
      <p className="mt-1 text-xs text-zinc-400">
        {tradeWinnerName(trade)} · {trade.verdictLabel}
      </p>
    </GoldGlowCard>
  );
}

function NotoriousTradesSection({
  leagueContextKey,
  leagueKeyReady,
  seasons,
}: {
  leagueContextKey: string;
  leagueKeyReady: boolean;
  seasons: number[];
}) {
  const seasonLabel =
    seasons.length === 0
      ? "—"
      : seasons.length === 1
        ? String(seasons[0])
        : `${seasons[0]}–${seasons[seasons.length - 1]}`;

  const reportQ = (trpc as any).completedTradeIntel.notoriousTradesReport.useQuery(
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        seasons: seasons.length > 0 ? seasons : [new Date().getFullYear()],
      },
      leagueContextKey,
    ),
    {
      enabled: leagueKeyReady && seasons.length > 0,
      staleTime: 60_000,
    },
  );

  const report = reportQ.data;
  const ranked = Array.isArray(report?.rankedByMargin) ? report.rankedByMargin.slice(0, 5) : [];
  const hasTrades = ranked.length > 0;

  return (
    <IntelPanel variant="profile" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-amber-400/90" aria-hidden />
          <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-zinc-100">Notorious Trades</h3>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{seasonLabel} season coverage</span>
      </div>
      <div className="p-4 sm:p-5">
        {reportQ.isLoading ? (
          <SectionLoading message="Loading completed trade rankings…" size="sm" />
        ) : reportQ.isError ? (
          <p className="text-sm text-red-300">Could not load notorious trades.</p>
        ) : !hasTrades ? (
          <EmptyState
            panelVariant="profile"
            className="p-6"
            title="No completed trades found for this league."
            description="Completed trades become part of your permanent league history. They will appear here after league sync."
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <TradeHighlightCard title="Biggest value gap" trade={report?.biggestValueGap ?? null} />
              <TradeHighlightCard title="Most lopsided trade" trade={report?.mostLopsided ?? null} />
              <TradeHighlightCard title="Closest fair trade" trade={report?.closestFairTrade ?? null} />
              <TradeHighlightCard title="Biggest pick-only gap" trade={report?.biggestPickOnlyGap ?? null} />
              {report?.biggestPlayerTrade ? (
                <TradeHighlightCard title="Biggest player trade" trade={report.biggestPlayerTrade} />
              ) : null}
              {report?.biggestMixedTrade ? (
                <TradeHighlightCard title="Biggest mixed trade" trade={report.biggestMixedTrade} />
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {report?.mostActivePair ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Most active trading pair</p>
                  <p className="mt-2 text-sm font-semibold text-zinc-100">
                    {report.mostActivePair.ownerAName} vs {report.mostActivePair.ownerBName}
                  </p>
                  <p className="mt-2 text-lg font-bold tabular-nums text-amber-200">{report.mostActivePair.count} trades</p>
                </GoldGlowCard>
              ) : null}
              {report?.mostSuccessfulOwner ? (
                <GoldGlowCard className="p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Most successful trader</p>
                  <p className="mt-2 text-sm font-semibold text-zinc-100">{report.mostSuccessfulOwner.ownerName}</p>
                  <p className="mt-2 text-lg font-bold tabular-nums text-amber-200">
                    {report.mostSuccessfulOwner.wins} wins · +{report.mostSuccessfulOwner.netValue} net value
                  </p>
                </GoldGlowCard>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Top trades by value margin</p>
              <div className="space-y-2">
                {ranked.map((trade: any) => (
                  <div
                    key={trade.clusterId ?? trade.tradeId}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-100">{tradeOwnersLine(trade)}</span>
                      <span className="rounded border border-white/[0.1] px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {trade.verdictLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-zinc-500">
                      {trade.season} · {formatTradeProcessedDate(trade.processedDate)} · +{Math.round(trade.margin)} value ·{" "}
                      {tradeWinnerName(trade)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </IntelPanel>
  );
}

export function HallOfFame() {
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const utils = trpc.useUtils();

  const { leagueContextKey, authLoaded, userLoaded, isSignedIn, activeQ } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const hofQ = trpc.espn.hallOfFame.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  const coverageQ = trpc.espn.ownerMatchupCoverage.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  const ownerListQ = (trpc as any).owners.ownerList.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: leagueKeyReady,
  });
  const backfillMut = trpc.espn.backfillMatchupsFromCache.useMutation({
    onSuccess: (data) => {
      const written = data.results.filter((r) => r.status === "backfilled");
      setBackfillNote(
        written.length > 0
          ? `Backfilled ${written.map((r) => r.season).join(", ")} (${data.totalWritten} rows). Refreshing…`
          : "No new seasons found in cache.",
      );
      void utils.espn.ownerMatchupCoverage.invalidate();
      void utils.espn.hallOfFame.invalidate();
      setBackfilling(false);
    },
    onError: (e) => {
      setBackfillNote(`Error: ${e.message}`);
      setBackfilling(false);
    },
  });

  const data = hofQ.data;
  const diag = data?.championships.medalDiagnostics;
  const unmatchedMedal =
    (diag?.unmatchedChampionTeams?.length ?? 0) +
    (diag?.unmatchedRunnerUpTeams?.length ?? 0) +
    (diag?.unmatchedThirdTeams?.length ?? 0);

  const coverageWarning = useMemo(() => {
    const rows = coverageQ.data?.seasons ?? [];
    return rows.some((s) => !s.usable);
  }, [coverageQ.data?.seasons]);

  const hasPlayoffGmMatchups = useMemo(() => {
    const rows = coverageQ.data?.seasons ?? [];
    return rows.some((s) => s.completedPlayoffDedupedRows > 0);
  }, [coverageQ.data?.seasons]);

  const tradeSeasons = useMemo(() => {
    const touched = hofQ.data?.coverage?.seasonsTouched ?? [];
    if (touched.length > 0) return [...touched].sort((a, b) => a - b);
    return [new Date().getFullYear()];
  }, [hofQ.data?.coverage?.seasonsTouched]);

  const notoriousQ = (trpc as any).completedTradeIntel.notoriousTradesReport.useQuery(
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        seasons: tradeSeasons.length > 0 ? tradeSeasons : [new Date().getFullYear()],
      },
      leagueContextKey,
    ),
    {
      enabled: leagueKeyReady && tradeSeasons.length > 0,
      staleTime: 60_000,
    },
  );

  const leagueLabel =
    activeQ.data?.leagueName?.trim() ||
    (activeQ.data?.leagueId ? `League ${activeQ.data.leagueId}` : "Your league");

  // -- Freemium gate (deep record book) --------------------------------------
  const hofGated = Boolean((hofQ.data as any)?.gated);
  const hofCheckout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (res) => {
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer");
      else toast.error("Checkout did not return a link. Try again or contact support.");
    },
    onError: (err) => {
      toast.error(err.message || "Could not start checkout. Please try again.");
    },
  });
  const hofLog = (trpc as any).usageMonitor.logUIEvent.useMutation();
  const hofSnapLogged = useRef(false);
  const hofPaywallLogged = useRef(false);
  useEffect(() => {
    if (!hofSnapLogged.current && hofQ.data) {
      hofSnapLogged.current = true;
      hofLog.mutate({ eventType: "feature_open", featureName: "hof_snapshot_viewed" });
    }
  }, [hofQ.data]);
  useEffect(() => {
    if (hofGated && !hofPaywallLogged.current) {
      hofPaywallLogged.current = true;
      hofLog.mutate({ eventType: "feature_open", featureName: "hof_paywall_viewed" });
    }
  }, [hofGated]);
  const startHofCheckout = () => {
    if (typeof window === "undefined") return;
    hofLog.mutate({ eventType: "cta_click", featureName: "hof_unlock_clicked" });
    hofCheckout.mutate({ origin: window.location.origin });
  };

  if (!leagueKeyReady) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic" width="standard" padding="compact">
        <PageLoading message="Loading league…" />
      </IntelPageShell>
    );
  }

  if (hofQ.isLoading) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic" width="standard" padding="compact">
        <PageLoading message="Loading League History…" />
      </IntelPageShell>
    );
  }

  if (hofQ.isError || !data) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic" width="standard" padding="compact">
        <PageError
          message={`Could not load League History: ${hofQ.isError ? String(hofQ.error?.message ?? hofQ.error) : "no data"}`}
        />
      </IntelPageShell>
    );
  }

  const lb = data.championships.leaderboard;
  const leader = lb[0];
  const coLeaders = lb.filter((r) => r.titles === (leader?.titles ?? -1));
  const leaderStats = leader ? data.ownerRecords.find((r) => r.ownerKey === leader.ownerKey) : undefined;

  const totalSeasonsTouched = data.coverage.seasonsTouched.length;
  const totalTitles = lb.reduce((s, r) => s + r.titles, 0);
  const totalOwners = data.ownerRecords.length;

  const sg = data.singleGameRecords;
  const sr = data.seasonRecords;
  const rv = data.rivalryRecords;

  const hiWeek = unwrapMaybe(sg.highestTeamScore);
  const loWeek = unwrapMaybe(sg.lowestTeamScore);
  const hiSeasonPf = unwrapMaybe(sr.mostPointsInSeason);
  const loSeasonPf = unwrapMaybe(sr.fewestPointsInSeason);
  const blowout = unwrapMaybe(sg.biggestBlowout);

  const mostGames = unwrapMaybe(rv.mostGamesPlayed);
  const mostHb = unwrapMaybe(rv.mostHeartbreakGames);
  const mostLop = unwrapMaybe(rv.mostLopsidedRivalry);
  const longDom = unwrapMaybe(rv.longestDominance);
  const bestRs = unwrapMaybe(sr.bestRegularSeasonRecord);
  const worstRs = unwrapMaybe(sr.worstRegularSeasonRecord);
  const closestGame = unwrapMaybe(sg.closestGame);
  const hiCombined = unwrapMaybe(sg.highestCombinedScore);
  const loCombined = unwrapMaybe(sg.lowestCombinedScore);

  const activeOwnersCount = Array.isArray(ownerListQ.data?.active) ? ownerListQ.data.active.length : totalOwners;
  const seasonsSpan = data.coverage.seasonsTouched;
  const leagueAge =
    seasonsSpan.length > 0 ? seasonsSpan[seasonsSpan.length - 1]! - seasonsSpan[0]! + 1 : totalSeasonsTouched;
  const totalGames = data.coverage.completedRsGmMatchupGames || data.coverage.dedupedMatchupRows;
  const championshipHistory = [...data.championships.history].sort((a, b) => b.season - a.season);
  const dynastyTimeline = [...data.championships.history]
    .filter((h) => h.resolvedChampionDisplay)
    .sort((a, b) => a.season - b.season);
  const historicMilestones = buildHistoricMilestones(data, notoriousQ.data);

  const cemetery = (() => {
    const activeNames = new Set(
      ((ownerListQ.data?.active ?? []) as any[]).map((o: any) => String(o.ownerName ?? o.ownerKey).trim().toLowerCase()),
    );
    const byName = new Map<string, { name: string; years: number[]; champs: number }>();
    for (const o of (ownerListQ.data?.allOwners ?? []) as any[]) {
      const nm = String(o.ownerName ?? o.ownerKey).trim();
      const k = nm.toLowerCase();
      const e = byName.get(k) ?? { name: nm, years: [], champs: 0 };
      if (Array.isArray(o.seasons)) {
        for (const s of o.seasons) {
          const y = Number(s);
          if (y && !e.years.includes(y)) e.years.push(y);
        }
      }
      e.champs += Number(o.championships ?? 0);
      byName.set(k, e);
    }
    return [...byName.values()]
      .filter((e) => e.years.length > 0 && e.years.length < 2 && e.champs === 0 && !activeNames.has(e.name.toLowerCase()))
      .map((e) => ({ name: e.name, years: [...e.years].sort((x, y) => x - y) }))
      .sort((p, q) => (p.years[0] ?? 0) - (q.years[0] ?? 0));
  })();

  return (
    <IntelPageShell
      bleed
      minHeight="full"
      width="standard"
      background="cinematic"
      padding="compact"
      className="pb-20"
    >
      <div className="space-y-8">
      {diag && diag.totalMedals === 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100/95">
          <p className="font-semibold text-amber-50">No championship medals imported yet</p>
          <p className="mt-1 text-[13px] leading-relaxed text-amber-100/80">
            The Ring of Honor reads dynasty titles from <code className="rounded bg-black/30 px-1 text-[11px]">league_medals</code>{" "}
            (scraped from ESPN&apos;s League History page). Until those rows exist for this league, the champions tab
            stays empty — this is expected, not a sync bug. Use{" "}
            <Link to="/sync" className="font-medium text-amber-50 underline underline-offset-2 hover:text-white">
              Sync Data → League History Medals
            </Link>{" "}
            to capture medals, then refresh this page.
          </p>
        </div>
      )}
      {diag && diag.totalMedals > 0 && lb.length === 0 && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.07] px-4 py-3 text-sm text-violet-100/95">
          <p className="font-semibold text-violet-50">Medals on file but no resolved champions</p>
          <p className="mt-1 text-[13px] leading-relaxed text-violet-100/80">
            Team labels in <code className="rounded bg-black/30 px-1 text-[11px]">league_medals</code> could not be
            matched to owners in <code className="rounded bg-black/30 px-1 text-[11px]">gm_teams</code>. Check medal
            diagnostics below or re-scrape medals after team names stabilize on{" "}
            <Link to="/sync" className="font-medium text-violet-50 underline underline-offset-2 hover:text-white">
              Sync Data
            </Link>
            .
          </p>
        </div>
      )}
      {/* ── 1. League Legacy Overview ──────────────────────────────────────── */}
      <IntelPanel id="archive-overview" variant="profile" className="scroll-mt-24 overflow-hidden" style={{ borderTop: "3px solid #f5c65a" }}>
        <div className="border-b border-white/[0.06] px-4 py-3">
          <ArchiveSectionHeader icon={<ScrollText className="h-4 w-4" />} title="League History Overview" accent="#f5c65a" />
        </div>
        <div className="px-4 py-4 sm:px-6">
          <CinematicPageHeader
            eyebrowMono="League History"
            title="League History"
            subtitle={leagueLabel}
            className="mb-4 text-center [&>div]:w-full [&>div]:items-center [&_h1]:text-center [&_p]:mx-auto"
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">League age</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-100">{leagueAge} seasons</div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Seasons in coverage</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-100">{totalSeasonsTouched}</div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Championships awarded</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-amber-200">{totalTitles}</div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Active owners</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-100">{activeOwnersCount}</div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Total RS games</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-100">{totalGames}</div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 sm:col-span-2 lg:col-span-1">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Historical coverage</div>
              <div className="mt-1 text-sm font-semibold text-zinc-200">
                {seasonsSpan.length > 0 ? `${seasonsSpan[0]}–${seasonsSpan[seasonsSpan.length - 1]}` : "—"}
              </div>
            </div>
          </div>
          {leader ? (
            <GoldGlowCard className="relative mt-4 overflow-hidden p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/90">Hall of Fame summary</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {coLeaders.length > 1 ? "Co-leaders" : "Top leader"}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-zinc-50 sm:text-3xl">{coLeaders.map((c) => c.displayName).join(" & ")}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                      {leader.titles} title{leader.titles === 1 ? "" : "s"}{coLeaders.length > 1 ? " each" : ""}
                    </span>
                    {coLeaders.length === 1 && leaderStats ? (
                      <>
                        <span className="text-zinc-600">·</span>
                        <span className="tabular-nums">{leaderStats.winPct.toFixed(1)}% reg. season wins</span>
                        <span className="text-zinc-600">·</span>
                        <span>{leaderStats.seasonsActive} seasons active</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-1 text-3xl sm:text-4xl" aria-hidden>
                  {Array.from({ length: Math.min(5, leader.titles) }).map((_, i) => (
                    <span key={i} className="drop-shadow-[0_0_12px_rgba(245,158,11,0.35)]">🏆</span>
                  ))}
                </div>
              </div>
            </GoldGlowCard>
          ) : (
            <div className="mt-4">
              <UnavailableBlock title="Championship leaderboard" />
            </div>
          )}
        </div>
      </IntelPanel>

      <ArchiveSectionNav />
      <ArchiveExplorerCards />

      {/* ── 2. Hall of Fame ────────────────────────────────────────────────── */}
      <IntelPanel id="archive-hof" variant="profile" className="scroll-mt-24 overflow-hidden p-4 sm:p-6">
        <ArchiveSectionHeader icon={<Trophy className="h-4 w-4" />} title="Hall of Fame" accent="#f5c65a" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lb.length === 0 ? (
            <p className="col-span-full text-center text-sm text-zinc-500">No resolved champions yet.</p>
          ) : (
            lb.slice(0, 10).map((row) => (
              <GoldGlowCard key={row.ownerKey} className="p-5">
                <p className="text-lg font-bold text-zinc-50">{row.displayName}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                  {row.titles} championship{row.titles === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1 text-2xl" aria-hidden>
                  {Array.from({ length: Math.min(5, row.titles) }).map((_, i) => (
                    <span key={i}>🏆</span>
                  ))}
                </div>
                <div className="mt-4 space-y-1 border-t border-white/[0.06] pt-3">
                  {row.titleSeasons.length ? (
                    row.titleSeasons.map((y) => (
                      <p key={y} className="text-sm tabular-nums text-zinc-300">{y}</p>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-600">—</p>
                  )}
                </div>
              </GoldGlowCard>
            ))
          )}
        </div>
      </IntelPanel>

      {/* ── 3. Championship History ────────────────────────────────────────── */}
      <IntelPanel id="archive-championships" variant="profile" className="scroll-mt-24 overflow-hidden p-4 sm:p-6">
        <ArchiveSectionHeader icon={<Crown className="h-4 w-4" />} title="Championship History" accent="#c4b5fd" />
        {championshipHistory.length === 0 ? (
          <p className="text-sm text-zinc-500">No championship history on file yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3">Season</th>
                  <th className="py-2 pr-3">Champion</th>
                  <th className="py-2 pr-3">Runner-up</th>
                  <th className="py-2">Third</th>
                </tr>
              </thead>
              <tbody>
                {championshipHistory.map((h) => (
                  <tr key={h.season} className="border-b border-white/[0.05]">
                    <td className="py-2 pr-3 font-semibold tabular-nums text-zinc-200">{h.season}</td>
                    <td className="py-2 pr-3 text-zinc-100">{h.resolvedChampionDisplay ?? h.championTeam ?? "—"}</td>
                    <td className="py-2 pr-3 text-zinc-400">{h.resolvedRunnerUpDisplay ?? h.runnerUpTeam ?? "—"}</td>
                    <td className="py-2 text-zinc-500">{h.resolvedThirdDisplay ?? h.thirdTeam ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </IntelPanel>

      {/* ── 4. League Records ─────────────────────────────────────────────── */}
      <IntelPanel id="archive-records" variant="profile" className="scroll-mt-24 overflow-hidden p-4 sm:p-6">
        <ArchiveSectionHeader icon={<BookOpen className="h-4 w-4" />} title="League Records" accent="#38bdf8" />
        {hofGated ? (
          <ProGate
            icon={Trophy}
            heading="Single-game & season records"
            description="The leaderboard, titles, tenure and win % stay free. The deep record book - single-game marks, season bests, and head-to-head legacy - unlocks with Rivals Pro."
            ctaLabel="Unlock the Record Book"
            accent="amber"
            onUnlock={startHofCheckout}
            pending={hofCheckout.isPending}
          />
        ) : (
          <div className="space-y-8">
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Career</p>
              <div className="grid gap-3 md:grid-cols-2">
                {mostGames ? (
                  <RivalryPairWithDossier
                    title="Most games played (pair)"
                    displayA={mostGames.displayA}
                    displayB={mostGames.displayB}
                    ownerKeyA={mostGames.ownerKeyA}
                    ownerKeyB={mostGames.ownerKeyB}
                    metricLabel="Games"
                    metricValue={mostGames.games}
                  />
                ) : (
                  <UnavailableBlock title="Most games played" />
                )}
                {mostLop ? (
                  <RivalryPairWithDossier
                    title="Most lopsided rivalry"
                    displayA={mostLop.displayA}
                    displayB={mostLop.displayB}
                    ownerKeyA={mostLop.ownerKeyA}
                    ownerKeyB={mostLop.ownerKeyB}
                    metricLabel="Avg margin"
                    metricValue={mostLop.avgAbsMargin}
                    sub={`${mostLop.games} games`}
                  />
                ) : (
                  <UnavailableBlock title="Most lopsided rivalry" />
                )}
                {mostHb ? (
                  <RivalryPairWithDossier
                    title="Most heartbreak games"
                    displayA={mostHb.displayA}
                    displayB={mostHb.displayB}
                    ownerKeyA={mostHb.ownerKeyA}
                    ownerKeyB={mostHb.ownerKeyB}
                    metricLabel="Heartbreaks"
                    metricValue={mostHb.heartbreakGames}
                    sub={`${mostHb.games} games`}
                  />
                ) : null}
                {longDom ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Longest dominance streak</p>
                    <p className="mt-2 text-sm font-semibold text-zinc-100">
                      {longDom.dominantDisplay} over {longDom.opponentDisplay}
                    </p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-amber-200">{longDom.consecutiveWins} straight</p>
                  </GoldGlowCard>
                ) : null}
              </div>
            </div>
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Single season</p>
              <div className="grid gap-3 md:grid-cols-2">
                {hiSeasonPf ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Highest season PF</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-amber-200">{hiSeasonPf.pointsFor.toFixed(1)}</p>
                    <p className="mt-2 text-sm font-medium text-zinc-200">{hiSeasonPf.displayName}</p>
                    <p className="mt-1 text-xs text-zinc-600">{hiSeasonPf.season} · {hiSeasonPf.games} RS games</p>
                  </GoldGlowCard>
                ) : (
                  <UnavailableBlock title="Highest season PF" />
                )}
                {loSeasonPf ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Lowest season PF</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-200">{loSeasonPf.pointsFor.toFixed(1)}</p>
                    <p className="mt-2 text-sm font-medium text-zinc-200">{loSeasonPf.displayName}</p>
                    <p className="mt-1 text-xs text-zinc-600">{loSeasonPf.season} · {loSeasonPf.games} RS games</p>
                  </GoldGlowCard>
                ) : null}
                {bestRs ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Best regular season record</p>
                    <p className="mt-2 text-xl font-bold text-zinc-50">{bestRs.displayName}</p>
                    <p className="mt-2 text-sm text-zinc-300">
                      {bestRs.wins}–{bestRs.losses}{bestRs.ties ? `–${bestRs.ties}` : ""} · {bestRs.winPct.toFixed(1)}% · {bestRs.season}
                    </p>
                  </GoldGlowCard>
                ) : null}
                {worstRs ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Worst regular season record</p>
                    <p className="mt-2 text-xl font-bold text-zinc-50">{worstRs.displayName}</p>
                    <p className="mt-2 text-sm text-zinc-300">
                      {worstRs.wins}–{worstRs.losses}{worstRs.ties ? `–${worstRs.ties}` : ""} · {worstRs.winPct.toFixed(1)}% · {worstRs.season}
                    </p>
                  </GoldGlowCard>
                ) : null}
              </div>
            </div>
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Weekly</p>
              <div className="grid gap-3 md:grid-cols-2">
                {hiWeek ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Highest single week</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-amber-200">{hiWeek.score.toFixed(1)} pts</p>
                    <p className="mt-2 text-sm text-zinc-400">{hiWeek.label}</p>
                    <p className="mt-1 text-xs text-zinc-600">{hiWeek.season} · week {hiWeek.week}</p>
                  </GoldGlowCard>
                ) : (
                  <UnavailableBlock title="Highest single week" />
                )}
                {loWeek ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Lowest single week</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-zinc-200">{loWeek.score.toFixed(1)} pts</p>
                    <p className="mt-2 text-sm text-zinc-400">{loWeek.label}</p>
                    <p className="mt-1 text-xs text-zinc-600">{loWeek.season} · week {loWeek.week}</p>
                  </GoldGlowCard>
                ) : null}
                {blowout ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Largest blowout</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-amber-200">{blowout.margin.toFixed(1)} pt margin</p>
                    <p className="mt-2 text-sm text-zinc-300">
                      {blowout.winnerLabel} {blowout.winnerScore} — {blowout.loserScore} {blowout.loserLabel}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">{blowout.season} · week {blowout.week}</p>
                  </GoldGlowCard>
                ) : null}
                {closestGame ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Closest game</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-200">{closestGame.margin.toFixed(1)} pt margin</p>
                    <p className="mt-2 text-sm text-zinc-300">
                      {closestGame.homeLabel} {closestGame.homeScore} — {closestGame.awayScore} {closestGame.awayLabel}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">{closestGame.season} · week {closestGame.week}</p>
                  </GoldGlowCard>
                ) : null}
                {hiCombined ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Highest combined score</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-amber-200">{hiCombined.combined.toFixed(1)} pts</p>
                    <p className="mt-2 text-sm text-zinc-300">
                      {hiCombined.homeLabel} {hiCombined.homeScore} + {hiCombined.awayLabel} {hiCombined.awayScore}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">{hiCombined.season} · week {hiCombined.week}</p>
                  </GoldGlowCard>
                ) : null}
                {loCombined ? (
                  <GoldGlowCard className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Lowest combined score</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-200">{loCombined.combined.toFixed(1)} pts</p>
                    <p className="mt-2 text-sm text-zinc-300">
                      {loCombined.homeLabel} {loCombined.homeScore} + {loCombined.awayLabel} {loCombined.awayScore}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">{loCombined.season} · week {loCombined.week}</p>
                  </GoldGlowCard>
                ) : null}
              </div>
            </div>
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Playoff</p>
              <ClosestChampionshipCard hasPlayoffGmMatchups={hasPlayoffGmMatchups} />
            </div>
          </div>
        )}
      </IntelPanel>

      {/* ── 5. Dynasty Timeline ────────────────────────────────────────────── */}
      <IntelPanel id="archive-dynasty" variant="profile" className="scroll-mt-24 overflow-hidden p-4 sm:p-6">
        <ArchiveSectionHeader icon={<Landmark className="h-4 w-4" />} title="Dynasty Timeline" accent="#a3e635" />
        <div className="mb-6 flex flex-col gap-2 rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-sky-100/80">Championship seasons from league medals. For current roster strength, see Dynasty Power Rankings.</p>
          <Link to="/dynasty-power-rankings" className="shrink-0 text-sm font-semibold text-sky-300 hover:text-sky-200">Dynasty Power Rankings →</Link>
        </div>
        {dynastyTimeline.length === 0 ? (
          <p className="text-sm text-zinc-500">No resolved championship seasons yet.</p>
        ) : (
          <div className="relative mb-8 space-y-0 border-l border-white/[0.08] pl-4">
            {dynastyTimeline.map((h) => (
              <div key={h.season} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-[#a3e635]/80 ring-2 ring-[#110c14]" aria-hidden />
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{h.season}</div>
                <div className="text-sm font-semibold text-zinc-100">🏆 {h.resolvedChampionDisplay}</div>
                {h.resolvedRunnerUpDisplay ? (
                  <div className="text-xs text-zinc-500">Runner-up · {h.resolvedRunnerUpDisplay}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">All-time owner legacy</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.ownerRecords.length === 0 ? (
            <p className="col-span-full text-center text-sm text-zinc-500">No owner rows.</p>
          ) : (
            data.ownerRecords.slice(0, 12).map((row, idx) => (
              <IntelPanel key={row.ownerKey} variant="profile" className="relative overflow-hidden p-5">
                <span className="absolute right-3 top-3 text-4xl font-black tabular-nums text-white/[0.04]">{idx + 1}</span>
                <p className="text-lg font-bold text-zinc-50">{row.displayName}</p>
                <div className="mt-3 space-y-2 text-sm text-zinc-400">
                  <p><span className="text-zinc-600">Titles</span> <span className="font-semibold text-amber-200/90">{row.titles}</span></p>
                  <p><span className="text-zinc-600">Regular Season Win %</span> <span className="tabular-nums text-zinc-200">{row.winPct.toFixed(1)}%</span></p>
                  <p><span className="text-zinc-600">Seasons</span> <span className="tabular-nums text-zinc-200">{row.seasonsActive}</span></p>
                </div>
              </IntelPanel>
            ))
          )}
        </div>
      </IntelPanel>

      {/* ── 6. Notorious Trades ────────────────────────────────────────────── */}
      <div id="archive-trades" className="scroll-mt-24">
        <NotoriousTradesSection leagueContextKey={leagueContextKey} leagueKeyReady={leagueKeyReady} seasons={tradeSeasons} />
      </div>

      {/* ── 7. Historic Milestones ─────────────────────────────────────────── */}
      <IntelPanel id="archive-milestones" variant="profile" className="scroll-mt-24 overflow-hidden p-4 sm:p-6">
        <ArchiveSectionHeader icon={<History className="h-4 w-4" />} title="Historic Milestones" accent="#fbbf24" />
        {historicMilestones.length === 0 ? (
          <p className="text-sm text-zinc-500">No milestones derivable from current archives yet.</p>
        ) : (
          <div className="relative space-y-0 border-l border-white/[0.08] pl-4">
            {historicMilestones.map((ev, i) => (
              <div key={`${ev.season}-${ev.label}-${i}`} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-[#fbbf24]/80 ring-2 ring-[#110c14]" aria-hidden />
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{ev.season}</div>
                <div className="text-sm font-semibold text-zinc-100">{ev.label}</div>
                <div className="text-xs text-zinc-500">{ev.detail}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 rounded-xl border border-violet-500/30 bg-violet-500/[0.08] px-4 py-3 text-center">
          <p className="text-sm font-semibold text-violet-50">Rivalry intelligence</p>
          <p className="mt-1 text-[13px] text-violet-100/75">Head-to-head feuds live in Rivalries.</p>
          <Link to="/rivalry-center" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-violet-300 hover:text-violet-200">
            Open Rivalries →
          </Link>
        </div>
      </IntelPanel>

      {/* ── Developer sections ─────────────────────────────────────────────── */}
      <Collapsible open={developerOpen} onOpenChange={setDeveloperOpen}>
        <IntelPanel variant="profile" className="overflow-hidden">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:bg-white/[0.03]">
            <span>Developer sections</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", developerOpen && "rotate-180")} aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 border-t border-white/[0.06] px-4 py-4">
      <Collapsible open={coverageOpen} onOpenChange={setCoverageOpen}>
        <IntelPanel variant="profile" className="overflow-hidden">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.03]">
          <span>Data Coverage &amp; Diagnostics</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", coverageOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t border-white/[0.06] px-4 py-4 text-xs text-zinc-500">
            <p className="leading-relaxed text-zinc-400">
              Championships from <code className="text-[10px] text-zinc-300">league_medals</code> (team names → owners via{" "}
              <code className="text-[10px] text-zinc-300">gmTeams</code>). Owner W/L/T, single-game marks, rivalry indexes,
              and season bests use <strong className="text-zinc-300">completed regular-season</strong>{" "}
              <code className="text-[10px] text-zinc-300">gmMatchups</code> only.
            </p>
            <p className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-300">Coverage:</span> {data.coverage.note} Deduped matchup rows:{" "}
              <span className="tabular-nums text-zinc-200">{data.coverage.dedupedMatchupRows}</span>
              {data.coverage.seasonsTouched.length > 0 && (
                <>
                  {" "}
                  · Seasons: {data.coverage.seasonsTouched.join(", ")}
                </>
              )}
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <RecordDump title="Highest combined score" rec={sg.highestCombinedScore as MaybeAvail<Record<string, unknown>>} />
              <RecordDump title="Lowest combined score" rec={sg.lowestCombinedScore as MaybeAvail<Record<string, unknown>>} />
              <RecordDump title="Closest game (margin)" rec={sg.closestGame as MaybeAvail<Record<string, unknown>>} />
            </div>

            {diag && (
              <div
                className={cn(
                  "rounded-md border px-3 py-2 font-mono",
                  unmatchedMedal > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-white/[0.08] bg-white/[0.02]",
                )}
              >
                <span className="font-semibold text-zinc-300">Medals → owners</span> · rows: {diag.totalMedals} · champion
                unmatched: {diag.unmatchedChampionTeams.length} · runner-up: {diag.unmatchedRunnerUpTeams.length} · third:{" "}
                {diag.unmatchedThirdTeams.length}
                {diag.unmatchedChampionTeams.length > 0 && (
                  <div className="mt-2 space-y-0.5 text-[10px] leading-snug text-amber-200/90">
                    <span className="text-zinc-500">Sample champion labels not matched:</span>
                    {diag.unmatchedChampionTeams.slice(0, 4).map((u) => (
                      <div key={`${u.season}-${u.teamName}`}>
                        {u.season}: <span className="text-zinc-300">{u.teamName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {coverageQ.data && (
              <details className="rounded-md border border-white/[0.08]" open={coverageWarning}>
                <summary className="cursor-pointer px-3 py-2 text-zinc-400 hover:text-zinc-200">
                  Season-by-season gmMatchups coverage
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-zinc-500">
                        <th className="py-1 text-left">Season</th>
                        <th className="py-1 text-right">Rows</th>
                        <th className="py-1 text-right">PO dedupe</th>
                        <th className="py-1 text-center">Usable?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverageQ.data.seasons.map((s) => (
                        <tr key={s.season} className={cn("border-b border-white/[0.05]", !s.usable && "text-amber-300/90")}>
                          <td className="py-0.5">{s.season}</td>
                          <td className="py-0.5 text-right tabular-nums">{s.gmMatchupsRows}</td>
                          <td className="py-0.5 text-right tabular-nums">{s.completedPlayoffDedupedRows}</td>
                          <td className="py-0.5 text-center">{s.usable ? "✓" : "✗"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBackfilling(true);
                  setBackfillNote(null);
                  backfillMut.mutate();
                }}
                disabled={backfilling}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
              >
                {backfilling ? (
                  <>
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    Backfilling…
                  </>
                ) : (
                  "Backfill gmMatchups from ESPN cache"
                )}
              </button>
              {backfillNote && <span className="text-[11px] text-zinc-400">{backfillNote}</span>}
            </div>
            <p className="text-[11px] text-zinc-600">
              Routes <code className="text-[10px]">/ring-of-honor</code> and <code className="text-[10px]">/championships</code>{" "}
              redirect here.
            </p>
          </div>
        </CollapsibleContent>
        </IntelPanel>
      </Collapsible>

              <IntelPanel variant="profile" className="overflow-hidden p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">The Graveyard</p>
                <p className="mb-4 mt-2 max-w-2xl text-sm text-zinc-500">
                  Owners who lasted less than two seasons. They came, they lost, they left.
                </p>
                {cemetery.length === 0 ? (
                  <p className="text-sm text-zinc-500">No short-timers — everyone who joined stuck around.</p>
                ) : (
                  <div className="rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,#1b131f,#140e17)] px-5 pt-8 pb-4">
                    <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                      {cemetery.map((g, i) => (
                        <div key={g.name + i} className="flex flex-col items-center">
                          <div className="relative flex w-full max-w-[170px] flex-col items-center rounded-t-[80px] rounded-b-md border border-zinc-700/60 bg-[linear-gradient(180deg,#3a4150,#281d2e)] px-4 pt-7 pb-6 text-center shadow-[inset_0_2px_12px_rgba(0,0,0,.45),0_10px_20px_-12px_rgba(0,0,0,.8)]">
                            <span className="text-[10px] font-bold tracking-[0.35em] text-zinc-500">R . I . P</span>
                            <span className="my-2 block h-px w-10 bg-white/15" />
                            <Skull className="mb-2 h-5 w-5 text-zinc-500" />
                            <span className="font-serif text-[15px] font-bold leading-tight text-zinc-200">{g.name}</span>
                            <span className="mt-1.5 text-xs tabular-nums text-zinc-400">{g.years.length ? g.years.join(" - ") : "Unknown"}</span>
                            <span className="mt-2 text-[9px] italic text-zinc-600">gone too soon</span>
                          </div>
                          <span className="h-3 w-[88%] max-w-[150px] rounded-b-sm bg-[linear-gradient(180deg,#1f1624,#16101a)] shadow-[0_6px_8px_-6px_rgba(0,0,0,.9)]" />
                          <span className="mb-6 h-1.5 w-[96%] max-w-[160px] rounded-full bg-lime-900/30 blur-[1px]" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </IntelPanel>
            </div>
          </CollapsibleContent>
        </IntelPanel>
      </Collapsible>
      </div>
    </IntelPageShell>
  );
}

function RecordDump({ title, rec }: { title: string; rec: MaybeAvail<Record<string, unknown>> }) {
  if (!rec.available) {
    return (
      <IntelPanel variant="profile" className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        <p className="mt-1 text-xs text-zinc-600">Unavailable — {rec.reason}</p>
      </IntelPanel>
    );
  }
  const o = rec.value;
  return (
    <IntelPanel variant="profile" className="p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-1 font-mono text-[11px] text-zinc-300">
        {Object.entries(o)
          .map(([k, v]) => `${k}: ${typeof v === "number" ? (Number.isInteger(v) ? v : Number(v).toFixed(2)) : String(v)}`)
          .join(" · ")}
      </p>
    </IntelPanel>
  );
}
