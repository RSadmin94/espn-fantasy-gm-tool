import { describe, it, expect } from "vitest";
import { computeOverallVerdict, mapChampionshipContext } from "./tradeIntelligence";

describe("mapChampionshipContext (locked mapping, no new classifier)", () => {
  it("folds Playoff Team into Contender", () => {
    expect(mapChampionshipContext("Contender")).toBe("Contender");
    expect(mapChampionshipContext("Playoff Team")).toBe("Contender");
  });
  it("maps the remaining existing labels 1:1", () => {
    expect(mapChampionshipContext("Bubble Team")).toBe("Bubble");
    expect(mapChampionshipContext("Retooling")).toBe("Retooling");
    expect(mapChampionshipContext("Rebuilding")).toBe("Rebuilding");
  });
  it("treats unknown/absent as Neutral", () => {
    expect(mapChampionshipContext(null)).toBe("Neutral");
    expect(mapChampionshipContext(undefined)).toBe("Neutral");
  });
});

describe("computeOverallVerdict (Tier 1 combiner — spec §3.4)", () => {
  const ov = (valueGrade: any, rosterFit: any, context: any) =>
    computeOverallVerdict({ valueGrade, rosterFit, context }).overall;

  it("live trade: COUNTER value, Retooling, fit D -> COUNTER", () => {
    expect(ov("COUNTER", "D", "Retooling")).toBe("COUNTER");
  });
  it("contender slightly behind + good fit -> FAIR (one-tier lift)", () => {
    expect(ov("COUNTER", "A", "Contender")).toBe("FAIR");
  });
  it("contender behind but POOR fit -> RISKY (lift then fit overlay)", () => {
    expect(ov("COUNTER", "D", "Contender")).toBe("RISKY");
  });
  it("rebuilder slightly behind -> stays COUNTER (no lift, floored at COUNTER)", () => {
    expect(ov("COUNTER", "C", "Rebuilding")).toBe("COUNTER");
  });
  it("clean value win + poor fit -> RISKY overlay", () => {
    expect(ov("ACCEPT", "F", "Bubble")).toBe("RISKY");
  });
  it("clean value win + good fit -> ACCEPT", () => {
    expect(ov("ACCEPT", "A", "Bubble")).toBe("ACCEPT");
  });
  it("fleecing + great fit + contender -> capped at COUNTER (never FAIR/ACCEPT)", () => {
    expect(ov("AVOID", "A", "Contender")).toBe("COUNTER");
  });
  it("true AVOID with rebuilding context stays AVOID", () => {
    expect(ov("AVOID", "C", "Rebuilding")).toBe("AVOID");
  });
  it("balanced FAIR + good fit + neutral -> FAIR", () => {
    expect(ov("FAIR", "B", "Bubble")).toBe("FAIR");
  });
  it("FAIR value + poor fit -> RISKY overlay", () => {
    expect(ov("FAIR", "D", "Neutral")).toBe("RISKY");
  });
  it("near-parity RISKY value surfaces as RISKY", () => {
    expect(ov("RISKY", "C", "Neutral")).toBe("RISKY");
  });
  it("context never manufactures an AVOID from a COUNTER (floor holds)", () => {
    // Rebuilding pushes -1 but a non-AVOID value can't fall below COUNTER.
    expect(ov("COUNTER", "B", "Rebuilding")).toBe("COUNTER");
  });
});
