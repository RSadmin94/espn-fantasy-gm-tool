import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query("SELECT payload FROM espn_raw_cache WHERE leagueId='457622' AND viewName='combined' AND season=2026 LIMIT 1");
const raw = rows[0]?.payload;
if (!raw) { console.log("NO DATA"); process.exit(1); }
const data = JSON.parse(raw);

// Find scoring settings
const settings = data.settings || data.scoringSettings || data.leagueSettings;
console.log("TOP KEYS:", Object.keys(data).slice(0,20).join(", "));

// Look for scoringSettings
if (data.settings?.scoringSettings) {
  const ss = data.settings.scoringSettings;
  console.log("scoringSettings keys:", Object.keys(ss).join(", "));
  console.log("scoringItems sample:", JSON.stringify(ss.scoringItems?.slice(0,5)));
}

// Also check for scoring in other locations
const findScoring = (obj, path = "", depth = 0) => {
  if (depth > 4 || !obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase().includes("scoring") || key.toLowerCase().includes("stat")) {
      console.log(`Found at ${path}.${key}:`, typeof obj[key] === "object" ? JSON.stringify(obj[key]).slice(0, 200) : obj[key]);
    }
    if (depth < 3) findScoring(obj[key], `${path}.${key}`, depth + 1);
  }
};
findScoring(data);
await conn.end();
