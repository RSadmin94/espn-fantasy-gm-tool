/**
 * Week 2 automation proof — does not invent Week 2 final scores.
 * Resolves ESPN clock, then runs scheduled processLeagueWeek for cron weeks.
 *
 * Usage: railway run --service espn-fantasy-gm-tool -- pnpm exec tsx scripts/_weekly_season_week2_automation.mts
 */
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
}

const LEAGUE_ID = "457622";
const outDir = path.join(process.cwd(), "scripts", "_weekly_season_week2_automation");
fs.mkdirSync(outDir, { recursive: true });

const { resolveSeasonClockForLeague, processLeagueWeek, planScheduledWeeks, shouldGenerateEditionNarratives } =
  await import("../server/weeklySeasonEngine.ts");

console.log("=== WEEK 2 AUTOMATION — 457622 ===");
const clock = await resolveSeasonClockForLeague({ leagueId: LEAGUE_ID });
console.log(`season=${clock.season} currentMatchupPeriod=${clock.currentMatchupPeriod} latestScoringPeriod=${clock.latestScoringPeriod}`);
console.log(`requestedWeek=${clock.requestedWeek} weekStatus=${clock.weekStatus}`);

const week1 = await resolveSeasonClockForLeague({ leagueId: LEAGUE_ID, week: 1 });
console.log(`Week 1 status=${week1.weekStatus} (expect FINAL)`);

const week2 = await resolveSeasonClockForLeague({ leagueId: LEAGUE_ID, week: 2 });
console.log(`Week 2 status=${week2.weekStatus} (provider state, not fabricated)`);

const upcomingWeek = Math.min(17, Math.max(clock.currentMatchupPeriod + 2, clock.requestedWeek + 2));
const upcoming = await resolveSeasonClockForLeague({ leagueId: LEAGUE_ID, week: upcomingWeek });
console.log(`Week ${upcomingWeek} status=${upcoming.weekStatus} (expect UPCOMING)`);

const planned = await planScheduledWeeks({ leagueId: LEAGUE_ID });
const cronWeeks = planned.weeks;
console.log(`cron weeks from current clock: ${cronWeeks.join(", ")}`);

const packs = [];
for (const week of cronWeeks) {
  console.log(`\nprocessLeagueWeek scheduled week=${week}`);
  const pack = await processLeagueWeek({ leagueId: LEAGUE_ID, week, mode: "scheduled" });
  const generate = shouldGenerateEditionNarratives("scheduled", pack.clock.weekStatus);
  console.log(`  status=${pack.clock.weekStatus} generateEdition=${generate} editionNarratives=${pack.receipts.editionNarrativeCount} stats=${pack.receipts.weeklyStatsStatus}/${pack.receipts.weeklyStatsRows} errors=${pack.receipts.errors.length ? pack.receipts.errors.join(" | ") : "none"}`);
  packs.push({
    week: pack.clock.requestedWeek,
    weekStatus: pack.clock.weekStatus,
    generateEdition: generate,
    editionNarrativeCount: pack.receipts.editionNarrativeCount,
    weeklyStatsStatus: pack.receipts.weeklyStatsStatus,
    weeklyStatsRows: pack.receipts.weeklyStatsRows,
    errors: pack.receipts.errors,
  });
}

if (upcoming.weekStatus === "UPCOMING") {
  console.log(`\nprocessLeagueWeek scheduled UPCOMING week=${upcomingWeek}`);
  const pack = await processLeagueWeek({ leagueId: LEAGUE_ID, week: upcomingWeek, mode: "scheduled" });
  const generate = shouldGenerateEditionNarratives("scheduled", pack.clock.weekStatus);
  console.log(`  status=${pack.clock.weekStatus} generateEdition=${generate} stats=${pack.receipts.weeklyStatsStatus}`);
  packs.push({
    week: pack.clock.requestedWeek,
    weekStatus: pack.clock.weekStatus,
    generateEdition: generate,
    editionNarrativeCount: pack.receipts.editionNarrativeCount,
    weeklyStatsStatus: pack.receipts.weeklyStatsStatus,
    weeklyStatsRows: pack.receipts.weeklyStatsRows,
    errors: pack.receipts.errors,
  });
}

const report = {
  leagueId: LEAGUE_ID,
  clock,
  week1: { week: 1, weekStatus: week1.weekStatus },
  week2: { week: 2, weekStatus: week2.weekStatus },
  upcoming: { week: upcomingWeek, weekStatus: upcoming.weekStatus },
  cronWeeks,
  packs,
  policy: {
    UPCOMING: "no final weekly edition",
    SCORING: "refresh stats/rosters/standings; no final edition Sofia",
    FINAL: "scheduled mode produces headline + major narratives via cache/gate",
  },
};

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.join(outDir, "report.json")}`);
if (week1.weekStatus !== "FINAL") {
  console.error("Week 1 is not FINAL");
  process.exit(2);
}
process.exit(0);
