// FILE: server/vegasOddsService.ts
/**
 * Vegas Odds Service
 *
 * Fetches NFL game lines, spreads, and totals from The Odds API v4.
 * Derives implied team totals from the game total + spread.
 * Caches results in the fantasyDataCache table with a 12-hour TTL.
 *
 * Implied team total formula:
 *   Given game total T and spread S (positive = home team favored):
 *     homeImplied = (T / 2) + (S / 2)
 *     awayImplied = (T / 2) - (S / 2)
 *
 * Vegas adjustment for Monte Carlo:
 *   vegasAdjustment = (impliedTeamTotal - LEAGUE_AVG_TEAM_SCORE) / LEAGUE_AVG_TEAM_SCORE
 *   e.g. team implied at 27 vs avg 22 → +22.7% boost to projection
 *
 * Exports:
 *   fetchAndCacheNFLOdds()   — fetch from API and write to DB cache
 *   getCachedNFLOdds()       — read from DB cache (no network call)
 *   getNFLOdds()             — cache-first: read cache, fetch if stale/missing
 *   getVegasContextForTeam() — returns game context for a given NFL team abbreviation
 *   calcVegasAdjustment()    — returns a multiplier for Monte Carlo projection scaling
 *   buildVegasPromptBlock()  — plain-text block for LLM prompt injection
 */

import { getDb } from "./db";
import { fantasyDataCache } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "./_core/env";

// ─── Constants ────────────────────────────────────────────────────────────────

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const CACHE_KEY = "nfl_odds_v4";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** League average team score per game (PPR, 14-team context).
 *  Used to normalize implied totals into a Monte Carlo adjustment factor. */
const LEAGUE_AVG_TEAM_SCORE = 22.5;

/** Preferred bookmakers — DraftKings and FanDuel for US market consistency */
const PREFERRED_BOOKMAKERS = ["draftkings", "fanduel", "betmgm", "caesars"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NFLGameOdds {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  /** Game total (over/under) — consensus across bookmakers */
  gameTotal: number | null;
  /** Spread from home team's perspective (negative = home favored) */
  homeSpread: number | null;
  /** Implied total points for home team */
  homeImpliedTotal: number | null;
  /** Implied total points for away team */
  awayImpliedTotal: number | null;
  /** Home team win probability derived from moneyline */
  homeWinProbability: number | null;
  /** Away team win probability derived from moneyline */
  awayWinProbability: number | null;
  /** Which bookmaker was used for consensus */
  bookmakerSource: string;
  /** When this data was last fetched */
  fetchedAt: string;
}

export interface VegasTeamContext {
  nflTeam: string;
  opponent: string;
  isHome: boolean;
  gameTotal: number | null;
  spread: number | null;
  impliedTotal: number | null;
  winProbability: number | null;
  vegasAdjustment: number;
  gameEnvironment: "high_scoring" | "low_scoring" | "neutral";
  commenceTime: string;
  bookmakerSource: string;
}

// ─── NFL team name to abbreviation map ───────────────────────────────────────
// Maps full team names from The Odds API to ESPN abbreviations

const TEAM_NAME_TO_ABBR: Record<string, string> = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS",
};

/** Reverse map: abbreviation → full name */
const ABBR_TO_TEAM_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_NAME_TO_ABBR).map(([k, v]) => [v, k])
);

// ─── American odds to probability conversion ──────────────────────────────────

