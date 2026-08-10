/**
 * RFSN-055 — Deterministic Draft Intelligence Authority.
 *
 * Reach convention matches shared/reachClassification.ts:
 *   reachDelta = ADP − actual pick  (positive = drafted earlier than ADP)
 *   stealDelta = actual pick − ADP  (positive = drafted later than ADP)
 *
 * No LLM. No invented personalities. Coverage years when ADP is missing.
 */
import {
  classifyReach,
  computeReachDelta,
  type ReachClassification,
} from "../shared/reachClassification";

export { computeReachDelta };

export const DRAFT_INTELLIGENCE_TOOL_NAME = "query_draft_intelligence" as const;

/** ESPN undrafted sentinel ~169–171 must never count as ADP. */
export const INVALID_ADP_MIN = 160;

export type DraftIntelligenceMetric =
  | "biggest_reaches"
  | "biggest_steals"
  | "average_reach_by_owner"
  | "largest_single_reach"
  | "reach_frequency"
  | "position_tendencies"
  | "draft_philosophy"
  | "qb_timing"
  | "rb_timing"
  | "wr_timing"
  | "rookie_preference"
  | "average_draft_value"
  | "draft_aggression"
  | "adp_follow"
  | "adp_ignore";

export type DraftTimingDirection = "early" | "late";
export type DraftAggressionMode = "gambles" | "safest";

export type DraftIntelligenceQuery = {
  metric: DraftIntelligenceMetric;
  timingDirection?: DraftTimingDirection;
  aggressionMode?: DraftAggressionMode;
  ownerName?: string;
  ownerNames?: string[];
  seasonFrom?: number;
  seasonTo?: number;
  topN?: number;
};

export type DraftPickEvidence = {
  season: number;
  overallPick: number;
  round: number;
  teamId: number;
  ownerName: string;
  ownerKey?: string;
  playerId?: number | null;
  playerName: string;
  position: string;
  isKeeper?: boolean;
  adp?: number | null;
  numberOfTeams?: number;
};

export type ScoredDraftPick = DraftPickEvidence & {
  reachDelta: number | null;
  stealDelta: number | null;
  classification: ReachClassification | null;
};

export type OwnerReachRow = {
  ownerName: string;
  ownerKey?: string;
  pickCount: number;
  adpPickCount: number;
  reachCount: number;
  avgReachDelta: number | null;
  avgValueDelta: number | null;
  avgAbsDelta: number | null;
};

export type OwnerTimingRow = {
  ownerName: string;
  ownerKey?: string;
  position: string;
  pickCount: number;
  avgRound: number;
  earliestRound: number;
};

export type RookieOwnerRow = {
  ownerName: string;
  ownerKey?: string;
  rookiePicks: number;
  pickCount: number;
  rookieShare: number;
};

export type DraftIntelligenceResult = {
  query: DraftIntelligenceQuery;
  draftBoardFrom: number | null;
  draftBoardTo: number | null;
  adpFrom: number | null;
  adpTo: number | null;
  noDraftBoard: boolean;
  noAdp: boolean;
  adpRequired: boolean;
  formattedAnswer: string;
  topReaches: ScoredDraftPick[];
  topSteals: ScoredDraftPick[];
  largestReach: ScoredDraftPick | null;
  ownerReach: OwnerReachRow[];
  ownerTiming: OwnerTimingRow[];
  rookieOwners: RookieOwnerRow[];
  philosophy: Array<{ ownerName: string; label: string; detail: string }>;
};

const ADP_METRICS = new Set<DraftIntelligenceMetric>([
  "biggest_reaches",
  "biggest_steals",
  "average_reach_by_owner",
  "largest_single_reach",
  "reach_frequency",
  "average_draft_value",
  "draft_aggression",
  "adp_follow",
  "adp_ignore",
]);

export function draftIntelligenceNeedsAdp(metric: DraftIntelligenceMetric): boolean {
  return ADP_METRICS.has(metric);
}

