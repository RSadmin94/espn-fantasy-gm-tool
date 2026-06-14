/**
 * Draft Reality Simulator engine.
 *
 * Answers: "What would standings look like if nobody made a roster move after draft day?"
 * For each owner we take their DRAFT-DAY roster (draftDetail.picks), then for every week we
 * compute the optimal BEST-BALL lineup from ONLY those drafted players (using real weekly
 * points already ingested into gm_weekly_player_stats), replay the actual schedule with those
 * draft-only scores, and produce Draft-Only Standings. Compared against Actual Standings, this
 * separates draft skill from in-season roster management.
 *
 * Data sources (all real, no fabrication):
 *  - draftDetail.picks[]  (espn_raw_cache 'combined')  -> draft-day rosters per owner GUID
 *  - settings.rosterSettings.lineupSlotCounts           -> best-ball starting slot rules
 *  - schedule[]                                         -> weekly pairings + actual team scores
 *  - teams[]                                            -> actual records, finalStanding, owner identity
 *  - gm_weekly_player_stats                             -> real per-player weekly points
 *  - gm_player_registry                                 -> espnPlayerId <-> internal playerId
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Phase B8: LEAGUE_ID constant removed — leagueId is passed in by callers.

// ESPN defaultPositionId -> our position label (for draft picks, which carry ESPN player ids)
const POS_BY_DEF_ID: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };

// Which positions can fill each starting lineup slot (ESPN lineupSlotId -> eligible positions)
const SLOT_ELIGIBLE: Record<number, string[]> = {
  0: ["QB"],
  2: ["RB"],
  4: ["WR"],
  6: ["TE"],
  15: ["D/ST"],
  16: ["D/ST"],
  17: ["K"],
  23: ["RB", "WR", "TE"], // FLEX
};
const BENCH_SLOTS = new Set([20, 21, 24]); // bench, IR, taxi — not starting slots

export type OwnerImpact = {
  ownerKey: string;
  ownerName: string;
  teamId: number | null;
  actualRank: number | null;
  actualRecord: string;
  actualPointsFor: number;
  draftRank: number | null;
  draftRecord: string;
  draftPointsFor: number;
  rankDelta: number | null;       // actual - draft (positive = roster mgmt helped)
  pointsAddedByMgmt: number;       // actual PF - draft-only PF
  draftGrade: number;              // 0-100
  rosterMgmtGrade: number;         // 0-100
  overallGrade: number;            // 0-100
  draftedPlayerCount: number;
};

export type StandingRow = {
  rank: number;
  ownerKey: string;
  ownerName: string;
  teamId: number | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
};

export type DraftRealityResult = {
  season: number;
  leagueId: string;
  teamCount: number;
  weeksSimulated: number;
  /** Distinct matchup periods present on the ESPN schedule payload for this season. */
  scheduleMatchupWeeks: number;
  confidence: "High" | "Medium" | "Limited";
  confidenceReason: string;
  actualStandings: StandingRow[];
  draftOnlyStandings: StandingRow[];
  ownerImpacts: OwnerImpact[];
  superlatives: Record<string, { ownerKey: string; ownerName: string; value: number; label: string } | null>;
  insights: string[];
};

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return Array.isArray(res[0]) ? res[0] : res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}

function r2(n: number): number { return Math.round(n * 100) / 100; }
function clamp(n: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, n)); }

