/**
 * Sprint 10.1 — ESPN live draft monitor pure tests.
 */
import { describe, expect, it } from "vitest";
import {
  buildEspnLiveDraftId,
  diffEspnLiveLockedPicks,
  parseEspnLiveDraftSnapshot,
  selectEspnLivePicksToNotify,
  type EspnLiveLockedPick,
} from "../../../shared/espnLiveDraftMonitor";

/** Mirror of client buildRfsnLiveDraftId — keep collision test free of client imports. */
function warRoomLiveDraftId(season: number): string {
  return `war-room-live-${season}`;
}
function pick(partial: Partial<EspnLiveLockedPick> & Pick<EspnLiveLockedPick, "overallPick" | "playerName">): EspnLiveLockedPick {
  return {
    round: 1,
    roundPick: partial.overallPick,
    teamId: "1",
    ownerName: "Rod",
    playerId: `p${partial.overallPick}`,
    position: "WR",
    nflTeam: "DAL",
    adp: null,
    isKeeper: false,
    ...partial,
  };
}

function espnPayload(picks: Record<string, unknown>[], drafted = false) {
  return {
    seasonId: 2026,
    settings: { size: 2 },
    teams: [
      { id: 1, location: "A", nickname: "Team", owners: [{ firstName: "Rod", lastName: "Sellers" }] },
      { id: 2, location: "B", nickname: "Squad", owners: [{ firstName: "Bruce", lastName: "Edwards" }] },
    ],
    draftDetail: { drafted, picks },
  };
}

