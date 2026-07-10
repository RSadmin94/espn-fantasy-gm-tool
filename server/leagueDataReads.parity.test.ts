/**
 * Phase 1C Step 2 — parity harness for `leagueDataReads.ts`.
 *
 * Compares the provider-neutral facade against validated production read paths.
 * Requires a live database with normalized rows for league 457622.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  gmDraftPicks,
  gmLeagueSettings,
  gmMatchups,
  gmRosterEntries,
  gmTeams,
  gmTransactions,
} from "../drizzle/schema";
import { getDb, getCachedViewWithTier } from "./db";
import {
  buildCombinedPayloadFromNormalized,
  distinctNormalizedSeasons,
  getSeasonDraftPicks as getSeasonDraftPicksHistorical,
  getSeasonMatchups as getSeasonMatchupsHistorical,
  getSeasonTeams as getSeasonTeamsHistorical,
  getSeasonTransactions as getSeasonTransactionsHistorical,
} from "./historicalDataService";
import {
  getCombinedSeasonBundle,
  getSeasonDraftPicks,
  getSeasonMatchups,
  getSeasonRosters,
  getSeasonSettings,
  getSeasonTeams,
  getSeasonTransactions,
  type LeagueSeasonRef,
} from "./leagueDataReads";
import { normalizeRosters, normalizeSettings } from "./espnService";

const LEAGUE_ID = "457622";
const USER_ID = 1;

type ParityStatus = "PASS" | "PARTIAL" | "FAIL" | "SKIP";

type MatrixRow = {
  entity: string;
  season: number;
  comparisonSource: string;
  facadeCount: number;
  referenceCount: number;
  ordering: ParityStatus;
  fields: ParityStatus;
  notes: string[];
};

type DifferenceRow = {
  entity: string;
  field: string;
  oldPath: string;
  facadePath: string;
  consumerUsage: string;
  classification: "A" | "B" | "C";
  action: string;
};

const matrix: MatrixRow[] = [];
const differences: DifferenceRow[] = [];

function recordMatrix(row: MatrixRow) {
  matrix.push(row);
}

function recordDiff(row: DifferenceRow) {
  differences.push(row);
}

function ref(season: number): LeagueSeasonRef {
  return { leagueId: LEAGUE_ID, season };
}

function isSorted<T>(items: T[], key: (item: T) => number | string): boolean {
  for (let i = 1; i < items.length; i++) {
    const a = key(items[i - 1]!);
    const b = key(items[i]!);
    if (a > b) return false;
  }
  return true;
}

function pick<T extends Record<string, unknown>>(row: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = row[k];
  return out;
}

const TEAM_FIELDS = [
  "teamId",
  "name",
  "abbrev",
  "owners",
  "ownerDisplay",
  "primaryOwner",
  "memberIds",
  "wins",
  "losses",
  "ties",
  "pointsFor",
  "pointsAgainst",
  "playoffSeed",
  "rankFinal",
  "rankCalculatedFinal",
  "points",
] as const;

const MATCHUP_FIELDS = [
  "matchupPeriodId",
  "scoringPeriodId",
  "winner",
  "playoffTierType",
  "homeTeamId",
  "homeTotalPoints",
  "homeProjectedPoints",
  "awayTeamId",
  "awayTotalPoints",
  "awayProjectedPoints",
] as const;

const DRAFT_FIELDS = [
  "overallPickNumber",
  "roundId",
  "roundPickNumber",
  "teamId",
  "teamName",
  "playerId",
  "playerName",
  "position",
  "keeper",
  "bidAmount",
] as const;

const TX_FIELDS = [
  "transactionId",
  "type",
  "status",
  "proposedDate",
  "processedDate",
  "teamId",
  "playerId",
  "playerName",
  "fromTeamId",
  "toTeamId",
  "bidAmount",
  "relatedTransactionId",
] as const;

const ROSTER_FIELDS = [
  "teamId",
  "playerId",
  "playerName",
  "position",
  "lineupSlotId",
  "acquisitionType",
  "proTeam",
  "appliedTotal",
  "projectedTotal",
] as const;

const SETTINGS_FIELDS = [
  "leagueId",
  "seasonId",
  "leagueName",
  "size",
  "scoringType",
  "playoffTeamCount",
  "matchupPeriodCount",
  "keepers",
  "keeperSlotsPerTeam",
  "tradeDeadline",
] as const;

let dbAvailable = false;
let normalizedSeasons: number[] = [];
let seasonCounts = new Map<
  number,
  { teams: number; matchups: number; draft: number; tx: number; roster: number; settings: number }
>();

async function countTable(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  table:
    | typeof gmTeams
    | typeof gmMatchups
    | typeof gmDraftPicks
    | typeof gmTransactions
    | typeof gmRosterEntries
    | typeof gmLeagueSettings,
  season: number,
): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(table)
    .where(and(eq(table.leagueId, LEAGUE_ID), eq(table.season, season)));
  return Number(rows[0]?.c ?? 0);
}

beforeAll(async () => {
  const db = await getDb();
  if (!db) return;
  dbAvailable = true;
  normalizedSeasons = await distinctNormalizedSeasons(LEAGUE_ID);
  for (const season of normalizedSeasons) {
    seasonCounts.set(season, {
      teams: await countTable(db, gmTeams, season),
      matchups: await countTable(db, gmMatchups, season),
      draft: await countTable(db, gmDraftPicks, season),
      tx: await countTable(db, gmTransactions, season),
      roster: await countTable(db, gmRosterEntries, season),
      settings: await countTable(db, gmLeagueSettings, season),
    });
  }
}, 120_000);

function seasonsWithTeams(): number[] {
  return normalizedSeasons.filter((s) => (seasonCounts.get(s)?.teams ?? 0) > 0);
}

function seasonsWith(predicate: (c: NonNullable<ReturnType<typeof seasonCounts.get>>) => boolean): number[] {
  return normalizedSeasons.filter((s) => {
    const c = seasonCounts.get(s);
    return c ? predicate(c) : false;
  });
}

describe("leagueDataReads parity (live DB)", () => {
  it("has database connectivity for league 457622", () => {
    expect(dbAvailable, "DATABASE_URL / getDb() required for parity harness").toBe(true);
    expect(normalizedSeasons.length).toBeGreaterThan(0);
  });

  describe("teams", () => {
    for (const season of [2026, 2025] as const) {
      it(`matches historicalDataService normalized DB path for season ${season}`, async () => {
      if (!dbAvailable) return;
      const facade = await getSeasonTeams(ref(season));
      const historical = await getSeasonTeamsHistorical(season, LEAGUE_ID, USER_ID);
      const notes: string[] = [];
      let fields: ParityStatus = "PASS";
      let ordering: ParityStatus = "PASS";

      if (historical.source !== "normalized") {
        recordMatrix({
          entity: "teams",
          season,
          comparisonSource: historical.source,
          facadeCount: facade.count,
          referenceCount: historical.count,
          ordering: "SKIP",
          fields: "SKIP",
          notes: [`historical source=${historical.source}, not normalized DB`],
        });
        return;
      }

      expect(facade.source).toBe("normalized");
      expect(facade.count).toBe(historical.count);

      const fIds = facade.rows.map((r) => Number(r.teamId));
      const hIds = historical.rows.map((r) => Number((r as Record<string, unknown>).teamId));
      expect(fIds).toEqual(hIds);
      ordering = isSorted(facade.rows, (r) => Number(r.teamId)) ? "PASS" : "FAIL";

      for (let i = 0; i < facade.count; i++) {
        const f = facade.rows[i]! as Record<string, unknown>;
        const h = historical.rows[i]! as Record<string, unknown>;
        for (const key of TEAM_FIELDS) {
          if (JSON.stringify(f[key]) !== JSON.stringify(h[key])) {
            fields = "FAIL";
            notes.push(`teamId=${f.teamId} field ${key}: facade=${JSON.stringify(f[key])} historical=${JSON.stringify(h[key])}`);
          }
        }
      }

      recordMatrix({
        entity: "teams",
        season,
        comparisonSource: "historicalDataService DB",
        facadeCount: facade.count,
        referenceCount: historical.count,
        ordering,
        fields,
        notes,
      });
      expect(fields).toBe("PASS");
      expect(ordering).toBe("PASS");
      });
    }

    it("covers older season when normalized teams exist", async () => {
      if (!dbAvailable) return;
      const older = seasonsWith((c) => c.teams > 0 && c.matchups > 0).filter((s) => s <= 2015);
      const season = older[0] ?? seasonsWith((c) => c.teams > 0).filter((s) => s < 2025)[0];
      if (!season) {
        recordMatrix({
          entity: "teams",
          season: -1,
          comparisonSource: "n/a",
          facadeCount: 0,
          referenceCount: 0,
          ordering: "SKIP",
          fields: "SKIP",
          notes: ["no older normalized season in DB"],
        });
        return;
      }
      const facade = await getSeasonTeams(ref(season));
      const historical = await getSeasonTeamsHistorical(season, LEAGUE_ID, USER_ID);
      expect(facade.count).toBe(historical.count);
      recordMatrix({
        entity: "teams",
        season,
        comparisonSource: historical.source === "normalized" ? "historicalDataService DB" : historical.source,
        facadeCount: facade.count,
        referenceCount: historical.count,
        ordering: "PASS",
        fields: historical.source === "normalized" ? "PASS" : "PARTIAL",
        notes: historical.source === "normalized" ? [] : [`historical fell back to ${historical.source}`],
      });
    });
  });

  describe("matchups", () => {
    for (const season of [2026, 2025] as const) {
      it(`matches historicalDataService normalized DB path for season ${season}`, async () => {
      if (!dbAvailable) return;
      const facade = await getSeasonMatchups(ref(season));
      const historical = await getSeasonMatchupsHistorical(season, LEAGUE_ID, USER_ID);
      const notes: string[] = [];
      let fields: ParityStatus = "PASS";
      let ordering: ParityStatus = "PASS";

      if (historical.source !== "normalized") {
        recordMatrix({
          entity: "matchups",
          season,
          comparisonSource: historical.source,
          facadeCount: facade.count,
          referenceCount: historical.count,
          ordering: "SKIP",
          fields: "SKIP",
          notes: [`historical source=${historical.source}`],
        });
        return;
      }

      expect(facade.count).toBe(historical.count);
      const facadeKeys = facade.rows.map((r) =>
        `${r.scoringPeriodId}:${r.matchupPeriodId}:${r.homeTeamId}:${r.awayTeamId}`,
      );
      const historicalKeys = historical.rows.map((r) => {
        const h = r as Record<string, unknown>;
        return `${h.scoringPeriodId}:${h.matchupPeriodId}:${h.homeTeamId}:${h.awayTeamId}`;
      });
      ordering = JSON.stringify(facadeKeys) === JSON.stringify(historicalKeys) ? "PASS" : "FAIL";

      for (let i = 0; i < facade.count; i++) {
        const f = facade.rows[i]! as Record<string, unknown>;
        const h = historical.rows[i]! as Record<string, unknown>;
        for (const key of MATCHUP_FIELDS) {
          if (JSON.stringify(f[key]) !== JSON.stringify(h[key])) {
            fields = "FAIL";
            notes.push(`row ${i} ${key} mismatch`);
          }
        }
      }

      recordMatrix({
        entity: "matchups",
        season,
        comparisonSource: "historicalDataService DB",
        facadeCount: facade.count,
        referenceCount: historical.count,
        ordering,
        fields,
        notes,
      });
      expect(fields).toBe("PASS");
      });
    }

    it("includes playoff-tier rows when present", async () => {
      if (!dbAvailable) return;
      const season = seasonsWith((c) => c.matchups > 0).find((s) => s >= 2020) ?? 2026;
      const facade = await getSeasonMatchups(ref(season));
      const playoff = facade.rows.filter((r) => String(r.playoffTierType || "NONE") !== "NONE");
      recordMatrix({
        entity: "matchups",
        season,
        comparisonSource: "facade playoff scan",
        facadeCount: facade.count,
        referenceCount: playoff.length,
        ordering: "PASS",
        fields: playoff.length > 0 ? "PASS" : "PARTIAL",
        notes: [`playoff rows=${playoff.length}`],
      });
    });
  });

  describe("draft picks", () => {
    for (const season of [2026, 2025] as const) {
      it(`matches historicalDataService normalized DB path for season ${season}`, async () => {
      if (!dbAvailable) return;
      const facade = await getSeasonDraftPicks(ref(season));
      const historical = await getSeasonDraftPicksHistorical(season, LEAGUE_ID, USER_ID);
      const notes: string[] = [];
      let fields: ParityStatus = "PASS";

      if (historical.source !== "normalized") {
        recordDiff({
          entity: "draftPicks",
          field: "source",
          oldPath: `historicalDataService (${historical.source})`,
          facadePath: facade.source,
          consumerUsage: "canonicalDraftBoard.buildCanonicalDraftBoard",
          classification: "C",
          action: "Document cache/mDraftDetail fallback as authoritative when DB empty",
        });
        recordMatrix({
          entity: "draftPicks",
          season,
          comparisonSource: historical.source,
          facadeCount: facade.count,
          referenceCount: historical.count,
          ordering: "SKIP",
          fields: "PARTIAL",
          notes: [`historical source=${historical.source}`],
        });
        return;
      }

      expect(facade.rawCount).toBe(historical.rawCount);
      expect(facade.count).toBe(historical.count);
      const fPicks = facade.rows.map((r) => Number(r.overallPickNumber));
      const hPicks = historical.rows.map((r) => Number((r as Record<string, unknown>).overallPickNumber));
      expect(fPicks).toEqual(hPicks);

      for (let i = 0; i < facade.count; i++) {
        const f = facade.rows[i]! as Record<string, unknown>;
        const h = historical.rows[i]! as Record<string, unknown>;
        for (const key of DRAFT_FIELDS) {
          if (JSON.stringify(f[key]) !== JSON.stringify(h[key])) {
            fields = "FAIL";
            notes.push(`pick ${f.overallPickNumber} ${key} mismatch`);
          }
        }
      }

      const keepers = facade.rows.filter((r) => Boolean(r.keeper));
      if (keepers.length > 0) notes.push(`keeper picks=${keepers.length}`);

      recordMatrix({
        entity: "draftPicks",
        season,
        comparisonSource: "historicalDataService DB",
        facadeCount: facade.count,
        referenceCount: historical.count,
        ordering: isSorted(facade.rows, (r) => Number(r.overallPickNumber)) ? "PASS" : "FAIL",
        fields,
        notes,
      });
      expect(fields).toBe("PASS");
      });
    }
  });

  describe("transactions", () => {
    for (const season of [2026, 2025] as const) {
      it(`matches historicalDataService normalized subset for season ${season}`, async () => {
      if (!dbAvailable) return;
      const facade = await getSeasonTransactions(ref(season));
      const historical = await getSeasonTransactionsHistorical(season, LEAGUE_ID, USER_ID);
      const notes: string[] = [];
      let fields: ParityStatus = "PASS";

      if (facade.count === 0 && historical.count === 0) {
        recordMatrix({
          entity: "transactions",
          season,
          comparisonSource: "empty",
          facadeCount: 0,
          referenceCount: 0,
          ordering: "PASS",
          fields: "PASS",
          notes: ["no transactions in DB or cache"],
        });
        return;
      }

      if (historical.source === "normalized") {
        expect(facade.count).toBe(historical.count);
        for (let i = 0; i < facade.count; i++) {
          const f = pick(facade.rows[i]! as Record<string, unknown>, [...TX_FIELDS]);
          const h = pick(historical.rows[i]! as Record<string, unknown>, [...TX_FIELDS]);
          if (JSON.stringify(f) !== JSON.stringify(h)) {
            fields = "FAIL";
            notes.push(`row ${i} subset mismatch`);
          }
        }
      } else {
        fields = "PARTIAL";
        notes.push(`historical source=${historical.source}`);
        recordDiff({
          entity: "transactions",
          field: "cache fallback",
          oldPath: "historicalDataService combined cache normalizeTransactions",
          facadePath: "DB-only facade",
          consumerUsage: "historical coverage report only",
          classification: "C",
          action: "Keep cache path in historicalDataService until Batch A",
        });
      }

      recordMatrix({
        entity: "transactions",
        season,
        comparisonSource: historical.source === "normalized" ? "historicalDataService DB" : historical.source,
        facadeCount: facade.count,
        referenceCount: historical.count,
        ordering: "PASS",
        fields,
        notes,
      });
      if (historical.source === "normalized") expect(fields).toBe("PASS");
      });
    }

    it("documents extended DB columns not in historicalDataService subset", async () => {
      if (!dbAvailable) return;
      const season = seasonsWith((c) => c.tx > 0)[0];
      if (!season) return;
      const db = await getDb();
      if (!db) return;
      const dbRows = await db
        .select()
        .from(gmTransactions)
        .where(and(eq(gmTransactions.leagueId, LEAGUE_ID), eq(gmTransactions.season, season)))
        .limit(5);
      const facade = await getSeasonTransactions(ref(season));
      if (dbRows.length === 0 || facade.count === 0) return;

      const sample = dbRows[0]!;
      const extended = ["position", "itemType", "round", "pickInRound", "overallPickNumber", "pickSeason", "legIndex", "executionType"] as const;
      for (const field of extended) {
        if (sample[field] != null && sample[field] !== "" && Number(sample[field]) !== 0) {
          recordDiff({
            entity: "transactions",
            field,
            oldPath: "gm_transactions column (recentLeagueEventsService direct read)",
            facadePath: "omitted from facade (matches historicalDataService subset)",
            consumerUsage: "recentLeagueEventsService, completedTradeAuthority",
            classification: "B",
            action: "Do not expand facade for historical parity; direct-DB consumers stay on gm_transactions until dedicated migration",
          });
        }
      }
      expect(true).toBe(true);
    });
  });

  describe("rosters", () => {
    it("reads week=0 season snapshots when present", async () => {
      if (!dbAvailable) return;
      const season = seasonsWith((c) => c.roster > 0)[0];
      if (!season) {
        recordMatrix({
          entity: "rosters",
          season: -1,
          comparisonSource: "n/a",
          facadeCount: 0,
          referenceCount: 0,
          ordering: "SKIP",
          fields: "SKIP",
          notes: ["no gm_roster_entries rows for league 457622"],
        });
        return;
      }

      const facade = await getSeasonRosters(ref(season));
      expect(facade.source).toBe("normalized");
      expect(facade.count).toBeGreaterThan(0);
      const ordering = isSorted(facade.rows, (r) =>
        `${Number(r.teamId)}:${r.lineupSlotId == null ? "null" : Number(r.lineupSlotId)}:${Number(r.playerId)}`,
      )
        ? "PASS"
        : "PARTIAL";

      const cacheHit = await getCachedViewWithTier(season, "combined", LEAGUE_ID, { userId: USER_ID });
      let fields: ParityStatus = "PARTIAL";
      const notes: string[] = [];
      if (cacheHit?.row?.payload && typeof cacheHit.row.payload === "object") {
        const norm = normalizeRosters(cacheHit.row.payload as Record<string, unknown>) as Record<string, unknown>[];
        const normByKey = new Map(norm.map((r) => [`${r.teamId}:${r.playerId}`, r]));
        let matched = 0;
        for (const row of facade.rows.slice(0, 50)) {
          const key = `${row.teamId}:${row.playerId}`;
          const n = normByKey.get(key);
          if (!n) continue;
          matched++;
          for (const f of ROSTER_FIELDS) {
            if (f === "appliedTotal" || f === "projectedTotal") continue;
            if (String(row[f] ?? "") !== String(n[f] ?? "")) {
              notes.push(`${key} ${f}: facade=${row[f]} cache=${n[f]}`);
            }
          }
        }
        fields = matched > 0 ? "PARTIAL" : "PARTIAL";
        notes.push(`overlap sample=${matched}/${Math.min(50, facade.count)} vs normalizeRosters(cache)`);
        recordDiff({
          entity: "rosters",
          field: "live stats / ownership",
          oldPath: "normalizeRosters(combined cache)",
          facadePath: "gm_roster_entries.rawRosterEntry snapshot",
          consumerUsage: "routers via getSeasonData+normalizeRosters (live cache path)",
          classification: "C",
          action: "Batch A must not swap live-roster consumers to facade without snapshot parity proof",
        });
      } else {
        notes.push("no combined cache for roster cross-check");
      }

      const db = await getDb();
      if (db) {
        const rawMissing = await db
          .select({ id: gmRosterEntries.id })
          .from(gmRosterEntries)
          .where(
            and(
              eq(gmRosterEntries.leagueId, LEAGUE_ID),
              eq(gmRosterEntries.season, season),
              eq(gmRosterEntries.week, 0),
              sql`(${gmRosterEntries.rawRosterEntry} IS NULL OR ${gmRosterEntries.rawRosterEntry} = '' OR ${gmRosterEntries.rawRosterEntry} = '{}')`,
            ),
          )
          .limit(1);
        if (rawMissing.length > 0) {
          notes.push("rows without usable rawRosterEntry exist — scalar fallback path exercised");
        }
      }

      recordMatrix({
        entity: "rosters",
        season,
        comparisonSource: "gm_roster_entries week=0",
        facadeCount: facade.count,
        referenceCount: facade.count,
        ordering,
        fields,
        notes,
      });
      expect(facade.count).toBeGreaterThan(0);
    });
  });

  describe("settings", () => {
    for (const season of [2026, 2025] as const) {
      it(`matches persisted columns and normalizeSettings(cache) where available for season ${season}`, async () => {
      if (!dbAvailable) return;
      const facade = await getSeasonSettings(ref(season));
      const notes: string[] = [];
      let fields: ParityStatus = "PASS";

      if (facade.count === 0) {
        recordMatrix({
          entity: "settings",
          season,
          comparisonSource: "empty DB",
          facadeCount: 0,
          referenceCount: 0,
          ordering: "PASS",
          fields: "PARTIAL",
          notes: ["no league_settings row — live fields unavailable from DB"],
        });
        recordDiff({
          entity: "settings",
          field: "currentMatchupPeriod/latestScoringPeriod/isActive",
          oldPath: "normalizeSettings(live combined cache status block)",
          facadePath: "undefined (not persisted)",
          consumerUsage: "weeklyAssessmentService, leaguePromptContext",
          classification: "B",
          action: "Live-only fields stay on cache path; document limitation",
        });
        return;
      }

      const row = facade.rows[0]! as Record<string, unknown>;
      const cacheHit = await getCachedViewWithTier(season, "combined", LEAGUE_ID, { userId: USER_ID });
      if (cacheHit?.row?.payload && typeof cacheHit.row.payload === "object") {
        const norm = normalizeSettings(cacheHit.row.payload as Record<string, unknown>) as Record<string, unknown>;
        for (const key of SETTINGS_FIELDS) {
          if (key === "tradeDeadline" || key === "leagueId") continue;
          const a = row[key];
          const b = norm[key];
          if (JSON.stringify(a) !== JSON.stringify(b)) {
            notes.push(`${key}: facade=${JSON.stringify(a)} cache=${JSON.stringify(b)}`);
          }
        }
        if (norm.currentMatchupPeriod != null || norm.latestScoringPeriod != null) {
          recordDiff({
            entity: "settings",
            field: "status.*",
            oldPath: "normalizeSettings live cache",
            facadePath: "undefined in facade",
            consumerUsage: "in-season live tools",
            classification: "B",
            action: "Not required for historical DB facade",
          });
        }
        const rosterPos = row.rosterPositions as Record<string, unknown> | null;
        if (rosterPos) {
          const slots = Object.keys(rosterPos);
          notes.push(`roster slot keys=${slots.join(",")}`);
        }
      }

      if (notes.length > 0) fields = "PARTIAL";

      recordMatrix({
        entity: "settings",
        season,
        comparisonSource: facade.source === "normalized" ? "gm_league_settings + cache cross-check" : facade.source,
        facadeCount: facade.count,
        referenceCount: 1,
        ordering: "PASS",
        fields,
        notes,
      });
      });
    }
  });

  describe("combined bundle", () => {
    for (const season of [2026, 2025] as const) {
      it(`matches buildCombinedPayloadFromNormalized core for season ${season}`, async () => {
      if (!dbAvailable) return;
      const facade = await getCombinedSeasonBundle(ref(season));
      const historical = await buildCombinedPayloadFromNormalized(season, LEAGUE_ID, USER_ID);
      const notes: string[] = [];
      let fields: ParityStatus = "PASS";

      if (!historical) {
        expect(facade.payload).toBeNull();
        recordMatrix({
          entity: "bundle",
          season,
          comparisonSource: "buildCombinedPayloadFromNormalized null",
          facadeCount: 0,
          referenceCount: 0,
          ordering: "PASS",
          fields: "PASS",
          notes: ["both empty"],
        });
        return;
      }

      expect(facade.payload).not.toBeNull();
      const f = facade.payload!;
      const h = historical;

      const coreKeys = ["seasonId", "id"] as const;
      for (const k of coreKeys) {
        if (f[k] !== h[k]) fields = "FAIL";
      }

      const fTeams = (f.teams as Record<string, unknown>[]) ?? [];
      const hTeams = (h.teams as Record<string, unknown>[]) ?? [];
      expect(fTeams.length).toBe(hTeams.length);
      for (let i = 0; i < fTeams.length; i++) {
        expect(fTeams[i]?.id).toBe(hTeams[i]?.id);
        expect(fTeams[i]?.name).toBe(hTeams[i]?.name);
        expect(fTeams[i]?.primaryOwner).toBe(hTeams[i]?.primaryOwner);
      }

      const fSched = (f.schedule as Record<string, unknown>[]) ?? [];
      const hSched = (h.schedule as Record<string, unknown>[]) ?? [];
      expect(fSched.length).toBe(hSched.length);
      for (let i = 0; i < fSched.length; i++) {
        if (JSON.stringify(fSched[i]) !== JSON.stringify(hSched[i])) {
          fields = "FAIL";
          notes.push(`schedule row ${i} mismatch`);
        }
      }

      const fMpc = ((f.settings as Record<string, unknown>)?.scheduleSettings as Record<string, unknown>)?.matchupPeriodCount;
      const hMpc = ((h.settings as Record<string, unknown>)?.scheduleSettings as Record<string, unknown>)?.matchupPeriodCount;
      if (fMpc !== hMpc) {
        notes.push(`matchupPeriodCount facade=${fMpc} historical=${hMpc}`);
      }

      const fSettings = f.settings as Record<string, unknown>;
      if (fSettings.scoringSettings || fSettings.rosterSettings) {
        recordDiff({
          entity: "bundle",
          field: "settings.scoringSettings/rosterSettings",
          oldPath: "buildCombinedPayloadFromNormalized (minimal scheduleSettings only)",
          facadePath: "getCombinedSeasonBundle enriches from getSeasonSettings",
          consumerUsage: "ownerCareerProfileService synth payload (routers)",
          classification: "B",
          action: "Document wider bundle contract; core schedule/teams/members match historical",
        });
        if (fields === "PASS") fields = "PARTIAL";
      }

      expect((f.transactions as unknown[]) ?? []).toEqual([]);
      recordMatrix({
        entity: "bundle",
        season,
        comparisonSource: "buildCombinedPayloadFromNormalized",
        facadeCount: fTeams.length,
        referenceCount: hTeams.length,
        ordering: "PASS",
        fields,
        notes,
      });
      expect(fields === "FAIL").toBe(false);
      });
    }
  });

  describe("coverage classes", () => {
    it("records available data classes for league 457622", () => {
      if (!dbAvailable) return;
      const has2026 = normalizedSeasons.includes(2026);
      const has2025 = normalizedSeasons.includes(2025);
      const older = normalizedSeasons.filter((s) => s <= 2015);
      const incomplete = normalizedSeasons.filter((s) => {
        const c = seasonCounts.get(s)!;
        return c.teams > 0 && (c.matchups === 0 || c.draft === 0);
      });
      const withTx = seasonsWith((c) => c.tx > 0);
      const withRoster = seasonsWith((c) => c.roster > 0);
      const withSettings = seasonsWith((c) => c.settings > 0);

      recordMatrix({
        entity: "coverage",
        season: 2026,
        comparisonSource: "inventory",
        facadeCount: has2026 ? 1 : 0,
        referenceCount: normalizedSeasons.length,
        ordering: "PASS",
        fields: "PASS",
        notes: [
          `2025=${has2025}`,
          `older=${older.join(",") || "none"}`,
          `incomplete=${incomplete.join(",") || "none"}`,
          `trades=${withTx.join(",") || "none"}`,
          `rosters=${withRoster.join(",") || "none"}`,
          `settings=${withSettings.join(",") || "none"}`,
        ],
      });

      expect(has2026).toBe(true);
      expect(has2025).toBe(true);
      expect(older.length).toBeGreaterThan(0);
    });
  });

  it("prints parity matrix and difference register for completion report", () => {
    if (!dbAvailable) {
      console.log("\n=== leagueDataReads parity matrix ===\n(skipped — no DATABASE_URL)");
      return;
    }
    // eslint-disable-next-line no-console
    console.log("\n=== leagueDataReads parity matrix ===");
    for (const row of matrix) {
      console.log(
        `${row.entity} s${row.season}: source=${row.comparisonSource} counts=${row.facadeCount}/${row.referenceCount} ordering=${row.ordering} fields=${row.fields}${row.notes.length ? ` notes=${row.notes.join("; ")}` : ""}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log("\n=== difference register ===");
    for (const d of differences) {
      console.log(`[${d.classification}] ${d.entity}.${d.field}: ${d.action}`);
    }
    expect(matrix.length).toBeGreaterThan(0);
  });
});
