/**
 * @vitest-environment node
 * Phase 1 — ESPN bookmarklet publisher unit tests.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { NormalizedDraftPick, NormalizedDraftSnapshot } from "../src/draft-monitor/normalize/draftTypes";
import {
  buildEspnLiveDraftId,
  buildSyntheticEspnPlayerId,
  EspnBookmarkletPublisher,
  resolveTransportPlayerId,
  toTransportPick,
  type EspnBmOutboundMessage,
  type EspnBmPickBatchMessage,
  type EspnBmStatusMessage,
} from "../src/draft-monitor/runtime/espnBookmarkletPublisher";

function pick(
  partial: Partial<NormalizedDraftPick> &
    Pick<NormalizedDraftPick, "eventKey" | "overallPick" | "round" | "pickInRound" | "playerName" | "currentTeamId" | "currentTeamName">,
): NormalizedDraftPick {
  return {
    source: "espn",
    isKeeper: false,
    isTradedPick: false,
    isLiveSelection: true,
    keeperStatusKnown: true,
    ...partial,
  };
}

function snapshot(picks: NormalizedDraftPick[], status: NormalizedDraftSnapshot["status"] = "ACTIVE"): NormalizedDraftSnapshot {
  return {
    source: "espn",
    draftId: "espn-live-999-na", // must be ignored — ARM supplies identity
    status,
    teamCount: 12,
    teams: [
      { teamId: "1", teamName: "Alpha" },
      { teamId: "2", teamName: "Bravo" },
    ],
    picks,
    lastUpdatedAt: "2026-07-19T20:00:00.000Z",
    draftFingerprint: "espn:test",
  };
}

function batches(out: EspnBmOutboundMessage[]): EspnBmPickBatchMessage[] {
  return out.filter((m): m is EspnBmPickBatchMessage => m.type === "GMWR_ESPN_BM_PICK_BATCH");
}

function statuses(out: EspnBmOutboundMessage[]): EspnBmStatusMessage[] {
  return out.filter((m): m is EspnBmStatusMessage => m.type === "GMWR_ESPN_BM_STATUS");
}

describe("buildEspnLiveDraftId", () => {
  it("matches shared season policy and never uses -na", () => {
    expect(buildEspnLiveDraftId("12345", 2026)).toBe("espn-live-12345-2026");
    expect(buildEspnLiveDraftId("12345", 2026)).not.toContain("-na");
  });
});

describe("player id policy", () => {
  it("retains real ESPN playerId", () => {
    const r = resolveTransportPlayerId(
      pick({
        eventKey: "k",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "Saquon Barkley",
        playerId: "3042519",
        currentTeamId: "1",
        currentTeamName: "Alpha",
        position: "RB",
        nflTeam: "PHI",
      }),
    );
    expect(r).toEqual({ playerId: "3042519", playerIdSource: "espn" });
  });

  it("builds deterministic synthetic id when ESPN id absent", () => {
    const a = buildSyntheticEspnPlayerId({
      playerName: "Saquon Barkley",
      position: "RB",
      nflTeam: "PHI",
    });
    const b = buildSyntheticEspnPlayerId({
      playerName: "Saquon  Barkley",
      position: "rb",
      nflTeam: "phi",
    });
    expect(a).toBe(b);
    expect(a.startsWith("syn:")).toBe(true);
    const r = resolveTransportPlayerId(
      pick({
        eventKey: "k",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "Saquon Barkley",
        currentTeamId: "1",
        currentTeamName: "Alpha",
        position: "RB",
        nflTeam: "PHI",
      }),
    );
    expect(r.playerIdSource).toBe("synthetic");
    expect(r.playerId).toBe(a);
  });
});

describe("EspnBookmarkletPublisher", () => {
  it("requires ARM before publishing", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.onSnapshot(
      snapshot([
        pick({
          eventKey: "old",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          playerName: "A",
          playerId: "1",
          currentTeamId: "1",
          currentTeamName: "Alpha",
        }),
      ]),
    );
    expect(batches(out)).toHaveLength(0);
    expect(pub.isArmed).toBe(false);
  });

  it("inbound content ARM populates armConfig and enables PICK_BATCH", () => {
    const out: EspnBmOutboundMessage[] = [];
    const listeners: Array<(ev: MessageEvent) => void> = [];
    const fakeWin = {
      location: { origin: "https://fantasy.espn.com" },
      postMessage() {},
      addEventListener(_t: string, fn: (ev: MessageEvent) => void) {
        listeners.push(fn);
      },
      removeEventListener() {},
    } as unknown as Window;
    const pub = new EspnBookmarkletPublisher({
      emit: (m) => out.push(m),
      window: fakeWin,
    });
    pub.attachInboundListener();
    expect(pub.isArmed).toBe(false);

    listeners[0]!({
      source: fakeWin,
      data: {
        channel: "GMWR_ESPN_BM_PAGE",
        type: "GMWR_ESPN_BM_ARM",
        protocolVersion: 1,
        config: { leagueId: "424242", season: 2026, sessionNonce: "nonce-handoff" },
      },
    } as MessageEvent);

    expect(pub.isArmed).toBe(true);
    expect(pub.state.sessionNonce).toBe("nonce-handoff");
    expect(out.some((m) => m.type === "GMWR_ESPN_BM_STATUS" && m.status === "armed")).toBe(
      true,
    );

    const boardPicks = [
      pick({
        eventKey: "h1",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "A",
        playerId: "1",
        currentTeamId: "1",
        currentTeamName: "A",
      }),
    ];
    pub.onSnapshot(snapshot(boardPicks));
    expect(batches(out).length).toBeGreaterThanOrEqual(1);
    expect(batches(out)[0]!.sessionNonce).toBe("nonce-handoff");
  });

  it("rejects invalid inbound ARM (bad leagueId) and stays unarmed", () => {
    const out: EspnBmOutboundMessage[] = [];
    const listeners: Array<(ev: MessageEvent) => void> = [];
    const fakeWin = {
      location: { origin: "https://fantasy.espn.com" },
      postMessage() {},
      addEventListener(_t: string, fn: (ev: MessageEvent) => void) {
        listeners.push(fn);
      },
      removeEventListener() {},
    } as unknown as Window;
    const pub = new EspnBookmarkletPublisher({
      emit: (m) => out.push(m),
      window: fakeWin,
    });
    pub.attachInboundListener();
    listeners[0]!({
      source: fakeWin,
      data: {
        channel: "GMWR_ESPN_BM_PAGE",
        type: "ARM",
        config: { leagueId: "not-digits", season: 2026, sessionNonce: "n1" },
      },
    } as MessageEvent);
    expect(pub.isArmed).toBe(false);
    expect(out.some((m) => m.type === "GMWR_ESPN_BM_STATUS" && m.status === "error")).toBe(
      true,
    );
    pub.onSnapshot(
      snapshot([
        pick({
          eventKey: "x",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          playerName: "A",
          playerId: "1",
          currentTeamId: "1",
          currentTeamName: "A",
        }),
      ]),
    );
    expect(batches(out)).toHaveLength(0);
  });

  it("RFSN-031B rejects ARM when page league mismatches Rivals league", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    const arm = pub.arm({
      leagueId: "457622",
      season: 2026,
      sessionNonce: "nonce-mm",
      destination: "live-draft",
      pageLeagueId: "999001",
    });
    expect(arm.ok).toBe(false);
    expect(arm.error).toBe("league_mismatch");
    expect(pub.isArmed).toBe(false);
    pub.onSnapshot(
      snapshot([
        pick({
          eventKey: "x1",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          playerName: "A",
          playerId: "1",
          currentTeamId: "1",
          currentTeamName: "A",
        }),
      ]),
    );
    expect(batches(out)).toHaveLength(0);
  });

  it("RFSN-031B accepts destination live-draft and stays dormant until ARM", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.onSnapshot(
      snapshot([
        pick({
          eventKey: "pre",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          playerName: "Pre",
          playerId: "9",
          currentTeamId: "1",
          currentTeamName: "A",
        }),
      ]),
    );
    expect(batches(out)).toHaveLength(0);
    const arm = pub.arm({
      leagueId: "424242",
      season: 2026,
      sessionNonce: "nonce-dest",
      destination: "live-draft",
    });
    expect(arm.ok).toBe(true);
    const armedStatus = statuses(out).find((s) => s.status === "armed");
    expect(armedStatus?.readerVersion).toBeTruthy();
    expect(armedStatus?.destination).toBe("live-draft");
  });

  it("reconnect DISARM then ARM re-arms publisher and emits a fresh baseline", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    const boardPicks = [
      pick({
        eventKey: "r1",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "A",
        playerId: "1",
        currentTeamId: "1",
        currentTeamName: "A",
      }),
    ];
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "nonce-1" });
    pub.onSnapshot(snapshot(boardPicks));
    expect(batches(out)).toHaveLength(1);

    pub.disarm();
    expect(pub.isArmed).toBe(false);
    pub.onSnapshot(snapshot(boardPicks));
    expect(batches(out)).toHaveLength(1);

    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "nonce-2" });
    pub.onSnapshot(snapshot(boardPicks));
    const b = batches(out);
    expect(b).toHaveLength(2);
    expect(b[1]!.sessionNonce).toBe("nonce-2");
    expect(b[1]!.revision).toBe(1);
  });

  it("emits full baseline projection batch with liveNotify=false", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    const arm = pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "nonce-1" });
    expect(arm.ok).toBe(true);

    const baselinePicks = [1, 2, 3].map((n) =>
      pick({
        eventKey: `e${n}`,
        overallPick: n,
        round: 1,
        pickInRound: n,
        playerName: `Player ${n}`,
        playerId: String(1000 + n),
        currentTeamId: String(n),
        currentTeamName: `Team ${n}`,
        position: "RB",
        nflTeam: "KC",
      }),
    );
    pub.onSnapshot(snapshot(baselinePicks));

    const b = batches(out);
    expect(b).toHaveLength(1);
    expect(b[0]!.baselineOnly).toBe(true);
    expect(b[0]!.liveNotify).toBe(false);
    expect(b[0]!.picks).toHaveLength(3);
    expect(b[0]!.draftId).toBe("espn-live-424242-2026");
    expect(b[0]!.leagueId).toBe("424242");
    expect(b[0]!.season).toBe(2026);
    expect(b[0]!.sessionNonce).toBe("nonce-1");
    expect(b[0]!.draftId).not.toContain("-na");
  });

  it("baseline generates no live-notify pick batches", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n" });
    pub.onSnapshot(
      snapshot([
        pick({
          eventKey: "e1",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          playerName: "A",
          playerId: "9",
          currentTeamId: "1",
          currentTeamName: "Alpha",
        }),
      ]),
    );
    expect(batches(out).every((b) => b.liveNotify === false)).toBe(true);
    expect(batches(out).every((b) => b.baselineOnly === true)).toBe(true);
    expect(pub.state.picksEmittedLive).toBe(0);
  });

  it("5 new picks produce exactly 5 delta events across batches", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "7", season: 2026, sessionNonce: "n" });

    const mk = (n: number) =>
      pick({
        eventKey: `raw-${n}`,
        overallPick: n,
        round: 1,
        pickInRound: n,
        playerName: `P${n}`,
        playerId: String(n),
        currentTeamId: String(n),
        currentTeamName: `T${n}`,
      });

    pub.onSnapshot(snapshot([mk(1), mk(2)])); // baseline 2
    out.length = 0;

    let board = [mk(1), mk(2)];
    for (let n = 3; n <= 7; n++) {
      board = [...board, mk(n)];
      pub.onSnapshot(snapshot(board));
    }

    const deltas = batches(out).filter((b) => b.liveNotify);
    const emitted = deltas.flatMap((b) => b.picks);
    expect(emitted).toHaveLength(5);
    expect(emitted.map((p) => p.overallPick)).toEqual([3, 4, 5, 6, 7]);
    expect(deltas.every((b) => b.baselineOnly === false)).toBe(true);
  });

  it("repeated polling produces no duplicates", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "7", season: 2026, sessionNonce: "n" });
    const board = [
      pick({
        eventKey: "a",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "A",
        playerId: "1",
        currentTeamId: "1",
        currentTeamName: "Alpha",
      }),
    ];
    pub.onSnapshot(snapshot(board));
    out.length = 0;
    pub.onSnapshot(snapshot(board));
    pub.onSnapshot(snapshot(board));
    expect(batches(out)).toHaveLength(0);
  });

  it("uses stable event keys derived from ARM draftId", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "55", season: 2026, sessionNonce: "n" });
    const p = pick({
      eventKey: "will-be-replaced",
      overallPick: 4,
      round: 1,
      pickInRound: 4,
      playerName: "Stable Name",
      playerId: "4242",
      currentTeamId: "3",
      currentTeamName: "Charlie",
      position: "WR",
      nflTeam: "DAL",
    });
    pub.onSnapshot(snapshot([p]));
    const row = batches(out)[0]!.picks[0]!;
    const again = toTransportPick(p, "espn-live-55-2026");
    expect(row.eventKey).toBe(again!.eventKey);
    expect(row.eventKey).toContain("espn:espn-live-55-2026:overall:4");
  });

  it("season/draftId always taken from ARM not snapshot", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "888", season: 2025, sessionNonce: "arm-nonce" });
    pub.onSnapshot(
      snapshot([
        pick({
          eventKey: "x",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          playerName: "A",
          playerId: "1",
          currentTeamId: "1",
          currentTeamName: "A",
          draftId: "espn-live-999-na",
        }),
      ]),
    );
    const b = batches(out)[0]!;
    expect(b.draftId).toBe("espn-live-888-2025");
    expect(b.season).toBe(2025);
    expect(b.leagueId).toBe("888");
  });

  it("emits COMPLETE status exactly once", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n" });
    const board = [
      pick({
        eventKey: "1",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "A",
        playerId: "1",
        currentTeamId: "1",
        currentTeamName: "A",
      }),
    ];
    pub.onSnapshot(snapshot(board, "COMPLETE"));
    pub.onSnapshot(snapshot(board, "COMPLETE"));
    pub.onSnapshot(snapshot(board, "COMPLETE"));
    const completes = statuses(out).filter((s) => s.status === "complete");
    expect(completes).toHaveLength(1);
    expect(completes[0]!.draftComplete).toBe(true);
  });

  it("baseline batch contains draftComplete false during active draft", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n" });
    pub.onSnapshot(
      snapshot(
        [
          pick({
            eventKey: "1",
            overallPick: 1,
            round: 1,
            pickInRound: 1,
            playerName: "A",
            playerId: "1",
            currentTeamId: "1",
            currentTeamName: "A",
          }),
        ],
        "ACTIVE",
      ),
    );
    const b = batches(out)[0]!;
    expect(b.baselineOnly).toBe(true);
    expect(b.liveNotify).toBe(false);
    expect(b.draftComplete).toBe(false);
  });

  it("final new pick plus COMPLETE emits one delta batch with draftComplete true", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n" });
    const first = pick({
      eventKey: "1",
      overallPick: 1,
      round: 1,
      pickInRound: 1,
      playerName: "A",
      playerId: "1",
      currentTeamId: "1",
      currentTeamName: "A",
    });
    pub.onSnapshot(snapshot([first], "ACTIVE"));
    out.length = 0;

    const last = pick({
      eventKey: "2",
      overallPick: 2,
      round: 1,
      pickInRound: 2,
      playerName: "B",
      playerId: "2",
      currentTeamId: "2",
      currentTeamName: "B",
    });
    pub.onSnapshot(snapshot([first, last], "COMPLETE"));

    const deltas = batches(out).filter((b) => b.liveNotify);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.draftComplete).toBe(true);
    expect(deltas[0]!.baselineOnly).toBe(false);
    expect(deltas[0]!.picks).toHaveLength(1);
    expect(deltas[0]!.picks[0]!.overallPick).toBe(2);
    expect(statuses(out).filter((s) => s.status === "complete")).toHaveLength(1);
    // No empty completion batch when delta already carried draftComplete
    expect(batches(out).filter((b) => b.picks.length === 0)).toHaveLength(0);
  });

  it("COMPLETE on a later poll with no new picks emits one empty completion batch", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n" });
    const board = [
      pick({
        eventKey: "1",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "A",
        playerId: "1",
        currentTeamId: "1",
        currentTeamName: "A",
      }),
    ];
    pub.onSnapshot(snapshot(board, "ACTIVE"));
    out.length = 0;

    pub.onSnapshot(snapshot(board, "COMPLETE"));
    const b = batches(out);
    expect(b).toHaveLength(1);
    expect(b[0]!.picks).toHaveLength(0);
    expect(b[0]!.draftComplete).toBe(true);
    expect(b[0]!.liveNotify).toBe(false);
    expect(b[0]!.baselineOnly).toBe(false);
    expect(statuses(out).filter((s) => s.status === "complete")).toHaveLength(1);
  });

  it("repeated COMPLETE polls emit no duplicate completion batches or STATUS", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n" });
    const board = [
      pick({
        eventKey: "1",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "A",
        playerId: "1",
        currentTeamId: "1",
        currentTeamName: "A",
      }),
    ];
    pub.onSnapshot(snapshot(board, "ACTIVE"));
    out.length = 0;
    pub.onSnapshot(snapshot(board, "COMPLETE"));
    pub.onSnapshot(snapshot(board, "COMPLETE"));
    pub.onSnapshot(snapshot(board, "COMPLETE"));
    expect(batches(out)).toHaveLength(1);
    expect(batches(out)[0]!.draftComplete).toBe(true);
    expect(statuses(out).filter((s) => s.status === "complete")).toHaveLength(1);
  });

  it("ARM after already completed draft emits baseline with draftComplete true, liveNotify false", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n" });
    pub.onSnapshot(
      snapshot(
        [
          pick({
            eventKey: "1",
            overallPick: 1,
            round: 1,
            pickInRound: 1,
            playerName: "A",
            playerId: "1",
            currentTeamId: "1",
            currentTeamName: "A",
          }),
          pick({
            eventKey: "2",
            overallPick: 2,
            round: 1,
            pickInRound: 2,
            playerName: "B",
            playerId: "2",
            currentTeamId: "2",
            currentTeamName: "B",
          }),
        ],
        "COMPLETE",
      ),
    );
    const b = batches(out);
    expect(b).toHaveLength(1);
    expect(b[0]!.baselineOnly).toBe(true);
    expect(b[0]!.liveNotify).toBe(false);
    expect(b[0]!.draftComplete).toBe(true);
    expect(b[0]!.picks).toHaveLength(2);
    expect(statuses(out).filter((s) => s.status === "complete")).toHaveLength(1);
  });

  it("re-ARM resets completion state correctly", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n1" });
    const board = [
      pick({
        eventKey: "1",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "A",
        playerId: "1",
        currentTeamId: "1",
        currentTeamName: "A",
      }),
    ];
    pub.onSnapshot(snapshot(board, "COMPLETE"));
    expect(pub.state.completionEmitted).toBe(true);

    out.length = 0;
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n2" });
    expect(pub.state.completionEmitted).toBe(false);
    pub.onSnapshot(snapshot(board, "COMPLETE"));
    const b = batches(out);
    expect(b).toHaveLength(1);
    expect(b[0]!.baselineOnly).toBe(true);
    expect(b[0]!.draftComplete).toBe(true);
    expect(b[0]!.liveNotify).toBe(false);
    expect(b[0]!.sessionNonce).toBe("n2");
    expect(statuses(out).filter((s) => s.status === "complete")).toHaveLength(1);
  });

  it("DISARM stops publishing", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "n" });
    pub.onSnapshot(
      snapshot([
        pick({
          eventKey: "1",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          playerName: "A",
          playerId: "1",
          currentTeamId: "1",
          currentTeamName: "A",
        }),
      ]),
    );
    pub.disarm();
    out.length = 0;
    pub.onSnapshot(
      snapshot([
        pick({
          eventKey: "1",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          playerName: "A",
          playerId: "1",
          currentTeamId: "1",
          currentTeamName: "A",
        }),
        pick({
          eventKey: "2",
          overallPick: 2,
          round: 1,
          pickInRound: 2,
          playerName: "B",
          playerId: "2",
          currentTeamId: "2",
          currentTeamName: "B",
        }),
      ]),
    );
    expect(batches(out)).toHaveLength(0);
    expect(pub.isArmed).toBe(false);
  });

  it("re-ARM creates a new nonce session and correct baseline", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "1", season: 2026, sessionNonce: "nonce-a" });
    const board = [
      pick({
        eventKey: "1",
        overallPick: 1,
        round: 1,
        pickInRound: 1,
        playerName: "A",
        playerId: "1",
        currentTeamId: "1",
        currentTeamName: "A",
      }),
      pick({
        eventKey: "2",
        overallPick: 2,
        round: 1,
        pickInRound: 2,
        playerName: "B",
        playerId: "2",
        currentTeamId: "2",
        currentTeamName: "B",
      }),
    ];
    pub.onSnapshot(snapshot(board));
    // live pick while armed
    pub.onSnapshot(
      snapshot([
        ...board,
        pick({
          eventKey: "3",
          overallPick: 3,
          round: 1,
          pickInRound: 3,
          playerName: "C",
          playerId: "3",
          currentTeamId: "3",
          currentTeamName: "C",
        }),
      ]),
    );

    out.length = 0;
    const arm2 = pub.arm({ leagueId: "1", season: 2026, sessionNonce: "nonce-b" });
    expect(arm2.sessionNonce).toBe("nonce-b");
    expect(pub.state.sessionNonce).toBe("nonce-b");

    const midDraft = [
      ...board,
      pick({
        eventKey: "3",
        overallPick: 3,
        round: 1,
        pickInRound: 3,
        playerName: "C",
        playerId: "3",
        currentTeamId: "3",
        currentTeamName: "C",
      }),
    ];
    pub.onSnapshot(snapshot(midDraft));
    const b = batches(out);
    expect(b).toHaveLength(1);
    expect(b[0]!.baselineOnly).toBe(true);
    expect(b[0]!.liveNotify).toBe(false);
    expect(b[0]!.sessionNonce).toBe("nonce-b");
    expect(b[0]!.picks).toHaveLength(3);
    expect(pub.state.picksEmittedLive).toBe(0);
  });
});

describe("Phase 4 refresh recovery (replay)", () => {
  const board = [
    pick({
      eventKey: "1",
      overallPick: 1,
      round: 1,
      pickInRound: 1,
      playerName: "A",
      playerId: "1",
      currentTeamId: "1",
      currentTeamName: "A",
    }),
    pick({
      eventKey: "2",
      overallPick: 2,
      round: 1,
      pickInRound: 2,
      playerName: "B",
      playerId: "2",
      currentTeamId: "2",
      currentTeamName: "B",
    }),
    pick({
      eventKey: "3",
      overallPick: 3,
      round: 1,
      pickInRound: 3,
      playerName: "C",
      playerId: "3",
      currentTeamId: "3",
      currentTeamName: "C",
    }),
  ];

  it("retains board across DISARM and replays full baseline after reconnect ARM", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "n1" });
    pub.onSnapshot(snapshot(board));
    expect(batches(out)).toHaveLength(1);
    pub.disarm();
    expect(pub.state.boardPickCount).toBe(3);

    out.length = 0;
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "n2" });
    const r = pub.handleReplayRequest({
      draftId: "espn-live-424242-2026",
      sessionNonce: "n2",
      afterOverallPick: 0,
      requestId: "req-full",
    });
    expect(r.ok).toBe(true);
    expect(r.emitted).toBe(3);
    const b = batches(out);
    expect(b).toHaveLength(1);
    expect(b[0]!.baselineOnly).toBe(true);
    expect(b[0]!.liveNotify).toBe(false);
    expect(b[0]!.sessionNonce).toBe("n2");
    expect(b[0]!.diagnostics.replay).toBe(true);
    expect(b[0]!.diagnostics.replayRequestId).toBe("req-full");
    expect(b[0]!.picks.map((p) => p.overallPick)).toEqual([1, 2, 3]);
  });

  it("replays only picks after afterOverallPick as liveNotify during live draft", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "n1" });
    pub.onSnapshot(snapshot(board.slice(0, 1)));
    pub.onSnapshot(snapshot(board.slice(0, 2)));
    pub.onSnapshot(snapshot(board));
    out.length = 0;
    const r = pub.handleReplayRequest({
      draftId: "espn-live-424242-2026",
      sessionNonce: "n1",
      afterOverallPick: 1,
      requestId: "req-delta",
    });
    expect(r.ok).toBe(true);
    expect(r.emitted).toBe(2);
    const b = batches(out)[0]!;
    expect(b.baselineOnly).toBe(false);
    expect(b.liveNotify).toBe(true);
    expect(b.picks.map((p) => p.playerName)).toEqual(["B", "C"]);
  });

  it("rejects wrong sessionNonce and wrong draftId", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "n1" });
    pub.onSnapshot(snapshot(board));
    out.length = 0;
    expect(
      pub.handleReplayRequest({
        draftId: "espn-live-424242-2026",
        sessionNonce: "wrong",
        afterOverallPick: 0,
        requestId: "r1",
      }).error,
    ).toBe("wrong_session_nonce");
    expect(
      pub.handleReplayRequest({
        draftId: "espn-live-999-2026",
        sessionNonce: "n1",
        afterOverallPick: 0,
        requestId: "r2",
      }).error,
    ).toBe("wrong_draft_id");
    expect(batches(out)).toHaveLength(0);
  });

  it("rejects stale replay (afterOverallPick beyond board)", () => {
    const pub = new EspnBookmarkletPublisher({ emit: () => {} });
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "n1" });
    pub.onSnapshot(snapshot(board));
    expect(
      pub.handleReplayRequest({
        draftId: "espn-live-424242-2026",
        sessionNonce: "n1",
        afterOverallPick: 99,
        requestId: "stale",
      }).error,
    ).toBe("stale_replay");
  });

  it("survives multiple rapid re-ARM + replay cycles without losing board", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({ emit: (m) => out.push(m) });
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "a" });
    pub.onSnapshot(snapshot(board));
    for (let i = 0; i < 5; i++) {
      pub.disarm();
      pub.arm({ leagueId: "424242", season: 2026, sessionNonce: `n${i}` });
      const r = pub.handleReplayRequest({
        draftId: "espn-live-424242-2026",
        sessionNonce: `n${i}`,
        afterOverallPick: 0,
        requestId: `rapid-${i}`,
      });
      expect(r.ok).toBe(true);
      expect(r.emitted).toBe(3);
    }
    expect(pub.state.boardPickCount).toBe(3);
  });

  it("inbound REPLAY_REQUEST message triggers handleReplayRequest", () => {
    const out: EspnBmOutboundMessage[] = [];
    const listeners: Array<(ev: MessageEvent) => void> = [];
    const fakeWin = {
      location: { origin: "https://fantasy.espn.com" },
      postMessage() {},
      addEventListener(_t: string, fn: (ev: MessageEvent) => void) {
        listeners.push(fn);
      },
      removeEventListener() {},
    } as unknown as Window;
    const pub = new EspnBookmarkletPublisher({
      emit: (m) => out.push(m),
      window: fakeWin,
    });
    pub.attachInboundListener();
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "n1" });
    pub.onSnapshot(snapshot(board));
    out.length = 0;
    listeners[0]!({
      source: fakeWin,
      data: {
        channel: "GMWR_ESPN_BM_PAGE",
        type: "GMWR_ESPN_BM_REPLAY_REQUEST",
        draftId: "espn-live-424242-2026",
        sessionNonce: "n1",
        afterOverallPick: 2,
        requestId: "inbound-1",
      },
    } as MessageEvent);
    expect(batches(out)).toHaveLength(1);
    expect(batches(out)[0]!.picks).toHaveLength(1);
    expect(batches(out)[0]!.picks[0]!.overallPick).toBe(3);
  });

  it("stamps protocolVersion 1 and monotonic revision per armed session", () => {
    const out: EspnBmOutboundMessage[] = [];
    const pub = new EspnBookmarkletPublisher({
      emit: (m) => out.push(m),
    });
    const mk = (n: number) =>
      pick({
        eventKey: `rev-${n}`,
        overallPick: n,
        round: 1,
        pickInRound: n,
        playerName: `P${n}`,
        playerId: String(n),
        currentTeamId: String(n),
        currentTeamName: `T${n}`,
      });
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "n1" });
    pub.onSnapshot(snapshot([mk(1), mk(2)]));
    pub.onSnapshot(snapshot([mk(1), mk(2), mk(3)]));
    const b = batches(out);
    expect(b.length).toBeGreaterThanOrEqual(2);
    expect(b[0]!.protocolVersion).toBe(1);
    expect(b[1]!.protocolVersion).toBe(1);
    expect(b[0]!.revision).toBe(1);
    expect(b[1]!.revision).toBe(2);
    pub.arm({ leagueId: "424242", season: 2026, sessionNonce: "n2" });
    pub.onSnapshot(snapshot([mk(1)]));
    const afterRearm = batches(out).at(-1)!;
    expect(afterRearm.revision).toBe(1);
  });
});

describe("mirror rendering remains unchanged", () => {
  it("publisher module does not import board/render paths", () => {
    const file = path.resolve(
      __dirname,
      "../src/draft-monitor/runtime/espnBookmarkletPublisher.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/renderBoard|DraftBoardMonitor|boardStyles|paint\(/);
  });

  it("monitorController still paints via DraftBoardMonitor before publish", () => {
    const file = path.resolve(
      __dirname,
      "../src/draft-monitor/runtime/monitorController.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toContain("this.monitor.applyAdapterResult(observeEspn(this.win))");
    expect(src).toContain("this.espnPublisher?.onSnapshot(this.monitor.getSnapshot())");
    // Order: applyAdapterResult then onSnapshot
    const applyAt = src.indexOf("this.monitor.applyAdapterResult(observeEspn(this.win))");
    const pubAt = src.indexOf("this.espnPublisher?.onSnapshot(this.monitor.getSnapshot())");
    expect(applyAt).toBeGreaterThan(-1);
    expect(pubAt).toBeGreaterThan(applyAt);
  });
});
