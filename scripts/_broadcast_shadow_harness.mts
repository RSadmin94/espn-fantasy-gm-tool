/** Shadow harness — editorial orchestration validation across simulated draft sessions. */
import { BroadcastOrchestrator } from "../server/services/sofia/broadcastOrchestrator.ts";
import { COACH, ROXANNE, SOFIA } from "../server/services/sofia/voicePersonalities.ts";
import { buildPlayerRegistryOracle } from "../server/services/sofia/playerRegistryOracle.ts";
import { SessionEditorialLedger } from "../server/services/sofia/editorialLedger.ts";
import { draftMomentToBroadcastMoment } from "../server/services/sofia/broadcastMomentBridge.ts";
import type { DraftMoment } from "../server/services/draftMoments/draftMomentTypes.ts";
import type { VoiceId } from "../server/services/sofia/editorialPlans.ts";

const entailChecker = { async check() { return "entail" as const; } };

function draftPick(pick: number, level: DraftMoment["level"], extras: Partial<DraftMoment> = {}): DraftMoment {
  return {
    eventId: `457622:mock:pick-${pick}`,
    leagueId: "457622",
    draftId: "mock-457622-2026",
    overallPick: pick,
    round: Math.ceil(pick / 12),
    roundPick: ((pick - 1) % 12) + 1,
    owner: { teamId: "1", ownerId: "u1", ownerName: "Rod Sellers", identityScope: "person", identitySource: "gmTeams" },
    player: { playerId: "p1", playerName: "Lamar Jackson", position: "QB", nflTeam: "BAL", adp: 18 },
    rosterBeforePick: { QB: 0 },
    receipts: [],
    signals: [],
    level,
    permittedClaims: [`Rod Sellers selected Lamar Jackson (QB) at pick ${pick}, round ${Math.ceil(pick / 12)}.`],
    forbiddenClaimCategories: [],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: level !== "routine", maxSentences: 2, maxWords: 40 },
    validation: { valid: true, errors: [], warnings: [] },
    ...extras,
  };
}

const oracle = buildPlayerRegistryOracle([
  { playerId: "p1", fullName: "Lamar Jackson", normalizedName: "lamar jackson" },
]);

const ledger = new SessionEditorialLedger();

const orchestrator = new BroadcastOrchestrator({
  voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
  checker: entailChecker,
  playerOracle: oracle,
  ledger,
  generate: async (prompt) => {
    const voice = prompt.includes("Sofia") ? "sofia" : prompt.includes("Coach") ? "coach" : "roxanne";
    const pickMatch = prompt.match(/pick (\d+)/i);
    const pick = pickMatch ? pickMatch[1] : "1";
    const round = Math.ceil(Number(pick) / 12);
    const lines: Record<string, string> = {
      sofia: `Rod Sellers selected Lamar Jackson (QB) at pick ${pick}, round ${round}.`,
      coach: "Here's what worries me about taking a QB this early.",
      roxanne: "Did Rod just reach for his guy?",
    };
    return JSON.stringify({ line: lines[voice], premise: "pick fact" });
  },
});

type Stats = {
  total: number;
  silenced: number;
  leadCounts: Record<VoiceId, number>;
  voiceSum: number;
  callbacks: number;
};

const stats: Stats = {
  total: 0,
  silenced: 0,
  leadCounts: { sofia: 0, coach: 0, roxanne: 0 },
  voiceSum: 0,
  callbacks: 0,
};

async function runMoment(dm: DraftMoment, opts: Parameters<typeof draftMomentToBroadcastMoment>[1] = {}) {
  const frame = await orchestrator.buildFrame(draftMomentToBroadcastMoment(dm, opts));
  stats.total++;
  if (frame.public.status === "suppressed") stats.silenced++;
  const lead = frame.public.primaryVoice?.voice as VoiceId | undefined;
  if (lead) stats.leadCounts[lead]++;
  const onAir = [
    frame.public.primaryVoice,
    frame.public.secondaryVoice,
    ...frame.public.deferredVoices,
  ].filter((v) => v?.accepted).length;
  stats.voiceSum += onAir;
  if (frame.diagnostics.voiceAttempts.length > 0 && frame.public.status === "suppressed") stats.callbacks++;
  return frame;
}

console.log("===== EDITORIAL SHADOW HARNESS =====\n");

// Quiet stretch
for (let p = 1; p <= 8; p++) {
  await runMoment(draftPick(p, "routine"));
}

// Value-heavy round
for (let p = 9; p <= 16; p++) {
  await runMoment(draftPick(p, "notable", { signals: ["STEAL"] }));
}

// Rivalry-heavy
for (let p = 17; p <= 20; p++) {
  await runMoment(draftPick(p, "major", {
    receipts: [{ id: "rivalry", type: "rivalry", status: "available", source: "x", authority: "x", confidence: 1 }],
  }));
}

// Blockbuster trade (league event shape)
await orchestrator.buildFrame({
  ...draftMomentToBroadcastMoment(draftPick(21, "major")),
  identity: { kind: "league_event", leagueId: "457622", eventId: "trade-21", occurredAt: new Date().toISOString() },
  momentType: "trade",
  editorialPlanId: "rivalry_trade",
  context: { kind: "league_storyline", title: "Blockbuster trade", body: "WR swap" },
  receipts: [{ id: "rivalry", type: "rivalry" }],
});

// Championship + decompression
await runMoment(draftPick(22, "historic"), { momentType: "championship", overrideDecompression: false });
await runMoment({ ...draftPick(23, "routine"), commentaryBudget: { enabled: true, maxSentences: 0, maxWords: 0 } });

// Back-to-back historic
await runMoment(draftPick(24, "historic"), { overrideDecompression: true });

// Long draft tail (100+ picks simulated as batch)
for (let p = 25; p <= 120; p++) {
  const level = p % 11 === 0 ? "notable" : p % 23 === 0 ? "major" : "routine";
  const signals = level === "notable" ? ["STEAL"] : level === "major" ? ["REACH:strong"] : [];
  await runMoment(draftPick(p, level, { signals }));
}

const silenceRate = ((stats.silenced / stats.total) * 100).toFixed(1);
const avgVoices = (stats.voiceSum / stats.total).toFixed(2);

console.log("--- Metrics ---");
console.log(`moments processed: ${stats.total}`);
console.log(`silence rate: ${silenceRate}%`);
console.log(`avg voices per moment: ${avgVoices}`);
console.log(`lead voice distribution: Sofia ${stats.leadCounts.sofia}, Coach ${stats.leadCounts.coach}, Roxanne ${stats.leadCounts.roxanne}`);
console.log(`ledger decompression remaining: ${ledger.snapshot().decompressionRemaining}`);
console.log(`active storylines: ${ledger.snapshot().activeStorylines.length}`);
console.log(`callback history entries: ${ledger.snapshot().callbackHistorySize}`);

process.exit(0);
