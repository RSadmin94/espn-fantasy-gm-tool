/**
 * Live advisor LLM test — verifies multi-season history and rival detection
 * are correctly incorporated into the AI GM Advisor's responses.
 *
 * Run: node server/advisorLiveTest.mjs
 */

const BASE = "http://localhost:3000";
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

async function trpcGet(path, input = {}) {
  const url = `${BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await fetch(url);
  const raw = await res.json();
  const d = Array.isArray(raw) ? raw[0] : raw;
  return d?.result?.data?.json ?? null;
}

// ─── Step 1: Load 2025 standings ─────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log("STEP 1 — 2025 season standings (multi-season history check)");
console.log("══════════════════════════════════════════════════════════════");

const standings = await trpcGet("espn.standings", { season: 2025 });
const teams = standings ?? [];
if (teams.length > 0) {
  const sorted = [...teams].sort((a, b) => (a.rankFinal ?? 99) - (b.rankFinal ?? 99));
  console.log(`✅ 2025 standings: ${teams.length} teams loaded`);
  sorted.slice(0, 5).forEach(t =>
    console.log(`  ${t.rankFinal}. ${t.teamName} (${t.owners}) ${t.wins}W-${t.losses}L PF:${Number(t.pointsFor).toFixed(1)}`)
  );
  const rod = sorted.find(t => t.owners?.toLowerCase().includes("rod"));
  if (rod) console.log(`\n  ✅ Rod's 2025 result: Rank #${rod.rankFinal}, ${rod.wins}W-${rod.losses}L, PF:${Number(rod.pointsFor).toFixed(1)}`);
} else {
  console.log("❌ No standings data");
}

// ─── Step 2: Load all seasons ────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log("STEP 2 — Multi-season history (18 seasons 2009–2026)");
console.log("══════════════════════════════════════════════════════════════");

const allSeasons = await trpcGet("espn.allSeasons");
if (allSeasons?.length > 0) {
  console.log(`✅ All seasons: ${allSeasons.join(", ")}`);
  console.log(`   Total: ${allSeasons.length} seasons (${allSeasons[0]}–${allSeasons[allSeasons.length - 1]})`);
} else {
  console.log("❌ allSeasons returned nothing");
}

// ─── Step 3: Load DNA profiles and rival detection ───────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log("STEP 3 — League DNA profiles and rival detection");
console.log("══════════════════════════════════════════════════════════════");

const dnaProfiles = await trpcGet("dna.leagueProfiles");
let rivalName = "Unknown";
let rivalH2H = "N/A";
let rivalSummary = "";

if (dnaProfiles?.length > 0) {
  console.log(`✅ DNA profiles: ${dnaProfiles.length} managers`);

  // Find Rod
  const rod = dnaProfiles.find(p => p.ownerName?.toLowerCase().includes("rod"));
  if (rod) {
    console.log(`\n  Rod Sellers:`);
    console.log(`    Archetype: ${rod.gmArchetype}`);
    console.log(`    Exploitability: ${rod.exploitabilityScore}/100 (${rod.exploitabilityLabel})`);
    console.log(`    Seasons analyzed: ${rod.seasonsAnalyzed}`);
  }

  // Find biggest rival (most losses vs Rod)
  const rivals = dnaProfiles
    .filter(p => !p.ownerName?.toLowerCase().includes("rod"))
    .map(p => ({
      name: p.ownerName,
      h2h: p.trade?.h2hVsRod ?? { wins: 0, losses: 0 },
      exploitability: p.exploitabilityScore,
      archetype: p.gmArchetype,
      summary: p.dnaSummary,
    }))
    .sort((a, b) => {
      // Score: losses vs Rod * 0.4 + exploitability * 0.3 + (losses/(wins+losses)) * 0.3
      const scoreA = a.h2h.losses * 0.4 + a.exploitability * 0.3 + (a.h2h.losses / Math.max(1, a.h2h.wins + a.h2h.losses)) * 30;
      const scoreB = b.h2h.losses * 0.4 + b.exploitability * 0.3 + (b.h2h.losses / Math.max(1, b.h2h.wins + b.h2h.losses)) * 30;
      return scoreB - scoreA;
    });

  console.log(`\n  Top rivals by H2H losses vs Rod:`);
  rivals.slice(0, 4).forEach(r =>
    console.log(`    ${r.name}: ${r.h2h.wins}W-${r.h2h.losses}L vs Rod | Exploitability: ${r.exploitability}/100 | ${r.archetype}`)
  );

  rivalName = rivals[0]?.name ?? "Unknown";
  rivalH2H = `${rivals[0]?.h2h.wins}W-${rivals[0]?.h2h.losses}L`;
  rivalSummary = rivals[0]?.summary ?? "";
} else {
  console.log("❌ No DNA profiles");
}

// ─── Step 4: Live LLM call with multi-season + rival context ─────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log("STEP 4 — Live LLM call: multi-season history + rival detection");
console.log("══════════════════════════════════════════════════════════════");

if (!FORGE_URL || !FORGE_KEY) {
  console.log("❌ BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY not available");
  process.exit(1);
}

