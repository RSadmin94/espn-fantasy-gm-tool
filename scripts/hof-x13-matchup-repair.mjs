/**
 * PHASE X.13 — Hall of Fame matchup isPlayoff audit + optional backfill.
 *
 * Usage:
 *   node scripts/hof-x13-matchup-repair.mjs [leagueId]           # audit only (default league 158918)
 *   node scripts/hof-x13-matchup-repair.mjs 158918 --apply      # rewrite isPlayoff from rawMatchup JSON
 *
 * Logic matches server/matchupPlayoffTier.ts matchupIsPlayoffFromEspnTier.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function matchupIsPlayoffFromEspnTier(playoffTierType) {
  return String(playoffTierType ?? "") !== "NONE" && Boolean(playoffTierType);
}

function parseTier(raw) {
  try {
    const j = JSON.parse(raw);
    return j?.playoffTierType ?? null;
  } catch {
    return "__INVALID_JSON__";
  }
}

const leagueId = String(process.argv[2] || "158918").trim();
const apply = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; cannot run audit/backfill.");
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [[totalRow]] = await conn.query(
  "SELECT COUNT(*) AS c FROM `matchups` WHERE `leagueId` = ?",
  [leagueId],
);
const [[zRow]] = await conn.query(
  "SELECT COUNT(*) AS c FROM `matchups` WHERE `leagueId` = ? AND `isPlayoff` = 0",
  [leagueId],
);
const [[oRow]] = await conn.query(
  "SELECT COUNT(*) AS c FROM `matchups` WHERE `leagueId` = ? AND `isPlayoff` = 1",
  [leagueId],
);

console.log("\n=== SECTION A — League", leagueId, "===");
console.log("1. Total matchups rows:", Number(totalRow.c));
console.log("2. Count isPlayoff = 0:", Number(zRow.c));
console.log("3. Count isPlayoff = 1:", Number(oRow.c));

const [allRows] = await conn.query(
  "SELECT `id`, `season`, `week`, `isPlayoff`, `isCompleted`, `rawMatchup` FROM `matchups` WHERE `leagueId` = ?",
  [leagueId],
);

let noneInRaw = 0;
let otherTierInRaw = 0;
let missingTier = 0;
let invalidJson = 0;

for (const r of allRows) {
  const tier = parseTier(r.rawMatchup);
  if (tier === "__INVALID_JSON__") invalidJson++;
  else if (tier == null || tier === "") missingTier++;
  else if (String(tier) === "NONE") noneInRaw++;
  else otherTierInRaw++;
}

console.log("4. Source rawMatchup playoffTierType:");
console.log("   - equals NONE:", noneInRaw);
console.log("   - other / non-empty:", otherTierInRaw);
console.log("   - missing / empty field:", missingTier);
console.log("   - invalid JSON:", invalidJson);

console.log("\n5. Sample (up to 10) season | week | playoffTierType | stored isPlayoff");
let shown = 0;
for (const r of allRows) {
  if (shown >= 10) break;
  const tier = parseTier(r.rawMatchup);
  const tLabel = tier === "__INVALID_JSON__" ? "<invalid json>" : tier == null ? "<null>" : String(tier);
  console.log(`   ${r.season}\t${r.week}\t${tLabel}\t${r.isPlayoff}`);
  shown++;
}

let wouldChange = 0;
const updates = [];

for (const r of allRows) {
  const tier = parseTier(r.rawMatchup);
  if (tier === "__INVALID_JSON__") continue;
  const next = matchupIsPlayoffFromEspnTier(tier) ? 1 : 0;
  if (Number(r.isPlayoff) !== next) {
    wouldChange++;
    updates.push({ id: r.id, next });
  }
}

console.log("\n=== SECTION C — Backfill preview ===");
console.log("Rows where isPlayoff would change (from rawMatchup):", wouldChange);
console.log(apply ? "Applying UPDATEs by primary key…" : "Dry run (omit --apply to skip writes).");

if (apply && updates.length > 0) {
  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const caseParts = [];
    const ids = [];
    for (const u of chunk) {
      const id = Number(u.id);
      if (!Number.isFinite(id)) continue;
      caseParts.push(`WHEN ${id} THEN ${u.next ? 1 : 0}`);
      ids.push(id);
    }
    if (!ids.length) continue;
    const caseSql = caseParts.join(" ");
    const inList = ids.join(",");
    await conn.query(
      `UPDATE \`matchups\` SET \`isPlayoff\` = CASE \`id\` ${caseSql} END WHERE \`id\` IN (${inList})`,
    );
  }
  console.log("Updated:", updates.length, "rows (batched).");
}

const [[rsDone]] = await conn.query(
  "SELECT COUNT(*) AS c FROM `matchups` WHERE `leagueId` = ? AND `isPlayoff` = 0 AND `isCompleted` = 1",
  [leagueId],
);

console.log("\n=== SECTION D — After state ===");
console.log("Completed regular-season rows (isPlayoff=0, isCompleted=1):", Number(rsDone.c));

await conn.end();

if (apply) {
  console.log("\nRe-run HoF / UI manually, or: npx tsx scripts/hof-x13-validate-payload.ts", leagueId);
}
