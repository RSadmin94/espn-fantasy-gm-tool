/**
 * RFSN-055 — Draft Intelligence tool selector + loader.
 *
 * Deterministic: classify prompt → load gmDraftPicks + season ADP → format.
 * Does not invent personalities. Does not apply one season's ADP to another.
 */
import { and, eq } from "drizzle-orm";
import { gmDraftPicks, gmTeams } from "../drizzle/schema";
import { getDb } from "./db";
import { loadDurableEspnOffenseAdp } from "./espnOffenseAdpDurableStore";
import { resolveDraftRound } from "../shared/reachClassification";
import {
  computeDraftIntelligence,
  DRAFT_INTELLIGENCE_TOOL_NAME,
  isUsableAdp,
  type DraftAggressionMode,
  type DraftIntelligenceMetric,
  type DraftIntelligenceQuery,
  type DraftIntelligenceResult,
  type DraftPickEvidence,
  type DraftTimingDirection,
} from "./draftIntelligence";

export { DRAFT_INTELLIGENCE_TOOL_NAME };

export type DraftIntelligenceToolSelection = {
  toolName: typeof DRAFT_INTELLIGENCE_TOOL_NAME;
  query: DraftIntelligenceQuery;
};

function parseSeasonRange(text: string): { seasonFrom?: number; seasonTo?: number } {
  const range = text.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { seasonFrom: Math.min(a, b), seasonTo: Math.max(a, b) };
  }
  const single = text.match(/\bin\s+(20\d{2})\b/);
  if (single) return { seasonFrom: Number(single[1]), seasonTo: Number(single[1]) };
  const since = text.match(/\bsince\s+(20\d{2})\b/);
  if (since) return { seasonFrom: Number(since[1]) };
  return {};
}

export function selectDraftIntelligenceTool(
  message: string,
  opts?: { ownerName?: string },
): DraftIntelligenceToolSelection | null {
  const raw = String(message ?? "").trim();
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (/\bshould i (draft|keep|pick|take)\b/.test(t)) return null;
  if (/\bstart[-\s]?sit\b|\bwho should i start\b/.test(t)) return null;

  const seasons = parseSeasonRange(t);
  const ownerName = opts?.ownerName?.trim() || undefined;
  const base: DraftIntelligenceQuery = { ...seasons, ownerName, topN: 5 };

  const hit = (metric: DraftIntelligenceMetric, extra?: Partial<DraftIntelligenceQuery>) => ({
    toolName: DRAFT_INTELLIGENCE_TOOL_NAME,
    query: { ...base, metric, ...extra },
  });

  if (/\bbiggest steals?\b|\blargest steals?\b|\bbest (?:value|steal)s?\b|\bwho steals?\b/.test(t)) {
    return hit("biggest_steals");
  }
  if (/\blargest (?:single )?reach\b|\bbiggest reach\b/.test(t) && !/\bbiggest reaches\b|\blargest reaches\b/.test(t)) {
    return hit("largest_single_reach");
  }
  if (/\bbiggest reaches\b|\blargest reaches\b|\bmost (?:outrageous )?reaches\b/.test(t)) {
    return hit("biggest_reaches");
  }
  if (
    /\bwho (?:always )?reach(?:es|ed)?(?: the most)?\b/.test(t) ||
    /\breach(?:es|ed)? the most\b/.test(t) ||
    /\breach frequency\b/.test(t) ||
    /\bmost reaches\b/.test(t)
  ) {
    return hit("reach_frequency");
  }
  if (/\baverage reach\b|\bavg reach\b/.test(t)) {
    return hit("average_reach_by_owner");
  }
  if (/\baverage draft value\b|\bavg draft value\b|\bbest draft value\b/.test(t)) {
    return hit("average_draft_value");
  }
  if (/\bwho (?:drafts?|picks?) safest\b|\bsafest drafter\b|\bwho drafts? safe\b/.test(t)) {
    return hit("draft_aggression", { aggressionMode: "safest" satisfies DraftAggressionMode });
  }
  if (
    /\bwho gambles? the most\b|\bmost aggressive drafter\b|\bwho (?:drafts?|picks?) aggressive\b/.test(t) ||
    /\bdraft aggression\b/.test(t)
  ) {
    return hit("draft_aggression", { aggressionMode: "gambles" satisfies DraftAggressionMode });
  }
  if (/\balways waits? on qbs?\b|\bwaits? on (?:a )?quarterbacks?\b|\blate qbs?\b|\bwho waits? (?:on )?qb/.test(t)) {
    return hit("qb_timing", { timingDirection: "late" satisfies DraftTimingDirection });
  }
  if (
    /\bdrafts? quarterbacks? early\b|\bearly qbs?\b|\bwho (?:drafts?|takes?|picks?) qbs? early\b/.test(t) ||
    /\bqb timing\b/.test(t)
  ) {
    return hit("qb_timing", { timingDirection: "early" satisfies DraftTimingDirection });
  }
  if (/\bloves? rbs?\b|\brb[- ]first\b|\bdrafts? rbs? early\b|\bwho (?:drafts?|takes?) rbs? early\b/.test(t)) {
    return hit("rb_timing", { timingDirection: "early" satisfies DraftTimingDirection });
  }
  if (/\bloves? wrs?\b|\bwr[- ]heavy\b|\bdrafts? wrs? early\b|\bwho (?:drafts?|takes?) wrs? early\b/.test(t)) {
    return hit("wr_timing", { timingDirection: "early" satisfies DraftTimingDirection });
  }
  if (/\balways drafts? rookies?\b|\brookie preference\b|\bwho drafts? rookies?\b|\bloves? rookies?\b/.test(t)) {
    return hit("rookie_preference");
  }
  if (/\bdraft philosophy\b|\bdraft (?:style|tendenc)/.test(t)) {
    return hit("draft_philosophy");
  }
  if (/\bposition tendenc|\bpositional (?:bias|tendenc)/.test(t)) {
    return hit("position_tendencies");
  }
  return null;
}

