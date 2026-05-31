/**
 * Import historical draft_picks via Drizzle (same schema as the app).
 *
 * Step 1: upsert one 2010 test row, then verify with select.
 * Step 2: bulk INSERT IGNORE from scripts/sql/import_draft_history_2010_2025_FIXED.sql (committed export).
 *
 * Usage: pnpm import:draft-drizzle
 * Requires: DATABASE_URL
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, count, eq } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

type GmDraftPickInsert = InferInsertModel<typeof schema.gmDraftPicks>;

const DEFAULT_SQL = join(__dirname, "sql", "import_draft_history_2010_2025_FIXED.sql");
const VALIDATION_JSON = join(__dirname, "sql", "import_validation.json");

function loadLeagueId(): string {
  if (!existsSync(VALIDATION_JSON)) return "457622";
  try {
    const j = JSON.parse(readFileSync(VALIDATION_JSON, "utf8")) as { leagueId?: string };
    const lid = String(j.leagueId ?? "457622").trim().slice(0, 32);
    return lid || "457622";
  } catch {
    return "457622";
  }
}

/** Parse one VALUES tuple body (inside outer `(...)`) into typed fields for draft_picks. */
function parseSqlFields(inner: string): (string | number | null)[] {
  const out: (string | number | null)[] = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && (inner[i] === " " || inner[i] === "\t" || inner[i] === ",")) i++;
    if (i >= inner.length) break;
    if (inner[i] === "'") {
      i++;
      let sb = "";
      while (i < inner.length) {
        if (inner[i] === "'" && inner[i + 1] === "'") {
          sb += "'";
          i += 2;
          continue;
        }
        if (inner[i] === "'") {
          i++;
          break;
        }
        sb += inner[i];
        i++;
      }
      out.push(sb);
      continue;
    }
    let j = i;
    while (j < inner.length && inner[j] !== ",") j++;
    const tok = inner.slice(i, j).trim();
    if (tok.toUpperCase() === "NULL") out.push(null);
    else if (/^-?\d+$/.test(tok)) out.push(Number(tok));
    else if (/^-?\d+\.\d+$/.test(tok)) out.push(Number(tok));
    else out.push(tok);
    i = j + 1;
  }
  return out;
}

function stripLineToInner(line: string): string | null {
  const t = line.trim();
  if (!t.startsWith("(")) return null;
  let body = t.slice(1);
  if (body.endsWith("),")) body = body.slice(0, -2);
  else if (body.endsWith(");")) body = body.slice(0, -2);
  else if (body.endsWith(")")) body = body.slice(0, -1);
  else return null;
  return body;
}

function rowFromSqlFields(f: (string | number | null)[], updatedAt: Date): GmDraftPickInsert | null {
  if (f.length !== 13) return null;
  const leagueId = String(f[0]);
  const season = Number(f[1]);
  const overallPick = Number(f[2]);
  const roundId = Number(f[3]);
  const roundPick = Number(f[4]);
  const teamId = Number(f[5]);
  const owningRaw = f[6];
  const playerRaw = f[7];
  const owningTeamId =
    owningRaw === null || owningRaw === undefined ? null : Number(owningRaw);
  const playerId =
    playerRaw === null || playerRaw === undefined ? null : Number(playerRaw);
  const playerName = String(f[8] ?? "");
  const position = String(f[9] ?? "");
  const isKeeper = Number(f[10]);
  const bidAmount = Number(f[11]);
  const rawPick = String(f[12] ?? "{}");
  if (
    !Number.isFinite(season) ||
    !Number.isFinite(overallPick) ||
    !Number.isFinite(teamId) ||
    !Number.isFinite(isKeeper) ||
    !Number.isFinite(bidAmount)
  ) {
    return null;
  }
  return {
    leagueId,
    season,
    overallPick,
    roundId: Number.isFinite(roundId) ? roundId : 0,
    roundPick: Number.isFinite(roundPick) ? roundPick : 0,
    teamId,
    owningTeamId: owningTeamId != null && Number.isFinite(owningTeamId) ? owningTeamId : null,
    playerId: playerId != null && Number.isFinite(playerId) ? playerId : null,
    playerName: playerName.slice(0, 255) || null,
    position: position.slice(0, 16) || null,
    isKeeper: isKeeper ? 1 : 0,
    bidAmount,
    rawPick,
    updatedAt,
  };
}

