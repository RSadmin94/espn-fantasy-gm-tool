/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  LIVE_DRAFT_SOURCES,
  MOCK_DRAFT_SOURCES,
  availableSourcesForExperience,
  normalizeEspnLivePick,
  normalizeFantasyProsMockPick,
  normalizeRfsnLocalMockPick,
  observeEspnLive,
  observeFantasyProsMock,
  observeRfsnLocalMock,
  toLockedPickInput,
  toNotifyLockedPickRequest,
} from "./index";
import type { FantasyProsLockedPick } from "../fantasyProsMockDraftMonitor";
import type { EspnLiveLockedPick } from "../espnLiveDraftMonitor";

describe("draft source catalog", () => {
  it("Live available sources are ESPN League only today", () => {
    const live = availableSourcesForExperience("live");
    expect(live.map((s) => s.id)).toEqual(["espn-live"]);
    expect(LIVE_DRAFT_SOURCES.some((s) => s.id === "sleeper-live" && !s.available)).toBe(true);
  });

  it("Mock available sources are RFSN Local + FantasyPros", () => {
    const mock = availableSourcesForExperience("mock");
    expect(mock.map((s) => s.id)).toEqual(["rfsn-local-mock", "fantasypros-mock"]);
    expect(MOCK_DRAFT_SOURCES.some((s) => s.id === "espn-mock" && !s.available)).toBe(true);
  });
});