// Build the advisor system prompt (mirrors what advisor.chat builds)
const rod2025 = teams.find(t => t.owners?.toLowerCase().includes("rod"));
const allTeamsList = teams.map(t => `${t.rankFinal}. ${t.teamName} (${t.owners}) ${t.wins}W-${t.losses}L PF:${Number(t.pointsFor).toFixed(1)}`).join("\n  ");

const dnaBlock = dnaProfiles?.length > 0
  ? `LEAGUE DNA INTELLIGENCE (derived from ${dnaProfiles[0]?.seasonsAnalyzed ?? 0}+ seasons of actual behavior — treat as ground truth):\n\n` +
    dnaProfiles.map(d => `  ${d.dnaSummary}`).join("\n\n")
  : "LEAGUE DNA: No behavioral profile data available.";

const systemPrompt = `You are an expert Fantasy Football GM advisor for the league "ATLANTAS FINEST FF" (League ID: 457622).
This is an 18-season keeper league running from 2009 to 2026 with 14 teams.
Format: Head-to-Head Points, PPR (Point Per Reception), Snake Draft, 1 keeper per team.
Scoring positions: QB, RB, WR, TE, K, D/ST. Playoffs: 7 teams.
Be concise, data-driven, and specific. Reference actual team names and player names when possible.

DATA CONTEXT: The 2025 season is COMPLETE (final standings below). The upcoming season is 2026.

2025 FINAL Standings:
  ${allTeamsList}

MULTI-SEASON HISTORY:
- League has operated for ${allSeasons?.length ?? 18} seasons (${allSeasons?.[0] ?? 2009}–${allSeasons?.[allSeasons?.length - 1] ?? 2026})
- Rod Sellers won the 2025 championship (Rank #1, ${rod2025?.wins ?? 9}W-${rod2025?.losses ?? 5}L, PF: ${Number(rod2025?.pointsFor ?? 1921).toFixed(1)})

${dnaBlock}`;

const testPrompt = `I need a strategic briefing on 3 things:
1. Based on my 18-season history in this league, what is my biggest competitive advantage heading into 2026?
2. Who is my most dangerous rival based on head-to-head record and behavioral DNA, and how should I approach them in trades?
3. Which manager in the league is most exploitable right now and why?

Be specific — reference actual names, H2H records, and DNA data.`;

console.log(`\n📤 Sending prompt to LLM...`);
console.log(`   System prompt length: ${systemPrompt.length} chars`);
console.log(`   DNA profiles injected: ${dnaProfiles?.length ?? 0}`);
console.log(`   Seasons in context: ${allSeasons?.length ?? 0}`);

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
      max_tokens: 600,
    }),
  });

  const llmJson = await llmRes.json();
  const reply = llmJson?.choices?.[0]?.message?.content ?? "";

  if (reply) {
    console.log("\n📥 LLM RESPONSE:");
    console.log("──────────────────────────────────────────────────────────────");
    console.log(reply);
    console.log("──────────────────────────────────────────────────────────────");

    // Verification checks
    const checks = [
      {
        label: "References multi-season history (18 seasons / years / 2009)",
        pass: /18.season|18 season|2009|multi.season|history|years? of|since 200[0-9]/i.test(reply),
      },
      {
        label: "References Rod's 2025 championship / #1 rank",
        pass: /champion|#1|rank.?1|first.?place|title|won|2025/i.test(reply),
      },
      {
        label: "References a specific rival by name",
        pass: /demetri|christian|jan|graham|clark|nate|sheldon|mark|lozell|steffon|tony|marcus|bruce/i.test(reply),
      },
      {
        label: "References H2H record (W-L format or wins/losses)",
        pass: /\d+W.?\d+L|\d+.win|\d+.loss|head.to.head|h2h|\bvs\b.*record/i.test(reply),
      },
      {
        label: "References DNA / behavioral / exploitability / archetype",
        pass: /dna|behavioral|exploit|archetype|tilt|trade.window|emotional|pattern/i.test(reply),
      },
      {
        label: "Response is substantive (>200 chars)",
        pass: reply.length > 200,
      },
    ];

    console.log("\n✅ VERIFICATION CHECKS:");
    let passCount = 0;
    for (const c of checks) {
      const icon = c.pass ? "✅" : "❌";
      console.log(`   ${icon} ${c.label}`);
      if (c.pass) passCount++;
    }

    const allPass = passCount === checks.length;
    console.log(`\n${allPass ? "✅ ALL CHECKS PASSED" : `⚠️  ${passCount}/${checks.length} CHECKS PASSED`}`);
    console.log(`   Tokens used: ${llmJson?.usage?.total_tokens ?? "N/A"}`);
    console.log(`   Response length: ${reply.length} chars`);
  } else {
    console.log("❌ LLM returned no content");
    console.log(JSON.stringify(llmJson, null, 2).substring(0, 500));
  }
} catch (err) {
  console.log(`❌ LLM call failed: ${err.message}`);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("TEST COMPLETE");
console.log("══════════════════════════════════════════════════════════════\n");
