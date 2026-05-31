import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const tables = ["matchups","teams","standings_snapshots","roster_entries","gm_weekly_player_stats","transactions","league_medals","draft_picks"];

for (const t of tables) {
  try {
    const [[cnt]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
    const [cols] = await conn.query(`DESCRIBE \`${t}\``);
    console.log(`\n=== ${t} (${cnt.c} rows) ===`);
    console.log("cols:", cols.map(c => c.Field).join(", "));
    if (cnt.c > 0) {
      const [[s]] = await conn.query(`SELECT * FROM \`${t}\` LIMIT 1`);
      console.log("sample:", JSON.stringify(s).slice(0, 300));
    }
  } catch(e) { console.log(`${t}: ERROR ${e.message?.slice(0,60)}`); }
}

// Check matchups seasons/weeks available
try {
  const [r] = await conn.query("SELECT season, week, COUNT(*) as cnt FROM matchups GROUP BY season, week ORDER BY season DESC, week DESC LIMIT 20");
  console.log("\nMatchups by season/week:", JSON.stringify(r));
} catch(e) {}

await conn.end();
