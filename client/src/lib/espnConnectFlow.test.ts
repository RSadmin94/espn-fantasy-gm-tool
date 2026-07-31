import { describe, expect, it } from "vitest";
import type { EspnConnectResult } from "./espnApi";
import {
  applyConnectResult,
  applyPreflight,
  applyReadBack,
  initialEspnConnectFlowState,
  shouldAutoConnect,
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
    expect(s.league).toEqual({ id: "457622", name: "Atlanta's Finest" });

    expect(applyReadBack(s, true).step).toBe("connected");
    expect(applyReadBack(s, false).problem?.kind).toBe("read_back_missing");
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
