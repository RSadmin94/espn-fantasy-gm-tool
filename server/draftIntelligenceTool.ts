/**
 * RFSN-055 — Draft Intelligence tool selector + loader.
 * RFSN-055C — Draft Intelligence follow-up context inheritance.
 *
 * Deterministic: classify prompt → load gmDraftPicks + season ADP → format.
 * Does not invent personalities. Does not apply one season's ADP to another.
 */
import { and, eq } from "drizzle-orm";
import { gmDraftPicks, gmTeams } from "../drizzle/schema";
import { findMentionedOwners, type AdvisorOwnerAlias } from "./advisorQuestionClassify";
import { getDb } from "./db";
import { fillMissingDraftPickIdentities } from "./draftPickIdentityLookup";
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

export type DraftIntelligenceUnsupported = {
  toolName: typeof DRAFT_INTELLIGENCE_TOOL_NAME;
  query: DraftIntelligenceQuery;
  unsupportedAnswer: string;
};

export type DraftIntelligenceToolContext = {
  priorQuery?: DraftIntelligenceQuery | null;
  lastIntent?: string | null;
  ownerAliases?: AdvisorOwnerAlias[];
  resolvedOwnerNames?: string[];
  lastDraftIntelligenceLeader?: string | null;
};

export type DraftIntelligenceSelectionResult =
  | DraftIntelligenceToolSelection
  | DraftIntelligenceUnsupported
  | null;

const TIMING_METRICS = new Set<DraftIntelligenceMetric>(["qb_timing", "rb_timing", "wr_timing"]);

function normalizeDraftText(message: string): string {
  return message.toLowerCase().replace(/\s+/g, " ").trim();
}

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

function parseFollowUpSeason(text: string): { seasonFrom?: number; seasonTo?: number } | null {
  const t = normalizeDraftText(text);
  const only = t.match(/\bonly\s+(20\d{2})\b/);
  if (only) return { seasonFrom: Number(only[1]), seasonTo: Number(only[1]) };
  const just = t.match(/\bjust\s+(20\d{2})\b/);
  if (just) return { seasonFrom: Number(just[1]), seasonTo: Number(just[1]) };
  const whatAbout = t.match(/^what about\s+(20\d{2})\??$/);
  if (whatAbout) return { seasonFrom: Number(whatAbout[1]), seasonTo: Number(whatAbout[1]) };
  return null;
}

type PositionHint = "QB" | "RB" | "WR";

function parsePositionHint(text: string): PositionHint | null {
  const t = normalizeDraftText(text);
  if (/\b(qbs?|quarterbacks?)\b/.test(t)) return "QB";
  if (/\b(rbs?|running backs?)\b/.test(t)) return "RB";
  if (/\b(wrs?|wide receivers?)\b/.test(t)) return "WR";
  return null;
}

function timingMetricForPosition(
  position: PositionHint,
  prior?: DraftIntelligenceQuery,
): Pick<DraftIntelligenceQuery, "metric" | "timingDirection"> {
  const direction =
    prior?.metric === "qb_timing" && prior.timingDirection === "late" && position === "QB"
      ? "late"
      : "early";
  switch (position) {
    case "QB":
      return { metric: "qb_timing", timingDirection: direction };
    case "RB":
      return { metric: "rb_timing", timingDirection: "early" };
    case "WR":
      return { metric: "wr_timing", timingDirection: "early" };
  }
}

function metricLabel(metric: DraftIntelligenceMetric): string {
  switch (metric) {
    case "reach_frequency":
      return "reach frequency";
    case "largest_single_reach":
      return "largest single reach";
    case "biggest_reaches":
      return "largest reaches";
    case "biggest_steals":
      return "largest steals";
    case "adp_follow":
      return "ADP follow";
    case "adp_ignore":
      return "ADP ignore";
    case "draft_aggression":
      return "draft aggression";
    case "qb_timing":
    case "rb_timing":
    case "wr_timing":
      return "positional draft timing";
    default:
      return "this draft metric";
  }
}

function positionFilterUnsupported(metric: DraftIntelligenceMetric, position: PositionHint): string {
  const pos =
    position === "QB" ? "quarterbacks" : position === "RB" ? "running backs" : "wide receivers";
  return `${metricLabel(metric)} is computed league-wide by owner and cannot be filtered to ${pos} only. Ask who drafts ${pos} early or waits on quarterback instead.`;
}

