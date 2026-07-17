import { describe, expect, it } from "vitest";
import {
  buildLockedPickNotifyPayload,
  detectNewlyLockedPicks,
  filterUnnotifiedPicks,
  lockedPickNotifyKey,
} from "./rfsnLivePickNotify";

const schedule = [
  { pickNumber: 1, round: 1, roundPick: 1, teamId: "1", ownerName: "Alice" },
  { pickNumber: 2, round: 1, roundPick: 2, teamId: "2", ownerName: "Bob" },
];

const DRAFT_ID = "war-room-live-2026";

describe("rfsnLivePickNotify", () => {
  it("builds notify payload from locked pick", () => {
    const payload = buildLockedPickNotifyPayload({
      leagueId: "L1",
      draftId: DRAFT_ID,
      slot: schedule[0]!,
      player: { name: "CeeDee Lamb", position: "wr", id: "p1", nflTeam: "DAL", adp: 4 },
      teamCount: 14,
    });
    expect(payload.leagueId).toBe("L1");
    expect(payload.draftId).toBe(DRAFT_ID);
    expect(payload.pick.overallPick).toBe(1);
    expect(payload.pick.playerName).toBe("CeeDee Lamb");
    expect(payload.pick.position).toBe("WR");
    expect(payload.pick.playerId).toBe("p1");
    expect(payload.pick.nflTeam).toBe("DAL");
  });

  it("detects only newly finalized picks", () => {
    const prev = {};
    const next = {
      1: { name: "CeeDee Lamb", position: "WR", id: "p1" },
    };
    const detected = detectNewlyLockedPicks(prev, next, schedule);
    expect(detected).toHaveLength(1);
    expect(detected[0]!.slot.pickNumber).toBe(1);

    const again = detectNewlyLockedPicks(next, next, schedule);
    expect(again).toHaveLength(0);
  });

  it("does not notify unfinalized picks", () => {
    const detected = detectNewlyLockedPicks({}, { 1: { position: "WR" } }, schedule);
    expect(detected).toHaveLength(0);
  });

  it("ignores keeper/preloaded slots", () => {
    const keeperSchedule = [
      { pickNumber: 1, round: 1, roundPick: 1, teamId: "1", ownerName: "Alice", isKeeperSlot: true },
      { pickNumber: 2, round: 1, roundPick: 2, teamId: "2", ownerName: "Bob" },
    ];
    const detected = detectNewlyLockedPicks(
      {},
      {
        1: { name: "Jaxon Smith-Njigba", position: "WR", id: "keeper:jsn" },
        2: { name: "CeeDee Lamb", position: "WR", id: "p1" },
      },
      keeperSchedule,
    );
    expect(detected).toHaveLength(1);
    expect(detected[0]!.slot.pickNumber).toBe(2);
    expect(detected[0]!.player.name).toBe("CeeDee Lamb");
  });

  it("does not notify when player name changes before finalization stabilizes", () => {
    const prev = { 1: { name: "Player A", position: "WR", id: "a" } };
    const next = { 1: { name: "Player B", position: "WR", id: "b" } };
    const detected = detectNewlyLockedPicks(prev, next, schedule);
    expect(detected).toHaveLength(1);
    expect(detected[0]!.player.name).toBe("Player B");
  });

  it("dedupes by draftId + pickNumber + player identity", () => {
    const key = lockedPickNotifyKey(DRAFT_ID, 1, { id: "p1", name: "CeeDee Lamb" });
    expect(key).toBe(`${DRAFT_ID}:1:p1:ceedee lamb`);

    const item = {
      leagueId: "L",
      draftId: DRAFT_ID,
      slot: schedule[0]!,
      player: { name: "CeeDee Lamb", position: "WR", id: "p1" },
      teamCount: 14,
    };
    const first = filterUnnotifiedPicks([item], new Set());
    expect(first.toNotify).toHaveLength(1);
    const second = filterUnnotifiedPicks(first.toNotify, first.nextNotified);
    expect(second.toNotify).toHaveLength(0);
    expect(first.nextNotified.has(key)).toBe(true);
  });

  it("allows two distinct picks through dedupe", () => {
    const items = [
      {
        leagueId: "L",
        draftId: DRAFT_ID,
        slot: schedule[0]!,
        player: { name: "CeeDee Lamb", position: "WR", id: "p1" },
        teamCount: 14,
      },
      {
        leagueId: "L",
        draftId: DRAFT_ID,
        slot: schedule[1]!,
        player: { name: "Josh Allen", position: "QB", id: "p2" },
        teamCount: 14,
      },
    ];
    const { toNotify } = filterUnnotifiedPicks(items, new Set());
    expect(toNotify).toHaveLength(2);
  });

  it("marks draft complete on final payload", () => {
    const payload = buildLockedPickNotifyPayload({
      leagueId: "L",
      draftId: DRAFT_ID,
      slot: schedule[1]!,
      player: { name: "Josh Allen", position: "QB" },
      teamCount: 14,
      draftComplete: true,
    });
    expect(payload.draftComplete).toBe(true);
  });
});
