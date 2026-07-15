import { describe, expect, it } from "vitest";
import { initialCardStates } from "@/lib/rfsnBoothPresentation";
import {
  analystLiveIndicatorVisible,
  clockProgress,
  clockUrgencyLevel,
  contextGraphicDelay,
  isOnClockRowLive,
  phraseRevealIntervalMs,
  resolveBroadcastFocus,
  splitCommentaryPhrases,
} from "@/lib/rfsnBroadcastProduction";

describe("resolveBroadcastFocus", () => {
  it("returns ambient when no analyst is active", () => {
    expect(resolveBroadcastFocus(null, initialCardStates())).toBe("ambient");
  });

  it("returns commentary when active analyst is speaking", () => {
    const states = initialCardStates();
    states.sofia = "active";
    expect(resolveBroadcastFocus("sofia", states)).toBe("commentary");
  });

  it("returns commentary during entering and dismissing", () => {
    const entering = initialCardStates();
    entering.coach = "entering";
    expect(resolveBroadcastFocus("coach", entering)).toBe("commentary");

    const dismissing = initialCardStates();
    dismissing.roxanne = "dismissing";
    expect(resolveBroadcastFocus("roxanne", dismissing)).toBe("commentary");
  });

  it("returns ambient when active commentator is on standby", () => {
    const states = initialCardStates();
    states.sofia = "standby";
    expect(resolveBroadcastFocus("sofia", states)).toBe("ambient");
  });
});

describe("isOnClockRowLive", () => {
  it("pulses on-clock row only during commentary focus", () => {
    expect(isOnClockRowLive("commentary", true)).toBe(true);
    expect(isOnClockRowLive("commentary", false)).toBe(false);
    expect(isOnClockRowLive("ambient", true)).toBe(false);
  });
});

describe("splitCommentaryPhrases", () => {
  it("splits on sentence boundaries first", () => {
    expect(splitCommentaryPhrases("First sentence. Second sentence.")).toEqual([
      "First sentence.",
      "Second sentence.",
    ]);
  });

  it("falls back to clause chunks for long single sentences", () => {
    const text =
      "This is a longer single sentence without periods, but it has clauses, and more detail, and keeps going";
    const phrases = splitCommentaryPhrases(text);
    expect(phrases.length).toBeGreaterThan(1);
    expect(phrases.join(" ").replace(/,/g, "")).toContain("longer single sentence");
  });

  it("returns empty for blank text", () => {
    expect(splitCommentaryPhrases("   ")).toEqual([]);
  });
});

describe("phraseRevealIntervalMs", () => {
  it("targets 400–700 ms total across phrases", () => {
    const interval = phraseRevealIntervalMs(4);
    expect(interval).toBeGreaterThan(0);
    expect(interval * 4).toBeGreaterThanOrEqual(400);
    expect(interval * 4).toBeLessThanOrEqual(700);
  });

  it("returns zero when reduced motion is enabled", () => {
    expect(phraseRevealIntervalMs(4, true)).toBe(0);
    expect(phraseRevealIntervalMs(1, false)).toBe(0);
  });
});

describe("clock urgency", () => {
  it("marks last 15 seconds as urgent", () => {
    expect(clockUrgencyLevel(16)).toBe("normal");
    expect(clockUrgencyLevel(15)).toBe("urgent");
    expect(clockUrgencyLevel(3)).toBe("urgent");
  });

  it("computes smooth progress from 90-second clock", () => {
    expect(clockProgress(90)).toBe(1);
    expect(clockProgress(45)).toBeCloseTo(0.5);
    expect(clockProgress(0)).toBe(0);
  });
});

describe("contextGraphicDelay", () => {
  it("staggers graphics for TV timing", () => {
    expect(contextGraphicDelay(0)).toBe("120ms");
    expect(contextGraphicDelay(1)).toBe("210ms");
  });

  it("disables stagger when reduced motion is requested", () => {
    expect(contextGraphicDelay(2, true)).toBe("0ms");
  });
});

describe("analystLiveIndicatorVisible", () => {
  it("shows live indicator for active or entering speaker", () => {
    expect(analystLiveIndicatorVisible(true, "active")).toBe(true);
    expect(analystLiveIndicatorVisible(true, "entering")).toBe(true);
    expect(analystLiveIndicatorVisible(true, "standby")).toBe(false);
    expect(analystLiveIndicatorVisible(false, "active")).toBe(false);
  });
});
