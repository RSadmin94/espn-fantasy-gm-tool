import { getDb } from "./server/db";
import { espnSeasonCache } from "./drizzle/schema";
import { eq } from "drizzle-orm";

const ROD_TEAM_ID = 11;
const SEASONS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

async function main() {
  const db = await getDb();

  // Load all combined payloads
  const rows = await db.select().from(espnSeasonCache).where(eq(espnSeasonCache.viewName, "combined"));
  const payloads: Record<number, any> = {};
  for (const row of rows) {
    payloads[row.season] = row.payload;
  }

  // Build member map and team-to-member map across all seasons
  const memberMap: Record<string, { firstName: string; lastName: string; displayName: string }> = {};
  const teamMemberMap: Record<string, Record<number, string>> = {}; // teamId -> season -> memberId

  for (const season of SEASONS) {
    const p = payloads[season];
    if (!p) continue;
    const members: any[] = p.members ?? [];
    for (const m of members) {
      memberMap[m.id] = { firstName: m.firstName, lastName: m.lastName, displayName: m.displayName };
    }
    const teams: any[] = p.teams ?? [];
    for (const t of teams) {
      const tid = String(t.id);
      if (!teamMemberMap[tid]) teamMemberMap[tid] = {};
      const primaryOwner = t.primaryOwner ?? t.owners?.[0];
      if (primaryOwner) teamMemberMap[tid][season] = primaryOwner;
    }
  }

  // Build per-team career stats
  const teamStats: Record<string, {
    teamId: number;
    ownerName: string;
    memberId: string;
    seasons: Array<{ season: number; wins: number; losses: number; pf: number; pa: number; seed: number; rank: number; acquisitions: number; drops: number; trades: number }>;
    draftPicks: Array<{ season: number; round: number; pick: number; position: string; keeper: boolean }>;
    h2hVsRod: Array<{ season: number; week: number; rodScore: number; oppScore: number; rodWon: boolean }>;
  }> = {};

  for (const season of SEASONS) {
    const p = payloads[season];
    if (!p) continue;
    const teams: any[] = p.teams ?? [];
    const schedule: any[] = p.schedule ?? [];
    const draftPicks: any[] = p.draftDetail?.picks ?? [];

    // Deduplicate draft picks
    const seenPicks = new Set<string>();
    const uniquePicks: any[] = [];
    for (const pick of draftPicks) {
      const key = `${season}-${pick.roundId}-${pick.roundPickNumber}-${pick.teamId}`;
      if (!seenPicks.has(key)) { seenPicks.add(key); uniquePicks.push(pick); }
    }

    for (const t of teams) {
      const tid = String(t.id);
      if (t.id === ROD_TEAM_ID) continue; // skip Rod

      const memberId = teamMemberMap[tid]?.[season] ?? "";
      const member = memberMap[memberId];
      const ownerName = member ? `${member.firstName} ${member.lastName}`.trim() : `Team${t.id}`;

      if (!teamStats[tid]) {
        teamStats[tid] = { teamId: t.id, ownerName, memberId, seasons: [], draftPicks: [], h2hVsRod: [] };
      }

      // Season record
      const wins = t.record?.overall?.wins ?? 0;
      const losses = t.record?.overall?.losses ?? 0;
      const pf = t.record?.overall?.pointsFor ?? 0;
      const pa = t.record?.overall?.pointsAgainst ?? 0;
      const seed = t.playoffSeed ?? 99;
      const rank = t.rankFinal ?? 99;
      const tc = t.transactionCounter ?? {};
      teamStats[tid].seasons.push({
        season, wins, losses, pf, pa, seed, rank,
        acquisitions: tc.acquisitions ?? 0,
        drops: tc.drops ?? 0,
        trades: tc.trades ?? 0,
      });

      // Draft picks for this team
      for (const pick of uniquePicks) {
        if (pick.teamId !== t.id) continue;
        const pos = pick.playerInfo?.defaultPositionId;
        const posMap: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
        teamStats[tid].draftPicks.push({
          season,
          round: pick.roundId,
          pick: pick.roundPickNumber,
          position: posMap[pos] ?? "FLEX",
          keeper: pick.keeper ?? false,
        });
      }

      // H2H vs Rod (regular season only)
      for (const matchup of schedule) {
        const isRegular = !matchup.playoffTierType || matchup.playoffTierType === "NONE";
        if (!isRegular) continue;
        const home = matchup.home;
        const away = matchup.away;
        if (!home || !away) continue;
        const homeId = home.teamId;
        const awayId = away.teamId;
        const isRodVsOpp = (homeId === ROD_TEAM_ID && awayId === t.id) || (awayId === ROD_TEAM_ID && homeId === t.id);
        if (!isRodVsOpp) continue;
        const rodIsHome = homeId === ROD_TEAM_ID;
        const rodScore = rodIsHome ? (home.totalPoints ?? 0) : (away.totalPoints ?? 0);
        const oppScore = rodIsHome ? (away.totalPoints ?? 0) : (home.totalPoints ?? 0);
        const winner = matchup.winner;
        const rodWon = winner === (rodIsHome ? "HOME" : "AWAY");
        teamStats[tid].h2hVsRod.push({ season, week: matchup.matchupPeriodId ?? 0, rodScore, oppScore, rodWon });
      }
    }
  }

  // Print summary
  for (const [tid, stats] of Object.entries(teamStats)) {
    const totalW = stats.seasons.reduce((s, r) => s + r.wins, 0);
    const totalL = stats.seasons.reduce((s, r) => s + r.losses, 0);
    const totalPF = stats.seasons.reduce((s, r) => s + r.pf, 0);
    const h2hW = stats.h2hVsRod.filter(m => m.rodWon === false).length;
    const h2hL = stats.h2hVsRod.filter(m => m.rodWon === true).length;
    const picks = stats.draftPicks.length;
    const rb = stats.draftPicks.filter(p => p.position === "RB").length;
    const wr = stats.draftPicks.filter(p => p.position === "WR").length;
    const qb = stats.draftPicks.filter(p => p.position === "QB").length;
    const te = stats.draftPicks.filter(p => p.position === "TE").length;
    const avgAcq = stats.seasons.length ? (stats.seasons.reduce((s, r) => s + r.acquisitions, 0) / stats.seasons.length).toFixed(1) : "0";
    const avgTrades = stats.seasons.length ? (stats.seasons.reduce((s, r) => s + r.trades, 0) / stats.seasons.length).toFixed(1) : "0";
    console.log(`\n=== ${stats.ownerName} (Team ${tid}) ===`);
    console.log(`  Member ID: ${stats.memberId}`);
    console.log(`  Career: ${totalW}W-${totalL}L | PF: ${totalPF.toFixed(0)} | ${stats.seasons.length} seasons`);
    console.log(`  H2H vs Rod: ${h2hW}W-${h2hL}L`);
    console.log(`  Draft: ${picks} picks | RB:${rb} WR:${wr} QB:${qb} TE:${te}`);
    console.log(`  Activity: ${avgAcq} adds/season, ${avgTrades} trades/season`);
    console.log(`  Seasons: ${stats.seasons.map(s => `${s.season}(${s.wins}-${s.losses})`).join(", ")}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