function americanOddsToProb(americanOdds: number): number {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

/** Remove vig from two-sided market to get true probabilities */
function devig(prob1: number, prob2: number): [number, number] {
  const total = prob1 + prob2;
  return [prob1 / total, prob2 / total];
}

// ─── Raw API types ────────────────────────────────────────────────────────────

interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsApiMarket {
  key: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

// ─── Fetch from The Odds API ──────────────────────────────────────────────────

async function fetchFromOddsApi(): Promise<NFLGameOdds[]> {
  const apiKey = ENV.oddsApiKey;
  if (!apiKey) {
    throw new Error("THE_ODDS_API_KEY is not configured");
  }

  const url = `${ODDS_API_BASE}/sports/americanfootball_nfl/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=${PREFERRED_BOOKMAKERS.join(",")}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Odds API error ${res.status}: ${body}`);
  }

  const events: OddsApiEvent[] = await res.json();
  const fetchedAt = new Date().toISOString();

  return events.map((event): NFLGameOdds => {
    // Find best bookmaker (prefer DraftKings, then FanDuel, then first available)
    const bm = PREFERRED_BOOKMAKERS
      .map(key => event.bookmakers.find(b => b.key === key))
      .find(Boolean) ?? event.bookmakers[0];

    if (!bm) {
      return {
        eventId: event.id,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        commenceTime: event.commence_time,
        gameTotal: null,
        homeSpread: null,
        homeImpliedTotal: null,
        awayImpliedTotal: null,
        homeWinProbability: null,
        awayWinProbability: null,
        bookmakerSource: "none",
        fetchedAt,
      };
    }

    // Extract totals market
    const totalsMkt = bm.markets.find(m => m.key === "totals");
    const gameTotal = totalsMkt?.outcomes.find(o => o.name === "Over")?.point ?? null;

    // Extract spreads market (home team perspective)
    const spreadsMkt = bm.markets.find(m => m.key === "spreads");
    const homeSpreadOutcome = spreadsMkt?.outcomes.find(o => o.name === event.home_team);
    const homeSpread = homeSpreadOutcome?.point ?? null;

    // Compute implied totals
    let homeImpliedTotal: number | null = null;
    let awayImpliedTotal: number | null = null;
    if (gameTotal !== null && homeSpread !== null) {
      // homeSpread is negative if home team favored (e.g. -6.5)
      // homeImplied = (total/2) - (spread/2)  [spread is negative for favorites]
      homeImpliedTotal = Math.round(((gameTotal / 2) - (homeSpread / 2)) * 10) / 10;
      awayImpliedTotal = Math.round(((gameTotal / 2) + (homeSpread / 2)) * 10) / 10;
    }

    // Extract moneyline for win probability
    const h2hMkt = bm.markets.find(m => m.key === "h2h");
    const homeML = h2hMkt?.outcomes.find(o => o.name === event.home_team)?.price ?? null;
    const awayML = h2hMkt?.outcomes.find(o => o.name === event.away_team)?.price ?? null;

    let homeWinProbability: number | null = null;
    let awayWinProbability: number | null = null;
    if (homeML !== null && awayML !== null) {
      const rawHome = americanOddsToProb(homeML);
      const rawAway = americanOddsToProb(awayML);
      const [devigged1, devigged2] = devig(rawHome, rawAway);
      homeWinProbability = Math.round(devigged1 * 100);
      awayWinProbability = Math.round(devigged2 * 100);
    }

    return {
      eventId: event.id,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      gameTotal,
      homeSpread,
      homeImpliedTotal,
      awayImpliedTotal,
      homeWinProbability,
      awayWinProbability,
      bookmakerSource: bm.key,
      fetchedAt,
    };
  });
}

// ─── DB cache helpers ─────────────────────────────────────────────────────────

async function getCachedOdds(): Promise<{ data: NFLGameOdds[]; fetchedAt: Date } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(fantasyDataCache)
    .where(eq(fantasyDataCache.cacheKey, CACHE_KEY))
    .limit(1);

  if (!rows[0]) return null;

  const fetchedAt = new Date(rows[0].updatedAt ?? rows[0].fetchedAt);
  const ageMs = Date.now() - fetchedAt.getTime();
  if (ageMs > CACHE_TTL_MS) return null; // stale

  try {
    const payload = rows[0].payload;
    const data = (typeof payload === "string" ? JSON.parse(payload) : payload) as NFLGameOdds[];
    return { data, fetchedAt };
  } catch {
    return null;
  }
}

