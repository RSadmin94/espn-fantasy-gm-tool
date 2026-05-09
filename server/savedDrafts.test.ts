import { describe, it, expect } from "vitest";

// Unit tests for Save Draft Results data logic
// These test the pure data transformation functions used by the saveDraft/listDrafts procedures
// without requiring a live DB connection.

// ---- Helpers mirrored from routers.ts ----

function encodeAvgEcr(avgEcr: number): number {
  return Math.round(avgEcr * 10);
}

function decodeAvgEcr(stored: number): number {
  return stored / 10;
}

function buildDefaultLabel(draftSlot: number): string {
  return `Mock Draft — Slot ${draftSlot}`;
}

type PickEntry = {
  round: number;
  pick: number;
  overall: number;
  owner: string;
  player: { name: string; position: string; ecrRank: number; adp?: number };
};

function computeGradeFromPicks(rodPicks: PickEntry[]): { grade: string; avgEcr: number; totalVbd: number } {
  if (rodPicks.length === 0) return { grade: "F", avgEcr: 999, totalVbd: 0 };
  const avgEcr = rodPicks.reduce((s, p) => s + p.player.ecrRank, 0) / rodPicks.length;
  const totalVbd = rodPicks.reduce((s, p) => {
    const gap = (p.player.adp ?? p.overall) - p.overall;
    return s + gap;
  }, 0);
  let grade: string;
  if (avgEcr <= 30) grade = "A+";
  else if (avgEcr <= 45) grade = "A";
  else if (avgEcr <= 60) grade = "A-";
  else if (avgEcr <= 75) grade = "B+";
  else if (avgEcr <= 90) grade = "B";
  else if (avgEcr <= 110) grade = "B-";
  else if (avgEcr <= 130) grade = "C+";
  else if (avgEcr <= 150) grade = "C";
  else if (avgEcr <= 175) grade = "C-";
  else if (avgEcr <= 200) grade = "D+";
  else if (avgEcr <= 225) grade = "D";
  else grade = "F";
  return { grade, avgEcr, totalVbd };
}

function buildPositionalSummary(picks: PickEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of picks) {
    counts[p.player.position] = (counts[p.player.position] ?? 0) + 1;
  }
  return counts;
}

// ---- Tests ----

describe("saveDraft data helpers", () => {
  it("encodes avgEcr as integer (×10) for DB storage", () => {
    expect(encodeAvgEcr(45.3)).toBe(453);
    expect(encodeAvgEcr(100.0)).toBe(1000);
    expect(encodeAvgEcr(12.7)).toBe(127);
  });

  it("decodes stored avgEcr back to float correctly", () => {
    expect(decodeAvgEcr(453)).toBeCloseTo(45.3);
    expect(decodeAvgEcr(1000)).toBeCloseTo(100.0);
    expect(decodeAvgEcr(127)).toBeCloseTo(12.7);
  });

  it("round-trips avgEcr through encode/decode without precision loss", () => {
    const values = [10.0, 33.3, 67.8, 99.1, 150.5];
    for (const v of values) {
      expect(decodeAvgEcr(encodeAvgEcr(v))).toBeCloseTo(v, 1);
    }
  });

  it("builds default label from draftSlot", () => {
    expect(buildDefaultLabel(1)).toBe("Mock Draft — Slot 1");
    expect(buildDefaultLabel(7)).toBe("Mock Draft — Slot 7");
    expect(buildDefaultLabel(14)).toBe("Mock Draft — Slot 14");
  });
});

