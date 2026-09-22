/**
 * storyEngine/storyFacts.ts
 * ─────────────────────────
 * Authority adapter: assembles the deterministic StoryLeagueFacts for a league
 * by REUSING existing trusted sources — never a parallel model:
 *   • ChampionshipAuthority (titles per owner)      → dynasty / chase / redemption
 *   • teams rows (owner-season records)             → rise / collapse / historic
 *   • H2HAuthority (head-to-head)                    → rivalry
 *
 * Trade Saga, Reach and Steal detectors are implemented and tested, but their
 * inputs are left empty here as an explicit second-pass wiring hook (see TODOs).
 * Empty input => those detectors emit nothing, so no unverified story ever ships.
 *
 * This is the only Story Engine file that reaches for the database; it is not
 * unit-tested (the pure engine is).
 */
import { getDb } from "../db";
import { gmTeams } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { buildChampionshipAuthority } from "../championshipAuthority";
import { buildH2HAuthority } from "../h2hAuthority";
import type {
  OwnerFacts,
  OwnerSeasonRecord,
  RivalryFacts,
  StoryLeagueFacts,
} from "./storyTypes";

const emptyFacts = (leagueId: string): StoryLeagueFacts => ({
  leagueId,
  currentSeason: 0,
  latestCompletedSeason: null,
  owners: [],
  rivalries: [],
  tradeSagas: [],
  draftPicks: [],
  leagueRecordWins: null,
});

interface OwnerAgg {
  ownerKey: string;
  displayName: string;
  seasons: Map<number, OwnerSeasonRecord>;
}

/** Build owner-season records from teams rows, keyed by canonical owner id. */
function aggregateOwners(
  rows: Array<typeof gmTeams.$inferSelect>,
  canonicalKey: (ownerId: string | null | undefined) => string,
): Map<string, OwnerAgg> {
  const byKey = new Map<string, OwnerAgg>();
  for (const r of rows) {
    if (!r.ownerId) continue; // skip legacy rows without a resolvable owner id
    const key = canonicalKey(r.ownerId);
    if (!key) continue;
    let agg = byKey.get(key);
    if (!agg) {
      agg = { ownerKey: key, displayName: r.ownerName || key, seasons: new Map() };
      byKey.set(key, agg);
    }
    if (r.ownerName) agg.displayName = r.ownerName; // latest non-empty name wins
    agg.seasons.set(r.season, {
      season: r.season,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pointsFor: Number(r.pointsFor) || 0,
      finalStanding: r.finalStanding ?? null,
      playoffSeed: r.playoffSeed ?? null,
      madePlayoffs: r.playoffSeed != null,
    });
  }
  return byKey;
}

/** Head-to-head pairs → RivalryFacts (A's perspective; each unordered pair once). */
async function buildRivalries(leagueId: string): Promise<RivalryFacts[]> {
  const h2h = await buildH2HAuthority(leagueId);
  const persons = h2h.listPersons();
  const out: RivalryFacts[] = [];
  for (const a of persons) {
    for (const b of h2h.opponentsOf(a)) {
      if (!(a < b)) continue; // dedupe unordered pair
      const r = h2h.getH2H(a, b);
      if (r.career.games <= 0 && r.playoffs.games <= 0) continue;
      out.push({
        ownerA: r.personA,
        ownerB: r.personB,
        displayA: r.displayA,
        displayB: r.displayB,
        games: r.career.games,
        winsA: r.career.wins,
        winsB: r.career.losses, // A's losses = B's wins
        ties: r.career.ties,
        playoffGames: r.playoffs.games,
        lastMeetingSeason: r.lastMeeting?.season ?? null,
        streakType: r.streak.type,
        streakCount: r.streak.count,
      });
    }
  }
  return out;
}

/** Assemble the complete deterministic fact set for a league. */
export async function buildStoryLeagueFacts(leagueId: string): Promise<StoryLeagueFacts> {
  const db = await getDb();
  if (!db) return emptyFacts(leagueId);

  const champ = await buildChampionshipAuthority({ db, leagueId });
  const rows = (await db
    .select()
    .from(gmTeams)
    .where(eq(gmTeams.leagueId, leagueId))) as Array<typeof gmTeams.$inferSelect>;

  if (rows.length === 0) return emptyFacts(leagueId);

  const ownersAgg = aggregateOwners(rows, champ.canonicalKeyForOwnerId);
  const currentSeason = rows.reduce((m, r) => Math.max(m, r.season), 0);
  const latestCompletedSeason = champ.latestCompletedSeason;

  const owners: OwnerFacts[] = [...ownersAgg.values()].map((agg) => {
    const titleSeasons = champ.championSeasonsByKey.get(agg.ownerKey) ?? [];
    return {
      ownerKey: agg.ownerKey,
      displayName: agg.displayName,
      seasons: [...agg.seasons.values()].sort((a, b) => a.season - b.season),
      titleSeasons: [...titleSeasons],
      totalTitles: champ.titlesByKey.get(agg.ownerKey) ?? titleSeasons.length,
    };
  });

  // best single-season win total from COMPLETED seasons (the record to chase).
  let leagueRecordWins: number | null = null;
  for (const o of owners) {
    for (const s of o.seasons) {
      if (s.season >= currentSeason) continue;
      if (leagueRecordWins == null || s.wins > leagueRecordWins) leagueRecordWins = s.wins;
    }
  }

  const rivalries = await buildRivalries(leagueId);

  return {
    leagueId,
    currentSeason,
    latestCompletedSeason,
    owners,
    rivalries,
    tradeSagas: [], // TODO(next pass): wire from completedTradeAuthority (repeat trades)
    draftPicks: [], // TODO(next pass): wire reach/steal from draft board + expected ADP
    leagueRecordWins,
  };
}
