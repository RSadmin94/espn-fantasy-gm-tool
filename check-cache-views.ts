import { getDb } from "./server/db";
import { espnSeasonCache } from "./drizzle/schema";

async function main() {
  const db = await getDb();
  const rows = await db.select({ season: espnSeasonCache.season, view: espnSeasonCache.view }).from(espnSeasonCache);
  console.log("Views in cache:", rows.map(r => `${r.season}:${r.view}`).join(", "));

  // Sample one season to see payload structure
  const sample = await db.select().from(espnSeasonCache).limit(1);
  if (sample.length > 0) {
    const payload = typeof sample[0].payload === "string"
      ? JSON.parse(sample[0].payload)
      : sample[0].payload;
    console.log("\nSample payload keys:", Object.keys(payload));
    if (payload.teams?.[0]) {
      console.log("Team[0] keys:", Object.keys(payload.teams[0]));
      console.log("Team[0] id:", payload.teams[0].id);
      console.log("Team[0] transactionCounter:", payload.teams[0].transactionCounter);
    }
    if (payload.draftDetail?.picks?.length > 0) {
      const p = payload.draftDetail.picks[0];
      console.log("\nFirst pick keys:", Object.keys(p));
      console.log("First pick:", JSON.stringify(p, null, 2).slice(0, 400));
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
