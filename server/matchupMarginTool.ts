/**
 * RFSN-049 — League AI matchup-margin tool.
 *
 * Deterministic path: select tool from the user prompt → load gmMatchups →
 * compute analytics → format answer. No LLM required for the factual reply.
 */

import { eq } from "drizzle-orm";
import { gmMatchups, gmTeams } from "../drizzle/schema";
import { getDb } from "./db";
import { buildOwnerIdentityAuthority } from "./ownerIdentityAuthority";
import {
  computeMatchupMarginAnalytics,
  formatMatchupMarginAnswer,
  type MarginGameRecord,
  type MatchupMarginAggregation,
  type MatchupMarginAnalyticsResult,
  type MatchupMarginQuery,
  type MatchupPhaseFilter,
} from "./matchupMarginAnalytics";

export const MATCHUP_MARGIN_TOOL_NAME = "query_matchup_margins" as const;

export type MatchupMarginToolSelection = {
  toolName: typeof MATCHUP_MARGIN_TOOL_NAME;
  query: MatchupMarginQuery;
};

function parseSeasonRange(text: string): { seasonFrom?: number; seasonTo?: number } {
  const range = text.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { seasonFrom: Math.min(a, b), seasonTo: Math.max(a, b) };
  }
  const through = text.match(/\bfrom\s+(20\d{2})\s+(?:through|to|until)\s+(20\d{2})\b/);
  if (through) {
    const a = Number(through[1]);
    const b = Number(through[2]);
    return { seasonFrom: Math.min(a, b), seasonTo: Math.max(a, b) };
  }
  const single = text.match(/\bin\s+(20\d{2})\b/);
  if (single) {
    const y = Number(single[1]);
    return { seasonFrom: y, seasonTo: y };
  }
  const since = text.match(/\bsince\s+(20\d{2})\b/);
  if (since) return { seasonFrom: Number(since[1]) };
  return {};
}

function parsePhase(text: string): MatchupPhaseFilter {
  const t = text.toLowerCase();
  if (/\bplayoff/.test(t) && !/\bregular\s*season/.test(t)) return "playoffs";
  if (/\ball\s+games\b|\bincluding\s+playoff|\bleague\s+history\b/.test(t)) {
    // "league history" for closest game includes all phases unless regular/playoff specified
    if (/\bleague\s+history\b/.test(t) && !/\bplayoff/.test(t) && !/\bregular\s*season/.test(t)) {
      return "all";
    }
    if (/\ball\s+games\b|\bincluding\s+playoff/.test(t)) return "all";
  }
  if (/\bregular\s*season/.test(t)) return "regular";
  // Default: regular season only (matches H2H Authority career default).
  return "regular";
}

function parseGroupBy(text: string): "owner" | "team" {
  const t = text.toLowerCase();
  if (/\bper[-\s]?team\b|\bby\s+team\b|\bteam\s+counts?\b/.test(t)) return "team";
  return "owner";
}

const NAME_STOP =
  /^(how|what|whats|who|when|where|why|most|many|the|a|an|my|your|our|his|her|their|biggest|largest|highest|lowest|best|worst)$/i;
const NAME_TAIL_STOP =
  /^(have|has|had|get|got|win|wins|won|lose|lost|losses|from|in|on|the|a|an|most|many|close|one|point|over|against)$/i;
const NAME_TOKEN = "[A-Za-z][A-Za-z\\-]+";

function titleishName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function cleanPersonName(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (!parts[0] || NAME_STOP.test(parts[0]) || NAME_TAIL_STOP.test(parts[0])) return undefined;
  if (parts[1] && !NAME_STOP.test(parts[1]) && !NAME_TAIL_STOP.test(parts[1])) {
    return titleishName(`${parts[0]} ${parts[1]}`);
  }
  return titleishName(parts[0]!);
}

function parseOwnerMention(text: string): string | undefined {
  // "for Bruce Edwards" / "does Rod Sellers have" / "did Rod have" / "rod's"
  const m =
    text.match(new RegExp(`\\b(?:for|about|does|did)\\s+(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)\\b`, "i")) ||
    text.match(new RegExp(`\\b(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)'s\\b`, "i"));
  return cleanPersonName(m?.[1]);
}

