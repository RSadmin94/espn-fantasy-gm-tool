import { describe, expect, it } from "vitest";
import {
  buildFantasyProsMockDraftId,
  detectFantasyProsDraftReset,
  detectFantasyProsSoloRoom,
  diffFantasyProsLockedPicks,
  fantasyProsPickDedupeKey,
  mapFantasyProsDraftedPick,
  mapFantasyProsOwnerLabel,
  normalizePlayerName,
  parseFantasyProsDraftedPlayers,
  resolveFantasyProsSessionIdentity,
  selectFantasyProsPicksToNotify,
  toNotifyLockedPickPayload,
  type FantasyProsDraftedPlayer,
  type FantasyProsLockedPick,
} from "./fantasyProsMockDraftMonitor";

const PLAYER_MAP = {
  "17298": {
    id: 17298,
    name: "Ja'Marr Chase",
    position: "WR",
    team: "CIN",
    adp: 1.2,
  },
  "16413": {
    id: 16413,
    name: "Justin Jefferson",
    position: "WR",
    team: "MIN",
    adp: 2.1,
  },
  "24357": {
    id: 24357,
    name: "Bijan Robinson",
    position: "RB",
    team: "ATL",
    adp: 3.4,
  },
};

function row(
  partial: Partial<FantasyProsDraftedPlayer> & { id: number; pick: number },
): FantasyProsDraftedPlayer {
  return {
    round: Math.ceil(partial.pick / 12),
    posInRound: ((partial.pick - 1) % 12) + 1,
    ownerPos: 0,
    owner: "Your Team",
    isKeeper: false,
    ...partial,
  };
}

