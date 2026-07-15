/**
 * leagueOffenseTimingProfile.ts — READ-ONLY QB / TE / K timing baselines from draft_picks.
 *
 * Mirrors the Phase 1 DP pattern: league history sets WHEN a position becomes draftable.
 */

import { normalizeDefensivePosition } from "./leagueIdpDraftProfile";
import type { PositionTimingProfile, TimingConfidence } from "./leagueDraftTimingProfile";

export type OffenseTimingPosition = "QB" | "TE" | "K";

function isUnlabeled(pos: string | null | undefined): boolean {
  const p = String(pos ?? "").trim();
  return p === "" || p === "?";
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round(((s[m - 1]! + s[m]!) / 2) * 10) / 10;
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo));
}

function pickRound(overallPick: number, teamCount: number): number {
  return Math.max(1, Math.ceil(overallPick / teamCount));
}

export interface OffenseTimingRawSeason {
  season: number;
  firstPick: number;
  firstRound: number;
  firstPlayer: string;
  positionPickCount: number;
  labeledCoveragePct: number;
}

export interface OffenseTimingRawProfile {
  position: OffenseTimingPosition;
  leagueId: string;
  teamCount: number;
  seasonsAnalyzed: number;
  totalPositionPicks: number;
  labeledCoveragePct: number;
  earliestFirstBySeason: OffenseTimingRawSeason[];
  firstPicks: number[];
  teamFirstPicks: number[];
  confidence: TimingConfidence;
  confidenceReasons: string[];
}

export async function computeLeagueOffensePositionRawProfile(opts: {
  db: { execute: (q: unknown) => Promise<unknown> };
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => unknown;
  leagueId: string;
  position: OffenseTimingPosition;
}): Promise<OffenseTimingRawProfile | null> {
  const { db, sql, leagueId, position } = opts;

  const [rows] = (await db.execute(sql`
    SELECT season, overallPick, roundId, roundPick, playerName, position, isKeeper, teamId
    FROM draft_picks
    WHERE leagueId = ${leagueId}
      AND isKeeper = 0
    ORDER BY season ASC, overallPick ASC
  `)) as unknown as [Array<Record<string, unknown>>];

  if (!rows.length) return null;

  const teamCount = Math.max(1, ...rows.map((r) => Number(r.roundPick) || 0)) || 14;
  const bySeason = new Map<number, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const s = Number(r.season);
    if (!bySeason.has(s)) bySeason.set(s, []);
    bySeason.get(s)!.push(r);
  }

  const earliestFirstBySeason: OffenseTimingRawSeason[] = [];
  const firstPicks: number[] = [];
  /** Per-team first-{pos} picks — better league timing baseline than first-off-board. */
  const teamFirstPicks: number[] = [];
  let totalPositionPicks = 0;
  let labeledInEra = 0;
  let totalInEra = 0;

  for (const s of [...bySeason.keys()].sort((a, b) => a - b)) {
    const picks = bySeason.get(s)!;
    const posPicks = picks
      .filter((p) => {
        const pos = normalizeDefensivePosition(String(p.position ?? ""));
        return pos === position;
      })
      .sort((a, b) => Number(a.overallPick) - Number(b.overallPick));

    if (!posPicks.length) continue;

    const labeled = picks.filter((p) => !isUnlabeled(String(p.position))).length;
    labeledInEra += labeled;
    totalInEra += picks.length;
    totalPositionPicks += posPicks.length;

    const first = posPicks[0]!;
    const firstPick = Number(first.overallPick);
    firstPicks.push(firstPick);
    earliestFirstBySeason.push({
      season: s,
      firstPick,
      firstRound: Number(first.roundId) || pickRound(firstPick, teamCount),
      firstPlayer: String(first.playerName ?? ""),
      positionPickCount: posPicks.length,
      labeledCoveragePct: picks.length ? Math.round((labeled / picks.length) * 100) : 0,
    });

    // Per-team first {position} in this season
    const byTeam = new Map<number, number>();
    for (const p of posPicks) {
      const tid = Number((p as { teamId?: number }).teamId ?? 0);
      if (!tid) continue;
      const op = Number(p.overallPick);
      const prev = byTeam.get(tid);
      if (prev == null || op < prev) byTeam.set(tid, op);
    }
    for (const op of byTeam.values()) teamFirstPicks.push(op);
  }

  if (!earliestFirstBySeason.length) return null;

  const seasonsAnalyzed = earliestFirstBySeason.length;
  const labeledCoveragePct = totalInEra > 0 ? Math.round((labeledInEra / totalInEra) * 100) : 0;

  const confidenceReasons: string[] = [];
  let confidence: TimingConfidence;
  if (seasonsAnalyzed < 3 || totalPositionPicks < 10 || labeledCoveragePct < 60) {
    confidence = "Low";
    if (seasonsAnalyzed < 3) confidenceReasons.push(`only ${seasonsAnalyzed} season(s) with ${position} data`);
    if (totalPositionPicks < 10) confidenceReasons.push(`only ${totalPositionPicks} ${position} pick(s) on record`);
    if (labeledCoveragePct < 60) confidenceReasons.push(`only ${labeledCoveragePct}% of picks carry a position label`);
  } else if (seasonsAnalyzed >= 6 && totalPositionPicks >= 40 && labeledCoveragePct >= 90) {
    confidence = "High";
    confidenceReasons.push(`${seasonsAnalyzed} seasons, ${totalPositionPicks} ${position} picks, ${labeledCoveragePct}% labeled`);
  } else {
    confidence = "Medium";
    confidenceReasons.push(`${seasonsAnalyzed} seasons and ${totalPositionPicks} ${position} picks (${labeledCoveragePct}% labeled)`);
  }

  return {
    position,
    leagueId,
    teamCount,
    seasonsAnalyzed,
    totalPositionPicks,
    labeledCoveragePct,
    earliestFirstBySeason,
    firstPicks,
    teamFirstPicks,
    confidence,
    confidenceReasons,
  };
}