export async function computeDraftReality(season: number, leagueId: string): Promise<DraftRealityResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // 1) Load the combined cache payload for this season (draft, schedule, settings, teams, members)
  const cacheRows = rowsOf(await db.execute(
    sql`SELECT payload FROM espn_raw_cache WHERE leagueId=${leagueId} AND season=${season} AND viewName='combined' LIMIT 1`
  ));
  if (!cacheRows[0]?.payload) throw new Error(`No combined cache for season ${season}`);
  const combined = typeof cacheRows[0].payload === "string" ? JSON.parse(cacheRows[0].payload) : cacheRows[0].payload;

  const members: any[] = combined.members ?? [];
  const nameByGuid = new Map<string, string>();
  for (const m of members) {
    const nm = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.displayName || m.id;
    nameByGuid.set(m.id, nm);
  }

  // teamId -> owner GUID (from teams[].owners), and the actual record/standing
  const teams: any[] = combined.teams ?? [];
  const ownerByTeamId = new Map<number, string>();
  for (const t of teams) {
    const guid = Array.isArray(t.owners) && t.owners.length ? t.owners[0] : null;
    if (guid) ownerByTeamId.set(Number(t.id), guid);
  }

  // 2) Best-ball starting slot rules from settings
  const slotCounts: Record<string, number> = combined.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const startingSlots: { slotId: number; count: number }[] = [];
  for (const [slotId, count] of Object.entries(slotCounts)) {
    const sid = Number(slotId);
    const c = Number(count);
    if (c > 0 && !BENCH_SLOTS.has(sid) && SLOT_ELIGIBLE[sid]) startingSlots.push({ slotId: sid, count: c });
  }

  // 3) Draft-day rosters: owner GUID -> set of drafted ESPN player ids
  const picks: any[] = combined.draftDetail?.picks ?? [];
  const draftedByOwner = new Map<string, Set<number>>();
  for (const p of picks) {
    // ESPN sometimes returns picks with a blank/missing memberId (owner GUID). When that
    // happens, resolve the owner from the pick's teamId via the combined-cache team map,
    // so the owner's drafted roster is still attributed instead of silently dropping that
    // owner from the simulation for the whole season.
    const rawGuid = typeof p.memberId === "string" ? p.memberId.trim() : "";
    const guid: string | null = rawGuid || ownerByTeamId.get(Number(p.teamId)) || null;
    const espnId = Number(p.playerId);
    if (!guid || !Number.isFinite(espnId) || espnId <= 0) continue;
    if (!draftedByOwner.has(guid)) draftedByOwner.set(guid, new Set());
    draftedByOwner.get(guid)!.add(espnId);
  }

  // 4) Weekly per-player points: map espnPlayerId -> { week -> points, position }
  //    Join gm_weekly_player_stats to registry to get espnPlayerId + position.
  const statRows = rowsOf(await db.execute(sql`
    SELECT w.week AS week, w.pointsScored AS pts, w.ownerKey AS ownerKey,
           r.espnPlayerId AS espnId, r.position AS position
    FROM gm_weekly_player_stats w
    JOIN gm_player_registry r ON r.id = w.playerId
    INNER JOIN teams t ON w.teamId IS NOT NULL AND w.teamId = t.teamId AND w.season = t.season AND t.leagueId = ${leagueId}
    WHERE w.season = ${season}
  `));

  // espnId -> position (from registry, stable across weeks)
  const posByEspnId = new Map<number, string>();
  // espnId -> (week -> bestPoints)  (max across any roster entry; dedupe safety)
  const weeklyByEspnId = new Map<number, Map<number, number>>();
  const weeksSeen = new Set<number>();
  for (const row of statRows) {
    const espnId = Number(row.espnId);
    const wk = Number(row.week);
    const pts = Number(row.pts);
    if (!Number.isFinite(espnId) || !Number.isFinite(wk)) continue;
    weeksSeen.add(wk);
    if (row.position) posByEspnId.set(espnId, String(row.position));
    if (!weeklyByEspnId.has(espnId)) weeklyByEspnId.set(espnId, new Map());
    const m = weeklyByEspnId.get(espnId)!;
    if (!m.has(wk) || pts > (m.get(wk) as number)) m.set(wk, pts);
  }
  const allWeeks = [...weeksSeen].sort((a, b) => a - b);
  const weeksSimulated = allWeeks.length;

  // Helper: position for a drafted ESPN id — prefer weekly registry, fall back to draft pick's slot mapping
  const draftPosByEspnId = new Map<number, string>();
  for (const p of picks) {
    const espnId = Number(p.playerId);
    if (!Number.isFinite(espnId)) continue;
    // draft pick lineupSlotId reflects the slot the player was drafted into; map via SLOT_ELIGIBLE primary pos
    const elig = SLOT_ELIGIBLE[Number(p.lineupSlotId)];
    if (elig && elig.length === 1) draftPosByEspnId.set(espnId, elig[0]);
  }
  function positionOf(espnId: number): string | null {
    return posByEspnId.get(espnId) ?? draftPosByEspnId.get(espnId) ?? null;
  }

  // 5) For each owner, compute draft-only optimal weekly score (best-ball from drafted players only)
  function bestBallWeekScore(draftedIds: Set<number>, week: number): number {
    // Build candidate list: drafted players who have a score this week, with position + points
    const candidates: { espnId: number; pos: string; pts: number }[] = [];
    for (const espnId of draftedIds) {
      const wkMap = weeklyByEspnId.get(espnId);
      if (!wkMap || !wkMap.has(week)) continue; // player had no recorded points that week
      const pos = positionOf(espnId);
      if (!pos) continue;
      candidates.push({ espnId, pos, pts: wkMap.get(week) as number });
    }
    // Greedy optimal fill: dedicated slots first (most constrained), then FLEX from remaining best.
    candidates.sort((a, b) => b.pts - a.pts);
    const used = new Set<number>();
    let total = 0;
    // dedicated (single-position) slots first
    for (const slot of startingSlots) {
      const elig = SLOT_ELIGIBLE[slot.slotId];
      if (elig.length !== 1) continue;
      let filled = 0;
      for (const c of candidates) {
        if (filled >= slot.count) break;
        if (used.has(c.espnId)) continue;
        if (c.pos === elig[0]) { used.add(c.espnId); total += c.pts; filled++; }
      }
    }
    // multi-position (FLEX) slots from best remaining eligible
    for (const slot of startingSlots) {
      const elig = SLOT_ELIGIBLE[slot.slotId];
      if (elig.length === 1) continue;
      let filled = 0;
      for (const c of candidates) {
        if (filled >= slot.count) break;
        if (used.has(c.espnId)) continue;
        if (elig.includes(c.pos)) { used.add(c.espnId); total += c.pts; filled++; }
      }
    }
    return r2(total);
  }

  // Precompute draft-only weekly scores per owner
  const draftWeeklyScore = new Map<string, Map<number, number>>(); // ownerKey -> week -> score
  for (const [guid, draftedIds] of draftedByOwner) {
    const wkMap = new Map<number, number>();
    for (const wk of allWeeks) wkMap.set(wk, bestBallWeekScore(draftedIds, wk));
    draftWeeklyScore.set(guid, wkMap);
  }

  // 6) Replay actual schedule with draft-only scores -> draft-only W/L + PF
  type Rec = { wins: number; losses: number; ties: number; pf: number };
  const draftRec = new Map<string, Rec>();
  const ensure = (g: string) => { if (!draftRec.has(g)) draftRec.set(g, { wins: 0, losses: 0, ties: 0, pf: 0 }); return draftRec.get(g)!; };

  const schedule: any[] = combined.schedule ?? [];
  const scheduleWeekNums = new Set<number>();
  for (const m of schedule) {
    const wk = Number(m.matchupPeriodId);
    if (Number.isFinite(wk) && wk > 0) scheduleWeekNums.add(wk);
  }
  const scheduleMatchupWeeks = scheduleWeekNums.size;
  for (const m of schedule) {
    const week = Number(m.matchupPeriodId);
    if (!allWeeks.includes(week)) continue; // only simulate weeks we have player data for (regular weeks)
    const homeTid = Number(m.home?.teamId);
    const awayTid = Number(m.away?.teamId);
    const homeGuid = ownerByTeamId.get(homeTid);
    const awayGuid = ownerByTeamId.get(awayTid);
    if (!homeGuid || !awayGuid) continue;
    const hs = draftWeeklyScore.get(homeGuid)?.get(week) ?? 0;
    const as = draftWeeklyScore.get(awayGuid)?.get(week) ?? 0;
    const hRec = ensure(homeGuid); const aRec = ensure(awayGuid);
    hRec.pf += hs; aRec.pf += as;
    if (hs > as) { hRec.wins++; aRec.losses++; }
    else if (as > hs) { aRec.wins++; hRec.losses++; }
    else { hRec.ties++; aRec.ties++; }
  }

  // 7) Actual standings from teams[]
  const actualByOwner = new Map<string, { teamId: number; wins: number; losses: number; ties: number; pf: number; finalStanding: number | null }>();
  for (const t of teams) {
    const guid = Array.isArray(t.owners) && t.owners.length ? t.owners[0] : null;
    if (!guid) continue;
    const rec = (t.record?.overall) ?? {};
    actualByOwner.set(guid, {
      teamId: Number(t.id),
      wins: Number(rec.wins ?? 0),
      losses: Number(rec.losses ?? 0),
      ties: Number(rec.ties ?? 0),
      pf: r2(Number(rec.pointsFor ?? 0)),
      finalStanding: t.rankCalculatedFinal != null ? Number(t.rankCalculatedFinal) : null,
    });
  }

  // Build standings arrays
  function rankRecords(recMap: Map<string, Rec>): StandingRow[] {
    const arr: StandingRow[] = [];
    for (const [guid, rec] of recMap) {
      arr.push({
        rank: 0, ownerKey: guid, ownerName: nameByGuid.get(guid) ?? guid,
        teamId: actualByOwner.get(guid)?.teamId ?? null,
        wins: rec.wins, losses: rec.losses, ties: rec.ties, pointsFor: r2(rec.pf),
      });
    }
    arr.sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));
    arr.forEach((row, i) => { row.rank = i + 1; });
    return arr;
  }
  const draftOnlyStandings = rankRecords(draftRec);

  const actualStandings: StandingRow[] = [...actualByOwner.entries()]
    .map(([guid, a]) => ({
      rank: 0, ownerKey: guid, ownerName: nameByGuid.get(guid) ?? guid, teamId: a.teamId,
      wins: a.wins, losses: a.losses, ties: a.ties, pointsFor: a.pf,
    }))
    .sort((x, y) => (x.rank) - (y.rank));
  // rank actual by finalStanding when present, else by wins/pf
  actualStandings.sort((a, b) => {
    const fa = actualByOwner.get(a.ownerKey)?.finalStanding ?? 999;
    const fb = actualByOwner.get(b.ownerKey)?.finalStanding ?? 999;
    if (fa !== fb) return fa - fb;
    return (b.wins - a.wins) || (b.pointsFor - a.pointsFor);
  });
  actualStandings.forEach((row, i) => { row.rank = i + 1; });

  const draftRankByOwner = new Map(draftOnlyStandings.map(r => [r.ownerKey, r.rank]));
  const actualRankByOwner = new Map(actualStandings.map(r => [r.ownerKey, r.rank]));

  // 8) Owner impacts + grades
  const ownerImpacts: OwnerImpact[] = [];
  const n = Math.max(actualStandings.length, draftOnlyStandings.length);
  for (const [guid, drafted] of draftedByOwner) {
    const a = actualByOwner.get(guid);
    const draftRow = draftOnlyStandings.find(r => r.ownerKey === guid);
    const actualRank = actualRankByOwner.get(guid) ?? null;
    const draftRank = draftRankByOwner.get(guid) ?? null;
    const actualPF = a?.pf ?? 0;
    const draftPF = draftRow?.pointsFor ?? 0;
    const rankDelta = (actualRank != null && draftRank != null) ? (draftRank - actualRank) : null; // positive = mgmt improved finish

    // Draft Grade: how good the draft-only finish was (1st = 100, last = ~0)
    const draftGrade = draftRank != null ? clamp(100 * (n - draftRank) / Math.max(1, n - 1)) : 50;
    // Roster Mgmt Grade: did actual outperform draft baseline? center 50 = neutral; scaled by rank improvement
    const mgmtRaw = rankDelta != null ? 50 + rankDelta * (50 / Math.max(1, n - 1)) : 50;
    const rosterMgmtGrade = clamp(mgmtRaw);
    const overallGrade = clamp(0.55 * draftGrade + 0.45 * rosterMgmtGrade);

    ownerImpacts.push({
      ownerKey: guid,
      ownerName: nameByGuid.get(guid) ?? guid,
      teamId: a?.teamId ?? null,
      actualRank, actualRecord: a ? `${a.wins}-${a.losses}${a.ties ? "-" + a.ties : ""}` : "—",
      actualPointsFor: actualPF,
      draftRank, draftRecord: draftRow ? `${draftRow.wins}-${draftRow.losses}${draftRow.ties ? "-" + draftRow.ties : ""}` : "—",
      draftPointsFor: draftPF,
      rankDelta,
      pointsAddedByMgmt: r2(actualPF - draftPF),
      draftGrade: Math.round(draftGrade),
      rosterMgmtGrade: Math.round(rosterMgmtGrade),
      overallGrade: Math.round(overallGrade),
      draftedPlayerCount: drafted.size,
    });
  }
  ownerImpacts.sort((a, b) => b.overallGrade - a.overallGrade);

  // 9) Superlatives
  function pick(arr: OwnerImpact[], keyFn: (o: OwnerImpact) => number, label: string, hi = true) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => hi ? keyFn(b) - keyFn(a) : keyFn(a) - keyFn(b));
    const top = sorted[0];
    return { ownerKey: top.ownerKey, ownerName: top.ownerName, value: r2(keyFn(top)), label };
  }
  const superlatives = {
    bestDrafter: pick(ownerImpacts, o => o.draftGrade, "Best Drafter"),
    bestManager: pick(ownerImpacts, o => o.rosterMgmtGrade, "Best Roster Manager"),
    mostImproved: pick(ownerImpacts, o => o.rankDelta ?? -99, "Most Improved by Management"),
    draftFraud: pick(ownerImpacts, o => -(o.rankDelta ?? 0), "Draft Fraud (great draft, fell off)"),
    pointsAddedKing: pick(ownerImpacts, o => o.pointsAddedByMgmt, "Most Points Added by Moves"),
    draftSteal: pick(ownerImpacts, o => o.draftPointsFor, "Highest Draft-Only Points"),
  };

  // 10) Deterministic insights
  const insights: string[] = [];
  if (scheduleMatchupWeeks > 0 && weeksSimulated > 0 && scheduleMatchupWeeks > weeksSimulated) {
    insights.push(
      `ESPN's schedule lists ${scheduleMatchupWeeks} matchup period${scheduleMatchupWeeks === 1 ? "" : "s"}; draft-only replay used ${weeksSimulated} where per-player points exist for this league in the database. Actual wins and losses still reflect the full ESPN team record.`,
    );
  }
  const champ = actualStandings[0];
  if (champ) {
    const ci = ownerImpacts.find(o => o.ownerKey === champ.ownerKey);
    if (ci) insights.push(`${champ.ownerName} won the league; their draft-only finish would have been #${ci.draftRank ?? "?"} (draft grade ${ci.draftGrade}/100, management grade ${ci.rosterMgmtGrade}/100).`);
  }
  const biggestClimber = [...ownerImpacts].sort((a, b) => (b.rankDelta ?? -99) - (a.rankDelta ?? -99))[0];
  if (biggestClimber && (biggestClimber.rankDelta ?? 0) > 0)
    insights.push(`${biggestClimber.ownerName} gained ${biggestClimber.rankDelta} spots through in-season moves vs their draft-only baseline — the league's strongest roster management.`);
  const biggestFaller = [...ownerImpacts].sort((a, b) => (a.rankDelta ?? 99) - (b.rankDelta ?? 99))[0];
  if (biggestFaller && (biggestFaller.rankDelta ?? 0) < 0)
    insights.push(`${biggestFaller.ownerName} drafted well (draft-only #${biggestFaller.draftRank}) but finished #${biggestFaller.actualRank} — a ${Math.abs(biggestFaller.rankDelta!)}-spot decline after draft day.`);

  // 11) Confidence
  let confidence: DraftRealityResult["confidence"] = "High";
  let confidenceReason = "Full weekly per-player data and complete draft rosters.";
  const avgDrafted = [...draftedByOwner.values()].reduce((s, x) => s + x.size, 0) / Math.max(1, draftedByOwner.size);
  if (avgDrafted < 10) { confidence = "Limited"; confidenceReason = "Sparse draft rosters captured."; }
  else if (weeksSimulated < 14) { confidence = "Medium"; confidenceReason = `Only ${weeksSimulated} weeks of player data available.`; }

  return {
    season, leagueId,
    teamCount: actualStandings.length,
    weeksSimulated,
    scheduleMatchupWeeks,
    confidence,
    confidenceReason,
    actualStandings, draftOnlyStandings, ownerImpacts, superlatives, insights,
  };
}