describe("normalization → LockedPickInput", () => {
  it("strips provider metadata for notifyLockedPick", () => {
    const event = normalizeRfsnLocalMockPick(
      {
        overallPick: 3,
        round: 1,
        roundPick: 3,
        teamId: "7",
        ownerName: "Alex",
        playerId: "p1",
        playerName: "Player One",
        position: "RB",
        nflTeam: "KC",
        adp: 12,
      },
      { leagueId: "L1", draftId: "war-room-live-2026", timestamp: "2026-07-19T00:00:00.000Z" },
    );
    expect(event.provider).toBe("rfsn-local-mock");
    expect(event.draftType).toBe("mock");
    expect(toLockedPickInput(event)).toEqual({
      overallPick: 3,
      round: 1,
      roundPick: 3,
      teamId: "7",
      ownerName: "Alex",
      playerId: "p1",
      playerName: "Player One",
      position: "RB",
      nflTeam: "KC",
      adp: 12,
    });
    const req = toNotifyLockedPickRequest(event, { teamCount: 12, draftComplete: false });
    expect(req.leagueId).toBe("L1");
    expect(req.draftId).toBe("war-room-live-2026");
    expect(req.pick.playerName).toBe("Player One");
    expect((req as { provider?: string }).provider).toBeUndefined();
  });

  it("ESPN and FantasyPros normalize to the same LockedPickInput shape", () => {
    const espn: EspnLiveLockedPick = {
      overallPick: 1,
      round: 1,
      roundPick: 1,
      teamId: "1",
      ownerName: "Sam",
      playerId: "111",
      playerName: "Star QB",
      position: "QB",
      nflTeam: "BUF",
      adp: 1.2,
      isKeeper: false,
    };
    const fp: FantasyProsLockedPick = {
      overallPick: 1,
      round: 1,
      roundPick: 1,
      teamId: "1",
      ownerName: "Sam",
      playerId: "111",
      playerName: "Star QB",
      position: "QB",
      nflTeam: "BUF",
      adp: 1.2,
      isKeeper: false,
      observedAt: "2026-07-19T00:00:00.000Z",
      provider: "fantasypros",
      providerPlayerId: "fp-111",
      providerDraftId: "mdk",
      source: "solo-mock",
      identityConfidence: "provider",
    };
    const e1 = toLockedPickInput(
      normalizeEspnLivePick(espn, { leagueId: "L", draftId: "espn-live-L-2026" }),
    );
    const e2 = toLockedPickInput(
      normalizeFantasyProsMockPick(fp, { leagueId: "L", draftId: "fp-mock-mdk" }),
    );
    expect(e1).toEqual(e2);
  });

  it("observeRfsnLocalMock returns null for empty picks", () => {
    expect(
      observeRfsnLocalMock({
        leagueId: "L",
        draftId: "d",
        teamCount: 12,
        draftComplete: false,
        picks: [],
      }),
    ).toBeNull();
  });

  it("ESPN cold start seeds baseline without emitting history", () => {
    const espnPayload = (picks: Record<string, unknown>[], drafted = false) => ({
      seasonId: 2026,
      settings: { size: 2 },
      teams: [
        {
          id: 1,
          location: "A",
          nickname: "Team",
          owners: [{ firstName: "Rod", lastName: "Sellers" }],
        },
        {
          id: 2,
          location: "B",
          nickname: "Squad",
          owners: [{ firstName: "Bruce", lastName: "Edwards" }],
        },
      ],
      draftDetail: { drafted, picks },
    });
    const pickRow = (n: number, name: string) => ({
      overallPickNumber: n,
      roundId: 1,
      roundPickNumber: n,
      teamId: 1,
      playerId: 100 + n,
      playerPoolEntry: {
        player: { id: 100 + n, fullName: name, defaultPositionId: 3, proTeamId: 6 },
      },
    });

    const first = observeEspnLive({
      leagueId: "457622",
      season: 2026,
      rawPayload: espnPayload([pickRow(1, "CeeDee Lamb"), pickRow(2, "Amon-Ra St. Brown")]),
      prevPicks: [],
      alreadyNotified: new Set(),
    });
    expect(first.snapshot?.picks.length).toBe(2);
    expect(first.seededBaseline).toBe(true);
    expect(first.batch).toBeNull();
    expect(first.projectionBatch?.picks.map((p) => p.overallPick)).toEqual([1, 2]);
    expect(first.nextNotified.size).toBe(2);

    const second = observeEspnLive({
      leagueId: "457622",
      season: 2026,
      rawPayload: espnPayload([
        pickRow(1, "CeeDee Lamb"),
        pickRow(2, "Amon-Ra St. Brown"),
        pickRow(3, "Bijan Robinson"),
      ]),
      prevPicks: first.nextPrevPicks,
      alreadyNotified: first.nextNotified,
    });
    expect(second.seededBaseline).toBeUndefined();
    expect(second.batch?.picks.map((p) => p.overallPick)).toEqual([3]);
    expect(second.batch?.picks[0]?.provider).toBe("espn-live");
    expect(toLockedPickInput(second.batch!.picks[0]!).playerName).toBe("Bijan Robinson");
  });

  it("FantasyPros multi-pick cold batch seeds without re-emitting history", () => {
    const mk = (n: number): FantasyProsLockedPick => ({
      overallPick: n,
      round: 1,
      roundPick: n,
      teamId: "1",
      ownerName: "Owner",
      playerId: `p${n}`,
      playerName: `Player ${n}`,
      position: "RB",
      nflTeam: "KC",
      adp: n,
      isKeeper: false,
      observedAt: "2026-07-19T00:00:00.000Z",
      provider: "fantasypros",
      providerPlayerId: `fp-${n}`,
      providerDraftId: "mdk",
      source: "solo-mock",
      identityConfidence: "provider",
    });
    const cold = observeFantasyProsMock({
      leagueId: "L",
      draftId: "fp-mock-mdk",
      teamCount: 12,
      draftComplete: false,
      newlyLocked: [mk(1), mk(2), mk(3)],
      alreadyNotified: new Set(),
    });
    expect(cold.batch).toBeNull();
    expect(cold.projectionBatch?.picks.map((p) => p.overallPick)).toEqual([1, 2, 3]);
    expect(cold.nextNotified.size).toBe(3);

    const next = observeFantasyProsMock({
      leagueId: "L",
      draftId: "fp-mock-mdk",
      teamCount: 12,
      draftComplete: false,
      newlyLocked: [mk(4)],
      alreadyNotified: cold.nextNotified,
    });
    expect(next.batch?.picks.map((p) => p.overallPick)).toEqual([4]);
  });
});