export async function loadDraftPickEvidence(leagueId: string): Promise<DraftPickEvidence[]> {
  const db = await getDb();
  if (!db) return [];
  const lid = String(leagueId).slice(0, 32);
  const rows = await db
    .select({
      season: gmDraftPicks.season,
      overallPick: gmDraftPicks.overallPick,
      roundId: gmDraftPicks.roundId,
      roundPick: gmDraftPicks.roundPick,
      teamId: gmDraftPicks.teamId,
      playerId: gmDraftPicks.playerId,
      playerName: gmDraftPicks.playerName,
      position: gmDraftPicks.position,
      isKeeper: gmDraftPicks.isKeeper,
      ownerName: gmTeams.ownerName,
      ownerId: gmTeams.ownerId,
      teamName: gmTeams.name,
    })
    .from(gmDraftPicks)
    .leftJoin(
      gmTeams,
      and(
        eq(gmDraftPicks.leagueId, gmTeams.leagueId),
        eq(gmDraftPicks.season, gmTeams.season),
        eq(gmDraftPicks.teamId, gmTeams.teamId),
      ),
    )
    .where(eq(gmDraftPicks.leagueId, lid));

  const teamsBySeason = new Map<number, Set<number>>();
  for (const r of rows) {
    if (!teamsBySeason.has(r.season)) teamsBySeason.set(r.season, new Set());
    if (r.teamId > 0) teamsBySeason.get(r.season)!.add(r.teamId);
  }

  const adpBySeason = new Map<number, Map<string, number>>();
  const ingestSeason = async (season: number) => {
    if (adpBySeason.has(season)) return;
    try {
      const durable = await loadDurableEspnOffenseAdp(season);
      if (!durable) return;
      const map = new Map<string, number>();
      for (const [pid, info] of durable) {
        if (isUsableAdp(info.adp)) map.set(String(pid), info.adp);
      }
      if (map.size) adpBySeason.set(season, map);
    } catch {
      /* season ADP optional */
    }
  };
  for (const season of teamsBySeason.keys()) {
    await ingestSeason(season);
  }

  // Current / prior calendar year only: same live ESPN offense ADP War Room uses.
  // Never apply that map to any other draft-board season.
  const calendarYear = new Date().getFullYear();
  const liveCandidates = [calendarYear, calendarYear - 1].filter((y) => teamsBySeason.has(y));
  if (liveCandidates.some((y) => !adpBySeason.has(y))) {
    try {
      const { getEspnPlayerInfoMap } = await import("./playerStatsRouter");
      await getEspnPlayerInfoMap();
      for (const season of liveCandidates) await ingestSeason(season);
    } catch {
      /* live ESPN ADP optional */
    }
  }

  const out: DraftPickEvidence[] = [];
  for (const r of rows) {
    const teams = teamsBySeason.get(r.season)?.size ?? 0;
    const round = resolveDraftRound({
      pickNumber: r.overallPick,
      numberOfTeams: teams || null,
      existingRound: r.roundId > 0 ? r.roundId : null,
    });
    const ownerName = String(r.ownerName || r.teamName || "").trim() || `Team ${r.teamId}`;
    const pid = r.playerId != null && r.playerId > 0 ? String(r.playerId) : "";
    const adp = pid ? adpBySeason.get(r.season)?.get(pid) ?? null : null;
    out.push({
      season: r.season,
      overallPick: r.overallPick,
      round,
      teamId: r.teamId,
      ownerName,
      ownerKey: String(r.ownerId || "").trim() || ownerName,
      playerId: r.playerId,
      playerName: String(r.playerName || "Unknown").trim(),
      position: String(r.position || "").trim(),
      isKeeper: Boolean(r.isKeeper),
      adp,
      numberOfTeams: teams || undefined,
    });
  }
  return out;
}

export async function tryDraftIntelligenceToolAnswer(args: {
  leagueId: string;
  message: string;
  resolvedOwnerNames?: string[];
}): Promise<{ answer: string; result: DraftIntelligenceResult } | null> {
  const names = (args.resolvedOwnerNames ?? []).map((n) => n.trim()).filter(Boolean);
  const sel = selectDraftIntelligenceTool(args.message);
  if (!sel) return null;
  // League-wide "who" rankings stay league-wide. Named comparisons (2+)
  // restrict to those owners so Demetri vs LOZELL is not H2H and not first-owner-only.
  if (names.length >= 2) sel.query.ownerNames = names;
  const picks = await loadDraftPickEvidence(args.leagueId);
  const result = computeDraftIntelligence(picks, sel.query);
  return { answer: result.formattedAnswer, result };
}
