/**
 * RFSN-055 — Draft Intelligence tool selector + loader.
 *
 * Deterministic: classify prompt → load gmDraftPicks + season ADP → format.
 * Does not invent personalities. Does not apply one season's ADP to another.
 */
import { and, eq } from "drizzle-orm";
import { gmDraftPicks, gmTeams } from "../drizzle/schema";
import { getDb } from "./db";
import { ensureSameSeasonEspnOffenseAdp } from "./espnOffenseAdpSameSeason";
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
  const base: Omit<DraftIntelligenceQuery, "metric"> = { ...seasons, ownerName, topN: 5 };

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
  if (
    /\bfollows? adp\b|\bclosest to adp\b|\bmost adp[- ]faithful\b|\bwho (?:drafts?|stays?|sticks?) (?:closest )?to adp\b/.test(
      t,
    )
  ) {
    return hit("adp_follow");
  }
  if (/\bignores? adp\b|\bfarthest from adp\b|\bleast adp[- ]faithful\b|\bwho ignores adp the most\b/.test(t)) {
    return hit("adp_ignore");
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
  if (
    /\bloves? rbs?\b|\brb[- ]first\b|\bdrafts? (?:running backs?|rbs?) early\b|\bwho (?:drafts?|takes?|picks?) (?:running backs?|rbs?) early\b/.test(
      t,
    )
  ) {
    return hit("rb_timing", { timingDirection: "early" satisfies DraftTimingDirection });
  }
  if (
    /\bloves? wrs?\b|\bwr[- ]heavy\b|\bdrafts? (?:wide ?receivers?|wrs?) early\b|\bwho (?:drafts?|takes?|picks?) (?:wide ?receivers?|wrs?) early\b/.test(
      t,
    )
  ) {
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

/** ESPN playerId from the normalized column, else rawPick. Never invents an id. */
export function resolveEspnPlayerIdFromRawPick(
  rawPick: string | null | undefined,
  columnId?: number | null,
): number | null {
  if (columnId != null && Number.isFinite(columnId) && columnId > 0) return columnId;
  if (!rawPick?.trim()) return null;
  try {
    const j = JSON.parse(rawPick) as { playerId?: unknown; player?: { id?: unknown } };
    const pid = Number(j.playerId ?? j.player?.id ?? 0);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Attach ADP only from the pick's own season map. */
export function attachSameSeasonAdp(
  picks: DraftPickEvidence[],
  adpBySeason: Map<number, Map<string, number>>,
): DraftPickEvidence[] {
  return picks.map((p) => {
    const pid = p.playerId != null && p.playerId > 0 ? String(p.playerId) : "";
    const adp = pid ? adpBySeason.get(p.season)?.get(pid) ?? null : null;
    return { ...p, adp: isUsableAdp(adp) ? adp : null };
  });
}

export async function loadDraftPickEvidence(
  leagueId: string,
  opts?: { season?: number },
): Promise<DraftPickEvidence[]> {
  const db = await getDb();
  if (!db) return [];
  const lid = String(leagueId).slice(0, 32);
  const seasonFilter =
    opts?.season != null && Number.isFinite(opts.season) ? Math.floor(opts.season) : null;
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
      rawPick: gmDraftPicks.rawPick,
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
    .where(
      seasonFilter != null
        ? and(eq(gmDraftPicks.leagueId, lid), eq(gmDraftPicks.season, seasonFilter))
        : eq(gmDraftPicks.leagueId, lid),
    );

  const teamsBySeason = new Map<number, Set<number>>();
  const seasonsWithIds = new Set<number>();
  for (const r of rows) {
    if (!teamsBySeason.has(r.season)) teamsBySeason.set(r.season, new Set());
    if (r.teamId > 0) teamsBySeason.get(r.season)!.add(r.teamId);
    if (resolveEspnPlayerIdFromRawPick(r.rawPick, r.playerId) != null) seasonsWithIds.add(r.season);
  }

  const adpBySeason = new Map<number, Map<string, number>>();
  await Promise.all(
    [...seasonsWithIds].map(async (season) => {
      try {
        const durable = await ensureSameSeasonEspnOffenseAdp(season);
        if (!durable) return;
        const map = new Map<string, number>();
        for (const [pid, info] of durable) {
          if (isUsableAdp(info.adp)) map.set(String(pid), info.adp);
        }
        if (map.size) adpBySeason.set(season, map);
      } catch {
        /* season ADP optional */
      }
    }),
  );

  const out: DraftPickEvidence[] = [];
  for (const r of rows) {
    const playerId = resolveEspnPlayerIdFromRawPick(r.rawPick, r.playerId);
    const playerName = String(r.playerName || "").trim();
    if (!playerId && !playerName) continue;
    const teams = teamsBySeason.get(r.season)?.size ?? 0;
    const round = resolveDraftRound({
      pickNumber: r.overallPick,
      numberOfTeams: teams || null,
      existingRound: r.roundId > 0 ? r.roundId : null,
    });
    const ownerName = String(r.ownerName || r.teamName || "").trim() || `Team ${r.teamId}`;
    const pid = playerId != null ? String(playerId) : "";
    const adp = pid ? adpBySeason.get(r.season)?.get(pid) ?? null : null;
    out.push({
      season: r.season,
      overallPick: r.overallPick,
      round,
      teamId: r.teamId,
      ownerName,
      ownerKey: String(r.ownerId || "").trim() || ownerName,
      playerId,
      playerName: playerName || "Unknown",
      position: String(r.position || "").trim(),
      isKeeper: Boolean(r.isKeeper),
      adp: isUsableAdp(adp) ? adp : null,
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
