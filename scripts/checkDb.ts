import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL!);

const [r1] = await conn.query("SHOW TABLES LIKE 'owner_aliases'") as any;
console.log("owner_aliases exists:", r1.length > 0);

const [r2] = await conn.query("SELECT COUNT(*) as c FROM gm_player_registry") as any;
console.log("gm_player_registry rows:", r2[0].c);

// Add missing indexes without IF NOT EXISTS
const indexes = [
  "CREATE UNIQUE INDEX uq_gm_player_registry_espn ON gm_player_registry (espnPlayerId)",
  "CREATE INDEX idx_gm_player_registry_norm ON gm_player_registry (normalizedName)",
  "CREATE UNIQUE INDEX uq_gm_wps ON gm_weekly_player_stats (playerId, season, week, ownerKey(50))",
  "CREATE INDEX idx_gm_wps_season_player ON gm_weekly_player_stats (season, playerId)",
];
for (const sql of indexes) {
  try { await conn.query(sql); process.stdout.write("."); }
  catch (e: any) { if (!e.message?.includes("Duplicate key name")) console.log("SKIP:", e.message?.slice(0,60)); }
}

await conn.end();
console.log("\nDone.");