function isPersonalBiggestWinAsk(t: string): boolean {
  return (
    /\bmy\s+(biggest|largest|most\s+dominant)\s+(win|victory|blowout|margin)\b/.test(t) ||
    /\b(what(?:'s| is|s)?|show)\s+my\s+(biggest|largest)\b/.test(t)
  );
}

function parseOwnerOpponentPair(
  raw: string,
): { ownerName?: string; opponentName?: string } {
  const over = raw.match(
    new RegExp(
      `\\b(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)(?:'s)?\\s+(?:biggest|largest|most\\s+dominant)\\s+(?:win|victory|blowout|margin)\\s+(?:over|against|vs\\.?|versus)\\s+(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)`,
      "i",
    ),
  );
  const ownerName = cleanPersonName(over?.[1]);
  const opponentName = cleanPersonName(over?.[2]);
  if (ownerName && opponentName) return { ownerName, opponentName };
  return {};
}

function isCountBlowoutsAsk(t: string): boolean {
  return (
    /\bmost\s+blowout\s+wins?\b/.test(t) ||
    /\bblowout\s+wins?\s+by\b/.test(t) ||
    /\b(?:wins?|losses?)\s+by\s+\d+(?:\.\d+)?\s*\+/.test(t) ||
    /\b\d+(?:\.\d+)?\s*\+\s*(?:point|pt)?\s*blowouts?\b/.test(t) ||
    /\bmost\s+\d+(?:\.\d+)?[-\s]?point\s+blowout/.test(t) ||
    /\bmost\s+wins?\s+by\s+\d+/.test(t)
  );
}

/** Largest single-game win / blowout / margin-of-victory (not 50+ count). */
export function isLargestMarginAsk(t: string): boolean {
  if (isCountBlowoutsAsk(t)) return false;
  if (/\bone[-\s]?point|1[-\s]?point|narrow(?:est)?\s+wins?\b/.test(t)) return false;
  if (/\bmargin of victory\b/.test(t)) return true;
  if (/\b(largest|biggest|highest)\s+(winning\s+)?margins?\b/.test(t)) return true;
  if (/\b(largest|biggest|most\s+dominant)\s+(blowout|wins?|victory|victories)\b/.test(t)) return true;
  if (/\bmost dominant win\b/.test(t)) return true;
  if (/\b(biggest|largest)\s+(win|victory)\b/.test(t)) return true;
  return false;
}

function largestMarginAggregation(
  t: string,
  personal: boolean,
  hasOpponent: boolean,
): MatchupMarginAggregation {
  if (personal || hasOpponent) return "single_game";
  if (
    /\bwhat was\b/.test(t) ||
    /\bin a single game\b/.test(t) ||
    /\bsingle[-\s]?game\b/.test(t) ||
    /\bin league history\b/.test(t) ||
    /\bever\b/.test(t)
  ) {
    return "single_game";
  }
  if (/\bwho (?:has|holds)\b/.test(t)) return "owner_max";
  return "single_game";
}

function isHighestCombinedAsk(t: string): boolean {
  return /\bhighest combined (?:score|total)s?\b/.test(t) || /\bmost combined points\b/.test(t);
}

function isLowestCombinedAsk(t: string): boolean {
  return /\blowest combined (?:score|total)s?\b/.test(t) || /\bfewest combined points\b/.test(t);
}

function isHighestLosingScoreAsk(t: string): boolean {
  return /\bhighest losing score\b/.test(t) || /\bmost points? (?:in|in a) loss\b/.test(t);
}

function isLowestWinningScoreAsk(t: string): boolean {
  return /\blowest winning score\b/.test(t) || /\bfewest points? (?:in|in a) win\b/.test(t);
}

function isLargestUpsetAsk(t: string): boolean {
  return /\b(largest|biggest)\s+upsets?\b/.test(t);
}

function isHalftimeDeficitAsk(t: string): boolean {
  return /\b(biggest|largest)\s+halftime\s+(deficit|comeback|lead)\b/.test(t);
}

const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function parseNumberToken(raw: string): number | undefined {
  const t = raw.toLowerCase();
  if (WORD_NUM[t] != null) return WORD_NUM[t];
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseMarginMax(text: string): number | undefined {
  const t = text.toLowerCase();
  const le = t.match(
    /(?:decided|decided by|within|by\s+at\s+most|or\s+less|or\s+fewer|≤|<=)\s*(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*points?/,
  );
  if (le) {
    const n = parseNumberToken(le[1]);
    if (n != null) return n;
  }
  const byOrFewer = t.match(
    /\bby\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+points?\s+or\s+(?:less|fewer)\b/,
  );
  if (byOrFewer) {
    const n = parseNumberToken(byOrFewer[1]);
    if (n != null) return n;
  }
  const alt = t.match(
    /(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*points?\s+or\s+(?:less|fewer)/,
  );
  if (alt) {
    const n = parseNumberToken(alt[1]);
    if (n != null) return n;
  }
  if (/\b(?:nail-?biters?|close\s+games?|close\s+losses?)\b/.test(t)) return 3;
  return undefined;
}

function parseExactMargin(text: string): number | undefined {
  const t = text.toLowerCase();
  if (/\bone[-\s]?point\b|\b1[-\s]?point\b/.test(t)) return 1;
  const exact = t.match(/\b(?:exact(?:ly)?\s+)?(\d+(?:\.\d+)?)\s*point\b/);
  if (exact) return Number(exact[1]);
  return undefined;
}

/** "blowout wins by 50+" / "wins by 50+" / "50+ point blowouts" */
function parseBlowoutMin(text: string): number | undefined {
  const t = text.toLowerCase();
  const plus = t.match(/\b(?:by|of)\s+(\d+(?:\.\d+)?)\s*\+|\b(\d+(?:\.\d+)?)\s*\+\s*(?:point|pt)?/);
  if (plus) {
    const n = Number(plus[1] || plus[2]);
    if (Number.isFinite(n) && n >= 10) return n;
  }
  const blowoutN = t.match(/\bblowout(?:s)?\s+(?:wins?\s+)?(?:by\s+)?(\d+(?:\.\d+)?)/);
  if (blowoutN) {
    const n = Number(blowoutN[1]);
    if (Number.isFinite(n) && n >= 10) return n;
  }
  if (/\bblowout/.test(t) && !/\bby\s+\d/.test(t)) return 50;
  return undefined;
}

export type MatchupMarginToolContext = {
  /** Display names already resolved by Advisor (viewer / mentioned owners). */
  resolvedOwnerNames?: string[];
};

/**
 * Select the deterministic matchup-margin tool when the prompt is a margin /
 * close-game factual question. Returns null for unrelated Advisor prompts.
 */
export function selectMatchupMarginTool(
  message: string,
  ctx?: MatchupMarginToolContext,
): MatchupMarginToolSelection | null {
  const raw = message.trim();
  if (!raw) return null;
  const t = raw.toLowerCase();

  const marginCue =
    /\b(one[-\s]?point|1[-\s]?point|margin|closest\s+game|narrow(?:est)?\s+wins?|narrowest|nail-?biter|close\s+games?|close\s+losses?|decided\s+by|average\s+margin|blowout|ties?\b|tied\s+games?|comeback|heartbreak|league\s+history|margin of victory|dominant win|combined (?:score|total)|losing score|winning score|upset|halftime)\b/.test(
      t,
    ) ||
    /\b(biggest|largest)\s+(win|victory|blowout|margin)\b/.test(t) ||
    /\b(wins?|losses?)\s+by\s+(\d+|one|two|three|four|five)/.test(t) ||
    /\bpoints?\s+or\s+(less|fewer)\b/.test(t);

  if (!marginCue) return null;

  const seasons = parseSeasonRange(t);
  const phase = parsePhase(t);
  const groupBy = parseGroupBy(t);
  const pair = parseOwnerOpponentPair(raw);
  const personal = isPersonalBiggestWinAsk(t);
  let ownerName = pair.ownerName || parseOwnerMention(raw);
  const opponentName = pair.opponentName;
  if (personal && !ownerName && ctx?.resolvedOwnerNames?.[0]) {
    ownerName = ctx.resolvedOwnerNames[0];
  }
  const base: MatchupMarginQuery = {
    metric: "losses_by_margin",
    phase,
    groupBy,
    topN: 5,
    ...seasons,
    ...(ownerName ? { ownerName } : {}),
    ...(opponentName ? { opponentName } : {}),
    ...(personal ? { personalAsk: true } : {}),
  };

  // RFSN-052K — largest win / blowout / margin of victory BEFORE one-point fallback.
  if (isLargestMarginAsk(t)) {
    const aggregation = largestMarginAggregation(t, personal, Boolean(opponentName));
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: {
        ...base,
        metric: "largest_margin",
        aggregation,
        marginExact: undefined,
        marginMax: undefined,
        marginMin: undefined,
      },
    };
  }

  if (isHighestCombinedAsk(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "highest_combined_score", aggregation: "single_game" },
    };
  }
  if (isLowestCombinedAsk(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "lowest_combined_score", aggregation: "single_game" },
    };
  }
  if (isHighestLosingScoreAsk(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "highest_losing_score", aggregation: "single_game" },
    };
  }
  if (isLowestWinningScoreAsk(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "lowest_winning_score", aggregation: "single_game" },
    };
  }
  if (isLargestUpsetAsk(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "largest_upset" },
    };
  }
  if (isHalftimeDeficitAsk(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "largest_halftime_deficit" },
    };
  }

  const wantsLossSideEarly = /\bloss(?:es|ing)?\b|\bclose\s+losses?\b|\bheartbreak/.test(t);
  const wantsWinSideEarly = /\bwins?\b/.test(t) && !wantsLossSideEarly;
  const blowoutMin = parseBlowoutMin(t);
  if (blowoutMin != null && (wantsWinSideEarly || /\bblowout\b/.test(t))) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: {
        ...base,
        metric: wantsLossSideEarly ? "losses_by_margin" : "wins_by_margin",
        aggregation: "count",
        marginMin: blowoutMin,
        marginExact: undefined,
        marginMax: undefined,
      },
    };
  }

  if (/\bcomeback\b/.test(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "largest_comeback" },
    };
  }

  if (
    /\bclosest\s+game\b|\bnarrowest\s+(?:win|loss|margin|game)\b|\bsmallest\s+margin\b|\bclosest\s+game\s+in\s+league\s+history\b/.test(
      t,
    )
  ) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "closest_game", phase: /\bplayoff/.test(t) ? "playoffs" : "all" },
    };
  }

  if (/\baverage\s+margin\b|\bmean\s+margin\b/.test(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "average_margin" },
    };
  }

  if (/\bties?\b|\btied\s+games?\b/.test(t) && !/\bone[-\s]?point|\bmargin\b/.test(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "ties" },
    };
  }

  // "narrow wins" → one-point wins
  if (/\bnarrow(?:est)?\s+wins?\b/.test(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "wins_by_margin", marginExact: 1 },
    };
  }

  const max = parseMarginMax(t);
  const wantsLossSide = /\bloss(?:es|ing)?\b|\bclose\s+losses?\b|\bheartbreak/.test(t);
  const wantsWinSide = /\bwins?\b/.test(t) && !wantsLossSide;

  // "losses by three points or fewer" / "close losses" → owner losses with margin ≤ N
  if (
    max != null &&
    wantsLossSide &&
    (/\bor\s+fewer\b|\bor\s+less\b|\bclose\s+losses?\b|\bby\s+(?:\d+|one|two|three|four|five)/.test(t) ||
      /\bheartbreak/.test(t))
  ) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: {
        ...base,
        metric: "losses_by_margin",
        marginMax: max,
        // explicit: not an exact-band query
        marginExact: undefined,
      },
    };
  }

  if (
    max != null &&
    (/\bdecided\b|\bwithin\b|\bnail-?biter|\bclose\s+games?\b/.test(t) || /≤|<=/.test(raw))
  ) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "decided_by_at_most", marginMax: max },
    };
  }

  const exact = parseExactMargin(t) ?? (/\bone[-\s]?point|1[-\s]?point/.test(t) ? 1 : undefined);
  if (exact != null) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: {
        ...base,
        metric: wantsWinSide ? "wins_by_margin" : "losses_by_margin",
        marginExact: exact,
      },
    };
  }

  if (/\bwins?\s+by\b/.test(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "wins_by_margin", marginExact: parseExactMargin(t) ?? 1 },
    };
  }

  if (/\bloss(?:es|ing)?\s+by\b|\bclose\s+losses?\b|\bheartbreak/.test(t)) {
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: {
        ...base,
        metric: "losses_by_margin",
        marginMax: parseMarginMax(t) ?? 3,
      },
    };
  }

  // Close games / nail-biters without an explicit band → one-point / decided-by.
  // Bare "margin" is NOT one-point losses (RFSN-052K).
  if (/\bclose\s+games?\b|\bnail-?biter/.test(t)) {
    const decidedMax = parseMarginMax(t);
    if (decidedMax != null) {
      return {
        toolName: MATCHUP_MARGIN_TOOL_NAME,
        query: { ...base, metric: "decided_by_at_most", marginMax: decidedMax },
      };
    }
    return {
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: { ...base, metric: "losses_by_margin", marginExact: 1 },
    };
  }

  return null;
}

