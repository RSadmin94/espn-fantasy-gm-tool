/**
 * Real Week 1 certification for Atlantas Finest FF (457622).
 * Calls processLeagueWeek({ mode: "certify" }) against live league data.
 * Does not substitute fixtures.
 *
 * Usage: railway run -- pnpm exec tsx scripts/_weekly_season_week1_cert.mts
 */
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
}

const LEAGUE_ID = "457622";
const WEEK = 1;
const outDir = path.join(process.cwd(), "scripts", "_weekly_season_week1_cert");
fs.mkdirSync(outDir, { recursive: true });

function pad(s: unknown, n: number): string {
  return String(s ?? "").padEnd(n);
}

async function ensureNarrativesTable() {
  const { getDb } = await import("../server/db.ts");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`weekly_season_narratives\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`leagueId\` varchar(32) NOT NULL,
      \`season\` int NOT NULL,
      \`week\` int NOT NULL,
      \`eventId\` varchar(128) NOT NULL,
      \`factFingerprint\` varchar(64) NOT NULL,
      \`promptVersion\` varchar(32) NOT NULL DEFAULT 'rfsn-week-v1',
      \`status\` varchar(16) NOT NULL DEFAULT 'pending',
      \`headline\` varchar(256) NULL,
      \`bodyText\` text NULL,
      \`usageEventId\` int NULL,
      \`errorMessage\` varchar(512) NULL,
      \`generatedAt\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_weekly_season_narrative\` (\`leagueId\`, \`season\`, \`week\`, \`eventId\`, \`factFingerprint\`, \`promptVersion\`),
      KEY \`idx_wsn_league_week\` (\`leagueId\`, \`season\`, \`week\`)
    )`,
  );
}

const { processLeagueWeek } = await import("../server/weeklySeasonEngine.ts");
const { inspectLeagueWeek } = await import("../server/weeklyWeekInspect.ts");
const { rivalryReceiptsForWeek, draftReceiptsForWeek, teamPacketsFromInspect } = await import("../server/weeklyWeekReceipts.ts");
const { composeWeeklyEdition, sofiaStoriesFromEdition, storyFactPacket } = await import("../server/weeklyEdition.ts");
const { ensureEditionNarratives, inspectRosterSnapshotThinness } = await import("../server/weeklyEditionService.ts");
const { getOrCreateWeeklyNarrative, groundNarrative } = await import("../server/weeklySeasonNarratives.ts");
const { getDb } = await import("../server/db.ts");
const { usageEvents, weeklySeasonNarratives } = await import("../drizzle/schema.ts");
const { and, eq, gte, desc } = await import("drizzle-orm");
const { execSync } = await import("node:child_process");

await ensureNarrativesTable();

console.log("=== WEEK 1 CERTIFICATION — 457622 ===");
console.log("processLeagueWeek({ leagueId: 457622, week: 1, mode: certify })");

const pack = await processLeagueWeek({ leagueId: LEAGUE_ID, week: WEEK, mode: "certify" });
const season = pack.clock.season;
const weekStatus = pack.clock.weekStatus;

console.log("\n## A. Week Pack");
console.log(`resolved season: ${season}`);
console.log(`resolved week: ${pack.clock.requestedWeek}`);
console.log(`week status: ${weekStatus}`);
console.log(`team count: ${pack.facts.teamCount}`);
console.log(`matchup count (week): ${pack.facts.matchupCount}`);
console.log(`completed matchups: ${pack.facts.completedMatchupCount}`);
console.log(`weekly player-stat count: ${pack.receipts.weeklyStatsRows} (${pack.receipts.weeklyStatsStatus})`);
console.log(`roster snapshot count: ${pack.receipts.rosterSnapshotCount}`);
console.log(`standings snapshot count: ${pack.receipts.standingsSnapshotCount}`);
console.log(`storyline count: ${pack.receipts.storylineCount}`);
console.log(`fear count: ${pack.receipts.fearCount}`);
console.log(`RFSN story engine count: ${pack.receipts.storyEngineCount}`);
console.log(`player-of-game count: ${pack.receipts.playerOfGameCount}`);
console.log(`bench-regret count: ${pack.receipts.benchRegretCount}`);
console.log(`warnings/errors: ${pack.receipts.errors.length ? pack.receipts.errors.join(" | ") : "none"}`);

