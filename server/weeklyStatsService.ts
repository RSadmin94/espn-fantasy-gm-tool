/**
 * ESPN Weekly Stats Service
 *
 * Fetches per-week player stats from ESPN's Fantasy API using scoringPeriodId.
 * ESPN returns stats with statSplitTypeId=1 (weekly) when scoringPeriodId is specified.
 *
 * Key ESPN stat IDs (PPR scoring):
 *   Passing:   3=completions, 0=passing attempts, 1=incomplete, 4=passing yards, 5=passing TDs, 6=interceptions
 *   Rushing:   23=rushing attempts, 24=rushing yards, 25=rushing TDs
 *   Receiving: 41=receptions, 42=receiving yards, 43=receiving TDs, 58=targets
 *   Usage:     87=snap count, 88=snap pct (0-100)
 *   Fantasy:   appliedTotal = total fantasy points for the week
 */

import type { EspnCreds } from "./espnService";
const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || "457622";
const SWID = process.env.ESPN_SWID || "";
const ESPN_S2 = process.env.ESPN_S2 || "";

const POSITION_MAP: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K",
  16: "K", 15: "D/ST",
};

const PRO_TEAM_MAP: Record<number, string> = {
  0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN",
  5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB",
  10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG",
  20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR",
  30: "JAX", 33: "BAL", 34: "HOU",
};

export interface WeeklyStatRow {
  season: number;
  week: number;
  playerId: number;
  playerName: string;
  position: string;
  proTeam: string;
  teamId: number | null;
  ownerName: string | null;
  // Receiving
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  // Rushing
  rushingAttempts: number;
  rushingYards: number;
  rushingTDs: number;
  // Passing
  passingAttempts: number;
  completions: number;
  passingYards: number;
  passingTDs: number;
  interceptions: number;
  // Usage
  snapCount: number;
  snapPct: number;
  // Fantasy (stored as points * 100 for integer precision)
  fantasyPoints: number;
}

function buildCookieStringFor(creds?: EspnCreds): string {
  const swid = creds?.swid ?? SWID;
  const s2   = creds?.espnS2 ?? ESPN_S2;
  const parts: string[] = [];
  if (swid) parts.push(`SWID=${swid}`);
  if (s2)   parts.push(`espn_s2=${s2}`);
  return parts.join("; ");
}