export function isUsableAdp(adp: number | null | undefined): adp is number {
  return typeof adp === "number" && Number.isFinite(adp) && adp > 0 && adp < INVALID_ADP_MIN;
}

export function coverageYears(start: number | null, end: number | null): string {
  if (start != null && end != null && start === end) return String(start);
  if (start != null && end != null) return `${start}–${end}`;
  return "recorded coverage";
}

function posKey(position: string | null | undefined): string {
  const p = String(position ?? "").trim().toUpperCase();
  if (p === "D/ST" || p === "DST" || p === "DEF") return "DEF";
  if (p.startsWith("RB")) return "RB";
  if (p.startsWith("WR")) return "WR";
  if (p.startsWith("QB")) return "QB";
  if (p.startsWith("TE")) return "TE";
  if (p.startsWith("K")) return "K";
  return p || "UNK";
}

function normOwner(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function ownerMatches(name: string, filter?: string): boolean {
  if (!filter?.trim()) return true;
  const a = normOwner(name).toLowerCase();
  const b = filter.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

function ownerMatchesAny(name: string, filters?: string[]): boolean {
  if (!filters?.length) return true;
  return filters.some((f) => ownerMatches(name, f));
}

function seasonInRange(season: number, from?: number, to?: number): boolean {
  if (from != null && season < from) return false;
  if (to != null && season > to) return false;
  return true;
}

export function scoreDraftPicks(picks: DraftPickEvidence[]): ScoredDraftPick[] {
  return picks.map((p) => {
    const adp = isUsableAdp(p.adp) ? p.adp : null;
    if (adp == null || p.isKeeper) {
      return { ...p, adp, reachDelta: null, stealDelta: null, classification: null };
    }
    const reachDelta = computeReachDelta(p.overallPick, adp);
    const classification = classifyReach({
      pickNumber: p.overallPick,
      playerAdp: adp,
      round: p.round,
      numberOfTeams: p.numberOfTeams,
    });
    return {
      ...p,
      adp,
      reachDelta,
      stealDelta: -reachDelta,
      classification,
    };
  });
}

function firstSeenSeasonByPlayer(picks: DraftPickEvidence[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const p of picks) {
    const id = p.playerId != null && p.playerId > 0 ? `id:${p.playerId}` : "";
    if (!id) continue;
    const prev = first.get(id);
    if (prev == null || p.season < prev) first.set(id, p.season);
  }
  return first;
}

function ownerReachRows(scored: ScoredDraftPick[]): OwnerReachRow[] {
  const by = new Map<string, OwnerReachRow>();
  for (const p of scored) {
    const key = p.ownerKey || p.ownerName;
    let row = by.get(key);
    if (!row) {
      row = {
        ownerName: p.ownerName,
        ownerKey: p.ownerKey,
        pickCount: 0,
        adpPickCount: 0,
        reachCount: 0,
        avgReachDelta: null,
        avgValueDelta: null,
        avgAbsDelta: null,
      };
      by.set(key, row);
    }
    row.pickCount += 1;
    if (p.reachDelta == null) continue;
    row.adpPickCount += 1;
    if (p.classification?.isReach) row.reachCount += 1;
    row.avgReachDelta = (row.avgReachDelta ?? 0) + p.reachDelta;
    row.avgValueDelta = (row.avgValueDelta ?? 0) + (p.stealDelta ?? 0);
    row.avgAbsDelta = (row.avgAbsDelta ?? 0) + Math.abs(p.reachDelta);
  }
  return [...by.values()]
    .map((r) => ({
      ...r,
      avgReachDelta: r.adpPickCount ? r.avgReachDelta! / r.adpPickCount : null,
      avgValueDelta: r.adpPickCount ? r.avgValueDelta! / r.adpPickCount : null,
      avgAbsDelta: r.adpPickCount ? r.avgAbsDelta! / r.adpPickCount : null,
    }))
    .filter((r) => r.adpPickCount > 0)
    .sort((a, b) => (b.avgReachDelta ?? -999) - (a.avgReachDelta ?? -999));
}

function ownerTimingRows(picks: DraftPickEvidence[], position: string): OwnerTimingRow[] {
  const want = posKey(position);
  const by = new Map<string, { rounds: number[]; ownerName: string; ownerKey?: string }>();
  for (const p of picks) {
    if (p.isKeeper) continue;
    if (posKey(p.position) !== want) continue;
    const key = p.ownerKey || p.ownerName;
    let row = by.get(key);
    if (!row) {
      row = { rounds: [], ownerName: p.ownerName, ownerKey: p.ownerKey };
      by.set(key, row);
    }
    row.rounds.push(p.round);
  }
  return [...by.values()]
    .filter((r) => r.rounds.length > 0)
    .map((r) => ({
      ownerName: r.ownerName,
      ownerKey: r.ownerKey,
      position: want,
      pickCount: r.rounds.length,
      avgRound: r.rounds.reduce((s, n) => s + n, 0) / r.rounds.length,
      earliestRound: Math.min(...r.rounds),
    }));
}

function philosophyRows(
  picks: DraftPickEvidence[],
): Array<{ ownerName: string; label: string; detail: string }> {
  const owners = [...new Set(picks.map((p) => p.ownerKey || p.ownerName))];
  const leagueQb = ownerTimingRows(picks, "QB");
  const leagueRb = ownerTimingRows(picks, "RB");
  const leagueWr = ownerTimingRows(picks, "WR");
  const qbLeagueAvg =
    leagueQb.length > 0 ? leagueQb.reduce((s, r) => s + r.avgRound, 0) / leagueQb.length : null;
  const rbLeagueAvg =
    leagueRb.length > 0 ? leagueRb.reduce((s, r) => s + r.avgRound, 0) / leagueRb.length : null;
  const wrLeagueAvg =
    leagueWr.length > 0 ? leagueWr.reduce((s, r) => s + r.avgRound, 0) / leagueWr.length : null;

  const out: Array<{ ownerName: string; label: string; detail: string }> = [];
  for (const key of owners) {
    const qb = leagueQb.find((r) => (r.ownerKey || r.ownerName) === key);
    const rb = leagueRb.find((r) => (r.ownerKey || r.ownerName) === key);
    const wr = leagueWr.find((r) => (r.ownerKey || r.ownerName) === key);
    const name = qb?.ownerName || rb?.ownerName || wr?.ownerName;
    if (!name) continue;
    const tags: string[] = [];
    const details: string[] = [];
    if (rb && rbLeagueAvg != null && rb.avgRound <= rbLeagueAvg - 1.0) {
      tags.push("RB-early");
      details.push(`RBs at round ${rb.avgRound.toFixed(1)} vs league ${rbLeagueAvg.toFixed(1)}`);
    }
    if (wr && wrLeagueAvg != null && wr.avgRound <= wrLeagueAvg - 1.0) {
      tags.push("WR-early");
      details.push(`WRs at round ${wr.avgRound.toFixed(1)} vs league ${wrLeagueAvg.toFixed(1)}`);
    }
    if (qb && qbLeagueAvg != null && qb.avgRound <= qbLeagueAvg - 1.0) {
      tags.push("QB-early");
      details.push(`QBs at round ${qb.avgRound.toFixed(1)} vs league ${qbLeagueAvg.toFixed(1)}`);
    } else if (qb && qbLeagueAvg != null && qb.avgRound >= qbLeagueAvg + 1.0) {
      tags.push("QB-wait");
      details.push(`QBs at round ${qb.avgRound.toFixed(1)} vs league ${qbLeagueAvg.toFixed(1)}`);
    }
    if (!tags.length) continue;
    out.push({
      ownerName: name,
      label: tags.join(" / "),
      detail: details.join("; "),
    });
  }
  return out.sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}

function rookieRows(picks: DraftPickEvidence[]): RookieOwnerRow[] {
  const first = firstSeenSeasonByPlayer(picks);
  if (first.size === 0) return [];
  const by = new Map<string, RookieOwnerRow>();
  for (const p of picks) {
    if (p.isKeeper) continue;
    const key = p.ownerKey || p.ownerName;
    let row = by.get(key);
    if (!row) {
      row = {
        ownerName: p.ownerName,
        ownerKey: p.ownerKey,
        rookiePicks: 0,
        pickCount: 0,
        rookieShare: 0,
      };
      by.set(key, row);
    }
    row.pickCount += 1;
    const id = p.playerId != null && p.playerId > 0 ? `id:${p.playerId}` : "";
    if (id && first.get(id) === p.season) row.rookiePicks += 1;
  }
  return [...by.values()]
    .filter((r) => r.pickCount > 0)
    .map((r) => ({ ...r, rookieShare: r.rookiePicks / r.pickCount }))
    .sort((a, b) => b.rookieShare - a.rookieShare || b.rookiePicks - a.rookiePicks);
}

function adpCoverageNote(boardFrom: number | null, boardTo: number | null, adpFrom: number | null, adpTo: number | null): string {
  const board = coverageYears(boardFrom, boardTo);
  if (adpFrom == null || adpTo == null) {
    return `Recorded draft history covers ${board}. ADP is not available for those seasons, so reach and steal rankings cannot be computed.`;
  }
  const adp = coverageYears(adpFrom, adpTo);
  if (boardFrom != null && adpFrom != null && (boardFrom < adpFrom || (boardTo != null && adpTo != null && boardTo > adpTo))) {
    return `Draft reach data is available from ${adp}; earlier draft boards (${board}) are preserved without reliable ADP.`;
  }
  return `Draft reach data is available from ${adp}.`;
}

function boardCoverageNote(boardFrom: number | null, boardTo: number | null): string {
  return `Not all-time. Recorded draft coverage is ${coverageYears(boardFrom, boardTo)}.`;
}

function fmtPick(p: ScoredDraftPick): string {
  const delta = p.reachDelta != null ? Math.abs(p.reachDelta).toFixed(1) : "?";
  const adp = p.adp != null ? p.adp.toFixed(1) : "?";
  return `${p.ownerName} selecting ${p.playerName} at pick ${p.overallPick} (ADP ${adp}, ${delta} picks ${
    (p.reachDelta ?? 0) > 0 ? "early" : "late"
  }) in ${p.season}`;
}

export function computeDraftIntelligence(
  picksIn: DraftPickEvidence[],
  query: DraftIntelligenceQuery,
): DraftIntelligenceResult {
  const ownerFilters =
    query.ownerNames?.filter((n) => n.trim()) ??
    (query.ownerName?.trim() ? [query.ownerName] : undefined);
  const filtered = picksIn.filter(
    (p) =>
      seasonInRange(p.season, query.seasonFrom, query.seasonTo) &&
      ownerMatchesAny(p.ownerName, ownerFilters),
  );
  const seasons = [...new Set(filtered.map((p) => p.season))].sort((a, b) => a - b);
  const draftBoardFrom = seasons[0] ?? null;
  const draftBoardTo = seasons.length ? seasons[seasons.length - 1]! : null;
  const scored = scoreDraftPicks(filtered);
  const adpSeasons = [...new Set(scored.filter((p) => p.reachDelta != null).map((p) => p.season))].sort(
    (a, b) => a - b,
  );
  const adpFrom = adpSeasons[0] ?? null;
  const adpTo = adpSeasons.length ? adpSeasons[adpSeasons.length - 1]! : null;
  const adpRequired = draftIntelligenceNeedsAdp(query.metric);
  const noDraftBoard = filtered.length === 0;
  const noAdp = adpRequired && adpFrom == null;
  const topN = query.topN ?? 5;

  const reaches = scored
    .filter((p) => p.reachDelta != null && p.reachDelta > 0)
    .sort((a, b) => (b.reachDelta ?? 0) - (a.reachDelta ?? 0));
  const steals = scored
    .filter((p) => p.stealDelta != null && p.stealDelta > 0)
    .sort((a, b) => (b.stealDelta ?? 0) - (a.stealDelta ?? 0));
  const ownerReach = ownerReachRows(scored);
  const empty: DraftIntelligenceResult = {
    query,
    draftBoardFrom,
    draftBoardTo,
    adpFrom,
    adpTo,
    noDraftBoard,
    noAdp,
    adpRequired,
    formattedAnswer: "",
    topReaches: reaches.slice(0, topN),
    topSteals: steals.slice(0, topN),
    largestReach: reaches[0] ?? null,
    ownerReach,
    ownerTiming: [],
    rookieOwners: [],
    philosophy: [],
  };

  if (noDraftBoard) {
    empty.formattedAnswer = `This league does not have recorded draft history for ${coverageYears(
      query.seasonFrom ?? null,
      query.seasonTo ?? null,
    )}.`;
    return empty;
  }

  if (noAdp) {
    empty.formattedAnswer = adpCoverageNote(draftBoardFrom, draftBoardTo, null, null);
    return empty;
  }

  const acrossAdp = `Across recorded ADP-joined drafts from ${coverageYears(adpFrom, adpTo)}`;
  const acrossBoard = `Across recorded drafts from ${coverageYears(draftBoardFrom, draftBoardTo)}`;
  const adpNote = adpCoverageNote(draftBoardFrom, draftBoardTo, adpFrom, adpTo);
  const boardNote = boardCoverageNote(draftBoardFrom, draftBoardTo);

  switch (query.metric) {
    case "largest_single_reach": {
      const hit = reaches[0];
      empty.formattedAnswer = hit
        ? `${acrossAdp}, the largest reach was ${fmtPick(hit)}.\n${adpNote}`
        : `${acrossAdp}, no ADP-joined reaches were recorded.\n${adpNote}`;
      return empty;
    }
    case "biggest_reaches": {
      if (!reaches.length) {
        empty.formattedAnswer = `${acrossAdp}, no ADP-joined reaches were recorded.\n${adpNote}`;
        return empty;
      }
      const lines = reaches.slice(0, topN).map((p, i) => `${i + 1}. ${fmtPick(p)}`);
      empty.formattedAnswer = `${acrossAdp}, largest reaches:\n${lines.join("\n")}\n${adpNote}`;
      return empty;
    }
    case "biggest_steals": {
      if (!steals.length) {
        empty.formattedAnswer = `${acrossAdp}, no ADP-joined steals were recorded.\n${adpNote}`;
        return empty;
      }
      const lines = steals.slice(0, topN).map((p, i) => `${i + 1}. ${fmtPick(p)}`);
      empty.formattedAnswer = `${acrossAdp}, largest steals (later than ADP):\n${lines.join("\n")}\n${adpNote}`;
      return empty;
    }
    case "average_reach_by_owner": {
      const rows = [...ownerReach].sort((a, b) => (b.avgReachDelta ?? -999) - (a.avgReachDelta ?? -999));
      if (!rows.length) {
        empty.formattedAnswer = `${acrossAdp}, no owner ADP-joined picks were recorded.\n${adpNote}`;
        return empty;
      }
      const lines = rows.slice(0, topN).map((r, i) => {
        const avg = r.avgReachDelta != null ? r.avgReachDelta.toFixed(1) : "?";
        return `${i + 1}. ${r.ownerName} — avg reach ${avg} (${r.adpPickCount} ADP-joined picks)`;
      });
      empty.formattedAnswer = `${acrossAdp}, average reach by owner (ADP − pick):\n${lines.join("\n")}\n${adpNote}`;
      return empty;
    }
    case "reach_frequency": {
      const rows = [...ownerReach].sort(
        (a, b) => b.reachCount - a.reachCount || (b.avgReachDelta ?? 0) - (a.avgReachDelta ?? 0),
      );
      if (!rows.length) {
        empty.formattedAnswer = `${acrossAdp}, no owner ADP-joined picks were recorded.\n${adpNote}`;
        return empty;
      }
      const lines = rows.slice(0, topN).map((r, i) => {
        const rate = r.adpPickCount ? Math.round((100 * r.reachCount) / r.adpPickCount) : 0;
        return `${i + 1}. ${r.ownerName} — ${r.reachCount} reaches / ${r.adpPickCount} ADP-joined picks (${rate}%)`;
      });
      empty.formattedAnswer = `${acrossAdp}, reach frequency (picks earlier than ADP by the phase threshold):\n${lines.join("\n")}\n${adpNote}`;
      return empty;
    }
    case "average_draft_value": {
      const rows = [...ownerReach].sort((a, b) => (b.avgValueDelta ?? -999) - (a.avgValueDelta ?? -999));
      if (!rows.length) {
        empty.formattedAnswer = `${acrossAdp}, no owner ADP-joined picks were recorded.\n${adpNote}`;
        return empty;
      }
      const lines = rows.slice(0, topN).map((r, i) => {
        const avg = r.avgValueDelta != null ? r.avgValueDelta.toFixed(1) : "?";
        return `${i + 1}. ${r.ownerName} — avg value ${avg} (pick − ADP; higher = later than ADP)`;
      });
      empty.formattedAnswer = `${acrossAdp}, average draft value by owner:\n${lines.join("\n")}\n${adpNote}`;
      return empty;
    }
    case "draft_aggression": {
      const mode = query.aggressionMode ?? "gambles";
      const rows = [...ownerReach].sort((a, b) =>
        mode === "safest"
          ? (a.avgReachDelta ?? 999) - (b.avgReachDelta ?? 999)
          : (b.avgReachDelta ?? -999) - (a.avgReachDelta ?? -999),
      );
      if (!rows.length) {
        empty.formattedAnswer = `${acrossAdp}, no owner ADP-joined picks were recorded.\n${adpNote}`;
        return empty;
      }
      const label = mode === "safest" ? "safest (lowest average reach)" : "most aggressive (highest average reach)";
      const lines = rows.slice(0, topN).map((r, i) => {
        const avg = r.avgReachDelta != null ? r.avgReachDelta.toFixed(1) : "?";
        return `${i + 1}. ${r.ownerName} — avg reach ${avg}, ${r.reachCount} reaches / ${r.adpPickCount} ADP-joined picks`;
      });
      empty.formattedAnswer = `${acrossAdp}, ${label}:\n${lines.join("\n")}\n${adpNote}`;
      return empty;
    }
    case "adp_follow":
    case "adp_ignore": {
      const ignore = query.metric === "adp_ignore";
      const rows = [...ownerReach].sort((a, b) =>
        ignore
          ? (b.avgAbsDelta ?? -999) - (a.avgAbsDelta ?? -999)
          : (a.avgAbsDelta ?? 999) - (b.avgAbsDelta ?? 999),
      );
      if (!rows.length) {
        empty.formattedAnswer = `${acrossAdp}, no owner ADP-joined picks were recorded.\n${adpNote}`;
        return empty;
      }
      const label = ignore
        ? "farthest from ADP (highest average |ADP − pick|)"
        : "closest to ADP (lowest average |ADP − pick|)";
      const lines = rows.slice(0, topN).map((r, i) => {
        const avg = r.avgAbsDelta != null ? r.avgAbsDelta.toFixed(1) : "?";
        return `${i + 1}. ${r.ownerName} — avg |ADP − pick| ${avg} (${r.adpPickCount} ADP-joined picks)`;
      });
      empty.formattedAnswer = `${acrossAdp}, ${label}:\n${lines.join("\n")}\n${adpNote}`;
      return empty;
    }
    case "qb_timing":
    case "rb_timing":
    case "wr_timing": {
      const pos = query.metric === "qb_timing" ? "QB" : query.metric === "rb_timing" ? "RB" : "WR";
      const timing = ownerTimingRows(filtered, pos);
      empty.ownerTiming = timing;
      if (!timing.length) {
        empty.formattedAnswer = `${acrossBoard}, no recorded ${pos} draft picks.\n${boardNote}`;
        return empty;
      }
      const dir = query.timingDirection ?? "early";
      const sorted = [...timing].sort((a, b) =>
        dir === "late" ? b.avgRound - a.avgRound : a.avgRound - b.avgRound,
      );
      const label = dir === "late" ? `latest average ${pos} selection` : `earliest average ${pos} selection`;
      const lines = sorted.slice(0, topN).map((r, i) => {
        return `${i + 1}. ${r.ownerName} — round ${r.avgRound.toFixed(1)} (${r.pickCount} ${pos} picks, earliest R${r.earliestRound})`;
      });
      empty.formattedAnswer = `${acrossBoard}, ${label}:\n${lines.join("\n")}\n${boardNote}`;
      return empty;
    }
    case "position_tendencies": {
      const qb = ownerTimingRows(filtered, "QB").slice(0, 3);
      const rb = ownerTimingRows(filtered, "RB").slice(0, 3);
      const wr = ownerTimingRows(filtered, "WR").slice(0, 3);
      empty.ownerTiming = [...qb, ...rb, ...wr];
      const block = (label: string, rows: OwnerTimingRow[], dir: "early" | "late") => {
        const sorted = [...rows].sort((a, b) =>
          dir === "late" ? b.avgRound - a.avgRound : a.avgRound - b.avgRound,
        );
        if (!sorted.length) return `${label}: none recorded`;
        return `${label}: ${sorted
          .slice(0, 3)
          .map((r) => `${r.ownerName} R${r.avgRound.toFixed(1)}`)
          .join("; ")}`;
      };
      empty.formattedAnswer = `${acrossBoard}, position timing:\n${block("QB earliest", qb, "early")}\n${block(
        "RB earliest",
        rb,
        "early",
      )}\n${block("WR earliest", wr, "early")}\n${boardNote}`;
      return empty;
    }
    case "draft_philosophy": {
      const phil = philosophyRows(filtered);
      empty.philosophy = phil;
      if (!phil.length) {
        empty.formattedAnswer = `${acrossBoard}, no owner was 1.0+ rounds earlier or later than the league average at QB/RB/WR.\n${boardNote}`;
        return empty;
      }
      const lines = phil.map((r, i) => `${i + 1}. ${r.ownerName} — ${r.label} (${r.detail})`);
      empty.formattedAnswer = `${acrossBoard}, recorded draft tendencies (vs league average round):\n${lines.join("\n")}\n${boardNote}`;
      return empty;
    }
    case "rookie_preference": {
      const rookies = rookieRows(filtered);
      empty.rookieOwners = rookies;
      if (!rookies.length) {
        empty.formattedAnswer = `${acrossBoard}, rookie preference needs player IDs on recorded picks. NFL debut year is not stored.\n${boardNote}`;
        return empty;
      }
      const lines = rookies.slice(0, topN).map((r, i) => {
        const pct = Math.round(r.rookieShare * 100);
        return `${i + 1}. ${r.ownerName} — ${r.rookiePicks} first-time draftees / ${r.pickCount} picks (${pct}%)`;
      });
      empty.formattedAnswer = `${acrossBoard}, first-time draftees in this league (NFL debut year is not stored; this is first appearance on the recorded draft board):\n${lines.join("\n")}\n${boardNote}`;
      return empty;
    }
    default:
      empty.formattedAnswer = `${acrossBoard}, that draft metric is not wired.\n${boardNote}`;
      return empty;
  }
}