if (weekStatus !== "FINAL") {
  console.error(`\nSTOP: Week ${WEEK} status is ${weekStatus}, expected FINAL. Fix data correctness before storytelling.`);
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ stop: true, reason: "week not FINAL", pack }, null, 2));
  process.exit(2);
}

const inspect = await inspectLeagueWeek({ leagueId: LEAGUE_ID, season, week: WEEK }).catch((e) => {
  console.error("inspect failed:", e instanceof Error ? e.message : e);
  return null;
});
if (!inspect) {
  console.error("\nSTOP: inspect could not read Week Pack facts.");
  process.exit(2);
}
if (inspect.weeklyStatCount < 50 || inspect.rosterSnapshotCount < 50 || inspect.completedMatchups < 7) {
  console.error("\nSTOP: authoritative data is materially incomplete.");
  console.error(JSON.stringify({
    weeklyStatCount: inspect.weeklyStatCount,
    rosterSnapshotCount: inspect.rosterSnapshotCount,
    completedMatchups: inspect.completedMatchups,
    teams: inspect.teams,
  }, null, 2));
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ stop: true, reason: "incomplete data", inspect: { weeklyStatCount: inspect.weeklyStatCount, rosterSnapshotCount: inspect.rosterSnapshotCount, completedMatchups: inspect.completedMatchups } }, null, 2));
  process.exit(2);
}

console.log(`transaction freshness: ${inspect.transactionFreshness ?? "unknown"}`);
console.log(`week-0 current roster count: ${inspect.week0RosterCount}`);

console.log("\n## B. Matchups");
console.log([
  pad("Home (owner)", 28),
  pad("Away (owner)", 28),
  pad("Score", 14),
  pad("Result", 22),
  pad("Margin", 8),
  pad("Top starter", 22),
  pad("Top bench", 22),
  "Regret",
].join(" "));
for (const m of inspect.matchups) {
  const regret = m.benchRegret
    ? `${m.benchRegret.impact} ${m.benchRegret.playerName} +${m.benchRegret.netImprovement}`
    : "—";
  console.log([
    pad(`${m.homeName} (${m.homeOwner})`, 28),
    pad(`${m.awayName} (${m.awayOwner})`, 28),
    pad(`${m.homeScore}-${m.awayScore}`, 14),
    pad(m.result, 22),
    pad(m.margin, 8),
    pad(m.highestStarter ? `${m.highestStarter.name} ${m.highestStarter.points}` : "—", 22),
    pad(m.highestBench ? `${m.highestBench.name} ${m.highestBench.points}` : "—", 22),
    regret,
  ].join(" "));
}

const s = inspect.superlatives;
console.log("\n## C. League Superlatives");
console.log(`highest scoring team: ${s.highestTeam?.name} (${s.highestTeam?.owner}) ${s.highestTeam?.score}`);
console.log(`lowest scoring team: ${s.lowestTeam?.name} (${s.lowestTeam?.owner}) ${s.lowestTeam?.score}`);
console.log(`closest game: ${s.closest?.homeName} vs ${s.closest?.awayName} margin ${s.closest?.margin}`);
console.log(`largest blowout: ${s.blowout?.homeName} vs ${s.blowout?.awayName} margin ${s.blowout?.margin}`);
console.log(`league average: ${s.leagueAverage}`);
console.log(`Week MVP: ${s.mvp ? `${s.mvp.player} ${s.mvp.points} (${s.mvp.position}) — ${s.mvp.owner}` : "none"}`);
console.log(`strongest bench regret: ${s.strongestRegret ? `${s.strongestRegret.ownerName} ${s.strongestRegret.playerName} net ${s.strongestRegret.netImprovement} ${s.strongestRegret.impact}` : "none"}`);
console.log(`WIN_FLIP count: ${s.winFlipCount}`);

console.log("\n## D. Detected Events (raw)");
for (const e of inspect.events) {
  console.log(`- [${e.source}] ${e.eventType} id=${e.eventId} canonical=${e.canonicalId}`);
  console.log(`  subject=${e.subject} opponent=${e.opponent ?? "n/a"} confidence=${e.confidence} significance=${e.significance}`);
  console.log(`  facts=${JSON.stringify(e.facts)}`);
}
console.log(`raw detections: ${inspect.rawEventCount}`);
console.log(`canonical events: ${inspect.canonicalEventCount}`);
for (const g of inspect.canonicalGroups) {
  console.log(`  ${g.canonicalId} x${g.count} types=${g.types.join(",")} sources=${g.sources.join(",")}`);
}