function getBaseUrlFor(season: number, creds?: EspnCreds): string {
  const lid = creds?.leagueId ?? LEAGUE_ID;
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${lid}`;
}

/**
 * Fetch per-week player stats for a given season and scoring period (week).
 * Uses mRoster view with scoringPeriodId to get weekly stat splits.
 */
export async function fetchWeeklyStatsForPeriod(
  season: number,
  scoringPeriodId: number,
  creds?: EspnCreds
): Promise<{ rows: WeeklyStatRow[]; error?: string }> {
  const url = new URL(getBaseUrlFor(season, creds));
  url.searchParams.append("view", "mRoster");
  url.searchParams.append("scoringPeriodId", String(scoringPeriodId));

  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Referer: "https://fantasy.espn.com/football/league",
  };
  const cookieStr = buildCookieStringFor(creds);
  if (cookieStr) headers["Cookie"] = cookieStr;

  try {
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(30000) });
    if (res.status === 401 || res.status === 403) {
      return { rows: [], error: `ESPN auth error ${res.status} — cookies may be expired` };
    }
    if (!res.ok) {
      return { rows: [], error: `ESPN HTTP ${res.status} ${res.statusText}` };
    }
    const data = await res.json() as Record<string, unknown>;
    const rows = normalizeWeeklyStats(data, season, scoringPeriodId);
    return { rows };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Normalize ESPN mRoster response into WeeklyStatRow array.
 * ESPN stat IDs for weekly splits (statSplitTypeId=1):
 *   3=completions, 0=pass attempts, 4=pass yards, 5=pass TDs, 6=interceptions
 *   23=rush attempts, 24=rush yards, 25=rush TDs
 *   41=receptions, 42=rec yards, 43=rec TDs, 58=targets
 *   87=snap count, 88=snap pct
 */
export function normalizeWeeklyStats(
  data: Record<string, unknown>,
  season: number,
  week: number
): WeeklyStatRow[] {
  const rows: WeeklyStatRow[] = [];
  const teams = (data.teams as Record<string, unknown>[]) || [];

  for (const team of teams) {
    const teamId = team.id as number;
    // Build owner name from team members
    const members = (team.members as Record<string, unknown>[]) || [];
    const ownerName = members.map((m) => {
      const first = (m.firstName as string) || "";
      const last = (m.lastName as string) || "";
      return `${first} ${last}`.trim();
    }).filter(Boolean).join(" / ") || null;

    const entries = ((team.roster as Record<string, unknown>)?.entries as Record<string, unknown>[]) || [];

    for (const entry of entries) {
      const poolEntry = (entry.playerPoolEntry as Record<string, unknown>) || {};
      const player = (poolEntry.player as Record<string, unknown>) || {};
      const playerId = (player.id || poolEntry.id) as number;
      const playerName = (player.fullName as string) || "";
      if (!playerId || !playerName) continue;

      const positionId = player.defaultPositionId as number;
      const position = POSITION_MAP[positionId] || "?";
      const proTeam = PRO_TEAM_MAP[player.proTeamId as number] || "?";

      // Find the weekly stat split (statSplitTypeId=1, statSourceId=0 for actual)
      const stats = (player.stats as Record<string, unknown>[]) || [];
      let weeklyStats: Record<string, number> = {};
      let fantasyPointsRaw = 0;

      for (const stat of stats) {
        // statSplitTypeId=1 means weekly split; statSourceId=0 means actual (not projected)
        if (stat.statSplitTypeId === 1 && stat.statSourceId === 0) {
          weeklyStats = (stat.appliedStats as Record<string, number>) || {};
          fantasyPointsRaw = (stat.appliedTotal as number) || 0;
          break;
        }
      }

      // Extract stat values using ESPN's numeric stat IDs
      const row: WeeklyStatRow = {
        season,
        week,
        playerId,
        playerName,
        position,
        proTeam,
        teamId,
        ownerName,
        // Receiving
        targets: Math.round(weeklyStats[58] || 0),
        receptions: Math.round(weeklyStats[41] || 0),
        receivingYards: Math.round(weeklyStats[42] || 0),
        receivingTDs: Math.round(weeklyStats[43] || 0),
        // Rushing
        rushingAttempts: Math.round(weeklyStats[23] || 0),
        rushingYards: Math.round(weeklyStats[24] || 0),
        rushingTDs: Math.round(weeklyStats[25] || 0),
        // Passing
        passingAttempts: Math.round(weeklyStats[0] || 0),
        completions: Math.round(weeklyStats[3] || 0),
        passingYards: Math.round(weeklyStats[4] || 0),
        passingTDs: Math.round(weeklyStats[5] || 0),
        interceptions: Math.round(weeklyStats[6] || 0),
        // Usage
        snapCount: Math.round(weeklyStats[87] || 0),
        snapPct: Math.round(weeklyStats[88] || 0),
        // Fantasy points stored as integer * 100
        fantasyPoints: Math.round(fantasyPointsRaw * 100),
      };

      rows.push(row);
    }
  }

  return rows;
}

/**
 * Fetch all weeks for a season up to maxWeek.
 * Returns a summary of weeks fetched and any errors encountered.
 */
export async function fetchAllWeeksForSeason(
  season: number,
  maxWeek: number = 17
): Promise<{
  weeksAttempted: number;
  weeksFetched: number;
  totalRows: number;
  errors: { week: number; error: string }[];
  allRows: WeeklyStatRow[];
}> {
  const allRows: WeeklyStatRow[] = [];
  const errors: { week: number; error: string }[] = [];
  let weeksFetched = 0;

  for (let week = 1; week <= maxWeek; week++) {
    const result = await fetchWeeklyStatsForPeriod(season, week);
    if (result.error) {
      errors.push({ week, error: result.error });
    } else if (result.rows.length > 0) {
      allRows.push(...result.rows);
      weeksFetched++;
    }
    // Small delay to avoid rate limiting
    if (week < maxWeek) await new Promise(r => setTimeout(r, 200));
  }

  return {
    weeksAttempted: maxWeek,
    weeksFetched,
    totalRows: allRows.length,
    errors,
    allRows,
  };
}

/**
 * Compute per-player trend stats from an array of weekly rows.
 * Returns last N weeks of targets, snaps, and fantasy points.
 */
export function computePlayerTrend(
  rows: WeeklyStatRow[],
  playerId: number,
  lastNWeeks: number = 4
): {
  playerId: number;
  playerName: string;
  position: string;
  weeks: number[];
  targets: number[];
  snapPct: number[];
  fantasyPoints: number[]; // in actual points (divided by 100)
  avgTargets: number;
  avgSnapPct: number;
  avgFantasyPoints: number;
  trend: "rising" | "falling" | "stable";
} | null {
  const playerRows = rows
    .filter(r => r.playerId === playerId)
    .sort((a, b) => a.week - b.week)
    .slice(-lastNWeeks);

  if (playerRows.length === 0) return null;

  const weeks = playerRows.map(r => r.week);
  const targets = playerRows.map(r => r.targets);
  const snapPct = playerRows.map(r => r.snapPct);
  const fantasyPoints = playerRows.map(r => r.fantasyPoints / 100);

  const avgTargets = targets.reduce((s, v) => s + v, 0) / targets.length;
  const avgSnapPct = snapPct.reduce((s, v) => s + v, 0) / snapPct.length;
  const avgFantasyPoints = fantasyPoints.reduce((s, v) => s + v, 0) / fantasyPoints.length;

  // Trend: compare first half vs second half
  let trend: "rising" | "falling" | "stable" = "stable";
  if (fantasyPoints.length >= 2) {
    const mid = Math.floor(fantasyPoints.length / 2);
    const firstHalf = fantasyPoints.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
    const secondHalf = fantasyPoints.slice(mid).reduce((s, v) => s + v, 0) / (fantasyPoints.length - mid);
    if (secondHalf > firstHalf * 1.15) trend = "rising";
    else if (secondHalf < firstHalf * 0.85) trend = "falling";
  }

  return {
    playerId,
    playerName: playerRows[0].playerName,
    position: playerRows[0].position,
    weeks,
    targets,
    snapPct,
    fantasyPoints,
    avgTargets,
    avgSnapPct,
    avgFantasyPoints,
    trend,
  };
}
