/**
 * Deterministic Week Pack inspection — reads existing GM tables.
 * Used for Week 1 certification. Does not invent a second weekly engine.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import {
  fearIndex,
  gmMatchups,
  gmRosterEntries,
  gmStandingsSnapshots,
  gmTeams,
  gmTransactions,
  rfsnStories,
  weeklyPlayerStats,
  weeklyStorylines,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getWeeklySeasonPack } from "./weeklySeasonEngine";
import {
  benchRegretForTeam,
  isStarterSlot,
  leagueWeekMvp,
  loadLineupPlayersForWeek,
  playerOfGameForTeams,
  type BenchRegret,
  type LineupPlayer,
  type PlayerOfGame,
} from "./weeklyLineupOutcomes";

export type InspectedMatchup = {
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  homeOwner: string;
  awayOwner: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: number | null;
  result: string;
  margin: number;
  highestStarter: { name: string; points: number; teamId: number } | null;
  highestBench: { name: string; points: number; teamId: number } | null;
  benchRegret: BenchRegret | null;
  playerOfGame: PlayerOfGame | null;
};

export type DetectedEvent = {
  eventId: string;
  canonicalId: string;
  eventType: string;
  subject: string;
  opponent: string | null;
  facts: Record<string, string | number | boolean | null>;
  confidence: number;
  significance: number;
  source: "Weekly Storylines" | "RFSN Story Engine" | "League Wire" | "Fear Index";
};

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function inspectLeagueWeek(opts: {
  leagueId: string;
  season: number;
  week: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  const { leagueId, season, week } = opts;

  const [teams, matchupRows, statCount, rosterCount, standingsCount, txFresh, storylines, fear, rfsn, packRow] =
    await Promise.all([
      db.select().from(gmTeams).where(and(eq(gmTeams.leagueId, leagueId), eq(gmTeams.season, season))),
      db
        .select()
        .from(gmMatchups)
        .where(and(eq(gmMatchups.leagueId, leagueId), eq(gmMatchups.season, season), eq(gmMatchups.matchupPeriodId, week))),
      db
        .select({ c: sql<number>`COUNT(*)` })
        .from(weeklyPlayerStats)
        .where(and(eq(weeklyPlayerStats.leagueId, leagueId), eq(weeklyPlayerStats.season, season), eq(weeklyPlayerStats.week, week))),
      db
        .select({ c: sql<number>`COUNT(*)` })
        .from(gmRosterEntries)
        .where(and(eq(gmRosterEntries.leagueId, leagueId), eq(gmRosterEntries.season, season), eq(gmRosterEntries.week, week))),
      db
        .select({ c: sql<number>`COUNT(*)` })
        .from(gmStandingsSnapshots)
        .where(and(eq(gmStandingsSnapshots.leagueId, leagueId), eq(gmStandingsSnapshots.season, season), eq(gmStandingsSnapshots.week, week))),
      db
        .select({ maxAt: sql<Date | null>`MAX(${gmTransactions.updatedAt})` })
        .from(gmTransactions)
        .where(and(eq(gmTransactions.leagueId, leagueId), eq(gmTransactions.season, season))),
      db
        .select()
        .from(weeklyStorylines)
        .where(and(eq(weeklyStorylines.leagueId, leagueId), eq(weeklyStorylines.season, season), eq(weeklyStorylines.week, week)))
        .orderBy(desc(weeklyStorylines.intensityScore)),
      db
        .select()
        .from(fearIndex)
        .where(and(eq(fearIndex.leagueId, leagueId), eq(fearIndex.season, season), eq(fearIndex.week, week)))
        .orderBy(desc(fearIndex.fearScore)),
      db.select().from(rfsnStories).where(eq(rfsnStories.leagueId, leagueId)),
      getWeeklySeasonPack(leagueId, season, week),
    ]);

  const teamById = new Map(teams.map((t) => [t.teamId, t]));
  const players = await loadLineupPlayersForWeek(leagueId, season, week);

  const liveMatchupRows = matchupRows.filter((m) => {
    const hs = Number(m.homeScore) || 0;
    const as = Number(m.awayScore) || 0;
    return (Number(m.isCompleted) === 1 || m.winnerTeamId != null) && (hs > 0 || as > 0);
  });
  const matchupSource = liveMatchupRows.length > 0 ? liveMatchupRows : matchupRows;

  const matchups: InspectedMatchup[] = matchupSource.map((m) => {
    const home = teamById.get(m.homeTeamId);
    const away = teamById.get(m.awayTeamId);
    const hs = Number(m.homeScore) || 0;
    const as = Number(m.awayScore) || 0;
    const winner = m.winnerTeamId;
    const margin = r2(Math.abs(hs - as));
    const lineup = players.filter((p) => p.teamId === m.homeTeamId || p.teamId === m.awayTeamId);
    const starters = lineup.filter((p) => isStarterSlot(p.slotId));
    const bench = lineup.filter((p) => p.slotId === 20);
    const highestStarter = starters.length
      ? starters.reduce((a, b) => (b.points > a.points ? b : a))
      : null;
    const highestBench = bench.length ? bench.reduce((a, b) => (b.points > a.points ? b : a)) : null;
    const homeRegret = benchRegretForTeam(players, m.homeTeamId, { teamScore: hs, opponentScore: as });
    const awayRegret = benchRegretForTeam(players, m.awayTeamId, { teamScore: as, opponentScore: hs });
    const benchRegret =
      [homeRegret, awayRegret].filter(Boolean).sort((a, b) => (b!.netImprovement - a!.netImprovement))[0] ?? null;
    const pog = playerOfGameForTeams(players, [m.homeTeamId, m.awayTeamId], {
      [m.homeTeamId]: hs,
      [m.awayTeamId]: as,
    });
    const winnerName = winner === m.homeTeamId ? (home?.name ?? "Home") : winner === m.awayTeamId ? (away?.name ?? "Away") : "TBD";
    return {
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeName: home?.name ?? `Team ${m.homeTeamId}`,
      awayName: away?.name ?? `Team ${m.awayTeamId}`,
      homeOwner: home?.ownerName ?? "",
      awayOwner: away?.ownerName ?? "",
      homeScore: r2(hs),
      awayScore: r2(as),
      winnerTeamId: winner,
      result: m.isCompleted ? `${winnerName} wins` : "incomplete",
      margin,
      highestStarter: highestStarter
        ? { name: highestStarter.playerName, points: r2(highestStarter.points), teamId: highestStarter.teamId }
        : null,
      highestBench: highestBench
        ? { name: highestBench.playerName, points: r2(highestBench.points), teamId: highestBench.teamId }
        : null,
      benchRegret,
      playerOfGame: pog,
    };
  });

  const scores = matchups.flatMap((m) => [
    { teamId: m.homeTeamId, name: m.homeName, owner: m.homeOwner, score: m.homeScore, opp: m.awayName },
    { teamId: m.awayTeamId, name: m.awayName, owner: m.awayOwner, score: m.awayScore, opp: m.homeName },
  ]);
  const completed = matchups.filter((m) => m.winnerTeamId != null);
  const highestTeam = scores.length ? scores.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const lowestTeam = scores.length ? scores.reduce((a, b) => (b.score < a.score ? b : a)) : null;
  const closest = completed.length ? completed.reduce((a, b) => (b.margin < a.margin ? b : a)) : null;
  const blowout = completed.length ? completed.reduce((a, b) => (b.margin > a.margin ? b : a)) : null;
  const avg = scores.length ? r2(scores.reduce((s, x) => s + x.score, 0) / scores.length) : 0;
  const mvp = leagueWeekMvp(players);
  const winFlips = matchups.map((m) => m.benchRegret).filter((r) => r?.impact === "WIN_FLIP");
  const strongestRegret = matchups
    .map((m) => m.benchRegret)
    .filter((r): r is BenchRegret => !!r)
    .sort((a, b) => b.netImprovement - a.netImprovement)[0] ?? null;

  const events: DetectedEvent[] = [];
  if (closest) {
    const pair = [closest.homeTeamId, closest.awayTeamId].sort((a, b) => a - b).join("-");
    events.push({
      eventId: `matchup:${pair}:w${week}:close`,
      canonicalId: `matchup:${pair}:w${week}:close`,
      eventType: "CLOSEST_GAME",
      subject: closest.homeName,
      opponent: closest.awayName,
      facts: { homeScore: closest.homeScore, awayScore: closest.awayScore, margin: closest.margin },
      confidence: 95,
      significance: closest.margin < 5 ? 90 : 70,
      source: "League Wire",
    });
  }
  if (blowout && blowout.margin >= 25) {
    const pair = [blowout.homeTeamId, blowout.awayTeamId].sort((a, b) => a - b).join("-");
    events.push({
      eventId: `matchup:${pair}:w${week}:blowout`,
      canonicalId: `matchup:${pair}:w${week}:blowout`,
      eventType: "BIGGEST_BLOWOUT",
      subject: blowout.homeScore > blowout.awayScore ? blowout.homeName : blowout.awayName,
      opponent: blowout.homeScore > blowout.awayScore ? blowout.awayName : blowout.homeName,
      facts: { homeScore: blowout.homeScore, awayScore: blowout.awayScore, margin: blowout.margin },
      confidence: 95,
      significance: 80,
      source: "League Wire",
    });
  }
  if (highestTeam) {
    events.push({
      eventId: `team:${highestTeam.teamId}:w${week}:statement`,
      canonicalId: `team:${highestTeam.teamId}:w${week}:statement`,
      eventType: "BIGGEST_STATEMENT",
      subject: highestTeam.name,
      opponent: highestTeam.opp,
      facts: { score: highestTeam.score, owner: highestTeam.owner },
      confidence: 90,
      significance: 75,
      source: "League Wire",
    });
  }
  if (mvp) {
    events.push({
      eventId: `player:${mvp.playerId}:w${week}:mvp`,
      canonicalId: `player:${mvp.playerId}:w${week}:mvp`,
      eventType: "LEAGUE_WEEK_MVP",
      subject: mvp.playerName,
      opponent: null,
      facts: { points: r2(mvp.points), teamId: mvp.teamId, position: mvp.position, owner: mvp.ownerName },
      confidence: 90,
      significance: 85,
      source: "League Wire",
    });
  }
  for (const m of matchups) {
    if (m.playerOfGame) {
      events.push({
        eventId: `player:${m.playerOfGame.playerId}:w${week}:pog:${m.homeTeamId}-${m.awayTeamId}`,
        canonicalId: `matchup:${[m.homeTeamId, m.awayTeamId].sort((a, b) => a - b).join("-")}:w${week}:result`,
        eventType: "MATCHUP_PLAYER_OF_GAME",
        subject: m.playerOfGame.playerName,
        opponent: m.homeName === teamById.get(m.playerOfGame.teamId)?.name ? m.awayName : m.homeName,
        facts: { points: r2(m.playerOfGame.points), share: m.playerOfGame.teamScoreShare },
        confidence: 80,
        significance: 40,
        source: "League Wire",
      });
    }
    if (m.benchRegret && m.benchRegret.impact !== "INSIGNIFICANT") {
      const pair = [m.homeTeamId, m.awayTeamId].sort((a, b) => a - b).join("-");
      events.push({
        eventId: `bench:${m.benchRegret.playerId}:w${week}`,
        canonicalId: m.benchRegret.impact === "WIN_FLIP" ? `matchup:${pair}:w${week}:close` : `bench:${m.benchRegret.playerId}:w${week}`,
        eventType: m.benchRegret.impact === "WIN_FLIP" ? "WIN_FLIP_BENCH" : "BENCH_DISASTER",
        subject: m.benchRegret.ownerName,
        opponent: null,
        facts: {
          bench: m.benchRegret.playerName,
          benchPoints: m.benchRegret.benchPoints,
          starter: m.benchRegret.replacedStarterName,
          starterPoints: m.benchRegret.lowestStarterPoints,
          net: m.benchRegret.netImprovement,
          impact: m.benchRegret.impact,
        },
        confidence: 92,
        significance: m.benchRegret.impact === "WIN_FLIP" ? 95 : 70,
        source: "League Wire",
      });
    }
  }
  for (const s of storylines) {
    const pairHint = s.opponentName ? `${s.teamId}:${s.opponentName}` : String(s.teamId);
    events.push({
      eventId: `storyline:${s.storyType}:${s.teamId}:w${week}`,
      canonicalId: s.storyType.includes("HEART") || s.storyType.includes("REVENGE")
        ? `matchup-story:${pairHint}:w${week}`
        : `storyline:${s.storyType}:${s.teamId}:w${week}`,
      eventType: s.storyType,
      subject: s.ownerName,
      opponent: s.opponentName,
      facts: { record: s.record, supportingStat: s.supportingStat, intensity: s.intensityScore },
      confidence: 70,
      significance: s.intensityScore,
      source: "Weekly Storylines",
    });
  }
  for (const f of fear) {
    if (f.heatLabel === "NEUTRAL") continue;
    events.push({
      eventId: `fear:${f.teamId}:w${week}`,
      canonicalId: `fear:${f.teamId}:w${week}`,
      eventType: `FEAR_${f.heatLabel.replace(/\s+/g, "_")}`,
      subject: f.ownerName,
      opponent: null,
      facts: { fearScore: f.fearScore, avgPfLast4: f.avgPfLast4, winStreak: f.winStreak, heat: f.heatLabel },
      confidence: f.avgPfLast4 > 0 ? 75 : 20,
      significance: f.fearScore,
      source: "Fear Index",
    });
  }
  for (const s of rfsn) {
    events.push({
      eventId: s.storyId,
      canonicalId: `rfsn:${s.storyType}:${(s.owners as string[] | null)?.slice().sort().join("-") ?? s.storyId}`,
      eventType: s.storyType,
      subject: ((s.ownerDisplay as string[] | null) ?? []).join(", "),
      opponent: null,
      facts: { status: s.status, priority: s.priority, confidence: s.confidence, headline: s.headline },
      confidence: s.confidence,
      significance: s.priority,
      source: "RFSN Story Engine",
    });
  }

  const byCanonical = new Map<string, DetectedEvent[]>();
  for (const e of events) {
    const arr = byCanonical.get(e.canonicalId) ?? [];
    arr.push(e);
    byCanonical.set(e.canonicalId, arr);
  }

  const categories: Record<string, "DETECTED" | "NO QUALIFYING EVENT" | "INSUFFICIENT DATA"> = {
    biggest_statement: highestTeam ? "DETECTED" : "NO QUALIFYING EVENT",
    closest_escape: closest && closest.margin < 8 ? "DETECTED" : "NO QUALIFYING EVENT",
    heartbreak: storylines.some((s) => s.storyType.includes("HEART")) || winFlips.length ? "DETECTED" : "NO QUALIFYING EVENT",
    biggest_blowout: blowout && blowout.margin >= 25 ? "DETECTED" : "NO QUALIFYING EVENT",
    lineup_masterclass: "INSUFFICIENT DATA",
    meaningful_bench_disaster: strongestRegret ? "DETECTED" : "NO QUALIFYING EVENT",
    player_eruption: mvp && mvp.points >= 25 ? "DETECTED" : "NO QUALIFYING EVENT",
    projection_overperformance: "INSUFFICIENT DATA",
    projection_disappointment: "INSUFFICIENT DATA",
    rivalry_result: storylines.some((s) => s.storyType === "REVENGE_GAME") ? "DETECTED" : "INSUFFICIENT DATA",
    draft_receipt: "INSUFFICIENT DATA",
    roster_strength_confirmed: "INSUFFICIENT DATA",
    roster_weakness_exposed: "INSUFFICIENT DATA",
    championship_path_movement: "INSUFFICIENT DATA",
    waiver_trade_need: "INSUFFICIENT DATA",
  };

  const week0Rosters = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(gmRosterEntries)
    .where(and(eq(gmRosterEntries.leagueId, leagueId), eq(gmRosterEntries.season, season), eq(gmRosterEntries.week, 0)));

  return {
    pack: packRow,
    teams: teams.length,
    matchups,
    completedMatchups: completed.length,
    weeklyStatCount: Number(statCount[0]?.c ?? 0),
    rosterSnapshotCount: Number(rosterCount[0]?.c ?? 0),
    week0RosterCount: Number(week0Rosters[0]?.c ?? 0),
    standingsSnapshotCount: Number(standingsCount[0]?.c ?? 0),
    transactionFreshness: txFresh[0]?.maxAt ?? null,
    storylines,
    fear,
    rfsnStories: rfsn,
    superlatives: {
      highestTeam,
      lowestTeam,
      closest,
      blowout,
      leagueAverage: avg,
      mvp: mvp
        ? { player: mvp.playerName, teamId: mvp.teamId, points: r2(mvp.points), position: mvp.position, owner: mvp.ownerName }
        : null,
      strongestRegret,
      winFlipCount: winFlips.length,
    },
    events,
    rawEventCount: events.length,
    canonicalEventCount: byCanonical.size,
    canonicalGroups: Array.from(byCanonical.entries()).map(([id, group]) => ({
      canonicalId: id,
      count: group.length,
      types: group.map((g) => g.eventType),
      sources: [...new Set(group.map((g) => g.source))],
    })),
    categories,
    players,
  };
}

export function selectNarratives(events: DetectedEvent[]): DetectedEvent[] {
  const ranked = [...events].sort((a, b) => b.significance - a.significance);
  const used = new Set<string>();
  const out: DetectedEvent[] = [];
  for (const e of ranked) {
    if (used.has(e.canonicalId)) continue;
    if (e.significance < 70) continue;
    used.add(e.canonicalId);
    out.push(e);
    if (out.length >= 5) break;
  }
  return out;
}