console.log("\n## Story significance");
for (const [k, v] of Object.entries(inspect.categories)) {
  console.log(`  ${k}: ${v}`);
}

const rivalry = await rivalryReceiptsForWeek({ leagueId: LEAGUE_ID, season, week: WEEK, matchups: inspect.matchups });
const regrets = inspect.matchups.map((m) => m.benchRegret).filter((r): r is NonNullable<typeof r> => !!r);
const drafts = await draftReceiptsForWeek({ leagueId: LEAGUE_ID, season, week: WEEK, players: inspect.players, regrets });
inspect.categories.draft_receipt = drafts.length ? "DETECTED" : "NO QUALIFYING EVENT";
inspect.categories.rivalry_result = rivalry.length ? "DETECTED" : "NO QUALIFYING EVENT";

console.log("\n## I. Draft Receipts");
if (!drafts.length) console.log("none — no unusually strong Week 1 draft connections");
for (const d of drafts) console.log(`- ${d.kind} ${d.playerName} / ${d.ownerName} ${d.classification} ${JSON.stringify(d.facts)}`);

console.log("\n## J. Rivalries");
if (!rivalry.length) console.log("none — no Week 1 matchup had enough historical H2H to qualify");
for (const r of rivalry) console.log(`- ${r.note} entering ${r.careerEntering} after ${r.careerAfter} streak ${r.streak ?? "n/a"} closeGames ${r.closeGames} playoffs ${r.playoffMeetings}`);

console.log("\n## H. Fear Index");
const invalidFear: string[] = [];
for (const f of inspect.fear) {
  const evidence = `score=${f.fearScore} heat=${f.heatLabel} avgPfLast4=${f.avgPfLast4} streak=${f.winStreak}`;
  console.log(`- ${f.ownerName} ${evidence}`);
  if (String(f.heatLabel).includes("RISING") && Number(f.avgPfLast4) <= 0 && Number(f.winStreak) <= 0) {
    invalidFear.push(`${f.ownerName}: RISING without PF/streak evidence`);
  }
}
if (invalidFear.length) {
  console.error("FEAR_RISING 0-PF regression:", invalidFear.join("; "));
}

const teams = teamPacketsFromInspect({
  matchups: inspect.matchups,
  leagueAverage: s.leagueAverage,
  rivalry,
  drafts,
});
console.log("\n## Team packets");
for (const t of teams) {
  console.log(`- ${t.ownerName} ${t.result} ${t.score} vs ${t.opponent} rank ${t.scoringRank} path ${t.championshipPathMovement}`);
  if (t.bestStarter) console.log(`    best starter ${t.bestStarter.name} ${t.bestStarter.points}`);
  if (t.meaningfulBenchIssue) console.log(`    bench ${t.meaningfulBenchIssue.impact} ${t.meaningfulBenchIssue.playerName}`);
  if (t.rivalryContext) console.log(`    rivalry ${t.rivalryContext}`);
  if (t.draftReceipt) console.log(`    draft ${t.draftReceipt}`);
  if (t.actionableConcern) console.log(`    watch ${t.actionableConcern}`);
}

const edition = composeWeeklyEdition({
  leagueId: LEAGUE_ID,
  season,
  week: WEEK,
  matchups: inspect.matchups,
  events: inspect.events,
  rivalry,
  teams,
  leagueAverage: s.leagueAverage,
  mvp: s.mvp,
  strongestRegret: s.strongestRegret,
});

console.log("\n## Headline");
if (!edition.headline) console.log("none");
else {
  const hs = edition.headline.headlineScore;
  console.log(`${edition.headline.eventType} — ${edition.headline.dek}`);
  console.log(`HEADLINE_SCORE drama=${hs?.drama} consequence=${hs?.consequence} historical=${hs?.historical} dominance=${hs?.dominance} rarity=${hs?.rarity} total=${hs?.total}`);
  console.log(`composedFrom=${edition.headline.composedFrom.join(",")}`);
}

console.log("\n## Major Stories");
for (const m of edition.majorStories) {
  console.log(`- ${m.eventType} [${m.diversityKey}] ${m.dek}`);
}
console.log(`diversity keys: ${edition.majorStories.map((m) => m.diversityKey).join(", ") || "none"}`);
console.log(`league-level WIN_FLIP count: ${[edition.headline, ...edition.majorStories].filter((x) => x?.eventType === "WIN_FLIP").length}`);

