/**
 * ESPN Fantasy Football API Service
 * Authenticates with SWID + espn_s2 cookies and fetches league data.
 */

import { ENV } from "./_core/env";

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || "457622";
const SWID = process.env.ESPN_SWID || "";
const ESPN_S2 = process.env.ESPN_S2 || "";

export const ALL_VIEWS = [
  "mSettings",
  "mTeam",
  "mRoster",
  "mMatchup",
  "mMatchupScore",
  "mScoreboard",
  "mSchedule",
  "mStandings",
  "mStatus",
  "mDraftDetail",
  "mTransactions2",
] as const;

export type EspnView = (typeof ALL_VIEWS)[number];

export const POSITION_MAP: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K",
  7: "OP", 9: "DT", 10: "DE", 11: "LB", 12: "CB",
  13: "S", 14: "HC", 15: "D/ST", 16: "K", 17: "P",
  23: "FLEX", 24: "FLEX", 25: "FLEX",
};

export const SLOT_MAP: Record<number, string> = {
  0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST",
  17: "K", 20: "Bench", 21: "IR", 23: "FLEX",
  24: "FLEX", 25: "FLEX",
};

export const PRO_TEAM_MAP: Record<number, string> = {
  0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN",
  5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB",
  10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG",
  20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR",
  30: "JAX", 33: "BAL", 34: "HOU",
};

function buildCookieString(): string {
  const parts: string[] = [];
  if (SWID) parts.push(`SWID=${SWID}`);
  if (ESPN_S2) parts.push(`espn_s2=${ESPN_S2}`);
  return parts.join("; ");
}

function getBaseUrl(season: number): string {
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}`;
}

export async function fetchEspnViews(
  season: number,
  views: string[] = [...ALL_VIEWS]
): Promise<Record<string, unknown>> {
  const url = new URL(getBaseUrl(season));
  for (const v of views) {
    url.searchParams.append("view", v);
  }

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Referer: "https://fantasy.espn.com/football/league",
  };

  const cookieStr = buildCookieString();
  if (cookieStr) headers["Cookie"] = cookieStr;

  const res = await fetch(url.toString(), { headers });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `ESPN API returned ${res.status}. Cookies may be expired. Please update ESPN_SWID and ESPN_S2.`
    );
  }
  if (!res.ok) {
    throw new Error(`ESPN API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

export function normalizeSettings(data: Record<string, unknown>) {
  const settings = (data.settings as Record<string, unknown>) || {};
  const status = (data.status as Record<string, unknown>) || {};
  const schedSettings = (settings.scheduleSettings as Record<string, unknown>) || {};
  const scoringSettings = (settings.scoringSettings as Record<string, unknown>) || {};
  const rosterSettings = (settings.rosterSettings as Record<string, unknown>) || {};
  const tradeSettings = (settings.tradeSettings as Record<string, unknown>) || {};
  const draftSettings = (settings.draftSettings as Record<string, unknown>) || {};

  return {
    leagueId: data.id,
    seasonId: data.seasonId,
    leagueName: settings.name,
    size: settings.size,
    scoringType: scoringSettings.scoringType,
    playoffTeamCount: schedSettings.playoffTeamCount,
    matchupPeriodCount: schedSettings.matchupPeriodCount,
    currentMatchupPeriod: status.currentMatchupPeriod,
    latestScoringPeriod: status.latestScoringPeriod,
    isActive: status.isActive,
    tradeDeadline: tradeSettings.deadlineDate,
    draftType: draftSettings.type,
    keeperCount: settings.keeperCount,
    rosterPositions: rosterSettings.lineupSlotCounts,
    scoringItems: scoringSettings.scoringItems,
  };
}

export function normalizeTeams(data: Record<string, unknown>) {
  const season = data.seasonId as number;
  const members: Record<string, Record<string, unknown>> = {};
  for (const m of (data.members as Record<string, unknown>[]) || []) {
    members[m.id as string] = m;
  }

  return ((data.teams as Record<string, unknown>[]) || []).map((team) => {
    const owners = (team.owners as string[]) || [];
    const ownerNames = owners.map((oid) => {
      const m = members[oid] || {};
      return `${m.firstName || ""} ${m.lastName || ""}`.trim() || oid;
    });
    const record = ((team.record as Record<string, unknown>)?.overall as Record<string, unknown>) || {};
    const currentRecord = ((team.record as Record<string, unknown>)?.home as Record<string, unknown>) || {};

    return {
      season,
      teamId: team.id,
      abbrev: team.abbrev,
      teamName: `${team.location || ""} ${team.nickname || ""}`.trim(),
      location: team.location,
      nickname: team.nickname,
      owners: ownerNames.join("; "),
      wins: record.wins,
      losses: record.losses,
      ties: record.ties,
      pointsFor: record.pointsFor,
      pointsAgainst: record.pointsAgainst,
      percentage: record.percentage,
      rankFinal: team.rankCalculatedFinal,
      playoffSeed: team.playoffSeed,
      draftDayProjectedRank: team.draftDayProjectedRank,
      currentProjectedRank: team.currentProjectedRank,
      logoUrl: team.logo,
      primaryColor: team.primaryColor,
    };
  });
}