async function setCachedOdds(odds: NFLGameOdds[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const body = JSON.stringify(odds);
  await db
    .insert(fantasyDataCache)
    .values({
      cacheKey: CACHE_KEY,
      payload: body,
      fetchedAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        payload: body,
        updatedAt: now,
      },
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Force-fetch from The Odds API and update the DB cache. */
export async function fetchAndCacheNFLOdds(): Promise<NFLGameOdds[]> {
  const odds = await fetchFromOddsApi();
  await setCachedOdds(odds);
  return odds;
}

/** Read from DB cache only — no network call. Returns null if cache is empty/stale. */
export async function getCachedNFLOdds(): Promise<NFLGameOdds[] | null> {
  const result = await getCachedOdds();
  return result?.data ?? null;
}

/** Cache-first: returns cached data if fresh, otherwise fetches from API. */
export async function getNFLOdds(): Promise<NFLGameOdds[]> {
  const cached = await getCachedOdds();
  if (cached) return cached.data;
  return fetchAndCacheNFLOdds();
}

/**
 * Returns Vegas game context for a given NFL team abbreviation.
 * Matches by converting full team names to abbreviations.
 *
 * @param teamAbbr - ESPN team abbreviation (e.g. "ATL", "KC", "SF")
 */
export function getVegasContextForTeam(
  teamAbbr: string,
  odds: NFLGameOdds[]
): VegasTeamContext | null {
  const fullName = ABBR_TO_TEAM_NAME[teamAbbr.toUpperCase()];
  if (!fullName) return null;

  const game = odds.find(
    g => g.homeTeam === fullName || g.awayTeam === fullName
  );
  if (!game) return null;

  const isHome = game.homeTeam === fullName;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const opponentAbbr = TEAM_NAME_TO_ABBR[opponent] ?? opponent;
  const impliedTotal = isHome ? game.homeImpliedTotal : game.awayImpliedTotal;
  const spread = isHome ? game.homeSpread : (game.homeSpread !== null ? -game.homeSpread : null);
  const winProbability = isHome ? game.homeWinProbability : game.awayWinProbability;

  const vegasAdjustment = calcVegasAdjustment(impliedTotal);

  const gameEnvironment: VegasTeamContext["gameEnvironment"] =
    game.gameTotal !== null && game.gameTotal >= 48 ? "high_scoring" :
    game.gameTotal !== null && game.gameTotal <= 40 ? "low_scoring" :
    "neutral";

  return {
    nflTeam: teamAbbr.toUpperCase(),
    opponent: opponentAbbr,
    isHome,
    gameTotal: game.gameTotal,
    spread,
    impliedTotal,
    winProbability,
    vegasAdjustment,
    gameEnvironment,
    commenceTime: game.commenceTime,
    bookmakerSource: game.bookmakerSource,
  };
}

/**
 * Computes a Monte Carlo projection adjustment factor from an implied team total.
 *
 * Returns a value between -0.25 and +0.25 representing the percentage
 * by which to scale a player's projected points relative to league average.
 *
 * Examples:
 *   impliedTotal 27 → +0.20 (team expected to score 20% above avg)
 *   impliedTotal 22.5 → 0.00 (exactly average)
 *   impliedTotal 17 → -0.24 (team expected to score 24% below avg)
 */
export function calcVegasAdjustment(impliedTotal: number | null): number {
  if (impliedTotal === null) return 0;
  const raw = (impliedTotal - LEAGUE_AVG_TEAM_SCORE) / LEAGUE_AVG_TEAM_SCORE;
  // Cap at ±25% to prevent extreme outliers from dominating
  return Math.max(-0.25, Math.min(0.25, Math.round(raw * 1000) / 1000));
}

/**
 * Builds a plain-text Vegas context block for LLM prompt injection.
 * Summarizes game environment signals for all players in a lineup.
 */
export function buildVegasPromptBlock(
  playerContexts: Array<{ playerName: string; teamAbbr: string; context: VegasTeamContext | null }>
): string {
  const lines: string[] = ["VEGAS GAME CONTEXT:"];

  for (const { playerName, teamAbbr, context } of playerContexts) {
    if (!context) {
      lines.push(`  ${playerName} (${teamAbbr}): No Vegas data available`);
      continue;
    }
    const adjPct = context.vegasAdjustment >= 0
      ? `+${(context.vegasAdjustment * 100).toFixed(1)}%`
      : `${(context.vegasAdjustment * 100).toFixed(1)}%`;
    const envLabel = context.gameEnvironment === "high_scoring" ? "🔥 High-scoring game" :
      context.gameEnvironment === "low_scoring" ? "🧊 Low-scoring game" : "Neutral game";
    lines.push(
      `  ${playerName} (${teamAbbr} vs ${context.opponent}): ` +
      `Game total ${context.gameTotal ?? "N/A"} | Implied ${context.impliedTotal ?? "N/A"} pts | ` +
      `Vegas adj ${adjPct} | Win prob ${context.winProbability ?? "N/A"}% | ${envLabel}`
    );
  }

  return lines.join("\n");
}