export async function loadCompletedMarginGames(leagueId: string): Promise<MarginGameRecord[]> {
  const db = await getDb();
  if (!db) return [];

  const identity = await buildOwnerIdentityAuthority(leagueId);
  const teamRows = await db
    .select({
      season: gmTeams.season,
      teamId: gmTeams.teamId,
      teamName: gmTeams.name,
    })
    .from(gmTeams)
    .where(eq(gmTeams.leagueId, leagueId));
  const teamNameByKey = new Map<string, string>();
  for (const t of teamRows) {
    if (t.teamId > 0 && t.teamName) teamNameByKey.set(`${t.season}:${t.teamId}`, t.teamName);
  }

  const rows = await db.select().from(gmMatchups).where(eq(gmMatchups.leagueId, leagueId));
  const out: MarginGameRecord[] = [];

  for (const r of rows) {
    if (!r.isCompleted) continue;
    const home = identity.resolve(r.season, r.homeTeamId);
    const away = identity.resolve(r.season, r.awayTeamId);
    const homeScore = Number(r.homeScore) || 0;
    const awayScore = Number(r.awayScore) || 0;

    let winnerPersonId: string | null = null;
    if (r.winnerTeamId != null) {
      const w = identity.resolve(r.season, r.winnerTeamId);
      if (w.status === "resolved" && w.canonicalPersonId) {
        winnerPersonId = w.canonicalPersonId;
      }
    }
    if (winnerPersonId == null) {
      if (homeScore > awayScore) {
        winnerPersonId = home.status === "resolved" ? home.canonicalPersonId : null;
      } else if (awayScore > homeScore) {
        winnerPersonId = away.status === "resolved" ? away.canonicalPersonId : null;
      } else {
        winnerPersonId = null;
      }
    }

    out.push({
      season: r.season,
      week: r.week,
      matchupPeriodId: r.matchupPeriodId,
      isPlayoff: !!r.isPlayoff,
      homeTeamId: r.homeTeamId,
      awayTeamId: r.awayTeamId,
      homeScore,
      awayScore,
      homePersonId: home.status === "resolved" ? home.canonicalPersonId : null,
      awayPersonId: away.status === "resolved" ? away.canonicalPersonId : null,
      homePersonName: home.canonicalName,
      awayPersonName: away.canonicalName,
      homeTeamName: teamNameByKey.get(`${r.season}:${r.homeTeamId}`) ?? null,
      awayTeamName: teamNameByKey.get(`${r.season}:${r.awayTeamId}`) ?? null,
      winnerPersonId,
    });
  }

  return out;
}

