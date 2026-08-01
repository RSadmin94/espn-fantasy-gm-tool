import { describe, expect, it } from "vitest";
import type { EspnConnectResult } from "./espnApi";
import {
  advanceSaving,
  applyConnectResult,
  applyPreflight,
  applyReadBack,
  defaultLeagueSelection,
  initialEspnConnectFlowState,
  recordFailedLeague,
  shouldAutoConnect,
  startConfirming,
  startConnecting,
  startSaving,
} from "./espnConnectFlow";

function result(over: Partial<EspnConnectResult>): EspnConnectResult {
  return {
    stage: "connected",
    connectorPresent: true,
    espnSignedIn: true,
    saveHttpStatus: null,
    leagues: [],
    leagueId: null,
    leagueName: null,
    savedTo: null,
    error: null,
    elapsedMs: 10,
    ...over,
  };
}

describe("preflight", () => {
  it("sends a user with no connector to the install step", () => {
    const s = applyPreflight(result({ stage: "connector_missing", connectorPresent: false }));
    expect(s.step).toBe("connector_missing");
  });

  it("sends a signed-out user to the ESPN sign-in step", () => {
    const s = applyPreflight(result({ stage: "espn_signed_out", espnSignedIn: false }));
    expect(s.step).toBe("espn_signed_out");
  });

  it("marks a ready session without connecting on its own", () => {
    const s = applyPreflight(result({ stage: "ready" }));
    expect(s.step).toBe("ready");
  });

  it("treats a silent connector as a problem, not a dead spinner", () => {
    const s = applyPreflight(result({ stage: "timeout", error: "no reply" }));
    expect(s.step).toBe("problem");
    expect(s.problem?.kind).toBe("timeout");
  });
});

describe("connect run", () => {
  it("offers the league picker when ESPN has more than one", () => {
    const s = applyConnectResult(
      startConnecting(initialEspnConnectFlowState()),
      result({
        stage: "choose",
        leagues: [
          { id: "1", name: "Atlanta's Finest" },
          { id: "2", name: "Dynasty Money" },
        ],
      }),
    );
    expect(s.step).toBe("choose");
    expect(s.leagues).toHaveLength(2);
  });

  it("holds a connected reply at confirming until the backend agrees", () => {
    const s = applyConnectResult(
      startConnecting(initialEspnConnectFlowState()),
      result({ stage: "connected", leagueId: "457622", leagueName: "Atlanta's Finest" }),
    );
    expect(s.step).toBe("connecting");
    expect(s.progress).toBe("confirming");
    expect(s.connected).toEqual([{ id: "457622", name: "Atlanta's Finest" }]);

    expect(applyReadBack(s, ["457622"]).step).toBe("connected");
    expect(applyReadBack(s, []).problem?.kind).toBe("read_back_missing");
  });

  it("keeps the HTTP status out of the copy but not out of the record", () => {
    const s = applyConnectResult(
      startConnecting(initialEspnConnectFlowState()),
      result({ stage: "save_failed", saveHttpStatus: 500, error: "UNAUTHORIZED" }),
    );
    expect(s.step).toBe("problem");
    expect(s.problem?.message).not.toMatch(/500|HTTP|UNAUTHORIZED/);
    expect(s.problem?.detail).toContain("500");
  });

  it("routes an empty ESPN account to its own message", () => {
    const s = applyConnectResult(
      startConnecting(initialEspnConnectFlowState()),
      result({ stage: "no_leagues" }),
    );
    expect(s.problem?.kind).toBe("no_leagues");
  });

  it("falls back to the sign-in step if the session dies mid-run", () => {
    const s = applyConnectResult(
      startConnecting(initialEspnConnectFlowState()),
      result({ stage: "espn_signed_out", espnSignedIn: false }),
    );
    expect(s.step).toBe("espn_signed_out");
  });

  it("shows the linking line once a league has been picked", () => {
    expect(startSaving(initialEspnConnectFlowState()).progress).toBe("linking");
  });
});

