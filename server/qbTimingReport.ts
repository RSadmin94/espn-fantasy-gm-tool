/**
 * qbTimingReport.ts — Read-only QB timing diagnostic (Phase 2B experimental).
 *
 * Does NOT modify mock draft behavior. Surfaces league/owner/sim gaps before any
 * future QB timing guard is considered.
 */

import { sql as drizzleSql } from "drizzle-orm";
import { buildMockDraft, type MockDraftInputs } from "./draftWarRoomRouter";
import type { HistoricalProfileBundle } from "./draftValidationHistory";
import { computeLeagueOffenseTimingProfile } from "./leagueOffenseTimingProfile";
import type { PositionTimingProfile } from "./leagueDraftTimingProfile";
import { normOwnerKey } from "./ownerDraftDnaModel";
import type { MockPickRow } from "./ownerAuthenticityScore";

export type QbTimingConfidence = "High" | "Medium" | "Low";

export interface OwnerQbTimingRow {
  ownerKey: string;
  ownerName: string;
  /** Mean first-QB round across seasons with a QB draft. */
  historicalFirstQbRound: number | null;
  /** Seasons with at least one QB drafted. */
  qbSeasons: number;
  /** Earliest first-QB round observed. */
  earliestFirstQbRound: number | null;
  /** Latest first-QB round observed. */
  latestFirstQbRound: number | null;
  simulatedFirstQbRound: number | null;
  simulatedFirstQbPick: number | null;
  simulatedFirstQbPlayer: string | null;
  /** sim − hist (positive = sim drafts QB later). */
  roundGap: number | null;
  absRoundGap: number | null;
  confidence: QbTimingConfidence;
  confidenceReasons: string[];
  recommendedIntervention: string;
}

export interface QbTimingReport {
  leagueId: string;
  season: number;
  generatedAt: string;
  leagueQbTiming: {
    profile: PositionTimingProfile | null;
    avgFirstQbRoundHistorical: number | null;
    avgFirstQbRoundSimulated: number | null;
    confidence: QbTimingConfidence;
    confidenceReasons: string[];
  };
  owners: OwnerQbTimingRow[];
  largestGaps: OwnerQbTimingRow[];
  watchlist: OwnerQbTimingRow[];
  summary: string[];
}

function qbConfidence(seasons: number, qbSeasons: number): { confidence: QbTimingConfidence; reasons: string[] } {
  const reasons: string[] = [];
  if (qbSeasons >= 4) reasons.push(`${qbSeasons} seasons with QB drafts`);
  else if (qbSeasons >= 2) reasons.push(`${qbSeasons} seasons with QB drafts (limited sample)`);
  else reasons.push(`${qbSeasons} season(s) with QB drafts (sparse)`);

  if (seasons >= 4 && qbSeasons >= 3) return { confidence: "High", reasons };
  if (qbSeasons >= 2) return { confidence: "Medium", reasons };
  return { confidence: "Low", reasons };
}

function recommendIntervention(row: OwnerQbTimingRow, leagueMedRound: number | null): string {
  const gap = row.roundGap;
  if (row.qbSeasons === 0) {
    return "No historical QB sample — defer any timing guard; use league median only after data accrues.";
  }
  if (gap == null || row.simulatedFirstQbRound == null) {
    return "Sim did not draft a QB — verify roster caps / pool before any timing intervention.";
  }
  if (Math.abs(gap) < 1.5) {
    return "Within normal variance — no QB timing guard recommended.";
  }
  if (gap > 0) {
    if (row.historicalFirstQbRound != null && row.historicalFirstQbRound <= 3) {
      return "Owner historically takes QB early; sim is late — investigate need-reach / DNA, not league-wide deferral.";
    }
    return "Sim QB later than history — check roster need urgency and close-decision DNA before league timing.";
  }
  // gap < 0 → sim earlier than history
  if (row.simulatedFirstQbRound <= 2 && (leagueMedRound ?? 99) >= 3) {
    return "Early QB in sim vs history and league median — likely CRITICAL need-reach; fix need engine before timing guard.";
  }
  return "Sim QB earlier than owner history — audit pick # and primaryFactor at first QB before adding guards.";
}