function parseDraftRowsFromFixedSql(sqlText: string, leagueId: string, updatedAt: Date): GmDraftPickInsert[] {
  const rows: GmDraftPickInsert[] = [];
  const lines = sqlText.split(/\r?\n/);
  for (const line of lines) {
    const inner = stripLineToInner(line);
    if (!inner) continue;
    const fields = parseSqlFields(inner);
    const row = rowFromSqlFields(fields, updatedAt);
    if (!row || row.leagueId !== leagueId) continue;
    rows.push(row);
  }
  return rows;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const leagueId = loadLeagueId();
  const sqlPath = process.argv[2] || DEFAULT_SQL;
  if (!existsSync(sqlPath)) {
    console.error(`SQL file not found: ${sqlPath}`);
    process.exit(1);
  }

  const db = drizzle(url, { schema, mode: "default" });
  const now = new Date();

  const testRow: GmDraftPickInsert = {
    leagueId,
    season: 2010,
    overallPick: 1,
    roundId: 1,
    roundPick: 1,
    teamId: 1,
    owningTeamId: null,
    playerId: null,
    playerName: "Dez Bryant",
    position: "WR",
    isKeeper: 0,
    bidAmount: 0,
    rawPick: JSON.stringify({
      source: "verified_manual",
      teamName: "BUM CITY",
      nflTeam: "Dal",
      ownerName: "",
    }),
    updatedAt: now,
  };

  console.error("Step 1: upsert test row (2010 / overallPick 1)…");
  await db
    .insert(schema.gmDraftPicks)
    .values(testRow)
    .onDuplicateKeyUpdate({
      set: {
        roundId: testRow.roundId,
        roundPick: testRow.roundPick,
        teamId: testRow.teamId,
        owningTeamId: testRow.owningTeamId,
        playerId: testRow.playerId,
        playerName: testRow.playerName,
        position: testRow.position,
        isKeeper: testRow.isKeeper,
        bidAmount: testRow.bidAmount,
        rawPick: testRow.rawPick,
        updatedAt: now,
      },
    });

  const verify = await db
    .select()
    .from(schema.gmDraftPicks)
    .where(
      and(
        eq(schema.gmDraftPicks.leagueId, leagueId),
        eq(schema.gmDraftPicks.season, 2010),
        eq(schema.gmDraftPicks.overallPick, 1),
      ),
    )
    .limit(1);

  if (verify.length === 0) {
    throw new Error("Step 1 failed: no row for season=2010, overallPick=1 after insert.");
  }
  const v0 = verify[0];
  if (v0.playerName !== "Dez Bryant") {
    throw new Error(`Step 1 failed: expected playerName Dez Bryant, got ${String(v0.playerName)}`);
  }
  console.error("Step 1 OK: row exists for 2010 pick 1 (Dez Bryant).");

  const sqlText = readFileSync(sqlPath, "utf8");
  const batchNow = new Date();
  const allRows = parseDraftRowsFromFixedSql(sqlText, leagueId, batchNow);
  if (allRows.length === 0) {
    throw new Error(`Step 2: no rows parsed from ${sqlPath}`);
  }

  console.error(`Step 2: bulk INSERT IGNORE ${allRows.length} rows from ${sqlPath}…`);
  const BATCH = 80;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const chunk = allRows.slice(i, i + BATCH);
    await db.insert(schema.gmDraftPicks).ignore().values(chunk);
  }
  console.error("Step 2 OK.");

  const summary = await db
    .select({ season: schema.gmDraftPicks.season, n: count() })
    .from(schema.gmDraftPicks)
    .where(eq(schema.gmDraftPicks.leagueId, leagueId))
    .groupBy(schema.gmDraftPicks.season)
    .orderBy(asc(schema.gmDraftPicks.season));

  console.error("Step 3: season counts (leagueId=%s)", leagueId);
  for (const r of summary) {
    console.log(`${r.season}\t${r.n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