function parseFollowUpMetricSwitch(text: string): Partial<DraftIntelligenceQuery> | null {
  const t = normalizeDraftText(text);
  if (/\bnow\s+(?:only\s+)?(?:the\s+)?(?:biggest\s+)?steals?\b/.test(t)) {
    return { metric: "biggest_steals" };
  }
  if (/\bnow\s+(?:only\s+)?(?:biggest\s+)?reaches?\b/.test(t) && !/\bfrequency\b/.test(t)) {
    if (/\blargest\b|\bbiggest reach\b/.test(t)) return { metric: "largest_single_reach" };
    return { metric: "biggest_reaches" };
  }
  if (/\bnow\s+(?:only\s+)?(?:who\s+)?reaches?\s+the\s+most\b/.test(t)) {
    return { metric: "reach_frequency" };
  }
  if (/\bnow\s+(?:only\s+)?safest\b/.test(t) || /\bnow\s+(?:only\s+)?(?:who\s+)?drafts?\s+safest\b/.test(t)) {
    return { metric: "draft_aggression", aggressionMode: "safest" satisfies DraftAggressionMode };
  }
  if (/\bnow\s+(?:only\s+)?gambl(?:e|es)\b/.test(t)) {
    return { metric: "draft_aggression", aggressionMode: "gambles" satisfies DraftAggressionMode };
  }
  if (/\bnow\s+(?:only\s+)?(?:who\s+)?ignores?\s+adp\b/.test(t)) {
    return { metric: "adp_ignore" };
  }
  if (/\bnow\s+(?:only\s+)?(?:who\s+)?follows?\s+adp\b/.test(t)) {
    return { metric: "adp_follow" };
  }
  return null;
}

/** Short refinements that inherit prior Draft Intelligence context (RFSN-055C). */
export function isDraftIntelligenceFollowUpAsk(message: string): boolean {
  const raw = String(message ?? "").trim();
  if (!raw) return false;
  const t = normalizeDraftText(raw);
  if (/\bplayoff\s+drafts?\b/.test(t)) return true;
  if (parseFollowUpSeason(raw)) return true;
  if (parseFollowUpMetricSwitch(raw)) return true;
  if (/^what about\s+(qbs?|quarterbacks?|rbs?|running backs?|wrs?|wide receivers?)\??$/.test(t)) {
    return true;
  }
  if (/^what about\s+(him|her|them)\??$/.test(t)) return true;
  if (/^what about\s+.+\??$/.test(t)) return true;
  if (/^only\s+(20\d{2})\.?$/.test(t)) return true;
  return false;
}

function mergeDraftIntelligenceFollowUp(
  message: string,
  prior: DraftIntelligenceQuery,
  ctx?: DraftIntelligenceToolContext,
): DraftIntelligenceSelectionResult {
  const t = normalizeDraftText(message);
  const next: DraftIntelligenceQuery = {
    ...prior,
    topN: prior.topN ?? 5,
  };

  if (/\bplayoff\s+drafts?\b/.test(t)) {
    return {
      toolName: DRAFT_INTELLIGENCE_TOOL_NAME,
      query: next,
      unsupportedAnswer:
        "Draft Intelligence uses regular season draft boards only; playoff drafts are not a separate recorded dataset.",
    };
  }

  const metricSwitch = parseFollowUpMetricSwitch(message);
  if (metricSwitch) {
    Object.assign(next, metricSwitch);
    if (metricSwitch.metric && metricSwitch.metric !== prior.metric) {
      if (metricSwitch.metric === "draft_aggression" && !metricSwitch.aggressionMode) {
        next.aggressionMode = prior.aggressionMode;
      }
      if (!TIMING_METRICS.has(metricSwitch.metric)) {
        delete next.timingDirection;
      }
    }
  }

  const season = parseFollowUpSeason(message);
  if (season) {
    next.seasonFrom = season.seasonFrom;
    next.seasonTo = season.seasonTo;
  }

  const positionHint = parsePositionHint(message);
  if (positionHint) {
    if (TIMING_METRICS.has(next.metric)) {
      Object.assign(next, timingMetricForPosition(positionHint, prior));
    } else {
      return {
        toolName: DRAFT_INTELLIGENCE_TOOL_NAME,
        query: next,
        unsupportedAnswer: positionFilterUnsupported(next.metric, positionHint),
      };
    }
  }

  if (/^what about\s+(him|her|them)\??$/.test(t)) {
    const leader = ctx?.lastDraftIntelligenceLeader?.trim();
    if (!leader) {
      return {
        toolName: DRAFT_INTELLIGENCE_TOOL_NAME,
        query: next,
        unsupportedAnswer:
          "Which owner did you mean? Name the owner or ask a league-wide Draft Intelligence question first.",
      };
    }
    next.ownerName = leader;
    delete next.ownerNames;
  } else if (/^what about\s+.+\??$/.test(t) && !parseFollowUpSeason(message) && !positionHint) {
    const subject = message.replace(/^what about\s+/i, "").replace(/\?+$/, "").trim();
    const aliases = ctx?.ownerAliases ?? [];
    const hits = aliases.length ? findMentionedOwners(subject, aliases) : [];
    const named = hits[0]?.displayName?.trim() || subject;
    if (!named) {
      return {
        toolName: DRAFT_INTELLIGENCE_TOOL_NAME,
        query: next,
        unsupportedAnswer: "Which owner did you mean? Name a recorded league owner.",
      };
    }
    next.ownerName = named;
    delete next.ownerNames;
  }

  return {
    toolName: DRAFT_INTELLIGENCE_TOOL_NAME,
    query: next,
  };
}

