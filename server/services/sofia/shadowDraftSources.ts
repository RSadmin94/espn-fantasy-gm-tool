/**
 * Simulated draft sources for shadow certification — uses real DraftMoment builder.
 * Picks are ADP-aligned so the classifier produces a realistic routine/notable mix.
 */
import { buildDraftMomentsFromContext } from "../draftMoments/draftMomentBuilder";
import { buildIdentityResolver } from "../draftMoments/draftMomentIdentityService";
import {
  BROADCAST_PACE_MOMENT_CONFIG,
  type DraftMoment,
  type MomentConfig,
} from "../draftMoments/draftMomentTypes";
import { normName, type MockPickLike, type ReceiptContext } from "../draftMoments/draftMomentReceiptService";

const TEAM_COUNT = 14;

/** Fixed story beats in the 168-pick broadcast certification fixture — real pick rows, not seed-derived. */
const BROADCAST_STORY_BEATS: ReadonlyArray<{
  overall: number;
  playerName: string;
  position: string;
  playerId: string;
  adp: number;
}> = [
  { overall: 4, playerName: "CeeDee Lamb", position: "WR", playerId: "lamb", adp: 4 },
  { overall: 9, playerName: "Josh Allen", position: "QB", playerId: "allen", adp: 24 },
  { overall: 14, playerName: "Kenneth Walker III", position: "RB", playerId: "kw3", adp: 54 },
  { overall: 21, playerName: "Patrick Mahomes", position: "QB", playerId: "mahomes", adp: 8 },
  { overall: 28, playerName: "Lamar Jackson", position: "QB", playerId: "lamar", adp: 18 },
  { overall: 38, playerName: "Travis Kelce", position: "TE", playerId: "kelce", adp: 22 },
  { overall: 45, playerName: "Jaxon Smith-Njigba", position: "WR", playerId: "jsn", adp: 105 },
  { overall: 59, playerName: "Sam LaPorta", position: "TE", playerId: "laporta", adp: 80 },
  { overall: 67, playerName: "Christian McCaffrey", position: "RB", playerId: "cmc", adp: 1 },
  { overall: 84, playerName: "DK Metcalf", position: "WR", playerId: "metcalf", adp: 48 },
  { overall: 112, playerName: "Chris Olave", position: "WR", playerId: "olave", adp: 72 },
  { overall: 140, playerName: "Rachaad White", position: "RB", playerId: "white", adp: 88 },
];

export function makeShadowReceiptContext(over: Partial<ReceiptContext> = {}): ReceiptContext {
  const routineRegistry = Array.from({ length: 200 }, (_, i) => {
    const pick = i + 1;
    return { norm: `routine wr ${pick}`, position: "WR", adp: pick };
  });

  const storyRegistry = BROADCAST_STORY_BEATS.map((b) => ({
    norm: normName(b.playerName),
    position: b.position,
    adp: b.adp,
  }));

  return {
    leagueId: "SHADOW",
    adpByName: new Map([
      ...routineRegistry.map((r) => [r.norm, r.adp] as const),
      ...storyRegistry.map((r) => [r.norm, r.adp] as const),
    ]),
    registry: [...routineRegistry, ...storyRegistry],
    historyByKey: new Map(),
    seasonsByKey: new Map(),
    rivalById: new Map([["PID_ALICE", { rivalName: "Alice", heat: "Heated" }]]),
    focalMemberId: "PID_ALICE",
    dpWindow: { startPick: 100, endPick: 180 },
    teamCount: TEAM_COUNT,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DP: 1 },
    ...over,
  };
}

const shadowResolver = buildIdentityResolver([
  { season: 2026, teamId: 1, name: "Alice Team", ownerName: "Alice", ownerId: "PID_ALICE" },
  { season: 2026, teamId: 2, name: "Bob Team", ownerName: "Bob", ownerId: "PID_BOB" },
  { season: 2026, teamId: 3, name: "Carol Team", ownerName: "Carol", ownerId: "PID_CAROL" },
  { season: 2025, teamId: 1, name: "Alice Team", ownerName: "Alice", ownerId: "PID_ALICE" },
]);

function mp(over: Partial<MockPickLike> = {}): MockPickLike {
  return {
    overall: 1,
    round: 1,
    roundPick: 1,
    teamId: "1",
    ownerName: "Alice",
    playerId: "p1",
    playerName: "Routine WR 1",
    position: "WR",
    nflTeam: "KC",
    ...over,
  };
}

function roundFor(overall: number): number {
  return Math.ceil(overall / TEAM_COUNT);
}

function roundPickFor(overall: number): number {
  return ((overall - 1) % TEAM_COUNT) + 1;
}

function ownerFor(overall: number): { teamId: string; ownerName: string } {
  const idx = (overall - 1) % 3;
  return idx === 0
    ? { teamId: "1", ownerName: "Alice" }
    : idx === 1
      ? { teamId: "2", ownerName: "Bob" }
      : { teamId: "3", ownerName: "Carol" };
}