/** Map raw offense timing stats → shared PositionTimingProfile (QB / TE / K). */
export function offenseTimingToProfile(raw: OffenseTimingRawProfile & { teamFirstPicks?: number[] }): PositionTimingProfile {
  const { position, leagueId, teamCount, firstPicks } = raw;
  const timingPicks = (raw.teamFirstPicks?.length ? raw.teamFirstPicks : firstPicks);
  const sorted = [...timingPicks].sort((a, b) => a - b);
  const sortedFirstOff = [...firstPicks].sort((a, b) => a - b);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  const med = median(sorted);
  const avg = mean(sorted);
  const earliest = sortedFirstOff[0] ?? null;
  const latest = sortedFirstOff[sortedFirstOff.length - 1] ?? null;

  let windowOpen: number | null = p25 ?? med;
  let softClose: number | null = p75 ?? (med != null ? med + teamCount : null);
  let hardClose: number | null = latest != null ? latest + teamCount : softClose;

  if (position === "K") {
    // Kickers: default to final rounds when history is sparse; never open before round N-2 equivalent.
    const minKOpen = Math.max(1, (raw.seasonsAnalyzed > 0 ? Math.max(...raw.earliestFirstBySeason.map((s) => s.firstPick)) : teamCount * 12) - teamCount);
    windowOpen = windowOpen != null ? Math.max(windowOpen, minKOpen) : minKOpen;
  }

  if (raw.confidence === "Low") {
    windowOpen = windowOpen != null ? Math.max(1, windowOpen - teamCount) : null;
    softClose = softClose != null ? softClose + teamCount : null;
    hardClose = hardClose != null ? hardClose + teamCount : null;
  } else if (raw.confidence === "High" && p25 != null) {
    windowOpen = p25;
    softClose = p75 ?? softClose;
  } else {
    windowOpen = p25 ?? (med != null ? med - teamCount : null);
    softClose = p75 ?? (med != null ? med + teamCount : null);
  }

  const medRound = med != null ? pickRound(med, teamCount) : null;
  const earlyThreshold = position === "K" ? 100 : position === "TE" ? 45 : 40;
  const seasonsWithEarlyFirst = raw.earliestFirstBySeason.filter((s) => s.firstPick < earlyThreshold).length;

  const interpretation =
    `${position} timing: median first-${position} pick ${med ?? "n/a"} (R${medRound ?? "?"}), ` +
    `window opens ~pick ${windowOpen ?? "n/a"}, soft close ~pick ${softClose ?? "n/a"}. ` +
    `${raw.seasonsAnalyzed} season(s), ${raw.labeledCoveragePct}% labeled coverage, ${raw.confidence} confidence.`;

  return {
    position,
    leagueId,
    teamCount,
    confidence: raw.confidence,
    confidenceReasons: raw.confidenceReasons,
    baselineFirstPick: med,
    baselineFirstRound: medRound,
    firstPickP25: p25,
    firstPickP75: p75,
    windowStartPick: windowOpen,
    windowEndPick: softClose,
    seasonsAnalyzed: raw.seasonsAnalyzed,
    totalPositionPicks: raw.totalPositionPicks,
    seasonsWithEarlyFirst,
    earliestFirstBySeason: raw.earliestFirstBySeason.map((s) => ({
      season: s.season,
      firstPick: s.firstPick,
      firstRound: s.firstRound,
      firstPlayer: s.firstPlayer,
    })),
    interpretation,
  };
}

export async function computeLeagueOffenseTimingProfile(opts: {
  db: { execute: (q: unknown) => Promise<unknown> };
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => unknown;
  leagueId: string;
  position: OffenseTimingPosition;
}): Promise<PositionTimingProfile | null> {
  const raw = await computeLeagueOffensePositionRawProfile(opts);
  if (!raw) return null;
  return offenseTimingToProfile({ ...raw, teamFirstPicks: raw.teamFirstPicks });
}
