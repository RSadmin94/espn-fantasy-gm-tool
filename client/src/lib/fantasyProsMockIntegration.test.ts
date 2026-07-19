/**
 * RFSN-030C integration: draftedPlayers growth → adapter → notify payload (simulated E2E).
 */
import { describe, expect, it, vi } from "vitest";
import {
  diffFantasyProsLockedPicks,
  parseFantasyProsDraftedPlayers,
  selectFantasyProsPicksToNotify,
  toNotifyLockedPickPayload,
} from "@shared/fantasyProsMockDraftMonitor";
import { parseFantasyProsBridgeMessage } from "./fantasyProsMockBridge";

describe("RFSN-030C FantasyPros → notifyLockedPick integration (simulated)", () => {
  const playerMap = {
    "17298": { name: "Ja'Marr Chase", position: "WR", team: "CIN", adp: 1.2 },
    "16413": { name: "Justin Jefferson", position: "WR", team: "MIN", adp: 2.1 },
  };

  it("end-to-end: store growth → bridge → LockedPickInput → single notify", async () => {
    const notifyLockedPick = vi.fn(async () => ({ accepted: true, pickId: "m1" }));

    // 1) Extension observes growth (prev empty → one pick)
    const prev = parseFantasyProsDraftedPlayers([], playerMap, { providerDraftId: "sess1" });
    const next = parseFantasyProsDraftedPlayers(
      [{ id: 17298, pick: 1, round: 1, posInRound: 1, ownerPos: 0, owner: "Your Team" }],
      playerMap,
      { providerDraftId: "sess1", observedAt: "2026-07-19T12:00:00.000Z" },
    );
    const added = diffFantasyProsLockedPicks(prev, next);
    expect(added).toHaveLength(1);

    // 2) Content script → FFR bridge validates batch
    const bridge = parseFantasyProsBridgeMessage({
      source: "gmwarroom-extension",
      type: "GMWR_FP_MOCK_PICK_BATCH",
      provider: "fantasypros",
      draftId: "fp-mock-sess1",
      providerDraftId: "sess1",
      picks: [
        {
          id: "17298",
          pick: 1,
          round: 1,
          posInRound: 1,
          ownerPos: 0,
          owner: "Your Team",
          isKeeper: false,
        },
      ],
      playerMapSlice: playerMap,
      observedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(bridge?.type).toBe("GMWR_FP_MOCK_PICK_BATCH");

    // 3) Adapter builds notify payload once
    const { toNotify, nextNotified } = selectFantasyProsPicksToNotify(
      "fp-mock-sess1",
      added,
      new Set(),
    );
    expect(toNotify).toHaveLength(1);
    const payload = toNotifyLockedPickPayload(toNotify[0]!, {
      leagueId: "457622",
      draftId: "fp-mock-sess1",
      teamCount: 12,
      draftPace: "broadcast",
    });

    await notifyLockedPick({
      leagueId: payload.leagueId,
      draftId: payload.draftId,
      pick: payload.pick,
      teamCount: payload.teamCount,
      draftPace: payload.draftPace,
    });

    // Duplicate suppressed
    const again = selectFantasyProsPicksToNotify("fp-mock-sess1", added, nextNotified);
    expect(again.toNotify).toHaveLength(0);

    expect(notifyLockedPick).toHaveBeenCalledTimes(1);
    expect(notifyLockedPick.mock.calls[0]![0]).toMatchObject({
      leagueId: "457622",
      draftId: "fp-mock-sess1",
      pick: {
        overallPick: 1,
        playerName: "Ja'Marr Chase",
        position: "WR",
        nflTeam: "CIN",
      },
    });
  });

  it("23 rapid AI picks → 23 unique ordered ingest events", () => {
    const session = "fp-mock-rapid";
    let notified = new Set<string>();
    const payloads: number[] = [];
    let prev = parseFantasyProsDraftedPlayers([], {}, { providerDraftId: "rapid" });

    for (let i = 1; i <= 23; i++) {
      const rows = Array.from({ length: i }, (_, idx) => ({
        id: idx + 1,
        pick: idx + 1,
        round: 1,
        posInRound: idx + 1,
        ownerPos: idx % 12,
        owner: `Team ${idx + 1}`,
      }));
      const map: Record<string, { name: string; position: string; team: string }> = {};
      for (const r of rows) {
        map[String(r.id)] = {
          name: `Player ${r.id}`,
          position: "WR",
          team: "NE",
        };
      }
      const next = parseFantasyProsDraftedPlayers(rows, map, { providerDraftId: "rapid" });
      const added = diffFantasyProsLockedPicks(prev, next);
      const sel = selectFantasyProsPicksToNotify(session, added, notified);
      notified = sel.nextNotified;
      for (const p of sel.toNotify) payloads.push(p.overallPick);
      prev = next;
    }

    expect(payloads).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(new Set(payloads).size).toBe(23);
  });
});
