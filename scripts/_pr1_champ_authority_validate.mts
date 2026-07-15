/**
 * PR1 validation — championship authority parity with the Hall of Fame (medals).
 *
 * Read-only. Confirms the centralized authority resolves the SAME medal champion
 * per season as buildHallOfFamePayload (the medal reference), and reports the
 * source breakdown (medal / finalStanding-fallback / unresolved) per league.
 *
 * Usage:  npx tsx scripts/_pr1_champ_authority_validate.mts [leagueId]
 * Default leagueId: 158918
 */
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
if (!line) { console.error("DATABASE_URL not found in .env"); process.exit(1); }
process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();

const leagueId = process.argv[2] ?? "158918";

const { getDb } = await import("../server/db.ts");
const { buildChampionshipAuthority } = await import("../server/championshipAuthority.ts");
const { buildHallOfFamePayload } = await import("../server/hallOfFameService.ts");

const db = await getDb();
if (!db) { console.error("NO_DB"); process.exit(1); }

const auth = await buildChampionshipAuthority({ db, leagueId });
const hof = await buildHallOfFamePayload({ db, leagueId, userId: 1 });

// source breakdown
let medal = 0, fallback = 0, unresolved = 0;
for (const src of auth.sourceBySeason.values()) {
  if (src === "medal") medal++;
  else if (src === "finalStanding-fallback") fallback++;
  else unresolved++;
}

// parity: for every season HoF resolved a medal champion, the authority must agree (and be medal-sourced)
const mismatches: string[] = [];
for (const h of hof.championships.history) {
  const hofKey = (h as any).resolvedChampionOwnerKey as string | null;
  if (!hofKey) continue; // HoF didn't resolve a medal champion this season
  const authKey = auth.championKeyBySeason.get(h.season) ?? null;
  const authSrc = auth.sourceBySeason.get(h.season);
  if (authSrc !== "medal") mismatches.push(`season ${h.season}: HoF medal champion but authority source=${authSrc}`);
  else if (authKey !== hofKey) mismatches.push(`season ${h.season}: key HoF=${hofKey} vs authority=${authKey}`);
}

// medal-only titles parity vs HoF leaderboard
const authMedalTitles = new Map<string, number>();
for (const [s, src] of auth.sourceBySeason) {
  if (src !== "medal") continue;
  const k = auth.championKeyBySeason.get(s);
  if (k) authMedalTitles.set(k, (authMedalTitles.get(k) ?? 0) + 1);
}
const titleMismatches: string[] = [];
for (const lb of hof.championships.leaderboard) {
  const a = authMedalTitles.get(lb.ownerKey) ?? 0;
  if (a !== lb.titles) titleMismatches.push(`${lb.displayName}: HoF=${lb.titles} vs authority(medal)=${a}`);
}

console.log(`\n=== PR1 championship authority validation — league ${leagueId} ===`);
console.log(`seasons resolved: medal=${medal}, finalStanding-fallback=${fallback}, unresolved=${unresolved}`);
console.log(`fallbackSeasons: [${auth.fallbackSeasons.join(", ")}]`);
console.log(`unresolvedSeasons: [${auth.unresolvedSeasons.join(", ")}]`);
console.log(`HoF leaderboard entries: ${hof.championships.leaderboard.length}, medal history rows: ${hof.championships.history.length}`);
console.log(`season-key parity mismatches: ${mismatches.length}`);
for (const m of mismatches) console.log("  - " + m);
console.log(`medal-title parity mismatches: ${titleMismatches.length}`);
for (const m of titleMismatches) console.log("  - " + m);

const pass = mismatches.length === 0 && titleMismatches.length === 0;
console.log(`\nRESULT: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
