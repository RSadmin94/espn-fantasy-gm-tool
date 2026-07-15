/**
 * Phase 3 post-deploy live confirm — mock draft anchors + draftDecision ledger.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = process.argv[2] ?? "457622";
const SEASON = Number(process.argv[3] ?? "2026");
const EXPECTED_SHA = process.argv[4] ?? "";

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

const { getDb } = await import("../server/db.ts");
const { buildMockDraft } = await import("../server/draftWarRoomRouter.ts");
const { computeLeaguePositionTimingProfiles } = await import("../server/leagueDraftTimingProfile.ts");
const { loadOwnerDraftDnaContext } = await import("../server/ownerDraftDnaModel.ts");
const { sql: drizzleSql } = await import("drizzle-orm");
const { users } = await import("../drizzle/schema.ts");
const { resolvePremiumAccess } = await import("../server/_core/trpc.ts");

async function loadInputs() {
  const fixture = path.join(ROOT, "scripts", `_mock_fixture_${LEAGUE_ID}.json`);
  if (fs.existsSync(fixture)) {
    const { deserializeMockFixture } = await import("../server/ownerDraftDnaSimulation.ts");
    return deserializeMockFixture(JSON.parse(fs.readFileSync(fixture, "utf8")));
  }
  throw new Error(`Fixture missing: ${fixture}`);
}

const inputs = await loadInputs();
const db = await getDb();
if (!db) throw new Error("no db");
if (!inputs.dpTiming) {
  const profiles = await computeLeaguePositionTimingProfiles({ db, sql: drizzleSql, leagueId: LEAGUE_ID });
  inputs.dpTiming = profiles.dp;
}
if (!inputs.ownerDnaContext) {
  inputs.ownerDnaContext = await loadOwnerDraftDnaContext({
    db, sql: drizzleSql, leagueId: LEAGUE_ID, currentSeason: SEASON,
  });
}

const picks = buildMockDraft(inputs);
const garrett = picks.find((p) => /Myles Garrett/i.test(p.player));
const warner = picks.find((p) => /Fred Warner/i.test(p.player));
const dpCount = picks.filter((p) => p.position === "DP" && !p.isKeeperSlot).length;
const byTeam = new Map<number, number>();
for (const p of picks.filter((x) => x.position === "DP" && !x.isKeeperSlot)) {
  byTeam.set(p.teamId, (byTeam.get(p.teamId) ?? 0) + 1);
}
const teamsWith2PlusDp = [...byTeam.entries()].filter(([, c]) => c >= 2).map(([t]) => t);
const nonKeeper = picks.filter((p) => !p.isKeeperSlot);
const withDecision = nonKeeper.filter((p) => p.draftDecision != null).length;
const withIntel = nonKeeper.filter((p) => p.pickIntelligence != null).length;
const garrettIntel = garrett?.pickIntelligence?.plainEnglish ?? null;

let prodGitSha: string | null = null;
try {
  const res = await fetch("https://gmwarroom.online/api/health");
  const health = await res.json() as { gitSha?: string; status?: string };
  prodGitSha = health.gitSha ?? null;
} catch {
  prodGitSha = null;
}

const report = {
  prodGitSha,
  expectedShaPrefix: EXPECTED_SHA || "(not checked)",
  shaMatch: EXPECTED_SHA ? String(prodGitSha ?? "").startsWith(EXPECTED_SHA) : null,
  garrett: garrett ? { pick: garrett.pickNumber, round: garrett.round, pickIntelligence: garrett.pickIntelligence, draftDecisionPrimary: garrett.draftDecision?.primaryFactor } : null,
  warner: warner ? { pick: warner.pickNumber, round: warner.round, pickIntelligence: warner.pickIntelligence, draftDecisionPrimary: warner.draftDecision?.primaryFactor } : null,
  totalDpPicks: dpCount,
  teamsWith2PlusDp,
  draftDecisionCoverage: `${withDecision}/${nonKeeper.length}`,
  pickIntelligenceCount: withIntel,
  garrettPlainEnglishPreserved: garrettIntel?.includes("League first-DP median") ?? false,
  sampleDecisionLedger: nonKeeper.find((p) => p.draftDecision?.ledger)?.draftDecision?.ledger?.slice(0, 200) ?? null,
};

console.log(JSON.stringify(report, null, 2));

const ok =
  garrett?.pickNumber === 75
  && warner?.pickNumber === 78
  && dpCount === 14
  && teamsWith2PlusDp.length === 0
  && withDecision === nonKeeper.length
  && (garrettIntel?.includes("League first-DP median") ?? false)
  && (!EXPECTED_SHA || String(prodGitSha ?? "").startsWith(EXPECTED_SHA));

process.exit(ok ? 0 : 1);
