/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  isEspnLiveDraftSource,
  isRfsnLiveDraftSource,
  normalizeLiveDraftSource,
} from "./liveDraftSource";

describe("liveDraftSource", () => {
  it("normalizes canonical and legacy aliases", () => {
    expect(normalizeLiveDraftSource("rfsn")).toBe("rfsn");
    expect(normalizeLiveDraftSource("espn")).toBe("espn");
    expect(normalizeLiveDraftSource("manual")).toBe("rfsn");
    expect(normalizeLiveDraftSource("connected-league")).toBe("espn");
  });

  it("defaults unknown to rfsn (built-in Live Draft)", () => {
    expect(normalizeLiveDraftSource(undefined)).toBe("rfsn");
    expect(normalizeLiveDraftSource("")).toBe("rfsn");
  });

  it("gate helpers", () => {
    expect(isEspnLiveDraftSource("connected-league")).toBe(true);
    expect(isRfsnLiveDraftSource("manual")).toBe(true);
    expect(isEspnLiveDraftSource("rfsn")).toBe(false);
  });
});
