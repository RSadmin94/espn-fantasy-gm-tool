/**
 * Beat Reporter & Depth Chart Intelligence Service
 *
 * Fetches NFL player news from three sources:
 *   1. ESPN NFL News API  — athlete-tagged articles
 *   2. ESPN Team Injury Reports — beat reporter notes per team (all 32)
 *   3. Sleeper Trending Players — rising/dropping add counts as workload signal
 *
 * Raw news is passed to the LLM signal extractor (beatReporterSignalExtractor.ts)
 * which converts each item into a structured PlayerNewsSignal.
 *
 * Results are cached in the player_news_signals table with a 6-hour TTL.
 */

import { getDb } from "./db";
import { playerNewsSignals } from "../drizzle/schema";
import { lt, eq, and, gte, desc, sql } from "drizzle-orm";
import { extractSignalsFromNewsItems } from "./beatReporterSignalExtractor";

// ─── Constants ────────────────────────────────────────────────────────────────

const ESPN_NEWS_URL =
  "http://site.api.espn.com/apis/site/v2/sports/football/nfl/news";
const ESPN_TEAMS_URL =
  "http://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";
const ESPN_TEAM_INJURIES_BASE =
  "http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams";
const ESPN_ATHLETE_BASE =
  "http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes";
const SLEEPER_TRENDING_URL =
  "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=25";
const ROTO_NFL_RSS =
  "https://www.rotoballer.com/category/nfl-news/feed";

const CACHE_TTL_HOURS = 6;
const FETCH_TIMEOUT_MS = 10_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawNewsItem {
  playerName: string;
  espnPlayerId?: number;
  nflTeam?: string;
  position?: string;
  headline: string;
  description: string;
  publishedAt?: Date;
  sourceType: "espn_news" | "espn_injury" | "rss";
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "Accept-Encoding": "gzip" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fetch all 32 NFL team IDs from ESPN */
async function fetchNflTeamIds(): Promise<Array<{ id: string; abbr: string }>> {
  const data = await fetchJson<any>(`${ESPN_TEAMS_URL}?limit=32`);
  if (!data) return [];
  const teams: Array<{ id: string; abbr: string }> = [];
  const rawTeams =
    data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  for (const t of rawTeams) {
    const team = t?.team ?? {};
    if (team.id && team.abbreviation) {
      teams.push({ id: String(team.id), abbr: team.abbreviation });
    }
  }
  return teams;
}

/** Fetch athlete display name + position from ESPN core API */
async function fetchAthleteInfo(
  athleteId: string
): Promise<{ name: string; position: string; team: string } | null> {
  const data = await fetchJson<any>(
    `${ESPN_ATHLETE_BASE}/${athleteId}?lang=en&region=us`
  );
  if (!data?.displayName) return null;
  return {
    name: data.displayName as string,
    position: (data.position?.abbreviation ?? "") as string,
    team: (data.team?.abbreviation ?? "") as string,
  };
}

// ─── Source 1: ESPN NFL News ──────────────────────────────────────────────────

export async function fetchEspnNews(limit = 50): Promise<RawNewsItem[]> {
  const data = await fetchJson<any>(`${ESPN_NEWS_URL}?limit=${limit}`);
  if (!data?.articles) return [];

  const items: RawNewsItem[] = [];
  for (const article of data.articles as any[]) {
    const headline: string = article.headline ?? "";
    const description: string = article.description ?? "";
    if (!headline && !description) continue;

    const publishedAt = article.published
      ? new Date(article.published)
      : undefined;

    // Extract athlete tags
    const athleteCategories = (article.categories ?? []).filter(
      (c: any) => c.type === "athlete"
    );

    if (athleteCategories.length > 0) {
      for (const cat of athleteCategories) {
        const athleteId = cat.athleteId;
        const playerName: string =
          cat.description ?? cat.athlete?.description ?? "";
        if (!playerName) continue;

        items.push({
          playerName,
          espnPlayerId: athleteId ? Number(athleteId) : undefined,
          headline,
          description,
          publishedAt,
          sourceType: "espn_news",
        });
      }
    } else {
      // No athlete tag — include as a general team news item
      const teamCats = (article.categories ?? []).filter(
        (c: any) => c.type === "team"
      );
      const teamName: string =
        teamCats[0]?.team?.displayName ?? teamCats[0]?.description ?? "";
      if (teamName) {
        items.push({
          playerName: teamName, // will be filtered by LLM if not player-specific
          headline,
          description,
          publishedAt,
          sourceType: "espn_news",
        });
      }
    }
  }
  return items;
}

// ─── Source 2: ESPN Team Injury Reports ──────────────────────────────────────

export async function fetchEspnInjuryReports(): Promise<RawNewsItem[]> {
  const teams = await fetchNflTeamIds();
  const items: RawNewsItem[] = [];

  // Fetch injuries for all 32 teams in parallel (batched to avoid rate limits)
  const BATCH_SIZE = 8;
  for (let i = 0; i < teams.length; i += BATCH_SIZE) {
    const batch = teams.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((team) => fetchTeamInjuries(team.id, team.abbr))
    );
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        items.push(...result.value);
      }
    }
  }
  return items;
}