describe("connecting several leagues at once", () => {
  const picks = [
    { id: "1", name: "Atlanta's Finest" },
    { id: "2", name: "Dynasty Money" },
    { id: "3", name: "The Gauntlet" },
  ];

  it("starts the batch on the first pick and counts through the rest", () => {
    const s = startSaving(initialEspnConnectFlowState(), picks);
    expect(s.progress).toBe("linking");
    expect(s.pending).toEqual({ index: 0, total: 3, name: "Atlanta's Finest" });

    const next = advanceSaving(s, 1, "Dynasty Money", 3);
    expect(next.pending).toEqual({ index: 1, total: 3, name: "Dynasty Money" });
  });

  it("keeps going when one league fails and reports it alongside the winners", () => {
    let s = startSaving(initialEspnConnectFlowState(), picks);
    s = recordFailedLeague(s, picks[1]);
    s = startConfirming(s, [picks[0], picks[2]]);
    expect(s.progress).toBe("confirming");
    expect(s.connected).toHaveLength(2);

    s = applyReadBack(s, ["1", "3"]);
    expect(s.step).toBe("connected");
    expect(s.connected.map((l) => l.id)).toEqual(["1", "3"]);
    expect(s.failed.map((l) => l.id)).toEqual(["2"]);
  });

  it("demotes a league the backend cannot see, even when its siblings saved", () => {
    let s = startConfirming(startSaving(initialEspnConnectFlowState(), picks), picks);
    s = applyReadBack(s, ["1", "2"]);
    expect(s.step).toBe("connected");
    expect(s.connected.map((l) => l.id)).toEqual(["1", "2"]);
    expect(s.failed.map((l) => l.id)).toEqual(["3"]);
  });

  it("treats a batch the backend confirms none of as a failure", () => {
    const s = applyReadBack(
      startConfirming(startSaving(initialEspnConnectFlowState(), picks), picks),
      [],
    );
    expect(s.step).toBe("problem");
    expect(s.problem?.kind).toBe("read_back_missing");
    expect(s.failed).toHaveLength(3);
  });

  it("records a failed league only once", () => {
    let s = startSaving(initialEspnConnectFlowState(), picks);
    s = recordFailedLeague(s, picks[0]);
    s = recordFailedLeague(s, picks[0]);
    expect(s.failed).toHaveLength(1);
  });

  it("ticks every league by default", () => {
    expect(defaultLeagueSelection(picks, null)).toEqual(["1", "2", "3"]);
    expect(defaultLeagueSelection(picks, 5)).toEqual(["1", "2", "3"]);
  });

  it("never pre-selects more leagues than the account has room for", () => {
    expect(defaultLeagueSelection(picks, 2)).toEqual(["1", "2"]);
    expect(defaultLeagueSelection(picks, 0)).toEqual([]);
  });

  it("never leaks technical language into any problem message", () => {
    const stages = ["no_leagues", "save_failed", "timeout", "error"] as const;
    for (const stage of stages) {
      const s = applyConnectResult(
        initialEspnConnectFlowState(),
        result({ stage, saveHttpStatus: 403, error: "swid/espn_s2 cookie missing" }),
      );
      const copy = `${s.problem?.headline ?? ""} ${s.problem?.message ?? ""}`;
      expect(copy).not.toMatch(/cookie|swid|espn_s2|HTTP|League ID|extension|401|403/i);
    }
  });
});

describe("auto-advance guard", () => {
  const base = {
    step: "ready" as const,
    connectedLeagueCount: 0,
    isDemo: false,
    atLimit: false,
    alreadyRan: false,
  };

  it("connects a cold-start account without a click", () => {
    expect(shouldAutoConnect(base)).toBe(true);
  });

  it("never reconnects an account that already has a league", () => {
    expect(shouldAutoConnect({ ...base, connectedLeagueCount: 1 })).toBe(false);
  });

  it("leaves the read-only demo account alone", () => {
    expect(shouldAutoConnect({ ...base, isDemo: true })).toBe(false);
  });

  it("does not push an account past its league limit", () => {
    expect(shouldAutoConnect({ ...base, atLimit: true })).toBe(false);
  });

  it("only ever fires once", () => {
    expect(shouldAutoConnect({ ...base, alreadyRan: true })).toBe(false);
  });

  it("waits for the league count to load", () => {
    expect(shouldAutoConnect({ ...base, connectedLeagueCount: null })).toBe(false);
  });

  it("does not fire from any step other than ready", () => {
    expect(shouldAutoConnect({ ...base, step: "connector_missing" })).toBe(false);
    expect(shouldAutoConnect({ ...base, step: "problem" })).toBe(false);
  });
});