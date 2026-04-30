import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { espnSeasonCache } from "./drizzle/schema.js";
import { eq } from "drizzle-orm";

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const db = drizzle(conn);
const rows = await db.select().from(espnSeasonCache).where(eq(espnSeasonCache.season, 2025));
const payload = rows[0].payload as Record<string, unknown>;
const draft = (payload.draftDetail as Record<string, unknown>)?.picks as unknown[] || [];
const seen = new Set<number>();
for (const pk of draft) {
  const p = pk as Record<string, unknown>;
  const ovp = p.overallPickNumber as number;
  if (seen.has(ovp)) continue;
  seen.add(ovp);
  if (p.teamId === 11 && p.keeper) {
    const pi = p.playerInfo as Record<string, unknown> || {};
    console.log("Rod 2025 keeper:", {
      playerId: p.playerId,
      round: p.roundId,
      playerName: pi.playerName,
      fullName: pi.fullName,
      proTeamId: pi.proTeamId,
      defaultPositionId: pi.defaultPositionId,
    });
    // Also check all keys
    console.log("playerInfo keys:", Object.keys(pi));
  }
}
await conn.end();