async function fetchTeamInjuries(
  teamId: string,
  teamAbbr: string
): Promise<RawNewsItem[]> {
  const data = await fetchJson<any>(
    `${ESPN_TEAM_INJURIES_BASE}/${teamId}/injuries?lang=en&region=us&limit=20`
  );
  if (!data?.items?.length) return [];

  const items: RawNewsItem[] = [];

  // Fetch details for up to 10 injury refs per team
  const refs: string[] = (data.items as any[])
    .slice(0, 10)
    .map((item: any) => item.$ref)
    .filter(Boolean);

  const details = await Promise.allSettled(
    refs.map((ref) => fetchJson<any>(ref))
  );

  for (const detail of details) {
    if (detail.status !== "fulfilled" || !detail.value) continue;
    const d = detail.value;

    const shortComment: string = d.shortComment ?? "";
    const longComment: string = d.longComment ?? "";
    const status: string = d.status ?? "";
    const injuryType: string = d.type?.description ?? "";
    const publishedAt = d.date ? new Date(d.date) : undefined;

    if (!shortComment && !longComment) continue;

    // Extract athlete ID from the athlete $ref URL
    const athleteRef: string = d.athlete?.$ref ?? "";
    const athleteIdMatch = athleteRef.match(/athletes\/(\d+)/);
    const athleteId = athleteIdMatch ? athleteIdMatch[1] : null;

    let playerName = "";
    let position = "";
    let team = teamAbbr;

    if (athleteId) {
      const athleteInfo = await fetchAthleteInfo(athleteId);
      if (athleteInfo) {
        playerName = athleteInfo.name;
        position = athleteInfo.position;
        team = athleteInfo.team || teamAbbr;
      }
    }

    if (!playerName) continue;

    const headline = `${playerName} (${injuryType || status}) — ${shortComment.slice(0, 80)}`;
    const description = [shortComment, longComment].filter(Boolean).join(" ");

    items.push({
      playerName,
      espnPlayerId: athleteId ? Number(athleteId) : undefined,
      nflTeam: team,
      position,
      headline,
      description,
      publishedAt,
      sourceType: "espn_injury",
    });
  }
  return items;
}

// ─── Source 3: Sleeper Trending Players ───────────────────────────────────────

export async function fetchSleeperTrending(): Promise<RawNewsItem[]> {
  const data = await fetchJson<Array<{ player_id: string; count: number }>>(
    SLEEPER_TRENDING_URL
  );
  if (!data?.length) return [];

  const items: RawNewsItem[] = [];
  // Fetch player details for top 10 trending
  for (const entry of data.slice(0, 10)) {
    const playerData = await fetchJson<any>(
      `https://api.sleeper.app/v1/players/nfl/${entry.player_id}`
    );
    if (!playerData?.full_name) continue;

    const fullName: string = playerData.full_name;
    const position: string = playerData.position ?? "";
    const team: string = playerData.team ?? "";
    const injuryStatus: string = playerData.injury_status ?? "";
    const injuryBodyPart: string = playerData.injury_body_part ?? "";
    const injuryNotes: string = playerData.injury_notes ?? "";
    const count: number = entry.count;

    // Only include skill positions
    if (!["QB", "RB", "WR", "TE"].includes(position)) continue;

    const headline = `${fullName} trending: +${count.toLocaleString()} adds in 24h${injuryStatus ? ` (${injuryStatus})` : ""}`;
    const description = [
      `${fullName} is trending with ${count.toLocaleString()} adds in the last 24 hours on Sleeper.`,
      injuryStatus ? `Injury status: ${injuryStatus}${injuryBodyPart ? ` (${injuryBodyPart})` : ""}.` : "",
      injuryNotes || "",
    ]
      .filter(Boolean)
      .join(" ");

    items.push({
      playerName: fullName,
      nflTeam: team,
      position,
      headline,
      description,
      publishedAt: new Date(),
      sourceType: "espn_news", // treated as general news for signal extraction
    });
  }
  return items;
}

// ─── Source 4: RotoBaller NFL RSS ─────────────────────────────────────────────