/** On-ADP filler pick — classifies routine when ADP matches overall pick. */
function routinePick(overall: number): MockPickLike {
  const o = ownerFor(overall);
  return mp({
    overall,
    round: roundFor(overall),
    roundPick: roundPickFor(overall),
    teamId: o.teamId,
    ownerName: o.ownerName,
    playerId: `routine-${overall}`,
    playerName: `Routine WR ${overall}`,
    position: "WR",
  });
}

function buildMoments(picks: MockPickLike[], draftId: string, config?: MomentConfig): DraftMoment[] {
  return buildDraftMomentsFromContext({
    leagueId: "SHADOW",
    draftId,
    season: 2026,
    mockPicks: picks,
    ctx: makeShadowReceiptContext(),
    resolver: shadowResolver,
    config,
  });
}

/**
 * 28-pick simulated draft: mostly on-ADP routine picks with a few story injections.
 */
export function buildSimulatedDraftMoments(): DraftMoment[] {
  const picks: MockPickLike[] = [];

  for (let i = 1; i <= 28; i++) {
    picks.push(routinePick(i));
  }

  picks[3] = mp({
    ...routinePick(4),
    playerName: "Lamar Jackson",
    position: "QB",
    playerId: "lamar",
    teamId: "2",
    ownerName: "Bob",
  });
  picks[8] = mp({
    ...routinePick(9),
    playerName: "Josh Allen",
    position: "QB",
    playerId: "allen",
    teamId: "1",
    ownerName: "Alice",
  });
  picks[13] = mp({
    ...routinePick(14),
    playerName: "Kenneth Walker III",
    position: "RB",
    playerId: "kw3",
  });
  picks[17] = mp({
    ...routinePick(18),
    playerName: "CeeDee Lamb",
    position: "WR",
    playerId: "lamb",
    teamId: "1",
    ownerName: "Alice",
  });

  return buildMoments(picks, "shadow-sim-2026");
}

/** Scenario draft — curated beats for playback visual validation. */
export function buildScenarioDraftMoments(): DraftMoment[] {
  const picks: MockPickLike[] = [
    routinePick(1),
    routinePick(2),
    routinePick(3),
    mp({ ...routinePick(4), playerName: "Lamar Jackson", position: "QB", playerId: "lamar" }),
    mp({ ...routinePick(5), playerName: "CeeDee Lamb", position: "WR", playerId: "lamb", teamId: "1", ownerName: "Alice" }),
    routinePick(6),
    routinePick(7),
    mp({ ...routinePick(8), playerName: "Josh Allen", position: "QB", playerId: "allen" }),
    routinePick(9),
    routinePick(10),
    mp({ ...routinePick(11), playerName: "Jaxon Smith-Njigba", position: "WR", playerId: "jsn" }),
    routinePick(12),
    routinePick(13),
    routinePick(14),
    routinePick(15),
    routinePick(16),
    routinePick(17),
    mp({ ...routinePick(18), playerName: "Sam LaPorta", position: "TE", playerId: "laporta" }),
    ...Array.from({ length: 10 }, (_, i) => routinePick(19 + i)),
  ];

  return buildMoments(picks, "shadow-scenario-2026");
}

/** Single-round mock draft — ADP-aligned with two intentional story picks. */
export function buildMockDraftMoments(): DraftMoment[] {
  const picks = Array.from({ length: TEAM_COUNT }, (_, i) => routinePick(i + 1));
  picks[3] = mp({ ...routinePick(4), playerName: "CeeDee Lamb", position: "WR", playerId: "lamb" });
  picks[8] = mp({ ...routinePick(9), playerName: "Josh Allen", position: "QB", playerId: "allen" });
  return buildMoments(picks, "shadow-mock-2026");
}

const BROADCAST_ROUNDS = 12;

/**
 * Canonical 14-team × 12-round (168-pick) fixture for broadcast-pace certification.
 * Fixed story injects with registered ADP — no seed-derived synthetic events.
 */
export function buildBroadcastPaceDraftMoments(
  seed = "broadcast-pace-168",
  config: MomentConfig = BROADCAST_PACE_MOMENT_CONFIG,
): DraftMoment[] {
  const total = TEAM_COUNT * BROADCAST_ROUNDS;
  const picks: MockPickLike[] = Array.from({ length: total }, (_, i) => routinePick(i + 1));

  for (const beat of BROADCAST_STORY_BEATS) {
    const o = ownerFor(beat.overall);
    picks[beat.overall - 1] = mp({
      ...routinePick(beat.overall),
      teamId: o.teamId,
      ownerName: o.ownerName,
      playerId: beat.playerId,
      playerName: beat.playerName,
      position: beat.position,
    });
  }

  return buildMoments(picks, `shadow-${seed}`, config);
}

export type ShadowDraftSource = "simulated" | "mock" | "scenario" | "broadcast_pace";

export function buildShadowDraftMoments(source: ShadowDraftSource): DraftMoment[] {
  switch (source) {
    case "simulated": return buildSimulatedDraftMoments();
    case "mock": return buildMockDraftMoments();
    case "scenario": return buildScenarioDraftMoments();
    case "broadcast_pace": return buildBroadcastPaceDraftMoments();
  }
}