function selectDraftIntelligenceFromPhrase(
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

export function selectDraftIntelligenceTool(
  message: string,
  ctx?: DraftIntelligenceToolContext & { ownerName?: string },
): DraftIntelligenceSelectionResult {
  const direct = selectDraftIntelligenceFromPhrase(message, { ownerName: ctx?.ownerName });
  if (direct) return direct;

  const prior =
    ctx?.lastIntent === "draft_intelligence" && ctx?.priorQuery ? ctx.priorQuery : undefined;
  if (!prior || !isDraftIntelligenceFollowUpAsk(message)) return null;
  return mergeDraftIntelligenceFollowUp(message, prior, ctx);
}

/** Leader name from a Draft Intelligence result for pronoun follow-ups. */
export function draftIntelligenceLeaderFromResult(result: DraftIntelligenceResult): string | null {
  const q = result.query;
  if (q.ownerName?.trim()) return q.ownerName.trim();
  if (result.largestReach?.ownerName) return result.largestReach.ownerName;
  if (result.topSteals[0]?.ownerName) return result.topSteals[0].ownerName;
  if (result.topReaches[0]?.ownerName) return result.topReaches[0].ownerName;
  if (result.ownerReach[0]?.ownerName) return result.ownerReach[0].ownerName;
  if (result.ownerTiming[0]?.ownerName) return result.ownerTiming[0].ownerName;
  if (result.rookieOwners[0]?.ownerName) return result.rookieOwners[0].ownerName;
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

  const identityFilled = await fillMissingDraftPickIdentities(
    rows.map((r) => ({
      playerId: resolveEspnPlayerIdFromRawPick(r.rawPick, r.playerId),
      playerName: r.playerName,
      position: r.position,
    })),
  );

  const out: DraftPickEvidence[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const ident = identityFilled[i]!;
    const playerId = ident.playerId != null ? Number(ident.playerId) : null;
    const playerName = String(ident.playerName || "").trim();
    if (!playerId && !playerName) continue;
    const position = String(ident.position || "").trim();
    const teams = teamsBySeason.get(r.season)?.size ?? 0;
    const round = resolveDraftRound({
      pickNumber: r.overallPick,
      numberOfTeams: teams || null,
      existingRound: r.roundId > 0 ? r.roundId : null,
    });
    const ownerName = String(r.ownerName || r.teamName || "").trim() || `Team ${r.teamId}`;
    const pid = playerId != null && Number.isFinite(playerId) && playerId > 0 ? String(playerId) : "";
    const adp = pid ? adpBySeason.get(r.season)?.get(pid) ?? null : null;
    out.push({
      season: r.season,
      overallPick: r.overallPick,
      round,
      teamId: r.teamId,
      ownerName,
      ownerKey: String(r.ownerId || "").trim() || ownerName,
      playerId: pid ? playerId : null,
      playerName: playerName || "Unknown",
      position,
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
  priorQuery?: DraftIntelligenceQuery | null;
  lastIntent?: string | null;
  ownerAliases?: AdvisorOwnerAlias[];
  lastDraftIntelligenceLeader?: string | null;
}): Promise<{ answer: string; result: DraftIntelligenceResult } | null> {
  const names = (args.resolvedOwnerNames ?? []).map((n) => n.trim()).filter(Boolean);
  const sel = selectDraftIntelligenceTool(args.message, {
    priorQuery: args.priorQuery,
    lastIntent: args.lastIntent,
    ownerAliases: args.ownerAliases,
    resolvedOwnerNames: names,
    lastDraftIntelligenceLeader: args.lastDraftIntelligenceLeader,
  });
  if (!sel) return null;
  if ("unsupportedAnswer" in sel) {
    const result = computeDraftIntelligence([], sel.query);
    result.formattedAnswer = sel.unsupportedAnswer;
    return { answer: sel.unsupportedAnswer, result };
  }
  // League-wide "who" rankings stay league-wide. Named comparisons (2+)
  // restrict to those owners so Demetri vs LOZELL is not H2H and not first-owner-only.
  if (names.length >= 2) sel.query.ownerNames = names;
  const picks = await loadDraftPickEvidence(args.leagueId);
  const result = computeDraftIntelligence(picks, sel.query);
  return { answer: result.formattedAnswer, result };
}
