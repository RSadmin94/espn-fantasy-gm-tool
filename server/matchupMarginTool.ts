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

function parseOwnerMention(text: string): string | undefined {
  // "for Bruce Edwards" / "does Rod Sellers have" / "did Rod have"
  const m =
    text.match(/\b(?:for|about|does|did)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/) ||
    text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\b/);
  const name = m?.[1]?.trim();
  if (!name) return undefined;
  // Avoid capturing non-names like "How" from malformed matches
  if (/^(How|What|Who|When|Where|Why|Most|Many)$/i.test(name)) return undefined;
  return name;
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

/**
 * Select the deterministic matchup-margin tool when the prompt is a margin /
 * close-game factual question. Returns null for unrelated Advisor prompts.
 */
export function selectMatchupMarginTool(message: string): MatchupMarginToolSelection | null {
  const raw = message.trim();
  if (!raw) return null;
  const t = raw.toLowerCase();

  const marginCue =
    /\b(one[-\s]?point|1[-\s]?point|margin|closest\s+game|narrow(?:est)?\s+wins?|narrowest|nail-?biter|close\s+games?|close\s+losses?|decided\s+by|average\s+margin|blowout|ties?\b|tied\s+games?|comeback|heartbreak|league\s+history)/.test(
      t,
    ) ||
    /\b(wins?|losses?)\s+by\s+(\d+|one|two|three|four|five)/.test(t) ||
    /\bpoints?\s+or\s+(less|fewer)\b/.test(t);

  if (!marginCue) return null;

  const seasons = parseSeasonRange(t);
  const phase = parsePhase(t);
  const groupBy = parseGroupBy(t);
  const ownerName = parseOwnerMention(raw);
  const base: MatchupMarginQuery = {
    metric: "losses_by_margin",
    phase,
    groupBy,
    topN: 5,
    ...seasons,
    ...(ownerName ? { ownerName } : {}),
  };

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

  // Generic margin cue without a clearer metric → one-point losses (the observed failure).
  if (/\bmargin\b|\bclose\s+games?\b|\bnail-?biter/.test(t)) {
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
}): Promise<MatchupMarginToolResult | null> {
  const selection = selectMatchupMarginTool(opts.message);
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