describe("computeGradeFromPicks", () => {
  const makePick = (overall: number, ecrRank: number, adp?: number): PickEntry => ({
    round: Math.ceil(overall / 14),
    pick: ((overall - 1) % 14) + 1,
    overall,
    owner: "Roderick Sellers",
    player: { name: `Player ${overall}`, position: "RB", ecrRank, adp },
  });

  it("returns F for empty picks", () => {
    const result = computeGradeFromPicks([]);
    expect(result.grade).toBe("F");
  });

  it("returns A+ for very low avg ECR (elite draft)", () => {
    const picks = [1, 2, 3, 4, 5].map((i) => makePick(i, i));
    const result = computeGradeFromPicks(picks);
    expect(result.grade).toBe("A+");
    expect(result.avgEcr).toBeCloseTo(3.0);
  });

  it("returns A- for avg ECR around 60 (top of A- tier)", () => {
    const picks = [10, 20, 80, 90, 100].map((i) => makePick(i, i));
    const result = computeGradeFromPicks(picks);
    // avg = 60 → falls in A- tier (≤60)
    expect(result.grade).toBe("A-");
    expect(result.avgEcr).toBeCloseTo(60.0);
  });

  it("returns B for avg ECR around 85 (mid-B tier)", () => {
    const picks = [70, 80, 85, 90, 100].map((i) => makePick(i, i));
    const result = computeGradeFromPicks(picks);
    // avg = 85 → falls in B tier (≤90)
    expect(result.grade).toBe("B");
    expect(result.avgEcr).toBeCloseTo(85.0);
  });

  it("computes positive totalVbd when picks go later than ADP (value)", () => {
    // Player's ADP is 50 but Rod picks them at overall 30 — Rod got value
    const picks = [makePick(30, 30, 50)];
    const result = computeGradeFromPicks(picks);
    expect(result.totalVbd).toBeGreaterThan(0);
  });

  it("computes negative totalVbd when picks go earlier than ADP (reach)", () => {
    // Player's ADP is 20 but Rod picks them at overall 40 — Rod reached
    const picks = [makePick(40, 40, 20)];
    const result = computeGradeFromPicks(picks);
    expect(result.totalVbd).toBeLessThan(0);
  });

  it("uses overall pick as ADP fallback when adp is undefined", () => {
    const picks = [makePick(10, 10, undefined)];
    const result = computeGradeFromPicks(picks);
    expect(result.totalVbd).toBe(0); // gap = overall - overall = 0
  });
});

describe("buildPositionalSummary", () => {
  const makePick = (pos: string, overall: number): PickEntry => ({
    round: 1, pick: overall, overall,
    owner: "Rod",
    player: { name: `P${overall}`, position: pos, ecrRank: overall },
  });

  it("counts positions correctly", () => {
    const picks = [
      makePick("RB", 1), makePick("RB", 2), makePick("WR", 3),
      makePick("QB", 4), makePick("TE", 5), makePick("WR", 6),
    ];
    const summary = buildPositionalSummary(picks);
    expect(summary.RB).toBe(2);
    expect(summary.WR).toBe(2);
    expect(summary.QB).toBe(1);
    expect(summary.TE).toBe(1);
    expect(summary.K).toBeUndefined();
  });

  it("returns empty object for empty picks", () => {
    expect(buildPositionalSummary([])).toEqual({});
  });

  it("handles all same position", () => {
    const picks = [1, 2, 3, 4, 5].map((i) => makePick("WR", i));
    const summary = buildPositionalSummary(picks);
    expect(summary.WR).toBe(5);
    expect(Object.keys(summary).length).toBe(1);
  });
});

describe("listDrafts sort order", () => {
  type DraftRow = { id: number; createdAt: Date; grade: string; avgEcr: number };

  function sortByNewest(drafts: DraftRow[]): DraftRow[] {
    return [...drafts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  it("sorts drafts newest-first", () => {
    const drafts: DraftRow[] = [
      { id: 1, createdAt: new Date("2026-05-01"), grade: "B", avgEcr: 80 },
      { id: 2, createdAt: new Date("2026-05-09"), grade: "A", avgEcr: 45 },
      { id: 3, createdAt: new Date("2026-04-20"), grade: "C", avgEcr: 120 },
    ];
    const sorted = sortByNewest(drafts);
    expect(sorted[0].id).toBe(2); // May 9 is newest
    expect(sorted[1].id).toBe(1); // May 1
    expect(sorted[2].id).toBe(3); // Apr 20 is oldest
  });
});