/** Per-owner first-QB round by season from draft_picks (read-only). */
export async function loadOwnerHistoricalQbTiming(opts: {
  db: { execute: (q: unknown) => Promise<unknown> };
  leagueId: string;
}): Promise<Map<string, { ownerName: string; firstQbRounds: number[] }>> {
  const { db, leagueId } = opts;
  const [rows] = (await db.execute(drizzleSql`
    SELECT d.season, d.roundId, t.ownerName
    FROM draft_picks d
    JOIN teams t ON t.leagueId = d.leagueId AND t.season = d.season AND t.teamId = d.teamId
    WHERE d.leagueId = ${leagueId}
      AND d.position = 'QB'
      AND d.isKeeper = 0
      AND d.playerName IS NOT NULL AND d.playerName != ''
    ORDER BY d.season ASC, d.overallPick ASC
  `)) as [Array<{ season: number; roundId: number; ownerName: string }>];

  const byOwnerSeason = new Map<string, Map<number, number>>();
  const ownerNames = new Map<string, string>();

  for (const r of rows) {
    const ownerName = String(r.ownerName ?? "").trim() || "Unknown";
    const key = normOwnerKey(ownerName);
    ownerNames.set(key, ownerName);
    if (!byOwnerSeason.has(key)) byOwnerSeason.set(key, new Map());
    const seasonMap = byOwnerSeason.get(key)!;
    const season = Number(r.season);
    const round = Number(r.roundId);
    if (!seasonMap.has(season) || round < seasonMap.get(season)!) {
      seasonMap.set(season, round);
    }
  }

  const out = new Map<string, { ownerName: string; firstQbRounds: number[] }>();
  for (const [key, seasonMap] of byOwnerSeason) {
    out.set(key, {
      ownerName: ownerNames.get(key) ?? key,
      firstQbRounds: [...seasonMap.values()].sort((a, b) => a - b),
    });
  }
  return out;
}

function simulatedFirstQbByOwner(picks: MockPickRow[]): Map<string, {
  round: number;
  pick: number;
  player: string;
  ownerName: string;
}> {
  const out = new Map<string, { round: number; pick: number; player: string; ownerName: string }>();
  for (const p of picks) {
    if (p.isKeeperSlot || p.position !== "QB") continue;
    const key = normOwnerKey(p.ownerName);
    if (!out.has(key)) {
      out.set(key, {
        round: p.round,
        pick: p.pickNumber,
        player: p.player,
        ownerName: p.ownerName,
      });
    }
  }
  return out;
}

export function buildQbTimingReport(params: {
  leagueId: string;
  season: number;
  leagueQbProfile: PositionTimingProfile | null;
  historical: HistoricalProfileBundle;
  mockInputs: MockDraftInputs;
  ownerHistoricalQb: Map<string, { ownerName: string; firstQbRounds: number[] }>;
  watchlistOwnerKeys?: string[];
}): QbTimingReport {
  const {
    leagueId,
    season,
    leagueQbProfile,
    historical,
    mockInputs,
    ownerHistoricalQb,
    watchlistOwnerKeys = [],
  } = params;

  const simPicks = buildMockDraft(mockInputs) as MockPickRow[];
  const simByOwner = simulatedFirstQbByOwner(simPicks);

  const leagueMedRound = leagueQbProfile?.baselineFirstRound
    ?? historical.league.avgFirstQbRound
    ?? null;

  const ownerKeys = new Set<string>([
    ...historical.owners.map((o) => o.ownerKey),
    ...simByOwner.keys(),
    ...ownerHistoricalQb.keys(),
  ]);

  const owners: OwnerQbTimingRow[] = [];

  for (const ownerKey of ownerKeys) {
    const histProf = historical.owners.find((o) => o.ownerKey === ownerKey);
    const histQb = ownerHistoricalQb.get(ownerKey);
    const firstRounds = histQb?.firstQbRounds ?? [];
    const historicalFirstQbRound = firstRounds.length
      ? Math.round((firstRounds.reduce((a, b) => a + b, 0) / firstRounds.length) * 10) / 10
      : histProf?.avgFirstQbRound ?? null;
    const qbSeasons = firstRounds.length;
    const earliestFirstQbRound = firstRounds.length ? Math.min(...firstRounds) : null;
    const latestFirstQbRound = firstRounds.length ? Math.max(...firstRounds) : null;

    const sim = simByOwner.get(ownerKey);
    const simulatedFirstQbRound = sim?.round ?? null;
    const roundGap = historicalFirstQbRound != null && simulatedFirstQbRound != null
      ? Math.round((simulatedFirstQbRound - historicalFirstQbRound) * 10) / 10
      : null;

    const { confidence, reasons } = qbConfidence(
      leagueQbProfile?.seasonsAnalyzed ?? historical.league.offensePickCount > 0 ? 5 : 0,
      qbSeasons,
    );

    const row: OwnerQbTimingRow = {
      ownerKey,
      ownerName: histProf?.ownerName ?? histQb?.ownerName ?? sim?.ownerName ?? ownerKey,
      historicalFirstQbRound,
      qbSeasons,
      earliestFirstQbRound,
      latestFirstQbRound,
      simulatedFirstQbRound,
      simulatedFirstQbPick: sim?.pick ?? null,
      simulatedFirstQbPlayer: sim?.player ?? null,
      roundGap,
      absRoundGap: roundGap != null ? Math.abs(roundGap) : null,
      confidence,
      confidenceReasons: reasons,
      recommendedIntervention: "",
    };
    row.recommendedIntervention = recommendIntervention(row, leagueMedRound);
    owners.push(row);
  }

  owners.sort((a, b) => (b.absRoundGap ?? 0) - (a.absRoundGap ?? 0));

  const simQbRounds = [...simByOwner.values()].map((s) => s.round);
  const avgFirstQbRoundSimulated = simQbRounds.length
    ? Math.round((simQbRounds.reduce((a, b) => a + b, 0) / simQbRounds.length) * 10) / 10
    : null;

  const leagueConfReasons = leagueQbProfile?.confidenceReasons ?? [];
  const leagueConfidence = leagueQbProfile?.confidence ?? "Low";

  const watchlist = owners.filter((o) =>
    watchlistOwnerKeys.some((k) => normOwnerKey(k) === o.ownerKey)
    || (o.absRoundGap ?? 0) >= 3,
  );

  const largestGaps = owners.filter((o) => (o.absRoundGap ?? 0) >= 1.5).slice(0, 10);

  const summary = [
    `League historical first-QB ~R${historical.league.avgFirstQbRound?.toFixed(1) ?? "—"}; sim ~R${avgFirstQbRoundSimulated ?? "—"}.`,
    leagueQbProfile
      ? `League QB window (read-only profile): opens ~pick ${leagueQbProfile.windowStartPick}, median R${leagueQbProfile.baselineFirstRound ?? "?"}.`
      : "League QB timing profile unavailable.",
    `${largestGaps.length} owner(s) with |gap| ≥ 1.5 rounds; ${watchlist.length} on watchlist.`,
    "QB timing guards are experimental — diagnose need-reach and owner DNA before shipping league-wide rules.",
  ];

  return {
    leagueId,
    season,
    generatedAt: new Date().toISOString(),
    leagueQbTiming: {
      profile: leagueQbProfile,
      avgFirstQbRoundHistorical: historical.league.avgFirstQbRound,
      avgFirstQbRoundSimulated: avgFirstQbRoundSimulated,
      confidence: leagueConfidence as QbTimingConfidence,
      confidenceReasons: leagueConfReasons,
    },
    owners,
    largestGaps,
    watchlist,
    summary,
  };
}

