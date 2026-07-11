import { describe, expect, it } from "vitest";
import {
  FIXTURE_SCENARIO_LABELS,
  applyQueuedMoment,
  commentaryVisibleForPhase,
  dequeueNextMoment,
  fixtureForScenario,
  nextBroadcastPhase,
  resolveContextGraphic,
  resolveLayoutMode,
  resolveOnAirCommentary,
  shouldShowBreakingNews,
  shouldShowMomentBanner,
  significanceLabel,
} from "@/lib/rfsnPresentation";

describe("rfsnPresentation fixtures", () => {
  it("exposes all required demo scenarios", () => {
    const keys = Object.keys(FIXTURE_SCENARIO_LABELS);
    expect(keys).toContain("routine_pick");
    expect(keys).toContain("notable_pick");
    expect(keys).toContain("major_pick");
    expect(keys).toContain("historic_pick");
    expect(keys).toContain("position_run");
    expect(keys).toContain("league_storyline");
    expect(keys).toContain("commentary_queued");
    expect(keys).toContain("long_commentary");
    expect(keys).toContain("mobile_narrow");
  });

  it("routine pick has no on-air commentary cards", () => {
    const snap = fixtureForScenario("routine_pick");
    const { primary, secondary } = resolveOnAirCommentary(snap);
    expect(primary).toBeNull();
    expect(secondary).toBeNull();
    expect(shouldShowMomentBanner(snap)).toBe(false);
  });

  it("notable pick shows primary only", () => {
    const snap = fixtureForScenario("notable_pick");
    const { primary, secondary } = resolveOnAirCommentary(snap);
    expect(primary?.commentator).toBe("sofia");
    expect(secondary).toBeNull();
    expect(significanceLabel(snap.significance)).toBe("Notable");
  });

  it("major pick allows one primary and one secondary", () => {
    const snap = fixtureForScenario("major_pick");
    const { primary, secondary } = resolveOnAirCommentary(snap);
    expect(primary).not.toBeNull();
    expect(secondary).not.toBeNull();
    expect(primary?.commentator).not.toBe(secondary?.commentator);
  });

  it("historic pick enables breaking news treatment", () => {
    const snap = fixtureForScenario("historic_pick");
    expect(shouldShowBreakingNews(snap)).toBe(true);
    expect(snap.breakingNews?.headline).toMatch(/TE/i);
    expect(significanceLabel(snap.significance)).toBe("Historic");
  });

  it("never exposes internal scoring in public labels", () => {
    const snap = fixtureForScenario("major_pick");
    expect(snap.momentMeter).toBeDefined();
    expect(significanceLabel(snap.significance)).not.toMatch(/score|model|validation/i);
  });
});

describe("broadcast phase machine", () => {
  it("advances through pick lock to commentary", () => {
    expect(nextBroadcastPhase("idle", false)).toBe("pick_locked");
    expect(nextBroadcastPhase("pick_locked", false)).toBe("board_updated");
    expect(nextBroadcastPhase("board_updated", false)).toBe("beat");
    expect(nextBroadcastPhase("beat", false)).toBe("primary_in");
  });

  it("skips secondary when none configured", () => {
    expect(nextBroadcastPhase("primary_in", false)).toBe("exiting");
  });

  it("includes secondary phase when reaction exists", () => {
    expect(nextBroadcastPhase("primary_in", true)).toBe("secondary_in");
    expect(nextBroadcastPhase("secondary_in", true)).toBe("exiting");
  });

  it("controls visibility by phase slot", () => {
    expect(commentaryVisibleForPhase("beat", "primary")).toBe(false);
    expect(commentaryVisibleForPhase("primary_in", "primary")).toBe(true);
    expect(commentaryVisibleForPhase("primary_in", "secondary")).toBe(false);
    expect(commentaryVisibleForPhase("secondary_in", "secondary")).toBe(true);
  });
});

describe("commentary queue", () => {
  it("dequeues moments in order", () => {
    const snap = fixtureForScenario("commentary_queued");
    const { next, remaining } = dequeueNextMoment(snap.queue);
    expect(next?.id).toBe("q1");
    expect(remaining).toHaveLength(0);
  });

  it("applies queued moment without stacking three cards", () => {
    const snap = fixtureForScenario("commentary_queued");
    const { next } = dequeueNextMoment(snap.queue);
    expect(next).not.toBeNull();
    const applied = applyQueuedMoment(snap, next!);
    const { primary, secondary } = resolveOnAirCommentary(applied);
    expect(primary?.commentator).toBe("roxanne");
    expect(secondary).toBeNull();
  });
});

describe("context graphic selection", () => {
  it("shows only breaking news when historic", () => {
    const snap = fixtureForScenario("historic_pick");
    const ctx = resolveContextGraphic(snap);
    expect(ctx.prominent).toBe("breaking_news");
    expect(ctx.showQuietOdds).toBe(true);
  });

  it("shows position run without competing widgets", () => {
    const snap = fixtureForScenario("position_run");
    const ctx = resolveContextGraphic(snap);
    expect(ctx.prominent).toBe("position_run");
  });

  it("shows league storyline when that is the active moment", () => {
    const snap = fixtureForScenario("league_storyline");
    const ctx = resolveContextGraphic(snap);
    expect(ctx.prominent).toBe("league_storyline");
  });

  it("uses quiet odds only for routine picks", () => {
    const snap = fixtureForScenario("routine_pick");
    const ctx = resolveContextGraphic(snap);
    expect(ctx.prominent).toBe("none");
    expect(ctx.showQuietOdds).toBe(true);
  });
});

describe("layout", () => {
  it("resolves mobile below 768px", () => {
    expect(resolveLayoutMode(375)).toBe("mobile");
    expect(resolveLayoutMode(1024)).toBe("desktop");
  });
});

describe("RfsnPrototype harness", () => {
  it("exports a prototype page component", async () => {
    const mod = await import("@/pages/RfsnPrototype");
    expect(mod.RfsnPrototype).toBeTypeOf("function");
  });
});