describe("fantasyProsMockDraftMonitor adapter", () => {
  it("maps a normal pick correctly", () => {
    const pick = mapFantasyProsDraftedPick(row({ id: 17298, pick: 1, ownerPos: 0 }), PLAYER_MAP, {
      providerDraftId: "abc",
      observedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(pick).toMatchObject({
      overallPick: 1,
      round: 1,
      roundPick: 1,
      teamId: "0",
      playerName: "Ja'Marr Chase",
      position: "WR",
      nflTeam: "CIN",
      adp: 1.2,
      provider: "fantasypros",
      providerPlayerId: "17298",
      source: "solo-mock",
    });
    expect(pick?.observedAt).toBe("2026-07-19T12:00:00.000Z");
  });

  it("maps owner position to team ID", () => {
    const pick = mapFantasyProsDraftedPick(
      row({ id: 16413, pick: 2, ownerPos: 3, owner: "Team 4" }),
      PLAYER_MAP,
      { providerDraftId: "abc" },
    );
    expect(pick?.teamId).toBe("3");
  });

  it("joins player map correctly", () => {
    const pick = mapFantasyProsDraftedPick(row({ id: 24357, pick: 5 }), PLAYER_MAP, {
      providerDraftId: "x",
    });
    expect(pick?.playerName).toBe("Bijan Robinson");
    expect(pick?.position).toBe("RB");
  });

  it("preserves FantasyPros provider ID", () => {
    const pick = mapFantasyProsDraftedPick(row({ id: 17298, pick: 1 }), PLAYER_MAP, {
      providerDraftId: "sess",
      canonicalHints: [
        {
          espnPlayerId: "4426387",
          name: "Ja'Marr Chase",
          nflTeam: "CIN",
          position: "WR",
        },
      ],
    });
    expect(pick?.providerPlayerId).toBe("17298");
    expect(pick?.canonicalPlayerId).toBe("4426387");
    expect(pick?.playerId).toBe("4426387");
    expect(pick?.identityConfidence).toBe("name_team_pos");
  });

  it("handles missing NFL team", () => {
    const pick = mapFantasyProsDraftedPick(row({ id: 1, pick: 1 }), { "1": { name: "X", position: "QB" } }, {
      providerDraftId: "s",
    });
    expect(pick?.nflTeam).toBeNull();
  });

  it("handles missing ADP", () => {
    const pick = mapFantasyProsDraftedPick(
      row({ id: 1, pick: 1 }),
      { "1": { name: "X", position: "QB", team: "KC" } },
      { providerDraftId: "s" },
    );
    expect(pick?.adp).toBeNull();
  });

  it("handles unknown player", () => {
    const pick = mapFantasyProsDraftedPick(row({ id: 999, pick: 7 }), {}, { providerDraftId: "s" });
    expect(pick?.playerName).toBe("Player 999");
    expect(pick?.identityConfidence).toBe("unknown");
    expect(pick?.position).toBe("?");
  });

  it("handles keeper", () => {
    const pick = mapFantasyProsDraftedPick(
      row({ id: 17298, pick: 1, isKeeper: true }),
      PLAYER_MAP,
      { providerDraftId: "s" },
    );
    expect(pick?.isKeeper).toBe(true);
  });

  it("creates stable draft ID", () => {
    expect(buildFantasyProsMockDraftId("key-1")).toBe("fp-mock-key-1");
    expect(resolveFantasyProsSessionIdentity({ mockDraftKey: "mdk" }).draftId).toBe(
      "fp-mock-mdk",
    );
    expect(resolveFantasyProsSessionIdentity({ dcId: "dc99" }).source).toBe("dcId");
    expect(resolveFantasyProsSessionIdentity({ generatedFallback: "uuid" }).draftId).toBe(
      "fp-mock-uuid",
    );
  });

  it("builds notify payload with league context", () => {
    const pick = mapFantasyProsDraftedPick(row({ id: 17298, pick: 1 }), PLAYER_MAP, {
      providerDraftId: "mdk",
      observedAt: "2026-07-19T12:00:00.000Z",
    })!;
    const payload = toNotifyLockedPickPayload(pick, {
      leagueId: "league-1",
      draftId: "fp-mock-mdk",
      teamCount: 12,
      draftComplete: false,
      draftPace: "broadcast",
    });
    expect(payload).toMatchObject({
      leagueId: "league-1",
      draftId: "fp-mock-mdk",
      teamCount: 12,
      provider: "fantasypros",
      source: "solo-mock",
      pick: {
        overallPick: 1,
        playerName: "Ja'Marr Chase",
        nflTeam: "CIN",
      },
    });
  });
});

describe("fantasyProsMockDraftMonitor owner mapping", () => {
  it("uses FFR seat names when provided", () => {
    const seats = new Map([[0, "Roderick"], [1, "Rival"]]);
    expect(mapFantasyProsOwnerLabel("Your Team", 0, seats)).toEqual({
      ownerName: "Roderick",
      mappingConfirmed: true,
    });
  });

  it("falls back to FantasyPros Seat N", () => {
    expect(mapFantasyProsOwnerLabel("", 3, null)).toEqual({
      ownerName: "FantasyPros Seat 4",
      mappingConfirmed: false,
    });
  });
});

describe("fantasyProsMockDraftMonitor observer diff", () => {
  function locked(
    overallPick: number,
    providerPlayerId: string,
    extra: Partial<FantasyProsLockedPick> = {},
  ): FantasyProsLockedPick {
    return {
      overallPick,
      round: 1,
      roundPick: overallPick,
      teamId: "0",
      ownerName: "Your Team",
      playerId: providerPlayerId,
      playerName: `P${providerPlayerId}`,
      position: "WR",
      nflTeam: "CIN",
      adp: null,
      isKeeper: false,
      observedAt: "2026-07-19T12:00:00.000Z",
      provider: "fantasypros",
      providerPlayerId,
      providerDraftId: "s",
      source: "solo-mock",
      identityConfidence: "provider",
      ...extra,
    };
  }

  it("detects one appended pick", () => {
    const prev = [locked(1, "1")];
    const next = [locked(1, "1"), locked(2, "2")];
    expect(diffFantasyProsLockedPicks(prev, next).map((p) => p.overallPick)).toEqual([2]);
  });

  it("detects multiple appended picks and preserves order", () => {
    const prev = [locked(1, "1")];
    const next = [locked(1, "1"), locked(2, "2"), locked(3, "3"), locked(4, "4")];
    expect(diffFantasyProsLockedPicks(prev, next).map((p) => p.overallPick)).toEqual([
      2, 3, 4,
    ]);
  });

  it("ignores unchanged state", () => {
    const rows = [locked(1, "1"), locked(2, "2")];
    expect(diffFantasyProsLockedPicks(rows, rows)).toEqual([]);
  });

  it("suppresses duplicates via notify selector", () => {
    const session = "fp-mock-s";
    const newly = [locked(1, "1"), locked(1, "1")];
    const first = selectFantasyProsPicksToNotify(session, newly, new Set());
    expect(first.toNotify).toHaveLength(1);
    const second = selectFantasyProsPicksToNotify(session, newly, first.nextNotified);
    expect(second.toNotify).toHaveLength(0);
  });

  it("handles array replacement", () => {
    const prev = parseFantasyProsDraftedPlayers(
      [row({ id: 17298, pick: 1 }), row({ id: 16413, pick: 2 })],
      PLAYER_MAP,
      { providerDraftId: "s" },
    );
    const next = parseFantasyProsDraftedPlayers(
      [
        row({ id: 17298, pick: 1 }),
        row({ id: 16413, pick: 2 }),
        row({ id: 24357, pick: 3 }),
      ],
      PLAYER_MAP,
      { providerDraftId: "s" },
    );
    expect(diffFantasyProsLockedPicks(prev, next).map((p) => p.overallPick)).toEqual([3]);
  });

  it("excludes keepers from notify", () => {
    const session = "fp-mock-s";
    const newly = [locked(1, "1", { isKeeper: true }), locked(2, "2")];
    const { toNotify } = selectFantasyProsPicksToNotify(session, newly, new Set());
    expect(toNotify.map((p) => p.overallPick)).toEqual([2]);
  });

  it("handles draft reset detection", () => {
    expect(
      detectFantasyProsDraftReset({
        prevProviderDraftId: "a",
        nextProviderDraftId: "b",
        prevPickCount: 10,
        nextPickCount: 10,
      }),
    ).toBe(true);
    expect(
      detectFantasyProsDraftReset({
        prevProviderDraftId: "a",
        nextProviderDraftId: "a",
        prevPickCount: 10,
        nextPickCount: 0,
      }),
    ).toBe(true);
  });

  it("handles 23 rapid AI picks without duplicates", () => {
    const session = "fp-mock-rapid";
    let notified = new Set<string>();
    const emitted: number[] = [];
    let prev: FantasyProsLockedPick[] = [];
    for (let i = 1; i <= 23; i++) {
      const next = Array.from({ length: i }, (_, idx) =>
        locked(idx + 1, String(idx + 1)),
      );
      const added = diffFantasyProsLockedPicks(prev, next);
      const sel = selectFantasyProsPicksToNotify(session, added, notified);
      notified = sel.nextNotified;
      emitted.push(...sel.toNotify.map((p) => p.overallPick));
      prev = next;
    }
    expect(emitted).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(new Set(emitted).size).toBe(23);
  });

  it("dedupe key is stable", () => {
    expect(fantasyProsPickDedupeKey("fp-mock-a", 5, "17298")).toBe("fp-mock-a:5:17298");
  });

  it("normalizes player names", () => {
    expect(normalizePlayerName("Ja'Marr Chase")).toBe("jamarr chase");
    expect(normalizePlayerName("Patrick Mahomes II")).toBe("patrick mahomes");
  });

  it("detects compatible solo room", () => {
    expect(
      detectFantasyProsSoloRoom({
        vueDraftTarget: "local",
        isMultiUserDraft: false,
        hasDraftState: true,
        hasDraftedPlayers: true,
      }).ok,
    ).toBe(true);
    expect(
      detectFantasyProsSoloRoom({
        vueDraftTarget: "local",
        isMultiUserDraft: true,
        hasDraftState: true,
      }).reason,
    ).toBe("multiuser_not_supported");
  });
});
