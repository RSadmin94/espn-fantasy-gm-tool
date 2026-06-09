/**
 * ownerCareerProfileService.ts
 *
 * Computes focal-owner career facts from synced ESPN combined cache.
 * **Championship seasons / title count:** `buildChampionshipAuthority` (medals-first,
 * same source as Hall of Fame), keyed by champion team id per season — not
 * `rankCalculatedFinal` or raw schedule alone.
 * Used by ownerSelfReview, `me.ownerHome`, and related prompts.
 */

import {
  getAllCachedSeasons,
  getCachedView,
  getDb,
  resolveActiveLeagueId,
} from "./db";
import { buildChampionshipAuthority, type ChampionshipAuthority } from "./championshipAuthority";
import { resolveCurrentOwner } from "./currentOwnerService";
import { normalizeDraftPicks, normalizeSettings } from "./espnService";

/** Championship matchup resolution — same logic as routers.findChampionshipMatchup (inlined to avoid coupling). */
function findChampionshipMatchup(schedule: Record<string, unknown>[]): Record<string, unknown> | null {
  const completed = schedule.filter(
    (m) =>
      m.playoffTierType === "WINNERS_BRACKET" && m.winner && m.winner !== "UNDECIDED",
  );
  if (completed.length === 0) return null;
  const maxPeriod = Math.max(...completed.map((m) => m.matchupPeriodId as number));
  const finalRound = completed.filter((m) => m.matchupPeriodId === maxPeriod);
  if (finalRound.length === 1) return finalRound[0];
  const semiFinalPeriod = maxPeriod - 1;
  const semiFinals = completed.filter((m) => m.matchupPeriodId === semiFinalPeriod);
  if (semiFinals.length > 0) {
    const semiFinalWinners = new Set<number>();
    for (const sf of semiFinals) {
      const winnerId = sf.winner === "HOME" ? (sf.home as Record<string, unknown>)?.teamId : (sf.away as Record<string, unknown>)?.teamId;
      if (winnerId != null) semiFinalWinners.add(winnerId as number);
    }
    for (const m of finalRound) {
      const homeId = (m.home as Record<string, unknown>)?.teamId;
      const awayId = (m.away as Record<string, unknown>)?.teamId;
      if (
        homeId != null &&
        awayId != null &&
        semiFinalWinners.has(homeId as number) &&
        semiFinalWinners.has(awayId as number)
      ) {
        return m;
      }
    }
  }
  return finalRound[finalRound.length - 1];
}

export type OwnerCareerSeasonRow = {
  season: number;
  teamName: string;
  wins: number;
  losses: number;
  pf: number;
  playoffSeed: number;
  madePlayoffs: boolean;
  isChampion: boolean;
  acquisitions: number;
  drops: number;
  trades: number;
};

export type OwnerCareerProfile = {
  memberId: string;
  leagueId: string;
  ownerName: string;
  /** Distinct franchise / team display names seen across cached seasons */
  teamNames: string[];
  seasons: OwnerCareerSeasonRow[];
  totalWins: number;
  totalLosses: number;
  winPct: number;
  seasonsActive: number;
  yearMin: number;
  yearMax: number;
  championships: number;
  playoffAppearances: number;
  /** e.g. "2019 #2 seed" for seasons that made playoffs */
  playoffSummaries: string[];
  bestSeason: OwnerCareerSeasonRow | null;
  worstSeason: OwnerCareerSeasonRow | null;
  /** Aggregated draft picks for focal team across seasons */
  totalDraftPicks: number;
  positionPickCounts: Record<string, number>;
  round1ByPosition: Record<string, number>;
  round1PickSeasons: number;
  draftStyleHint: string;
  keeperHistoryLines: string[];
  /** One line per season with a round-1 pick (player + position) */
  roundOneNotables: string[];
  avgAcquisitions: number;
  avgDrops: number;
  avgTrades: number;
  mostActiveSeasonNote: string | null;
  quietestSeasonNote: string | null;
};

