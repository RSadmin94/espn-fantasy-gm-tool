import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { fantasyDataCache } from "./drizzle/schema.js";
import { like } from "drizzle-orm";
import { parseEspnFantasyDataCacheKey } from "./server/db.js";

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const db = drizzle(conn);

const rows = await db.select().from(fantasyDataCache).where(like(fantasyDataCache.cacheKey, "espn:%"));

for (const row of rows) {
  const meta = parseEspnFantasyDataCacheKey(row.cacheKey);
  if (!meta || meta.viewName !== "combined") continue;
  const payload = row.payload as Record<string, unknown>;
  const season = meta.season;
  const teams = (payload.teams as unknown[]) || [];
  const members = (payload.members as unknown[]) || [];

  // Build member id -> name map
  const memberMap: Record<string, string> = {};
  for (const m of members) {
    const mem = m as Record<string, unknown>;
    const id = mem.id as string;
    const name = `${mem.firstName} ${mem.lastName}`.trim();
    memberMap[id] = name;
  }

  for (const t of teams) {
    const team = t as Record<string, unknown>;
    const name = (team.name as string) || "";
    const abbrev = (team.abbrev as string) || "";
    const fullName = `${name} ${abbrev}`.trim();

    const primaryOwner = team.primaryOwner as string;
    const owners = (team.owners as string[]) || [];
    const allOwnerIds = [primaryOwner, ...owners].filter(Boolean);
    const ownerNames = allOwnerIds.map((id) => memberMap[id] || id).join(", ");

    const isRod =
      ownerNames.toLowerCase().includes("rod") ||
      ownerNames.toLowerCase().includes("sellers") ||
      fullName.toLowerCase().includes("str8") ||
      fullName.toLowerCase().includes("rodzilla") ||
      fullName.toLowerCase().includes("rod");

    if (isRod) {
      const tid = team.id as number;
      const record = (team.record as Record<string, unknown>) || {};
      const overall = (record.overall as Record<string, unknown>) || {};
      const wins = (overall.wins as number) || 0;
      const losses = (overall.losses as number) || 0;
      const pf = (overall.pointsFor as number) || 0;
      const pa = (overall.pointsAgainst as number) || 0;
      const seed = team.playoffSeed as number;
      const rankFinal = team.rankFinal as number;

      console.log(`\n=== SEASON ${season} ===`);
      console.log(`Team: ${fullName} (ID: ${tid})`);
      console.log(`Owners: ${ownerNames}`);
      console.log(`Record: ${wins}-${losses}, PF: ${pf.toFixed(1)}, PA: ${pa.toFixed(1)}`);
      console.log(`Playoff Seed: ${seed}, Final Rank: ${rankFinal}`);

      // Get keepers from draft
      const draftDetail = (payload.draftDetail as Record<string, unknown>) || {};
      const picks = (draftDetail.picks as unknown[]) || [];
      const seenPicks = new Set<number>();
      for (const pk of picks) {
        const pick = pk as Record<string, unknown>;
        const overallPick = pick.overallPickNumber as number;
        if (seenPicks.has(overallPick)) continue;
        seenPicks.add(overallPick);
        if (pick.teamId === tid && pick.keeper) {
          const playerInfo = (pick.playerInfo as Record<string, unknown>) || {};
          const playerName = (playerInfo.playerName as string) || `Player#${pick.playerId}`;
          console.log(`  KEEPER: ${playerName} (Rd ${pick.roundId})`);
        }
      }
    }
  }
}

await conn.end();