export type MatchupMarginToolResult = {
  selected: true;
  toolName: typeof MATCHUP_MARGIN_TOOL_NAME;
  query: MatchupMarginQuery;
  analytics: MatchupMarginAnalyticsResult;
  answer: string;
};

/**
 * Run the deterministic tool end-to-end for a selected query.
 */
export async function runMatchupMarginTool(opts: {
  leagueId: string;
  query: MatchupMarginQuery;
  games?: MarginGameRecord[];
}): Promise<MatchupMarginToolResult> {
  const games = opts.games ?? (await loadCompletedMarginGames(opts.leagueId));
  const analytics = computeMatchupMarginAnalytics(games, opts.query);
  return {
    selected: true,
    toolName: MATCHUP_MARGIN_TOOL_NAME,
    query: opts.query,
    analytics,
    answer: formatMatchupMarginAnswer(analytics),
  };
}

/**
 * League AI entry: select tool from prompt and execute, or return null if not selected.
 */
export async function tryMatchupMarginToolAnswer(opts: {
  leagueId: string;
  message: string;
  games?: MarginGameRecord[];
  resolvedOwnerNames?: string[];
}): Promise<MatchupMarginToolResult | null> {
  const selection = selectMatchupMarginTool(opts.message, {
    resolvedOwnerNames: opts.resolvedOwnerNames,
  });
  if (!selection) return null;
  if (!opts.leagueId.trim()) {
    const analytics = computeMatchupMarginAnalytics([], selection.query);
    return {
      selected: true,
      toolName: MATCHUP_MARGIN_TOOL_NAME,
      query: selection.query,
      analytics: {
        ...analytics,
        noData: true,
        missingDataset: "active league id / completed historical matchups (gmMatchups)",
      },
      answer:
        "I don't have completed historical matchups to run that margin query. Missing dataset: active league id / completed historical matchups (gmMatchups).",
    };
  }
  return runMatchupMarginTool({
    leagueId: opts.leagueId,
    query: selection.query,
    games: opts.games,
  });
}
