import { getDb } from "./server/db";
import { espnSeasonCache } from "./drizzle/schema";
import { eq, and } from "drizzle-orm";

async function main() {
  const db = await getDb();

  // Check 2025 season for scoring settings and player stats
  const rows = await db
    .select()
    .from(espnSeasonCache)
    .where(and(eq(espnSeasonCache.season, 2025), eq(espnSeasonCache.viewName, "combined")))
    .limit(1);

  if (!rows.length) {
    console.log("No combined row found for 2025");
    process.exit(1);
  }

  const payload = rows[0].payload as any;
  const keys = Object.keys(payload);
  console.log("Top-level keys:", keys);

  // Check scoring settings
  if (payload.settings) {
    const settingsKeys = Object.keys(payload.settings);
    console.log("\nSettings keys:", settingsKeys);
    if (payload.settings.scoringSettings) {
      console.log("\nScoring settings (first 10):");
      const ss = payload.settings.scoringSettings;
      const ssKeys = Object.keys(ss).slice(0, 20);
      ssKeys.forEach(k => console.log(`  ${k}: ${JSON.stringify(ss[k])}`));
    }
  }

  // Check roster / player stats
  if (payload.teams) {
    const team = payload.teams[0];
    console.log("\nFirst team keys:", Object.keys(team));
    if (team.roster) {
      console.log("Roster keys:", Object.keys(team.roster));
      const entries = team.roster.entries || [];
      if (entries.length > 0) {
        const entry = entries[0];
        console.log("\nFirst roster entry keys:", Object.keys(entry));
        if (entry.playerPoolEntry) {
          const ppe = entry.playerPoolEntry;
          console.log("playerPoolEntry keys:", Object.keys(ppe));
          if (ppe.player) {
            const p = ppe.player;
            console.log("player keys:", Object.keys(p));
            console.log("player name:", p.fullName);
            console.log("player defaultPositionId:", p.defaultPositionId);
            if (p.stats && p.stats.length > 0) {
              console.log("\nStats entries count:", p.stats.length);
              const stat = p.stats[0];
              console.log("First stat entry keys:", Object.keys(stat));
              console.log("First stat entry:", JSON.stringify(stat).slice(0, 400));
            }
          }
          if (ppe.appliedStatTotal !== undefined) {
            console.log("appliedStatTotal:", ppe.appliedStatTotal);
          }
          if (ppe.totalPoints !== undefined) {
            console.log("totalPoints:", ppe.totalPoints);
          }
        }
      }
    }
  }

  // Check if there are separate player stats views
  const allRows = await db
    .select({ viewName: espnSeasonCache.viewName })
    .from(espnSeasonCache)
    .where(eq(espnSeasonCache.season, 2025));
  console.log("\nAll views for 2025:", allRows.map(r => r.viewName));

  process.exit(0);
}

main().catch(console.error);