console.log("\n## Superlatives");
console.log(JSON.stringify(edition.superlatives, null, 2));

console.log("\n## Owner Takes");
for (const t of edition.ownerTakes) {
  console.log(`- ${t.ownerName} team=${t.teamId} ${t.eventType} sofia=${t.generateSofia} — ${t.dek}`);
}

console.log("\n## Weekly Events vs Historical Context");
console.log(`weekly events: ${edition.weeklyEventCount}`);
console.log(`historical context: ${edition.historicalContextCount}`);
console.log(`canonical editorial events: ${edition.canonicalEditorialEventCount}`);
console.log(`raw detections: ${inspect.rawEventCount}`);
console.log(`canonical (unfiltered): ${inspect.canonicalEventCount}`);

const snapshot = await inspectRosterSnapshotThinness({ leagueId: LEAGUE_ID, season, week: WEEK });
console.log("\n## Snapshot investigation");
console.log(JSON.stringify(snapshot, null, 2));

console.log("\n## F/G/K Sofia + grounding + cache");
const ensured = await ensureEditionNarratives({ leagueId: LEAGUE_ID, season, week: WEEK, edition });
const generated: Array<{ eventId: string; first: unknown; second: unknown; grounding: unknown; headline: string | null; body: string | null }> = [];
for (const story of sofiaStoriesFromEdition(edition)) {
  const packet = storyFactPacket(story, { week: WEEK, season });
  const first = ensured.results.find((r) => r.eventId === story.eventId) ?? await getOrCreateWeeklyNarrative({ leagueId: LEAGUE_ID, season, week: WEEK, packet });
  const second = await getOrCreateWeeklyNarrative({ leagueId: LEAGUE_ID, season, week: WEEK, packet });
  const grounding = first.bodyText ? groundNarrative(first.bodyText, packet) : { claims: [], supported: 0, unsupported: 0, contradicted: 0 };
  console.log(`--- ${story.eventType} ${story.presentationLabel}`);
  console.log(`first=${first.status}/${first.cache} second=${second.status}/${second.cache}`);
  console.log(`headline: ${first.headline}`);
  console.log(`body: ${first.bodyText}`);
  console.log(`grounding supported=${grounding.supported} unsupported=${grounding.unsupported} contradicted=${grounding.contradicted}`);
  generated.push({ eventId: story.eventId, first, second, grounding, headline: first.headline, body: first.bodyText });
}

const concurrentStory = sofiaStoriesFromEdition(edition)[0];
let c1 = { status: "SKIP", cache: "SKIP" as string };
let c2 = { status: "SKIP", cache: "SKIP" as string };
if (concurrentStory) {
  const packet = storyFactPacket(concurrentStory, { week: WEEK, season });
  [c1, c2] = await Promise.all([
    getOrCreateWeeklyNarrative({ leagueId: LEAGUE_ID, season, week: WEEK, packet }),
    getOrCreateWeeklyNarrative({ leagueId: LEAGUE_ID, season, week: WEEK, packet }),
  ]);
  console.log(`concurrent headline: ${c1.status}/${c1.cache} vs ${c2.status}/${c2.cache}`);
}

const db = await getDb();
const since = new Date(Date.now() - 60 * 60 * 1000);
const usage = db
  ? await db
      .select()
      .from(usageEvents)
      .where(and(eq(usageEvents.featureId, "WEEKLY_INTEL"), gte(usageEvents.createdAt, since)))
      .orderBy(desc(usageEvents.createdAt))
      .limit(30)
  : [];
const narRows = db
  ? await db
      .select()
      .from(weeklySeasonNarratives)
      .where(and(eq(weeklySeasonNarratives.leagueId, LEAGUE_ID), eq(weeklySeasonNarratives.season, season), eq(weeklySeasonNarratives.week, WEEK)))
  : [];
const cost = usage.reduce((sum, u) => sum + Number(u.estimatedCostUsd ?? 0), 0);
console.log(`usage records (1h WEEKLY_INTEL): ${usage.length} cost≈$${cost.toFixed(4)}`);
console.log(`narrative rows this week: ${narRows.length} generated=${narRows.filter((n) => n.status === "generated").length}`);