export function normalizeRosters(data: Record<string, unknown>) {
  const season = data.seasonId as number;
  const rosters: unknown[] = [];

  for (const team of (data.teams as Record<string, unknown>[]) || []) {
    const teamId = team.id;
    const teamName = `${team.location || ""} ${team.nickname || ""}`.trim();
    const entries = ((team.roster as Record<string, unknown>)?.entries as Record<string, unknown>[]) || [];

    for (const entry of entries) {
      const poolEntry = (entry.playerPoolEntry as Record<string, unknown>) || {};
      const player = (poolEntry.player as Record<string, unknown>) || {};
      const stats = (player.stats as Record<string, unknown>[]) || [];
      const ownership = (player.ownership as Record<string, unknown>) || {};

      let appliedTotal: number | null = null;
      let projectedTotal: number | null = null;
      for (const stat of stats) {
        if (stat.statSourceId === 0) appliedTotal = stat.appliedTotal as number;
        if (stat.statSourceId === 1) projectedTotal = stat.appliedTotal as number;
      }

      rosters.push({
        season,
        teamId,
        teamName,
        playerId: player.id || poolEntry.id,
        playerName: player.fullName,
        positionId: player.defaultPositionId,
        position: POSITION_MAP[player.defaultPositionId as number] || "?",
        proTeamId: player.proTeamId,
        proTeam: PRO_TEAM_MAP[player.proTeamId as number] || "?",
        lineupSlotId: entry.lineupSlotId,
        lineupSlot: SLOT_MAP[entry.lineupSlotId as number] || "Bench",
        acquisitionType: poolEntry.acquisitionType,
        acquisitionDate: poolEntry.acquisitionDate,
        injuryStatus: player.injuryStatus,
        percentOwned: ownership.percentOwned,
        percentStarted: ownership.percentStarted,
        appliedTotal,
        projectedTotal,
      });
    }
  }
  return rosters;
}

export function buildPlayerIdMap(data: Record<string, unknown>): Map<number, { name: string; position: string; positionId: number; proTeam: string }> {
  const map = new Map<number, { name: string; position: string; positionId: number; proTeam: string }>();
  // Build from roster entries (most reliable source)
  for (const team of (data.teams as Record<string, unknown>[]) || []) {
    for (const entry of ((team.roster as Record<string, unknown>)?.entries as Record<string, unknown>[]) || []) {
      const poolEntry = (entry.playerPoolEntry as Record<string, unknown>) || {};
      const player = (poolEntry.player as Record<string, unknown>) || {};
      const pid = player.id as number;
      if (pid && !map.has(pid)) {
        map.set(pid, {
          name: (player.fullName as string) || "",
          position: POSITION_MAP[player.defaultPositionId as number] || "?",
          positionId: player.defaultPositionId as number,
          proTeam: PRO_TEAM_MAP[player.proTeamId as number] || "?",
        });
      }
    }
  }
  // Also try players array if present
  for (const fa of (data.players as Record<string, unknown>[]) || []) {
    const poolEntry = (fa.playerPoolEntry as Record<string, unknown>) || fa;
    const player = (poolEntry.player as Record<string, unknown>) || {};
    const pid = (player.id || fa.id) as number;
    if (pid && !map.has(pid)) {
      map.set(pid, {
        name: (player.fullName as string) || "",
        position: POSITION_MAP[player.defaultPositionId as number] || "?",
        positionId: player.defaultPositionId as number,
        proTeam: PRO_TEAM_MAP[player.proTeamId as number] || "?",
      });
    }
  }
  return map;
}

/**
 * Resolve player names for IDs not found in the roster map
 * by calling the ESPN public athlete API.
 */
