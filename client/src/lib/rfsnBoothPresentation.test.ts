import { describe, expect, it } from "vitest";
import { fixtureForScenario } from "@/lib/rfsnPresentation";
import {
  BOOTH_ANALYST_ORDER,
  BOOTH_INACTIVE_OPACITY,
  BOOTH_PORTRAIT_WIDTH_PCT,
  analystOpacity,
  boothCardMinHeight,
  boothPortraitMinHeight,
  boothStandbyLine,
  buildBoothCommentarySequence,
  commentaryDisplayMs,
  filterTickerForBooth,
  initialCardStates,
  isCommentaryVisibleState,
  nextBoothSegment,
} from "@/lib/rfsnBoothPresentation";

describe("buildBoothCommentarySequence", () => {
  it("orders primary then secondary", () => {
    const snap = fixtureForScenario("major_pick");
    const seq = buildBoothCommentarySequence(snap);
    expect(seq.map((c) => c.commentator)).toEqual(["sofia", "coach", "roxanne"]);
  });

  it("includes at most three voices", () => {
    const snap = fixtureForScenario("historic_pick");
    const seq = buildBoothCommentarySequence(snap);
    expect(seq.length).toBeLessThanOrEqual(3);
  });

  it("returns empty for routine", () => {
    const snap = fixtureForScenario("routine_pick");
    expect(buildBoothCommentarySequence(snap)).toHaveLength(0);
  });
});

describe("analyst opacity", () => {
  it("fades inactive analysts when Sofia speaks", () => {
    expect(analystOpacity("sofia", "sofia", "active")).toBe(1);
    expect(analystOpacity("coach", "sofia", "standby")).toBe(BOOTH_INACTIVE_OPACITY);
    expect(analystOpacity("roxanne", "sofia", "standby")).toBe(BOOTH_INACTIVE_OPACITY);
  });

  it("fades inactive analysts when Coach speaks", () => {
    expect(analystOpacity("coach", "coach", "active")).toBe(1);
    expect(analystOpacity("sofia", "coach", "standby")).toBe(BOOTH_INACTIVE_OPACITY);
    expect(analystOpacity("roxanne", "coach", "standby")).toBe(BOOTH_INACTIVE_OPACITY);
  });

  it("fades inactive analysts when Roxanne speaks", () => {
    expect(analystOpacity("roxanne", "roxanne", "active")).toBe(1);
    expect(analystOpacity("sofia", "roxanne", "standby")).toBe(BOOTH_INACTIVE_OPACITY);
    expect(analystOpacity("coach", "roxanne", "standby")).toBe(BOOTH_INACTIVE_OPACITY);
  });

  it("returns full opacity for all in standby", () => {
    for (const id of BOOTH_ANALYST_ORDER) {
      expect(analystOpacity(id, null, "standby")).toBe(1);
    }
  });
});

describe("commentary visibility", () => {
  it("shows text only in active and dismissing states", () => {
    expect(isCommentaryVisibleState("active")).toBe(true);
    expect(isCommentaryVisibleState("dismissing")).toBe(true);
    expect(isCommentaryVisibleState("standby")).toBe(false);
    expect(isCommentaryVisibleState("entering")).toBe(false);
    expect(isCommentaryVisibleState("exiting")).toBe(false);
  });
});

describe("commentaryDisplayMs", () => {
  it("respects minimum and scales with length (no hard max cut-off)", () => {
    expect(commentaryDisplayMs("")).toBe(3000);
    expect(commentaryDisplayMs("x".repeat(500))).toBe(500 * 50);
  });

  it("uses reduced motion minimum", () => {
    expect(commentaryDisplayMs("x".repeat(200), true)).toBe(3000);
  });
});

describe("ticker deduplication", () => {
  it("removes active card from ticker", () => {
    const snap = fixtureForScenario("major_pick");
    const active = snap.primary!;
    const filtered = filterTickerForBooth(snap.ticker, active, new Set());
    expect(filtered.some((t) => t.text === active.text && t.commentator === active.commentator)).toBe(
      false,
    );
  });

  it("removes consumed ticker ids", () => {
    const snap = fixtureForScenario("major_pick");
    const item = snap.ticker[0]!;
    const filtered = filterTickerForBooth(snap.ticker, null, new Set([item.id]));
    expect(filtered.find((t) => t.id === item.id)).toBeUndefined();
  });
});

describe("sequence advancement", () => {
  it("advances to next speaker after primary", () => {
    const snap = fixtureForScenario("major_pick");
    const seq = buildBoothCommentarySequence(snap);
    const next = nextBoothSegment(seq, 0);
    expect(next.type).toBe("play");
    if (next.type === "play") {
      expect(next.card.commentator).toBe("coach");
    }
  });

  it("returns standby after final speaker", () => {
    const snap = fixtureForScenario("notable_pick");
    const seq = buildBoothCommentarySequence(snap);
    expect(nextBoothSegment(seq, seq.length - 1).type).toBe("standby");
  });
});

describe("initial booth state", () => {
  it("keeps all three analysts in standby", () => {
    const states = initialCardStates();
    expect(BOOTH_ANALYST_ORDER.every((id) => states[id] === "standby")).toBe(true);
  });
});

describe("booth analyst order", () => {
  it("keeps Sofia, Coach, Roxanne in fixed order", () => {
    expect(BOOTH_ANALYST_ORDER).toEqual(["sofia", "coach", "roxanne"]);
  });
});

describe("booth card layout helpers", () => {
  it("sizes Sofia largest, Roxanne most compact", () => {
    expect(boothCardMinHeight("sofia", false)).toContain("11rem");
    expect(boothCardMinHeight("coach", false)).toContain("10.5rem");
    expect(boothCardMinHeight("roxanne", false)).toContain("10rem");
    expect(boothCardMinHeight("sofia", true)).toContain("17.5rem");
  });

  it("grows portrait region when analyst is active", () => {
    expect(boothPortraitMinHeight("sofia", true)).toContain("11.5rem");
    expect(boothPortraitMinHeight("sofia", false)).toContain("9.5rem");
  });

  it("uses 42% portrait width constant", () => {
    expect(BOOTH_PORTRAIT_WIDTH_PCT).toBe(42);
  });

  it("provides standby copy per analyst", () => {
    expect(boothStandbyLine("sofia")).toContain("Lead Analyst");
    expect(boothStandbyLine("coach")).toContain("On standby");
  });
});

describe("dismissal returns to standby path", () => {
  it("final segment advances to standby", () => {
    const snap = fixtureForScenario("major_pick");
    const seq = buildBoothCommentarySequence(snap);
    const last = nextBoothSegment(seq, seq.length - 1);
    expect(last.type).toBe("standby");
  });
});