function isKeeperTrue(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

function classifyDraftStyle(round1ByPosition: Record<string, number>, round1Seasons: number): string {
  if (round1Seasons <= 0) return "Insufficient round-1 data to classify.";
  const entries = Object.entries(round1ByPosition).filter(([, n]) => n > 0);
  if (entries.length === 0) return "Balanced / data-sparse early rounds.";
  entries.sort((a, b) => b[1] - a[1]);
  const [topPos, topN] = entries[0];
  const share = topN / round1Seasons;
  if (topPos === "RB" && share >= 0.5) return "RB-first lean in round 1.";
  if (topPos === "WR" && share >= 0.5) return "WR-heavy lean in round 1.";
  if (topPos === "QB" && share >= 0.35) return "QB-aggressive in round 1.";
  if (topPos === "TE" && share >= 0.25) return "Early-TE aggressive.";
  return "Mixed early-round approach.";
}

/**
 * Build a career profile for the authenticated user's focal owner (active profile + active league cache).
 * Returns null if profile is incomplete or no cached seasons exist for that member in the active league.
 */
export async function buildOwnerCareerProfileForFocalUser(userId: number): Promise<OwnerCareerProfile | null> {
  const co = await resolveCurrentOwner({ id: userId });
  if (!co.isSetupComplete || !co.ownerKey) return null;
  const memberId = co.ownerId;
  if (!memberId) return null;

  const { leagueId } = await resolveActiveLeagueId({ user: { id: userId } }, null, undefined);
  const cachedSeasons = await getAllCachedSeasons(leagueId);
  if (cachedSeasons.length === 0) return null;

  let authority: ChampionshipAuthority | null = null;
  const db = await getDb();
  if (db && leagueId) {
    try {
      authority = await buildChampionshipAuthority({ db, leagueId });
    } catch {
      authority = null;
    }
  }

  let ownerName = "";
  const teamNames: string[] = [];
  const seasonRows: OwnerCareerSeasonRow[] = [];

  let totalWins = 0;
  let totalLosses = 0;
  let championships = 0;
  let playoffAppearances = 0;
  const playoffSummaries: string[] = [];

  let totalAcquisitions = 0;
  let totalDrops = 0;
  let totalTrades = 0;

  const positionPickCounts: Record<string, number> = {};
  const round1ByPosition: Record<string, number> = {};
  let round1PickSeasons = 0;
  const keeperHistoryLines: string[] = [];
  const roundOneNotables: string[] = [];

  const posMap: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST", 17: "D/ST" };

  for (const season of cachedSeasons) {
    const row = await getCachedView(season, "combined", leagueId);
    if (!row) continue;
    const data = row.payload as Record<string, unknown>;
    const members = (data.members as Record<string, unknown>[]) || [];
    const teams = (data.teams as Record<string, unknown>[]) || [];
    const schedule = (data.schedule as Record<string, unknown>[]) || [];
    const settingsNorm = normalizeSettings(data);
    const playoffTeamCount = Math.max(2, Number(settingsNorm.playoffTeamCount) || 6);

    const team = teams.find(
      (t) => t.primaryOwner === memberId || (Array.isArray(t.owners) && (t.owners as string[]).includes(memberId)),
    );
    if (!team) continue;

    if (!ownerName) {
      const m = members.find((x) => x.id === memberId);
      if (m) {
        ownerName =
          `${m.firstName || ""} ${m.lastName || ""}`.trim() || (m.displayName as string) || memberId;
      }
    }

    const teamName =
      (team.name as string) ||
      (team.abbrev as string) ||
      `Team ${String(team.id)}`;
    if (!teamNames.includes(teamName)) teamNames.push(teamName);

    const tc = (team.transactionCounter as Record<string, unknown>) || {};
    const acq = Number(tc.acquisitions) || 0;
    const drops = Number(tc.drops) || 0;
    const trades = Number(tc.trades) || 0;
    totalAcquisitions += acq;
    totalDrops += drops;
    totalTrades += trades;

    const overall = ((team.record as Record<string, unknown>)?.overall as Record<string, unknown>) || {};
    const wins = Number(overall.wins) || 0;
    const losses = Number(overall.losses) || 0;
    totalWins += wins;
    totalLosses += losses;
    const pf =
      Number(team.points) ||
      Number(overall.pointsFor) ||
      0;

    let isChamp = false;
    if (authority) {
      const champTid = authority.championTeamIdBySeason.get(season);
      if (champTid != null && Number(champTid) === Number(team.id)) {
        isChamp = true;
      }
    } else {
      const champByRankP = teams.find((t) => Number(t.rankCalculatedFinal) === 1);
      if (champByRankP) {
        isChamp = Number(champByRankP.id) === Number(team.id);
      } else {
        const champM = findChampionshipMatchup(schedule);
        if (champM) {
          const champTeamId =
            champM.winner === "HOME"
              ? (champM.home as Record<string, unknown>)?.teamId
              : (champM.away as Record<string, unknown>)?.teamId;
          isChamp = Number(champTeamId) === Number(team.id);
        }
      }
    }
    if (isChamp) championships++;

    const playoffSeed = Number(team.playoffSeed) || 0;
    const madePlayoffs = playoffSeed > 0 && playoffSeed <= playoffTeamCount;
    if (madePlayoffs) {
      playoffAppearances++;
      playoffSummaries.push(`${season} #${playoffSeed} seed`);
    }

    seasonRows.push({
      season,
      teamName,
      wins,
      losses,
      pf,
      playoffSeed,
      madePlayoffs,
      isChampion: isChamp,
      acquisitions: acq,
      drops,
      trades,
    });

    const teamIdNum = Number(team.id);
    const picks = normalizeDraftPicks(data).filter((p) => p.teamId === teamIdNum);
    let hadR1 = false;
    for (const p of picks) {
      const pos = p.position && p.position !== "?" ? p.position : posMap[p.positionId as number] || "?";
      positionPickCounts[pos] = (positionPickCounts[pos] || 0) + 1;
      if (p.roundId === 1 && p.playerName) {
        hadR1 = true;
        round1ByPosition[pos] = (round1ByPosition[pos] || 0) + 1;
        roundOneNotables.push(`${season}: ${p.playerName} (${pos}) — round 1`);
      }
      if (isKeeperTrue(p.keeper)) {
        keeperHistoryLines.push(`${season}: ${p.playerName} (Rd${p.roundId}, ${pos})`);
      }
    }
    if (hadR1) round1PickSeasons++;
  }

  if (seasonRows.length === 0) return null;
  if (!ownerName) ownerName = memberId;

  const totalGames = totalWins + totalLosses;
  const winPct = totalGames > 0 ? Math.round((totalWins / totalGames) * 1000) / 10 : 0;
  const seasonsActive = seasonRows.length;
  const years = seasonRows.map((s) => s.season).sort((a, b) => a - b);
  const yearMin = years[0];
  const yearMax = years[years.length - 1];

  const sortedByWinPct = [...seasonRows].sort((a, b) => {
    const ga = a.wins + a.losses;
    const gb = b.wins + b.losses;
    const pa = ga > 0 ? a.wins / ga : 0;
    const pb = gb > 0 ? b.wins / gb : 0;
    if (pb !== pa) return pb - pa;
    return b.pf - a.pf;
  });
  const bestSeason = sortedByWinPct[0] ?? null;
  const worstSeason = sortedByWinPct[sortedByWinPct.length - 1] ?? null;

  const totalDraftPicks = Object.values(positionPickCounts).reduce((s, n) => s + n, 0);

  const avgAcquisitions = seasonsActive > 0 ? Math.round((totalAcquisitions / seasonsActive) * 10) / 10 : 0;
  const avgDrops = seasonsActive > 0 ? Math.round((totalDrops / seasonsActive) * 10) / 10 : 0;
  const avgTrades = seasonsActive > 0 ? Math.round((totalTrades / seasonsActive) * 10) / 10 : 0;

  const activityScore = (s: OwnerCareerSeasonRow) => s.acquisitions + s.trades;
  const most = [...seasonRows].sort((a, b) => activityScore(b) - activityScore(a))[0];
  const least = [...seasonRows].sort((a, b) => activityScore(a) - activityScore(b))[0];
  const mostActiveSeasonNote =
    most && activityScore(most) > 0
      ? `${most.season} (${most.acquisitions} adds, ${most.trades} trades) — ${most.wins}-${most.losses}`
      : null;
  const quietestSeasonNote =
    least && activityScore(least) >= 0
      ? `${least.season} (${least.acquisitions} adds, ${least.trades} trades) — ${least.wins}-${least.losses}`
      : null;

  const draftStyleHint = classifyDraftStyle(round1ByPosition, round1PickSeasons);

  keeperHistoryLines.sort((a, b) => {
    const yA = Number(String(a).split(":")[0]) || 0;
    const yB = Number(String(b).split(":")[0]) || 0;
    return yA - yB;
  });

  return {
    memberId,
    leagueId,
    ownerName,
    teamNames,
    seasons: seasonRows.sort((a, b) => a.season - b.season),
    totalWins,
    totalLosses,
    winPct,
    seasonsActive,
    yearMin,
    yearMax,
    championships,
    playoffAppearances,
    playoffSummaries,
    bestSeason,
    worstSeason,
    totalDraftPicks,
    positionPickCounts,
    round1ByPosition,
    round1PickSeasons,
    draftStyleHint,
    keeperHistoryLines,
    roundOneNotables,
    avgAcquisitions,
    avgDrops,
    avgTrades,
    mostActiveSeasonNote,
    quietestSeasonNote,
  };
}

/**
 * Multiline fact block for LLM user prompts (owner self-review, etc.).
 */
export function formatOwnerCareerProfileFactsBlock(p: OwnerCareerProfile): string {
  const yearSpan = p.yearMin === p.yearMax ? `${p.yearMin}` : `${p.yearMin}–${p.yearMax}`;
  const lines: string[] = [];

  lines.push(
    `CAREER RECORD: ${p.totalWins}W–${p.totalLosses}L (${p.winPct}% win rate) across ${p.seasonsActive} cached season(s) (${yearSpan})`,
  );
  lines.push(
    `CHAMPIONSHIPS: ${p.championships} | PLAYOFF APPEARANCES: ${p.playoffAppearances}/${p.seasonsActive}` +
      (p.playoffSummaries.length ? ` (${p.playoffSummaries.join(", ")})` : ""),
  );

  if (p.bestSeason) {
    lines.push(
      `BEST SEASON (by win rate, tiebreak PF): ${p.bestSeason.season} — ${p.bestSeason.wins}–${p.bestSeason.losses}, seed ${p.bestSeason.playoffSeed || "n/a"}, ${p.bestSeason.pf.toFixed(1)} PF`,
    );
  }
  if (p.worstSeason && p.seasonsActive > 1) {
    lines.push(
      `WORST SEASON (by win rate, tiebreak PF): ${p.worstSeason.season} — ${p.worstSeason.wins}–${p.worstSeason.losses}, seed ${p.worstSeason.playoffSeed || "n/a"}, ${p.worstSeason.pf.toFixed(1)} PF`,
    );
  }

  lines.push(`TEAM NAMES (franchise): ${p.teamNames.length ? p.teamNames.join("; ") : "n/a"}`);

  if (p.totalDraftPicks > 0) {
    const posParts = Object.entries(p.positionPickCounts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([pos, n]) => `${pos}: ${n} (${((n / p.totalDraftPicks) * 100).toFixed(0)}%)`);
    lines.push(`DRAFT PICKS (all rounds, ${p.totalDraftPicks} picks): ${posParts.join(" | ")}`);
    const r1Parts = Object.entries(p.round1ByPosition)
      .filter(([, n]) => n > 0)
      .map(([pos, n]) => `${pos}: ${n} in round 1 across ${p.round1PickSeasons} season(s) with R1 data`);
    lines.push(`ROUND 1 POSITION COUNTS: ${r1Parts.length ? r1Parts.join("; ") : "n/a"}`);
    lines.push(`EARLY-ROUND STYLE (heuristic): ${p.draftStyleHint}`);
  } else {
    lines.push("DRAFT PICKS: No draft pick rows found in cached combined payloads for this franchise.");
  }

  lines.push(
    p.keeperHistoryLines.length
      ? `KEEPER HISTORY (from synced keeper flags): ${p.keeperHistoryLines.join("; ")}`
      : "KEEPER HISTORY: No keeper-flagged picks in cache for this franchise (or none resolved).",
  );
  lines.push(
    "UPCOMING KEEPERS: Resolve from the latest season's draft/keeper data and league rules when present in ESPN sync — not inferred here.",
  );

  lines.push(
    `GM ACTIVITY (per-season averages): ${p.avgAcquisitions} adds/season, ${p.avgDrops} drops/season, ${p.avgTrades} trades/season`,
  );
  if (p.mostActiveSeasonNote) lines.push(`Most active season by adds+trades: ${p.mostActiveSeasonNote}`);
  if (p.quietestSeasonNote) lines.push(`Quietest season by adds+trades: ${p.quietestSeasonNote}`);

  if (p.roundOneNotables.length) {
    lines.push("ROUND 1 NOTABLES (from synced drafts):");
    for (const n of p.roundOneNotables.slice(0, 12)) lines.push(`- ${n}`);
    if (p.roundOneNotables.length > 12) lines.push(`- … (${p.roundOneNotables.length - 12} more)`);
  }

  lines.push("SEASON-BY-SEASON:");
  for (const s of p.seasons) {
    const tag = s.isChampion ? "CHAMPION" : s.madePlayoffs ? "playoffs" : "missed";
    lines.push(
      `  ${s.season}: ${s.teamName} | ${s.wins}-${s.losses} | PF ${s.pf.toFixed(1)} | seed ${s.playoffSeed || "—"} | ${tag} | adds ${s.acquisitions}, drops ${s.drops}, trades ${s.trades}`,
    );
  }

  return lines.join("\n");
}
