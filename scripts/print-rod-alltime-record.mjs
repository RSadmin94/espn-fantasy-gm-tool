/**
 * One-off: print Rod Sellers all-time W-L-T from deduped matchups (same logic as ownerAllTimeRecords).
 * Usage: node scripts/print-rod-alltime-record.mjs
 * Requires DATABASE_URL in environment or .env in repo root.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import * as schema from "../drizzle/schema.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const { gmTeams, gmMatchups } = schema;

function normalizeOwnerStr(raw) {
  if (!raw) return "";
  return raw.trim().replace(/^\(+|\)+$/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = drizzle(url, { schema, mode: "default" });
const leagueRows = await db.select({ leagueId: schema.leagueConnections.leagueId }).from(schema.leagueConnections).limit(1);
const leagueId = leagueRows[0]?.leagueId;
if (!leagueId) {
  console.error("No league connection");
  process.exit(1);
}

const allTeams = await db.select().from(gmTeams).where(eq(gmTeams.leagueId, leagueId));
const teamToOwnerKey = new Map();
const ownerDisplay = new Map();
for (const t of allTeams) {
  const rawName = (t.ownerName || t.name || `Team ${t.teamId}`).trim();
  const ownerKey = normalizeOwnerStr(rawName);
  teamToOwnerKey.set(`${t.season}:${t.teamId}`, ownerKey);
  if (rawName) ownerDisplay.set(ownerKey, rawName.replace(/^\(+|\)+$/g, "").trim());
}

const matchups = await db
  .select()
  .from(gmMatchups)
  .where(and(eq(gmMatchups.leagueId, leagueId), eq(gmMatchups.isCompleted, 1)));

const records = new Map();
const bump = (k, f) => {
  if (!records.has(k)) records.set(k, { wins: 0, losses: 0, ties: 0 });
  records.get(k)[f]++;
};

const seen = new Set();
for (const m of matchups) {
  const homeId = Number(m.homeTeamId);
  const awayId = Number(m.awayTeamId);
  if (!homeId || !awayId || homeId <= 0 || awayId <= 0 || homeId === awayId) continue;
  const mk = `${m.season}|${m.matchupPeriodId}|${homeId}|${awayId}`;
  if (seen.has(mk)) continue;
  seen.add(mk);
  const hk = teamToOwnerKey.get(`${m.season}:${homeId}`);
  const ak = teamToOwnerKey.get(`${m.season}:${awayId}`);
  if (!hk || !ak || hk === ak) continue;
  const w = m.winnerTeamId != null ? Number(m.winnerTeamId) : null;
  if (w === homeId) {
    bump(hk, "wins");
    bump(ak, "losses");
  } else if (w === awayId) {
    bump(ak, "wins");
    bump(hk, "losses");
  } else {
    bump(hk, "ties");
    bump(ak, "ties");
  }
}

const rodKey = normalizeOwnerStr("Rod Sellers");
const rod = records.get(rodKey);
const games = rod ? rod.wins + rod.losses + rod.ties : 0;
const winPct = games > 0 ? ((rod.wins + 0.5 * rod.ties) / games) * 100 : 0;

console.log(
  JSON.stringify(
    {
      ownerKey: rodKey,
      displayName: ownerDisplay.get(rodKey) ?? "Rod Sellers",
      wins: rod?.wins ?? 0,
      losses: rod?.losses ?? 0,
      ties: rod?.ties ?? 0,
      gamesPlayed: games,
      winPct: Math.round(winPct * 10) / 10,
      uniqueMatchups: seen.size,
    },
    null,
    2,
  ),
);

process.exit(0);
