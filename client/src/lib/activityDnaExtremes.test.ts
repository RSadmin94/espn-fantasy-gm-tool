import { describe, expect, it } from "vitest";
import { pickMostAndLeastHighActivity } from "./activityDnaExtremes";

type TestRow = {
  ownerId: string;
  archetypes?: Record<string, { score: number | null; status: string } | undefined>;
};

function row(ownerId: string, score: number | null, status: "ok" | "pending-data" = "ok"): TestRow {
  return { ownerId, archetypes: { highActivity: { score, status } } };
}

// Build a row with an arbitrary (possibly invalid) ownerId for filter tests.
function rowWithId(ownerId: unknown, score: number | null, status: "ok" | "pending-data" = "ok"): TestRow {
  return { ownerId: ownerId as string, archetypes: { highActivity: { score, status } } };
}

describe("pickMostAndLeastHighActivity", () => {
  it("returns nulls for an empty dataset", () => {
    expect(pickMostAndLeastHighActivity([])).toEqual({ most: null, least: null });
  });

  it("returns nulls when no ok scores", () => {
    expect(pickMostAndLeastHighActivity([row("a", 80, "pending-data")])).toEqual({ most: null, least: null });
  });

  it("single valid owner -> most set, least null (never duplicated)", () => {
    const r = pickMostAndLeastHighActivity([row("solo", 55)]);
    expect(r.most?.ownerId).toBe("solo");
    expect(r.least).toBeNull();
  });

  it("never assigns same owner to most and least when two+ owners differ", () => {
    const r = pickMostAndLeastHighActivity([row("high", 99), row("low", 12)]);
    expect(r.most?.ownerId).toBe("high");
    expect(r.least?.ownerId).toBe("low");
  });

  it("breaks ties so least is a different owner than most", () => {
    const r = pickMostAndLeastHighActivity([row("b", 50), row("a", 50), row("c", 50)]);
    expect(r.most?.ownerId).toBe("a");
    expect(r.least?.ownerId).not.toBe(r.most?.ownerId);
    expect(["b", "c"]).toContain(r.least?.ownerId);
  });

  it("with two owners tied at max, most is stable first by ownerId; least is the other", () => {
    const r = pickMostAndLeastHighActivity([row("zebra", 70), row("apple", 70)]);
    expect(r.most?.ownerId).toBe("apple");
    expect(r.least?.ownerId).toBe("zebra");
  });

  it("excludes empty-string ownerId", () => {
    const r = pickMostAndLeastHighActivity([row("", 90), row("real", 40)]);
    expect(r.most?.ownerId).toBe("real");
    expect(r.least).toBeNull();
  });

  it("excludes undefined ownerId", () => {
    const r = pickMostAndLeastHighActivity([rowWithId(undefined, 90), row("real", 40)]);
    expect(r.most?.ownerId).toBe("real");
    expect(r.least).toBeNull();
  });

  it("excludes null ownerId", () => {
    const r = pickMostAndLeastHighActivity([rowWithId(null, 90), row("real", 40)]);
    expect(r.most?.ownerId).toBe("real");
    expect(r.least).toBeNull();
  });

  it("excludes whitespace-only ownerId", () => {
    const r = pickMostAndLeastHighActivity([row("   ", 90), row("real", 40)]);
    expect(r.most?.ownerId).toBe("real");
    expect(r.least).toBeNull();
  });

  it("filters mixed valid/invalid owners (status, null, NaN, blank id)", () => {
    const r = pickMostAndLeastHighActivity([
      row("ok-high", 88),
      row("ok-low", 22),
      row("pending", 99, "pending-data"),
      row("null-score", null),
      rowWithId("nan-score", NaN),
      row("  ", 95),
    ]);
    expect(r.most?.ownerId).toBe("ok-high");
    expect(r.least?.ownerId).toBe("ok-low");
  });
});
