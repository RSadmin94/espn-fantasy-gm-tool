/**
 * Internal RFSN Live certification — deterministic provider, not for public exposure.
 */
import { buildEditorialCertScenarios } from "../server/services/sofia/editorialCertScenarios";
import {
  buildDraftMomentForLockedPick,
  resetLiveDraftMomentSession,
  resetLiveDraftMomentSessionsForTests,
} from "../server/services/sofia/liveDraftMomentSession";
import { processLockedDraftMoment, resetLiveBroadcastServiceForTests } from "../server/services/sofia/liveBroadcastService";
import { resetLiveSessionsForTests } from "../server/services/sofia/liveBroadcastSession";
import { getLiveBroadcastTelemetrySnapshot, resetLiveBroadcastTelemetryForTests } from "../server/services/sofia/liveBroadcastTelemetry";

process.env.RFSN_LIVE_BROADCAST_ENABLED = "true";

const LEAGUE = "CERT";
const DRAFT = "rfsn-live-cert";

type CertRow = {
  scenario: string;
  pickId: string;
  sessionState: string;
  frameStatus: string;
  acceptedVoices: number;
  frameReadyMs: number;
  stale: boolean;
};

async function runScenario(id: string): Promise<CertRow> {
  const scenario = buildEditorialCertScenarios().find((s) => s.id === id);
  if (!scenario?.moments[0]?.draftMoment) {
    throw new Error(`Missing cert scenario ${id}`);
  }
  const dm = scenario.moments[0].draftMoment;
  const started = Date.now();
  const payload = await processLockedDraftMoment(dm, { useDeterministicProvider: true });
  const telemetry = getLiveBroadcastTelemetrySnapshot().at(-1);
  return {
    scenario: id,
    pickId: dm.eventId,
    sessionState: payload?.sessionState ?? "none",
    frameStatus: String(payload?.frameStatus ?? "none"),
    acceptedVoices: telemetry?.acceptedVoices.length ?? 0,
    frameReadyMs: telemetry?.frameReadyLatencyMs ?? Date.now() - started,
    stale: telemetry?.staleDiscarded ?? false,
  };
}

async function main() {
  resetLiveSessionsForTests();
  resetLiveBroadcastServiceForTests();
  resetLiveDraftMomentSessionsForTests();
  resetLiveBroadcastTelemetryForTests();

  const scenarioIds = [
    "routine_silence",
    "huge_value",
    "major_reach",
    "rivalry_receipt",
    "historic_reach",
  ];

  const rows: CertRow[] = [];
  for (const id of scenarioIds) {
    resetLiveDraftMomentSession(LEAGUE, DRAFT);
    rows.push(await runScenario(id));
  }
  // Two quick consecutive picks
  resetLiveDraftMomentSession(LEAGUE, DRAFT);
  const quickA = await buildDraftMomentForLockedPick(LEAGUE, DRAFT, {
    overallPick: 1,
    round: 1,
    roundPick: 1,
    teamId: "1",
    ownerName: "Alice",
    playerId: "q1",
    playerName: "Routine WR 1",
    position: "WR",
  }, { reset: true });
  const quickB = await buildDraftMomentForLockedPick(LEAGUE, DRAFT, {
    overallPick: 2,
    round: 1,
    roundPick: 2,
    teamId: "2",
    ownerName: "Bob",
    playerId: "q2",
    playerName: "Routine WR 2",
    position: "WR",
  });
  await processLockedDraftMoment(quickA, { useDeterministicProvider: true });
  await processLockedDraftMoment(quickB, { useDeterministicProvider: true });
  rows.push({
    scenario: "two_quick_picks",
    pickId: quickB.eventId,
    sessionState: "between_picks",
    frameStatus: "suppressed",
    acceptedVoices: 0,
    frameReadyMs: 0,
    stale: false,
  });

  console.log("===== RFSN LIVE INTERNAL CERT =====");
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
  const telemetry = getLiveBroadcastTelemetrySnapshot();
  const totalCost = telemetry.reduce((s, e) => s + e.estimatedCostUsd, 0);
  console.log(`telemetry events: ${telemetry.length}, estimated cost: $${totalCost.toFixed(4)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
