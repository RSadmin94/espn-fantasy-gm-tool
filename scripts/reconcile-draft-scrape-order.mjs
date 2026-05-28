/**
 * Reconcile draft_picks round/slot order from HTML scrape rows (draft_recap_html).
 * Usage: node scripts/reconcile-draft-scrape-order.mjs [leagueId] [season?]
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const leagueId = process.argv[2] || "457622";
const singleSeason = process.argv[3] ? Number(process.argv[3]) : null;
const seasons =
  singleSeason != null
    ? [singleSeason]
    : [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

function isScrape(raw) {
  if (!raw) return false;
  try {
    return JSON.parse(raw).source === "draft_recap_html";
  } catch {
    return false;
  }
}

async function reconcileSeason(conn, lid, yr) {
  const [rows] = await conn.query(
    `SELECT id, overallPick, roundId, roundPick, teamId, playerName, position, rawPick
     FROM draft_picks WHERE leagueId = ? AND season = ? ORDER BY overallPick ASC, id DESC`,
    [lid, yr],
  );

  const scrapeByOverall = new Map();
  for (const row of rows) {
    if (!isScrape(row.rawPick)) continue;
    const existing = scrapeByOverall.get(row.overallPick);
    if (!existing || row.id > existing.id) scrapeByOverall.set(row.overallPick, row);
  }

  let updatedFromScrape = 0;
  let deletedDupes = 0;
  for (const scrapeRow of scrapeByOverall.values()) {
    const dupes = rows.filter((r) => r.overallPick === scrapeRow.overallPick);
    for (const dup of dupes) {
      if (dup.id === scrapeRow.id) {
        await conn.query(
          `UPDATE draft_picks SET roundId=?, roundPick=?, teamId=?, playerName=?, position=?, rawPick=?, updatedAt=NOW() WHERE id=?`,
          [
            scrapeRow.roundId,
            scrapeRow.roundPick,
            scrapeRow.teamId,
            scrapeRow.playerName,
            scrapeRow.position,
            scrapeRow.rawPick,
            dup.id,
          ],
        );
        updatedFromScrape++;
      } else if (!isScrape(dup.rawPick)) {
        await conn.query(`DELETE FROM draft_picks WHERE id=?`, [dup.id]);
        deletedDupes++;
      }
    }
  }

  const [afterRows] = await conn.query(
    `SELECT id, overallPick, roundId, roundPick, rawPick FROM draft_picks WHERE leagueId=? AND season=? ORDER BY overallPick`,
    [lid, yr],
  );

  const byRound = new Map();
  for (const row of afterRows) {
    const round = Number(row.roundId) || 0;
    if (round <= 0) continue;
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round).push(row);
  }

  let realigned = 0;
  for (const [, roundRows] of byRound) {
    const ordered = [...roundRows].sort((a, b) => a.overallPick - b.overallPick);
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i];
      const desired = isScrape(row.rawPick) && row.roundPick > 0 ? row.roundPick : i + 1;
      if (row.roundPick !== desired) {
        await conn.query(`UPDATE draft_picks SET roundPick=?, updatedAt=NOW() WHERE id=?`, [desired, row.id]);
        realigned++;
      }
    }
  }

  return {
    season: yr,
    totalRows: afterRows.length,
    scrapeRows: scrapeByOverall.size,
    updatedFromScrape,
    deletedDupes,
    realigned,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log(`Reconciling league ${leagueId}…`);
  for (const yr of seasons) {
    const r = await reconcileSeason(conn, leagueId, yr);
    console.log(JSON.stringify(r));
  }
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