export async function fetchRotoBalllerNflRss(): Promise<RawNewsItem[]> {
  try {
    const res = await fetch(ROTO_NFL_RSS, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // Simple XML item extraction without a parser dependency
    const items: RawNewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1]
        ?? "";
      const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? block.match(/<description>(.*?)<\/description>/)?.[1]
        ?? "";
      const pubDateStr = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

      if (!title) continue;

      // Strip HTML tags from description
      const cleanDesc = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);

      items.push({
        playerName: "", // LLM will extract player name from headline/description
        headline: title,
        description: cleanDesc,
        publishedAt: pubDateStr ? new Date(pubDateStr) : undefined,
        sourceType: "rss",
      });
    }
    return items;
  } catch {
    return [];
  }
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

/** Returns cached signals for a player that haven't expired yet */
export async function getCachedSignals(playerName: string) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(playerNewsSignals)
    .where(
      and(
        eq(playerNewsSignals.playerName, playerName),
        gte(playerNewsSignals.expiresAt, now)
      )
    )
    .orderBy(desc(playerNewsSignals.cachedAt))
    .limit(10);
}

/** Returns all non-expired signals, optionally filtered by signal type */
export async function getAllActiveSignals(opts?: {
  signalType?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const conditions = [gte(playerNewsSignals.expiresAt, now)];
  if (opts?.signalType) {
    conditions.push(
      eq(playerNewsSignals.signalType, opts.signalType as any)
    );
  }
  return db
    .select()
    .from(playerNewsSignals)
    .where(and(...conditions))
    .orderBy(desc(playerNewsSignals.cachedAt))
    .limit(opts?.limit ?? 100);
}

/** Purge expired signals */
export async function purgeExpiredSignals() {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(playerNewsSignals)
    .where(lt(playerNewsSignals.expiresAt, new Date()));
}

/** Upsert a batch of signals — replaces existing signals for the same player */
export async function upsertSignals(
  signals: Array<{
    playerName: string;
    espnPlayerId?: number;
    nflTeam?: string;
    position?: string;
    signalType: string;
    magnitude: number;
    projectionImpactPct: number;
    summary: string;
    confidence: number;
    headline?: string;
    articleDescription?: string;
    sourceType?: string;
    publishedAt?: Date;
  }>
) {
  const db = await getDb();
  if (!db || signals.length === 0) return;

  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000);

  // Delete old signals for these players first
  const playerNamesSet = new Set(signals.map((s) => s.playerName));
  const playerNames = Array.from(playerNamesSet);
  for (const name of playerNames) {
    await db
      .delete(playerNewsSignals)
      .where(eq(playerNewsSignals.playerName, name));
  }

  // Insert new signals
  await db.insert(playerNewsSignals).values(
    signals.map((s) => ({
      playerName: s.playerName,
      espnPlayerId: s.espnPlayerId ?? null,
      nflTeam: s.nflTeam ?? null,
      position: s.position ?? null,
      signalType: s.signalType as any,
      magnitude: Math.round(Math.min(100, Math.max(0, s.magnitude * 100))),
      projectionImpactPct: Math.round(
        Math.min(25, Math.max(-25, s.projectionImpactPct))
      ),
      summary: s.summary,
      confidence: Math.round(Math.min(100, Math.max(0, s.confidence))),
      headline: s.headline ?? null,
      articleDescription: s.articleDescription ?? null,
      sourceType: (s.sourceType as any) ?? "espn_news",
      publishedAt: s.publishedAt ?? null,
      expiresAt,
    }))
  );
}

// ─── Main refresh orchestrator ────────────────────────────────────────────────

export async function refreshBeatReporterSignals(): Promise<{
  newsItems: number;
  injuryItems: number;
  trendingItems: number;
  rssItems: number;
  signalsExtracted: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // Fetch all sources in parallel
  const [newsItems, injuryItems, trendingItems, rssItems] =
    await Promise.allSettled([
      fetchEspnNews(50),
      fetchEspnInjuryReports(),
      fetchSleeperTrending(),
      fetchRotoBalllerNflRss(),
    ]).then((results) =>
      results.map((r, i) => {
        if (r.status === "rejected") {
          errors.push(`Source ${i} failed: ${String(r.reason)}`);
          return [] as RawNewsItem[];
        }
        return r.value;
      })
    );

  const allItems = [...newsItems, ...injuryItems, ...trendingItems, ...rssItems];

  // Extract structured signals via LLM
  let signalsExtracted = 0;
  if (allItems.length > 0) {
    try {
      const signals = await extractSignalsFromNewsItems(allItems);
      await upsertSignals(signals);
      signalsExtracted = signals.length;
    } catch (err) {
      errors.push(`Signal extraction failed: ${String(err)}`);
    }
  }

  // Purge expired signals
  await purgeExpiredSignals();

  return {
    newsItems: newsItems.length,
    injuryItems: injuryItems.length,
    trendingItems: trendingItems.length,
    rssItems: rssItems.length,
    signalsExtracted,
    errors,
  };
}