export function formatQbTimingReportText(report: QbTimingReport): string {
  const lines: string[] = [
    "══════════════════════════════════════════════════════════════",
    "              QB TIMING DIAGNOSTIC REPORT (read-only)",
    "══════════════════════════════════════════════════════════════",
    `Generated: ${report.generatedAt}`,
    `League ${report.leagueId} · Season ${report.season}`,
    "",
    "── League QB timing ──",
    `Historical avg first-QB round: ${report.leagueQbTiming.avgFirstQbRoundHistorical?.toFixed(1) ?? "—"}`,
    `Simulated avg first-QB round:  ${report.leagueQbTiming.avgFirstQbRoundSimulated?.toFixed(1) ?? "—"}`,
    `Profile confidence: ${report.leagueQbTiming.confidence}`,
    ...(report.leagueQbTiming.profile
      ? [
          `Median first-QB pick: ${report.leagueQbTiming.profile.baselineFirstPick ?? "—"} (R${report.leagueQbTiming.profile.baselineFirstRound ?? "?"})`,
          `Window: pick ${report.leagueQbTiming.profile.windowStartPick ?? "?"} – ${report.leagueQbTiming.profile.windowEndPick ?? "?"}`,
          report.leagueQbTiming.profile.interpretation,
        ]
      : []),
    "",
    "── Owner gaps (hist → sim) ──",
    "Owner | Hist R | Sim R | Gap | Conf | QB seasons",
    ...report.largestGaps.map((o) =>
      `${o.ownerName} | ${o.historicalFirstQbRound?.toFixed(1) ?? "—"} | ${o.simulatedFirstQbRound ?? "—"} | ${o.roundGap != null ? (o.roundGap > 0 ? "+" : "") + o.roundGap : "—"} | ${o.confidence} | ${o.qbSeasons}`,
    ),
    "",
    "── Watchlist & recommendations ──",
    ...report.watchlist.map((o) =>
      `• ${o.ownerName}: hist R${o.historicalFirstQbRound ?? "?"} → sim R${o.simulatedFirstQbRound ?? "?"} (pick ${o.simulatedFirstQbPick ?? "—"} ${o.simulatedFirstQbPlayer ?? ""}). ${o.recommendedIntervention}`,
    ),
    "",
    "── Summary ──",
    ...report.summary.map((s) => `• ${s}`),
    "══════════════════════════════════════════════════════════════",
  ];
  return lines.join("\n");
}

export async function runQbTimingReport(opts: {
  db: { execute: (q: unknown) => Promise<unknown> };
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => unknown;
  leagueId: string;
  season: number;
  mockInputs: MockDraftInputs;
  historical: HistoricalProfileBundle;
  watchlistOwnerKeys?: string[];
}): Promise<QbTimingReport> {
  const leagueQbProfile = await computeLeagueOffenseTimingProfile({
    db: opts.db,
    sql: opts.sql,
    leagueId: opts.leagueId,
    position: "QB",
  });
  const ownerHistoricalQb = await loadOwnerHistoricalQbTiming({
    db: opts.db,
    leagueId: opts.leagueId,
  });
  return buildQbTimingReport({
    leagueId: opts.leagueId,
    season: opts.season,
    leagueQbProfile,
    historical: opts.historical,
    mockInputs: opts.mockInputs,
    ownerHistoricalQb,
    watchlistOwnerKeys: opts.watchlistOwnerKeys,
  });
}
