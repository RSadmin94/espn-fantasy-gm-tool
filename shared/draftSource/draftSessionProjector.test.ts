/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  applyNormalizedPickBatch,
  applyNormalizedPickEvent,
  buildRostersByTeam,
  computeDraftGradesFromRosters,
  computeScheduleCursor,
  createDraftSessionState,
  isDraftSessionComplete,
  normalizeRfsnLocalMockPick,
  type NormalizedPickEvent,
} from "./index";

function event(
  overallPick: number,
  teamId: string,
  playerName: string,
  extras: Partial<NormalizedPickEvent> = {},
): NormalizedPickEvent {
  return {
    provider: "rfsn-local-mock",
    draftType: "mock",
    draftId: "session-1",
    leagueId: "L1",
    round: 1,
    pick: overallPick,
    overallPick,
    teamId,
    ownerId: teamId,
    ownerName: `Owner ${teamId}`,
    playerId: `p-${overallPick}`,
    playerName,
    position: "RB",
    timestamp: "2026-07-19T00:00:00.000Z",
    adp: overallPick + 5,
    ...extras,
  };
}

describe("draftSessionProjector", () => {
  it("projects a normalized pick onto the board and roster", () => {
    let state = createDraftSessionState({
      sessionKey: "s1",
      draftId: "session-1",
    });
    const { state: next, applied } = applyNormalizedPickEvent(state, event(1, "7", "Bijan Robinson"), {
      enrich: { marketValue: 88, adp: 4 },
    });
    expect(applied).toBe(true);
    expect(next.results[1]?.name).toBe("Bijan Robinson");
    expect(next.results[1]?.marketValue).toBe(88);

    const schedule = [
      { pickNumber: 1, teamId: 7, round: 1 },
      { pickNumber: 2, teamId: 3, round: 1 },
    ];
    const rosters = buildRostersByTeam(schedule, next.results);
    expect(rosters.get(7)?.[0]?.name).toBe("Bijan Robinson");
    expect(computeScheduleCursor(schedule, next.results)).toBe(1);
  });

  it("removes drafted players from availability via results keys", () => {
    const state = createDraftSessionState({ sessionKey: "s1", draftId: "session-1" });
    const { state: next } = applyNormalizedPickEvent(state, event(1, "1", "CeeDee Lamb"));
    const pool = [{ name: "CeeDee Lamb" }, { name: "Amon-Ra St. Brown" }];
    const drafted = new Set(
      Object.values(next.results).map((p) => p.name.toLowerCase()),
    );
    const available = pool.filter((p) => !drafted.has(p.name.toLowerCase()));
    expect(available.map((p) => p.name)).toEqual(["Amon-Ra St. Brown"]);
  });

  it("refreshes grade state after projection", () => {
    let state = createDraftSessionState({ sessionKey: "s1", draftId: "session-1" });
    for (const [overall, team, name, adp, mv] of [
      [1, "1", "A", 10, 90],
      [2, "2", "B", 2, 40],
      [3, "1", "C", 20, 85],
      [4, "2", "D", 3, 35],
      [5, "1", "E", 30, 80],
      [6, "2", "F", 4, 30],
    ] as const) {
      state = applyNormalizedPickEvent(state, event(overall, team, name, { adp }), {
        enrich: { marketValue: mv, adp },
      }).state;
    }
    const schedule = [1, 2, 3, 4, 5, 6].map((n) => ({
      pickNumber: n,
      teamId: n % 2 === 1 ? 1 : 2,
      round: 1,
    }));
    const rosters = buildRostersByTeam(schedule, state.results);
    const grades = computeDraftGradesFromRosters(rosters);
    expect(grades.get(1)?.letter).not.toBe("—");
    expect(grades.get(2)?.letter).not.toBe("—");
    expect(grades.get(1)?.letter).not.toEqual(grades.get(2)?.letter);
  });

  it("is idempotent for duplicate / replayed events", () => {
    let state = createDraftSessionState({ sessionKey: "s1", draftId: "session-1" });
    const ev = event(1, "1", "Player One");
    state = applyNormalizedPickEvent(state, ev, { enrich: { marketValue: 70 } }).state;
    const second = applyNormalizedPickEvent(state, ev, { enrich: { marketValue: 99 } });
    expect(second.applied).toBe(false);
    expect(second.state.results[1]?.marketValue).toBe(70);
    expect(Object.keys(second.state.results)).toHaveLength(1);
  });

  it("reconnect history batch does not duplicate board state", () => {
    let state = createDraftSessionState({ sessionKey: "s1", draftId: "session-1" });
    const batch = {
      provider: "espn-live" as const,
      draftType: "live" as const,
      draftId: "session-1",
      leagueId: "L",
      teamCount: 12,
      draftComplete: false,
      picks: [event(1, "1", "A"), event(2, "2", "B"), event(3, "1", "C")],
    };
    state = applyNormalizedPickBatch(state, batch).state;
    const again = applyNormalizedPickBatch(state, batch);
    expect(again.appliedCount).toBe(0);
    expect(Object.keys(again.state.results)).toHaveLength(3);
  });

  it("source/session change resets prior state via new sessionKey", () => {
    let state = createDraftSessionState({ sessionKey: "espn:1", draftId: "espn-1" });
    state = applyNormalizedPickEvent(state, event(1, "1", "Old Pick")).state;
    expect(state.results[1]?.name).toBe("Old Pick");

    state = createDraftSessionState({
      sessionKey: "fp:2",
      draftId: "fp-2",
      baselineResults: {},
    });
    expect(state.results[1]).toBeUndefined();
    expect(state.draftComplete).toBe(false);
    expect(state.appliedKeys.size).toBe(0);
  });

  it("marks completion and cursor for wrap-up", () => {
    let state = createDraftSessionState({ sessionKey: "s1", draftId: "session-1" });
    const schedule = [
      { pickNumber: 1, teamId: 1, round: 1 },
      { pickNumber: 2, teamId: 2, round: 1 },
    ];
    state = applyNormalizedPickEvent(state, event(1, "1", "A")).state;
    state = applyNormalizedPickEvent(state, event(2, "2", "B"), {
      forceComplete: true,
    }).state;
    const cursor = computeScheduleCursor(schedule, state.results);
    expect(cursor).toBe(2);
    expect(
      isDraftSessionComplete({
        draftCompleteFlag: state.draftComplete,
        scheduleLength: schedule.length,
        cursor,
      }),
    ).toBe(true);
  });

  it("FantasyPros completion flag drives wrap-up readiness", () => {
    let state = createDraftSessionState({
      sessionKey: "fp:1",
      draftId: "fp-draft",
      provider: "fantasypros-mock",
    });
    const batch = {
      provider: "fantasypros-mock" as const,
      draftType: "mock" as const,
      draftId: "fp-draft",
      leagueId: "L",
      teamCount: 12,
      draftComplete: true,
      picks: [
        { ...event(1, "1", "FP One"), provider: "fantasypros-mock" as const, draftType: "mock" as const },
        { ...event(2, "2", "FP Two"), provider: "fantasypros-mock" as const, draftType: "mock" as const },
      ],
    };
    state = applyNormalizedPickBatch(state, batch).state;
    expect(state.draftComplete).toBe(true);
    expect(
      isDraftSessionComplete({
        draftCompleteFlag: state.draftComplete,
        scheduleLength: 100,
        cursor: 2,
      }),
    ).toBe(true);
  });

  it("ESPN completion flag drives wrap-up readiness", () => {
    let state = createDraftSessionState({
      sessionKey: "espn:1",
      draftId: "espn-draft",
      provider: "espn-live",
    });
    const batch = {
      provider: "espn-live" as const,
      draftType: "live" as const,
      draftId: "espn-draft",
      leagueId: "L",
      teamCount: 12,
      draftComplete: true,
      picks: [
        { ...event(1, "1", "ESPN One"), provider: "espn-live" as const, draftType: "live" as const },
      ],
    };
    state = applyNormalizedPickBatch(state, batch).state;
    expect(state.draftComplete).toBe(true);
    expect(
      isDraftSessionComplete({
        draftCompleteFlag: state.draftComplete,
        scheduleLength: 168,
        cursor: 1,
      }),
    ).toBe(true);
  });

  it("local mock normalize + project preserves enrichment flags", () => {
    const locked = normalizeRfsnLocalMockPick(
      {
        overallPick: 4,
        round: 1,
        roundPick: 4,
        teamId: "3",
        ownerName: "Sam",
        playerId: "pool-9",
        playerName: "Local Star",
        position: "WR",
        adp: 11,
      },
      { leagueId: "L", draftId: "war-room-live-2026" },
    );
    const { state } = applyNormalizedPickEvent(
      createDraftSessionState({ sessionKey: "mock", draftId: "war-room-live-2026" }),
      locked,
      { enrich: { marketValue: 77, byAI: true } },
    );
    expect(state.results[4]?.byAI).toBe(true);
    expect(state.results[4]?.marketValue).toBe(77);
    expect(state.provider).toBe("rfsn-local-mock");
  });
});