export async function resolveUnknownPlayerIds(
  unknownIds: number[]
): Promise<Map<number, { name: string; position: string }>> {
  const result = new Map<number, { name: string; position: string }>();
  const POS_MAP: Record<string, string> = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "K", "D/ST": "D/ST" };
  await Promise.allSettled(
    unknownIds.map(async (pid) => {
      try {
        const url = `https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${pid}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return;
        const d = (await res.json()) as Record<string, unknown>;
        const athlete = (d.athlete as Record<string, unknown>) || {};
        const name = (athlete.displayName as string) || (athlete.fullName as string) || "";
        const posAbbr = ((athlete.position as Record<string, unknown>)?.abbreviation as string) || "?";
        if (name) result.set(pid, { name, position: POS_MAP[posAbbr] || posAbbr });
      } catch { /* ignore */ }
    })
  );
  return result;
}

export function normalizeDraftPicks(data: Record<string, unknown>) {
  const season = data.seasonId as number;
  const draft = (data.draftDetail as Record<string, unknown>) || {};
  const picks = (draft.picks as Record<string, unknown>[]) || [];
  const playerMap = buildPlayerIdMap(data);

  // Build teamId -> teamName map
  const teamNameMap: Record<number, string> = {};
  for (const t of (data.teams as Record<string, unknown>[]) || []) {
    const tid = t.id as number;
    teamNameMap[tid] = `${t.location || ""} ${t.nickname || ""}`.trim() || (t.name as string) || `Team ${tid}`;
  }

  return picks.map((pick) => {
    const playerId = pick.playerId as number;
    const pinfo = playerMap.get(playerId) || { name: "", position: "?", positionId: 0, proTeam: "?" };
    return {
      season,
      roundId: pick.roundId,
      roundPickNumber: pick.roundPickNumber,
      overallPickNumber: pick.overallPickNumber,
      teamId: pick.teamId,
      teamName: teamNameMap[pick.teamId as number] || `Team ${pick.teamId}`,
      playerId,
      playerName: pinfo.name,
      positionId: pinfo.positionId,
      position: pinfo.position,
      proTeam: pinfo.proTeam,
      keeper: pick.keeper,
      reservedForKeeper: pick.reservedForKeeper,
      autoDrafted: (pick.autoDraftTypeId as number) > 0,
    };
  });
}

export function normalizeDraftOrder(data: Record<string, unknown>) {
  const settings = (data.settings as Record<string, unknown>) || {};
  const draftSettings = (settings.draftSettings as Record<string, unknown>) || {};
  const pickOrder = (draftSettings.pickOrder as number[]) || [];
  const draftDate = draftSettings.date as number;
  const keeperDeadline = draftSettings.keeperDeadlineDate as number;

  const teamNameMap: Record<number, { name: string; abbrev: string; owners: string }> = {};
  const members: Record<string, Record<string, unknown>> = {};
  for (const m of (data.members as Record<string, unknown>[]) || []) {
    members[m.id as string] = m;
  }
  for (const t of (data.teams as Record<string, unknown>[]) || []) {
    const tid = t.id as number;
    const owners = (t.owners as string[]) || [];
    const ownerNames = owners.map((oid) => {
      const m = members[oid] || {};
      return `${m.firstName || ""} ${m.lastName || ""}`.trim() || oid;
    });
    teamNameMap[tid] = {
      name: `${t.location || ""} ${t.nickname || ""}`.trim() || (t.name as string) || `Team ${tid}`,
      abbrev: (t.abbrev as string) || "",
      owners: ownerNames.join("; "),
    };
  }

  return {
    pickOrder: pickOrder.map((teamId, idx) => ({
      position: idx + 1,
      teamId,
      ...teamNameMap[teamId],
    })),
    draftDate,
    keeperDeadline,
    draftType: draftSettings.orderType,
    keeperCount: draftSettings.keeperCount,
  };
}

export function normalizeMatchups(data: Record<string, unknown>) {
  const season = data.seasonId as number;
  const schedule = (data.schedule as Record<string, unknown>[]) || [];

  return schedule.map((item) => {
    const home = (item.home as Record<string, unknown>) || {};
    const away = (item.away as Record<string, unknown>) || {};
    return {
      season,
      matchupPeriodId: item.matchupPeriodId,
      scoringPeriodId: item.scoringPeriodId,
      winner: item.winner,
      playoffTierType: item.playoffTierType,
      homeTeamId: home.teamId,
      homeTotalPoints: home.totalPoints,
      homeProjectedPoints: home.totalProjectedPoints,
      awayTeamId: away.teamId,
      awayTotalPoints: away.totalPoints,
      awayProjectedPoints: away.totalProjectedPoints,
    };
  });
}

export function normalizeTransactions(data: Record<string, unknown>) {
  const season = data.seasonId as number;
  const txs = (data.transactions as Record<string, unknown>[]) || [];
  const rows: unknown[] = [];

  for (const tx of txs) {
    const items = (tx.items as Record<string, unknown>[]) || [];
    if (items.length === 0) {
      rows.push({
        season,
        transactionId: tx.id,
        type: tx.type,
        status: tx.status,
        proposedDate: tx.proposedDate,
        teamId: tx.teamId,
        playerId: null,
        playerName: null,
        fromTeamId: null,
        toTeamId: null,
      });
      continue;
    }
    for (const item of items) {
      const player = (item.player as Record<string, unknown>) || {};
      rows.push({
        season,
        transactionId: tx.id,
        type: tx.type,
        status: tx.status,
        proposedDate: tx.proposedDate,
        teamId: tx.teamId,
        playerId: player.id || item.playerId,
        playerName: player.fullName,
        fromTeamId: item.fromTeamId,
        toTeamId: item.toTeamId,
        itemType: item.type,
      });
    }
  }
  return rows;
}
