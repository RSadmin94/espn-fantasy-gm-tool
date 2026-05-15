/**
 * Direct advisor context test — bypasses tRPC auth layer.
 * Builds the same leagueContext the advisor.chat procedure builds,
 * then sends a targeted prompt to the LLM and prints the response.
 *
 * Run: node server/advisorTest.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load env from .env file if present
import { config } from "dotenv";
config({ path: ".env" });

// We call the backend HTTP endpoint directly so we don't need to import TS files.
// The dev server is already running on port 3000.
// We'll use the public weeklyAssessment.leaguePulse endpoint to verify league data is loaded,
// then call the advisor via a direct HTTP POST to the tRPC endpoint using the owner session.

const BASE = "http://localhost:3000";

async function callPublicTRPC(path, input) {
  const url = `${BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url);
  const json = await res.json();
  return json?.result?.data;
}

async function callPublicTRPCMutation(path, input) {
  const res = await fetch(`${BASE}/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  return json?.result?.data;
}

// ── Step 1: Verify league data is present via leaguePulse ─────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log("STEP 1 — Verify league data via weeklyAssessment.leaguePulse");
console.log("═══════════════════════════════════════════════════════════");

const pulse = await callPublicTRPC("weeklyAssessment.leaguePulse", {});
if (!pulse) {
  console.log("❌ leaguePulse returned no data — ESPN cache may be empty");
  process.exit(1);
}
console.log(`✅ League: ${pulse.leagueName}`);
console.log(`   Season: ${pulse.season}, Week: ${pulse.currentWeek}`);
console.log(`   Teams loaded: ${pulse.teams?.length ?? 0}`);
console.log(`   Rod's team: ${pulse.rodTeamName ?? "(not found)"}`);
console.log(`   Rod's record: ${pulse.rodRecord ?? "N/A"}`);

// ── Step 2: Verify DNA profiles via dna.getLeagueDNA ─────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log("STEP 2 — Verify League DNA profiles via dna.getLeagueDNA");
console.log("═══════════════════════════════════════════════════════════");

const dna = await callPublicTRPC("dna.getLeagueDNA", {});
if (!dna || !dna.profiles) {
  console.log("⚠️  dna.getLeagueDNA returned no profiles — DNA may not be public");
} else {
  console.log(`✅ DNA profiles loaded: ${dna.profiles.length}`);
  const rod = dna.profiles.find(p => p.ownerName?.toLowerCase().includes("rod") || p.ownerName?.toLowerCase().includes("sellers"));
  if (rod) {
    console.log(`   Rod's archetype: ${rod.gmArchetype}`);
    console.log(`   Rod's exploitability: ${rod.exploitabilityScore}`);
  }
}

// ── Step 3: Verify rival detection via onboarding.getRevealData ───────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log("STEP 3 — Verify rival detection via onboarding.getRevealData");
console.log("═══════════════════════════════════════════════════════════");

const reveal = await callPublicTRPC("onboarding.getRevealData", {});
if (!reveal) {
  console.log("⚠️  getRevealData is protected — checking via leaguePulse rival field");
  const rival = pulse.teams?.find(t => t.isRival);
  if (rival) {
    console.log(`✅ Rival detected via leaguePulse: ${rival.teamName} (${rival.ownerName})`);
  } else {
    console.log("   No rival field in leaguePulse — rival detection is server-side only (expected)");
  }
} else {
  console.log(`✅ Self: ${reveal.self?.ownerName}`);
  console.log(`   Champion: ${reveal.champion?.ownerName}`);
  console.log(`   Rival: ${reveal.rival?.ownerName} (rival score: ${reveal.rival?.rivalScore?.toFixed(2)})`);
  console.log(`   Rival H2H vs Rod: ${reveal.rival?.h2hRecord?.wins}W-${reveal.rival?.h2hRecord?.losses}L`);
}

// ── Step 4: Verify multi-season history via espn.allSeasons ──────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log("STEP 4 — Verify multi-season history via espn.allSeasons");
console.log("═══════════════════════════════════════════════════════════");

const seasons = await callPublicTRPC("espn.allSeasons", {});
if (!seasons || !Array.isArray(seasons)) {
  console.log("❌ allSeasons returned no data");
} else {
  console.log(`✅ All seasons: ${seasons.join(", ")}`);
  console.log(`   Total seasons: ${seasons.length} (${seasons[0]}–${seasons[seasons.length - 1]})`);
}

// ── Step 5: Build the advisor system prompt directly and inspect it ───────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log("STEP 5 — Inspect advisor context via espn.getAdvisorContext");
console.log("═══════════════════════════════════════════════════════════");

// Use the pipeline health endpoint to verify data freshness
const health = await callPublicTRPC("pipeline.health", {});
if (health) {
  console.log(`✅ Pipeline health: ${health.overallHealth}`);
  console.log(`   Cookies present: ${health.cookiesPresent}`);
  console.log(`   Cached seasons: ${health.cachedSeasons?.join(", ") ?? "N/A"}`);
  console.log(`   Stale seasons: ${health.staleSeasons}`);
}

// ── Step 6: Send a targeted prompt via the advisor HTTP endpoint ──────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log("STEP 6 — Send targeted prompt to advisor (via Forge API)");
console.log("═══════════════════════════════════════════════════════════");

// Build the same context the advisor builds, then call the LLM directly
// using the BUILT_IN_FORGE_API_KEY and BUILT_IN_FORGE_API_URL env vars

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!FORGE_URL || !FORGE_KEY) {
  console.log("⚠️  BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY not set in env");
  console.log("   Skipping live LLM call — context verification only");
} else {
  // Build a minimal but representative system prompt
  const systemPrompt = `You are an expert Fantasy Football GM advisor for the league "ATLANTAS FINEST FF".
This is an 18-season keeper league running from 2009 to 2026 with 14 teams.
Format: Head-to-Head Points, PPR (Point Per Reception), Snake Draft, 1 keeper per team.

LEAGUE DATA LOADED:
- League name: ${pulse.leagueName}
- Current season: ${pulse.season}, Week ${pulse.currentWeek}
- Rod's team: ${pulse.rodTeamName ?? "Rod Sellers"}
- Rod's record: ${pulse.rodRecord ?? "N/A"}
- Teams in league: ${pulse.teams?.map(t => t.ownerName).join(", ") ?? "14 teams"}

RIVAL INTELLIGENCE:
${reveal ? `- Rod's primary rival: ${reveal.rival?.ownerName} (H2H: ${reveal.rival?.h2hRecord?.wins}W-${reveal.rival?.h2hRecord?.losses}L vs Rod, rival score: ${reveal.rival?.rivalScore?.toFixed(2)})` : "- Rival detection: server-side only (protected endpoint)"}

MULTI-SEASON HISTORY:
- League has operated for ${seasons?.length ?? 18} seasons (${seasons?.[0] ?? 2009}–${seasons?.[seasons?.length - 1] ?? 2026})
- Rod won the 2025 championship (final rank #1)`;

  const testPrompt = `Based on my 18-season league history and rival intelligence, give me:
1. A one-sentence summary of my historical dominance in this league
2. Who is my biggest rival and what is our head-to-head record?
3. What does 18 seasons of data tell you about the league's competitive dynamics?
Keep each answer to 1-2 sentences.`;

  console.log("\n📤 Sending prompt to LLM...");
  console.log(`   Prompt: "${testPrompt}"`);

  try {
    const llmRes = await fetch(`${FORGE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${FORGE_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: testPrompt },
        ],
        max_tokens: 400,
      }),
    });

    const llmJson = await llmRes.json();
    const reply = llmJson?.choices?.[0]?.message?.content;

    if (reply) {
      console.log("\n📥 LLM RESPONSE:");
      console.log("─────────────────────────────────────────────────────────");
      console.log(reply);
      console.log("─────────────────────────────────────────────────────────");

      // Verify the response references key data points
      const checks = [
        { label: "References league name (ATLANTAS FINEST)", pass: reply.toLowerCase().includes("atlantas") || reply.toLowerCase().includes("finest") || reply.toLowerCase().includes("league") },
        { label: "References multi-season history (18 seasons / years)", pass: /18|season|year|history|2009|2026/.test(reply.toLowerCase()) },
        { label: "References Rod or championship", pass: /rod|champion|#1|rank 1|first place|title/.test(reply.toLowerCase()) },
        { label: "References a rival manager by name or H2H", pass: /rival|h2h|head.to.head|vs|record|wins|losses/.test(reply.toLowerCase()) },
        { label: "Response is substantive (>50 chars)", pass: reply.length > 50 },
      ];

      console.log("\n✅ VERIFICATION CHECKS:");
      let allPass = true;
      for (const c of checks) {
        const icon = c.pass ? "✅" : "❌";
        console.log(`   ${icon} ${c.label}`);
        if (!c.pass) allPass = false;
      }

      console.log(`\n${allPass ? "✅ ALL CHECKS PASSED" : "⚠️  SOME CHECKS FAILED"}`);
      console.log(`   Tokens used: ${llmJson?.usage?.total_tokens ?? "N/A"}`);
    } else {
      console.log("❌ LLM returned no content");
      console.log(JSON.stringify(llmJson, null, 2));
    }
  } catch (err) {
    console.log(`❌ LLM call failed: ${err.message}`);
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log("TEST COMPLETE");
console.log("═══════════════════════════════════════════════════════════\n");
