/**
 * Seed historical draft picks into `draft_picks` (and stub `teams` rows when needed).
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-draft-history.ts <season> [--file=path/to.json] [--league-id=457622]
 *
 * JSON shape (see scripts/draft-data/README.md):
 *   { "leagueId"?: string, "teams"?: TeamRow[], "picks": PickRow[] }
 *
 * Each pick: season, overallPick, round, roundPick, teamName, playerName, position, nflTeam,
 * optional teamId, isKeeper, playerId.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

type TeamRow = {
  teamId: number;
  teamName: string;
  ownerName?: string;
};

type PickRow = {
  season: number;
  overallPick: number;
  round: number;
  roundPick: number;
  teamName: string;
  teamId?: number;
  playerName: string;
  position: string;
  nflTeam: string;
  isKeeper?: boolean;
  playerId?: number | null;
};

type DraftFile = {
  leagueId?: string;
  teams?: TeamRow[];
  picks: PickRow[];
};

function rawPickFromSeedPick(p: PickRow): Record<string, unknown> {
  return {
    overallPickNumber: p.overallPick,
    roundId: p.round,
    roundPickNumber: p.roundPick,
    teamId: p.teamId,
    playerId: p.playerId ?? null,
    playerName: p.playerName,
    position: p.position,
    proTeam: p.nflTeam,
    keeper: Boolean(p.isKeeper),
    reservedForKeeper: false,
    seeded: true,
  };
}

function parseArgs(argv: string[]) {
  const seasonArg = argv[2];
  if (!seasonArg || !/^\d{4}$/.test(seasonArg)) {
    console.error("Usage: tsx scripts/seed-draft-history.ts <season> [--file=...] [--league-id=...]");
    process.exit(1);
  }
  const season = Number(seasonArg);
  let leagueId = process.env.ESPN_LEAGUE_ID?.trim() || "457622";
  let filePath = join(__dirname, "draft-data", `${season}.json`);
  for (const a of argv.slice(3)) {
    if (a.startsWith("--league-id=")) leagueId = a.slice("--league-id=".length).trim().slice(0, 32);
    if (a.startsWith("--file=")) filePath = a.slice("--file=".length).trim();
  }
  return { season, leagueId, filePath };
}

async function ensureTeams(
  db: ReturnType<typeof drizzle<typeof schema>>,
  leagueId: string,
  season: number,
  teams: TeamRow[]
) {
  const now = new Date();
  for (const t of teams) {
    const tid = Math.floor(Number(t.teamId));
    if (!Number.isFinite(tid) || tid <= 0) continue;
    const name = String(t.teamName ?? "").slice(0, 255);
    const ownerName = String(t.ownerName ?? "").slice(0, 255);
    await db
      .insert(schema.gmTeams)
      .values({
        leagueId,
        season,
        teamId: tid,
        name,
        abbreviation: "",
        ownerName,
        ownerId: "",
        logoUrl: "",
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        playoffSeed: null,
        finalStanding: null,
        rawTeam: JSON.stringify({ stub: true, teamId: tid, name, ownerName }),
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          name,
          ownerName,
          rawTeam: JSON.stringify({ stub: true, teamId: tid, name, ownerName }),
          updatedAt: now,
        },
      });
  }
}

function resolveTeamIds(picks: PickRow[]): { nameToId: Map<string, number>; rows: TeamRow[] } {
  const nameToId = new Map<string, number>();
  let maxId = 0;
  for (const p of picks) {
    const name = String(p.teamName ?? "").trim();
    if (!name) continue;
    if (p.teamId != null && Number.isFinite(Number(p.teamId))) {
      const tid = Math.floor(Number(p.teamId));
      maxId = Math.max(maxId, tid);
      if (!nameToId.has(name)) nameToId.set(name, tid);
    }
  }
  for (const p of picks) {
    const name = String(p.teamName ?? "").trim();
    if (!name) continue;
    if (!nameToId.has(name)) {
      maxId += 1;
      nameToId.set(name, maxId);
    }
  }
  const rows = [...nameToId.entries()].map(([teamName, teamId]) => ({
    teamId,
    teamName,
    ownerName: "",
  }));
  return { nameToId, rows };
}

async function main() {
  const { season, leagueId, filePath } = parseArgs(process.argv);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const doc = JSON.parse(readFileSync(filePath, "utf8")) as DraftFile;
  const lid = String(doc.leagueId ?? leagueId).trim().slice(0, 32);
  const picks = doc.picks;
  if (!Array.isArray(picks) || picks.length === 0) {
    console.error("JSON must contain a non-empty picks array.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const db = drizzle(url, { schema, mode: "default" });

  const { nameToId, rows: derivedTeams } = resolveTeamIds(picks);
  const teamsFromFile = doc.teams?.length ? doc.teams : derivedTeams;

  await ensureTeams(db, lid, season, teamsFromFile);

  const now = new Date();
  let n = 0;
  for (const p of picks) {
    const yr = Math.floor(Number(p.season ?? season));
    const overall = Math.floor(Number(p.overallPick));
    const teamName = String(p.teamName ?? "").trim();
    const tid = p.teamId != null && Number.isFinite(Number(p.teamId))
      ? Math.floor(Number(p.teamId))
      : nameToId.get(teamName);
    if (!tid || !Number.isFinite(overall) || overall <= 0) {
      console.warn("Skipping pick (missing teamId / overallPick):", p);
      continue;
    }
    const raw = rawPickFromSeedPick({ ...p, teamId: tid });
    await db
      .insert(schema.gmDraftPicks)
      .values({
        leagueId: lid,
        season: yr,
        overallPick: overall,
        roundId: Math.floor(Number(p.round)) || 0,
        roundPick: Math.floor(Number(p.roundPick)) || 0,
        teamId: tid,
        owningTeamId: null,
        playerId: p.playerId != null && Number.isFinite(Number(p.playerId)) ? Math.floor(Number(p.playerId)) : null,
        playerName: String(p.playerName ?? "").slice(0, 255) || null,
        position: String(p.position ?? "").slice(0, 16) || null,
        isKeeper: p.isKeeper ? 1 : 0,
        bidAmount: 0,
        rawPick: JSON.stringify(raw),
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          roundId: Math.floor(Number(p.round)) || 0,
          roundPick: Math.floor(Number(p.roundPick)) || 0,
          teamId: tid,
          playerId: p.playerId != null && Number.isFinite(Number(p.playerId)) ? Math.floor(Number(p.playerId)) : null,
          playerName: String(p.playerName ?? "").slice(0, 255) || null,
          position: String(p.position ?? "").slice(0, 16) || null,
          isKeeper: p.isKeeper ? 1 : 0,
          rawPick: JSON.stringify(raw),
          updatedAt: now,
        },
      });
    n++;
  }

  console.log(`Upserted ${n} draft picks for league ${lid} season ${season}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