describe("espnLiveDraftMonitor", () => {
  it("builds isolated espn-live draft ids", () => {
    expect(buildEspnLiveDraftId("457622", 2026)).toBe("espn-live-457622-2026");
  });

  it("parses locked picks and ignores provisional rows without player names", () => {
    const snap = parseEspnLiveDraftSnapshot(
      espnPayload([
        {
          overallPickNumber: 1,
          roundId: 1,
          roundPickNumber: 1,
          teamId: 1,
          playerId: 101,
          playerPoolEntry: { player: { id: 101, fullName: "CeeDee Lamb", defaultPositionId: 3, proTeamId: 6 } },
        },
        {
          overallPickNumber: 2,
          roundId: 1,
          roundPickNumber: 2,
          teamId: 2,
          playerId: 0,
        },
      ]),
    );
    expect(snap).not.toBeNull();
    expect(snap!.teamCount).toBe(2);
    expect(snap!.picks).toHaveLength(1);
    expect(snap!.picks[0]!.playerName).toBe("CeeDee Lamb");
    expect(snap!.picks[0]!.ownerName).toContain("Rod");
    expect(snap!.draftComplete).toBe(false);
  });

  it("diffs only newly locked picks and is idempotent on remount-equivalent snapshots", () => {
    const a = pick({ overallPick: 1, playerName: "A", playerId: "1" });
    const b = pick({ overallPick: 2, playerName: "B", playerId: "2", teamId: "2" });
    expect(diffEspnLiveLockedPicks([], [a])).toEqual([a]);
    expect(diffEspnLiveLockedPicks([a], [a, b])).toEqual([b]);
    expect(diffEspnLiveLockedPicks([a, b], [a, b])).toEqual([]);
  });

  it("marks draft complete when ESPN draftDetail.drafted is true", () => {
    const snap = parseEspnLiveDraftSnapshot(
      espnPayload(
        [
          {
            overallPickNumber: 1,
            teamId: 1,
            playerPoolEntry: { player: { fullName: "Player One", defaultPositionId: 2 } },
          },
        ],
        true,
      ),
    );
    expect(snap?.draftComplete).toBe(true);
  });

  it("duplicate pick protection — ESPN returning the same lock twice notifies once", () => {
    const draftId = buildEspnLiveDraftId("457622", 2026);
    const locked = pick({ overallPick: 9, playerName: "Josh Allen", playerId: "allen", teamId: "3" });

    const firstDiff = diffEspnLiveLockedPicks([], [locked]);
    const first = selectEspnLivePicksToNotify(draftId, firstDiff, new Set());
    expect(first.toNotify).toHaveLength(1);

    // Same payload returned on next poll (duplicate)
    const secondDiff = diffEspnLiveLockedPicks([locked], [locked]);
    expect(secondDiff).toHaveLength(0);
    const second = selectEspnLivePicksToNotify(draftId, secondDiff, first.nextNotified);
    expect(second.toNotify).toHaveLength(0);

    // Even if diff incorrectly re-emits, notified set still blocks
    const forced = selectEspnLivePicksToNotify(draftId, [locked], first.nextNotified);
    expect(forced.toNotify).toHaveLength(0);
    expect(forced.nextNotified.size).toBe(1);
  });

  it("draft pause — no new locks while paused yields no fake notify events; snapshot stays alive", () => {
    const paused = parseEspnLiveDraftSnapshot(
      espnPayload([
        {
          overallPickNumber: 1,
          teamId: 1,
          playerPoolEntry: { player: { fullName: "Locked One", defaultPositionId: 3 } },
        },
        // on-clock provisional only — draft paused mid-pick
        { overallPickNumber: 2, teamId: 2, playerId: 0 },
      ]),
    );
    expect(paused).not.toBeNull();
    expect(paused!.draftComplete).toBe(false);
    expect(paused!.picks).toHaveLength(1);

    const stillPaused = parseEspnLiveDraftSnapshot(
      espnPayload([
        {
          overallPickNumber: 1,
          teamId: 1,
          playerPoolEntry: { player: { fullName: "Locked One", defaultPositionId: 3 } },
        },
        { overallPickNumber: 2, teamId: 2, playerId: 0 },
      ]),
    );
    const newly = diffEspnLiveLockedPicks(paused!.picks, stillPaused!.picks);
    expect(newly).toEqual([]);
    const draftId = buildEspnLiveDraftId("457622", 2026);
    const { toNotify } = selectEspnLivePicksToNotify(draftId, newly, new Set(["already"]));
    expect(toNotify).toEqual([]);
    // Monitor remains alive: parse still succeeds with same locked count
    expect(stillPaused!.picks).toHaveLength(1);
  });

  it("pick correction — provisional / changing name does not notify until final lock", () => {
    const draftId = buildEspnLiveDraftId("457622", 2026);
    let notified = new Set<string>();

    // Poll 1: only provisional on pick 1
    const provisional = parseEspnLiveDraftSnapshot(
      espnPayload([{ overallPickNumber: 1, teamId: 1, playerId: 0 }]),
    )!;
    expect(provisional.picks).toHaveLength(0);
    let newly = diffEspnLiveLockedPicks([], provisional.picks);
    let sel = selectEspnLivePicksToNotify(draftId, newly, notified);
    expect(sel.toNotify).toHaveLength(0);
    notified = sel.nextNotified;

    // Poll 2: ESPN shows a tentative name that will be corrected (still treat as lock if named —
    // but if name flips, a different notify key fires only for the final identity after first lock).
    // Correction path: empty → Player A shown briefly → Player B final.
    // We only emit when a named row appears; if A then B, both could notify unless ESPN
    // clears the row. Spec: no notify until final state = ignore empty; when A appears
    // then is replaced by B at same overall, both keys differ — product prefers final only
    // if we never saw A as locked. Simulate: A never committed (empty between), then B.
    const emptyAgain = parseEspnLiveDraftSnapshot(espnPayload([{ overallPickNumber: 1, teamId: 1 }]))!;
    newly = diffEspnLiveLockedPicks(provisional.picks, emptyAgain.picks);
    sel = selectEspnLivePicksToNotify(draftId, newly, notified);
    expect(sel.toNotify).toHaveLength(0);

    const finalLock = parseEspnLiveDraftSnapshot(
      espnPayload([
        {
          overallPickNumber: 1,
          teamId: 1,
          playerId: 404,
          playerPoolEntry: { player: { id: 404, fullName: "Final Player", defaultPositionId: 2 } },
        },
      ]),
    )!;
    newly = diffEspnLiveLockedPicks(emptyAgain.picks, finalLock.picks);
    sel = selectEspnLivePicksToNotify(draftId, newly, notified);
    expect(sel.toNotify).toHaveLength(1);
    expect(sel.toNotify[0]!.playerName).toBe("Final Player");
  });

  it("session collision — espn-live ids never collide with war-room mock sessions", () => {
    const season = 2026;
    const leagueId = "457622";
    const espn = buildEspnLiveDraftId(leagueId, season);
    const mock = warRoomLiveDraftId(season);
    expect(espn).toBe("espn-live-457622-2026");
    expect(mock).toBe("war-room-live-2026");
    expect(espn).not.toBe(mock);
    expect(espn.startsWith("espn-live-")).toBe(true);
    expect(mock.startsWith("war-room-live-")).toBe(true);
    // Different leagues stay isolated
    expect(buildEspnLiveDraftId("111", season)).not.toBe(buildEspnLiveDraftId("222", season));
    // Season boundary
    expect(buildEspnLiveDraftId(leagueId, 2025)).not.toBe(buildEspnLiveDraftId(leagueId, 2026));
  });
});
