import { describe, expect, it } from "vitest";
import {
  buildLiveDraftRecentPicks,
  formatLiveDraftMarketValue,
  formatLiveDraftPoolAdp,
  formatLiveDraftValueVsMarket,
  liveDraftBoothPresenceLine,
  liveDraftStatusLines,
  resolveLiveDraftUiPhase,
} from "./liveDraftUx";

describe("RFSN-024 liveDraftUx status phases", () => {
  const base = {
    active: true,
    source: "espn" as const,
    monitoring: true,
    boothOnAir: true,
    draftComplete: false,
    lastError: null,
    connectorReady: true,
  };

  it("connected — healthy monitoring before first lock", () => {
    expect(resolveLiveDraftUiPhase(base)).toBe("connected");
    expect(liveDraftStatusLines(base)).toEqual([
      "Connected League",
      "Monitoring Live Draft",
      "RFSN Booth Online",
    ]);
  });

  it("waiting — after at least one lock", () => {
    const s = { ...base, hasLockedPicks: true };
    expect(resolveLiveDraftUiPhase(s)).toBe("waiting");
    expect(liveDraftStatusLines(s)[0]).toBe("Connected League");
  });

  it("rfsn source labels as RFSN Draft", () => {
    const s = { ...base, source: "rfsn" as const };
    expect(liveDraftStatusLines(s)[0]).toBe("RFSN Draft");
  });
  it("waiting — after locks, awaiting next pick", () => {
    const s = { ...base, hasLockedPicks: true };
    expect(resolveLiveDraftUiPhase(s)).toBe("waiting");
    expect(liveDraftStatusLines(s)[1]).toBe("Waiting for next pick");
  });

  it("paused — monitoring suspended", () => {
    const s = { ...base, draftPaused: true };
    expect(resolveLiveDraftUiPhase(s)).toBe("paused");
    expect(liveDraftStatusLines(s)[0]).toMatch(/paused/i);
  });

  it("reconnecting — feed error", () => {
    const s = { ...base, lastError: "network" };
    expect(resolveLiveDraftUiPhase(s)).toBe("reconnecting");
    expect(liveDraftStatusLines(s)[0]).toBe("Reconnecting to league feed");
  });

  it("does not expose ESPN terminology in status lines", () => {
    const lines = liveDraftStatusLines({
      ...base,
      lastError: "auth",
    }).join(" ");
    expect(lines).not.toMatch(/ESPN|mDraftDetail|fantasy\.espn/i);
    expect(lines).toMatch(/league feed/i);
  });
});

describe("RFSN-024 liveDraftUx pool display", () => {
  it("formats real ADP and never promotes null as elite", () => {
    expect(formatLiveDraftPoolAdp(23)).toEqual({ label: "ADP 23", isReal: true });
    expect(formatLiveDraftPoolAdp(null)).toEqual({ label: "ADP unavailable", isReal: false });
    expect(formatLiveDraftPoolAdp(250)).toEqual({ label: "ADP unavailable", isReal: false });
    expect(formatLiveDraftPoolAdp(170)).toEqual({ label: "ADP 170", isReal: true }); // numeric 170 still "real" until server nulls sentinel feeds
  });

  it("formats market value and value-vs-market from existing fields", () => {
    expect(formatLiveDraftMarketValue(82)).toBe("Val 82/100");
    expect(formatLiveDraftValueVsMarket(28, 23)).toBe("+5 vs market");
    expect(formatLiveDraftValueVsMarket(null, 23)).toBeNull();
  });
});

describe("RFSN-024 liveDraftUx recent picks + booth", () => {
  it("builds recent pick timeline from results (last highlighted)", () => {
    const recent = buildLiveDraftRecentPicks({
      schedule: [
        { pickNumber: 1, round: 1, teamId: 1, ownerName: "A" },
        { pickNumber: 2, round: 1, teamId: 2, ownerName: "B" },
        { pickNumber: 3, round: 1, teamId: 1, ownerName: "A" },
      ],
      results: {
        1: { name: "Josh Allen", position: "QB" },
        2: { name: "Lamar Jackson", position: "QB" },
      },
      teams: [
        { teamId: 1, teamName: "Aces", ownerName: "Alex" },
        { teamId: 2, teamName: "Bolts", ownerName: "Blake" },
      ],
    });
    expect(recent[0]?.playerName).toBe("Lamar Jackson");
    expect(recent[0]?.isLast).toBe(true);
    expect(recent[1]?.playerName).toBe("Josh Allen");
  });

  it("booth silence is monitoring, not failure", () => {
    expect(liveDraftBoothPresenceLine({ speaking: false, analystName: null })).toBe(
      "RFSN is monitoring",
    );
    expect(
      liveDraftBoothPresenceLine({ speaking: true, analystName: "Sofia" }),
    ).toBe("Sofia analyzing pick");
  });
});
