/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  isEspnLiveDraftSource,
  isRfsnLiveDraftSource,
  normalizeDraftControlSource,
  normalizeLiveDraftSource,
  normalizeMockDraftSource,
} from "./liveDraftSource";

describe("liveDraftSource product model", () => {
  it("Live normalizes only to ESPN League", () => {
    expect(normalizeLiveDraftSource("espn")).toBe("espn");
    expect(normalizeLiveDraftSource("connected-league")).toBe("espn");
    expect(normalizeLiveDraftSource("rfsn")).toBe("espn");
    expect(normalizeLiveDraftSource("manual")).toBe("espn");
    expect(normalizeLiveDraftSource(undefined)).toBe("espn");
  });

  it("Mock normalizes RFSN Local vs FantasyPros", () => {
    expect(normalizeMockDraftSource("rfsn")).toBe("rfsn");
    expect(normalizeMockDraftSource("manual")).toBe("rfsn");
    expect(normalizeMockDraftSource("fantasypros")).toBe("fantasypros");
    expect(normalizeMockDraftSource("fantasypros-mock")).toBe("fantasypros");
  });

  it("control-source helper preserves both experiences", () => {
    expect(normalizeDraftControlSource("espn")).toBe("espn");
    expect(normalizeDraftControlSource("rfsn")).toBe("rfsn");
    expect(normalizeDraftControlSource("fantasypros")).toBe("fantasypros");
  });

  it("gate helpers", () => {
    expect(isEspnLiveDraftSource("connected-league")).toBe(true);
    expect(isRfsnLiveDraftSource("manual")).toBe(true);
    expect(isEspnLiveDraftSource("rfsn")).toBe(false);
  });
});
