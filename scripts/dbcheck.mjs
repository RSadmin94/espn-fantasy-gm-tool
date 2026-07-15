import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [tables] = await conn.query("SHOW TABLES");
console.log("TABLES:", JSON.stringify(tables.map(r => Object.values(r)[0])));
const targets = ["gmMatchups","gmTeams","gmWeeklyPlayerStats","gm_player_registry","gmDraftPicks","gmSeasonRosters","espn_raw_cache"];
for (const t of targets) {
  try {
    const [[r]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
    console.log(t + ": " + r.c + " rows");
  } catch(e) { console.log(t + ": MISSING"); }
}

// Sample gmMatchups columns
try {
  const [cols] = await conn.query("DESCRIBE gmMatchups");
  console.log("gmMatchups cols:", JSON.stringify(cols.map(c => c.Field + ":" + c.Type)));
  const [[sample]] = await conn.query("SELECT * FROM gmMatchups LIMIT 1");
  console.log("gmMatchups sample:", JSON.stringify(sample));
} catch(e) { console.log("gmMatchups: MISSING"); }

try {
  const [cols] = await conn.query("DESCRIBE gmTeams");
  console.log("gmTeams cols:", JSON.stringify(cols.map(c => c.Field)));
  const [[sample]] = await conn.query("SELECT * FROM gmTeams LIMIT 1");
  console.log("gmTeams sample:", JSON.stringify(sample));
} catch(e) { console.log("gmTeams: MISSING"); }

try {
  const [cols] = await conn.query("DESCRIBE gmWeeklyPlayerStats");
  console.log("gmWeeklyPlayerStats cols:", JSON.stringify(cols.map(c => c.Field)));
} catch(e) { console.log("gmWeeklyPlayerStats: MISSING"); }

await conn.end();