const problems: Array<{ severity: "release blocker" | "important" | "enhancement"; text: string }> = [];
if (invalidFear.length) problems.push({ severity: "release blocker", text: `Fear rising without PF/streak: ${invalidFear.join("; ")}` });
if (generated.some((g) => (g.grounding as { contradicted: number; unsupported: number }).contradicted > 0 || (g.grounding as { unsupported: number }).unsupported > 0)) {
  problems.push({ severity: "release blocker", text: "Sofia narrative has unsupported or contradicted claims" });
}
if (generated.some((g) => (g as { first: { cache: string }; second: { cache: string } }).second.cache !== "HIT")) {
  problems.push({ severity: "important", text: "Second request did not HIT narrative cache" });
}
const genCount = [c1, c2].filter((x) => x.status === "GENERATE").length;
if (genCount > 1) problems.push({ severity: "important", text: `Concurrent first-request generated ${genCount} times` });
if (inspect.week0RosterCount === 0) problems.push({ severity: "release blocker", text: "week-0 current roster missing" });
if (inspect.rosterSnapshotCount === inspect.week0RosterCount && inspect.rosterSnapshotCount > 0) {
  problems.push({ severity: "important", text: "Week 1 roster count equals week-0 count — verify historical snapshot is distinct" });
}
const leagueWinFlips = [edition.headline, ...edition.majorStories].filter((x) => x?.eventType === "WIN_FLIP");
if (leagueWinFlips.length > 1) {
  problems.push({ severity: "release blocker", text: `Editorial layer still selected ${leagueWinFlips.length} league-level WIN_FLIPs` });
}
if (edition.headline?.eventType === "WIN_FLIP" && edition.majorStories.every((m) => m.eventType === "WIN_FLIP")) {
  problems.push({ severity: "release blocker", text: "Weekly edition is still a WIN_FLIP leaderboard" });
}

let git = { branch: "unknown", sha: "unknown", dirty: true };
try {
  git = {
    branch: execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim(),
    sha: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
    dirty: execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0,
  };
} catch {
  /* ignore */
}
console.log(`\n## Git\n${git.branch} ${git.sha}${git.dirty ? " dirty" : " clean"}`);

const report = {
  leagueId: LEAGUE_ID,
  season,
  week: WEEK,
  weekStatus,
  pack,
  matchups: inspect.matchups,
  superlatives: edition.superlatives,
  edition: {
    headline: edition.headline,
    majorStories: edition.majorStories,
    ownerTakes: edition.ownerTakes.map((t) => ({ owner: t.ownerName, teamId: t.teamId, eventType: t.eventType, sofia: t.generateSofia })),
    weeklyEventCount: edition.weeklyEventCount,
    historicalContextCount: edition.historicalContextCount,
    canonicalEditorialEventCount: edition.canonicalEditorialEventCount,
    oneThatGotAway: edition.oneThatGotAway,
  },
  events: inspect.events,
  rawEventCount: inspect.rawEventCount,
  canonicalEventCount: inspect.canonicalEventCount,
  canonicalGroups: inspect.canonicalGroups,
  categories: inspect.categories,
  generated,
  grounding: generated.map((g) => ({ eventId: g.eventId, ...(g.grounding as object) })),
  fear: inspect.fear,
  invalidFear,
  drafts,
  rivalry,
  teams,
  snapshot,
  cache: {
    generated,
    concurrent: [c1, c2],
    usageCount: usage.length,
    cost,
    narrativeRows: narRows.length,
  },
  problems,
  git,
  ownerView: {
    whatHappened: edition.headline?.dek ?? "no headline",
    why: edition.headline ? `HEADLINE_SCORE ${JSON.stringify(edition.headline.headlineScore)}` : "",
    aroundLeague: edition.majorStories.map((m) => m.eventType).join(", "),
    whatChanged: "Editorial composition over Week Pack; career RFSN is CONTEXT",
    watchNext: "Owner Rivals Take on demand via existing narrative cache",
    wiringNeeded: "League Wire / RFSN Home / dashboard feed WeeklyEditionPanel",
  },
};

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.join(outDir, "report.json")}`);
console.log("\n## M. Problems");
if (!problems.length) console.log("none recorded by cert script");
for (const p of problems) console.log(`[${p.severity}] ${p.text}`);
process.exit(0);
