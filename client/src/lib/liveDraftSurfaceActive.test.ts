import { describe, expect, it } from "vitest";
import {
  isConnectedLeagueLiveActive,
  isLiveDraftSurfaceActive,
} from "./liveDraftSurfaceActive";

describe("isLiveDraftSurfaceActive", () => {
  it("is true only on Live Draft surface with Live Draft ON", () => {
    expect(
      isLiveDraftSurfaceActive({ liveDraftActive: true, preferLiveDraft: true }),
    ).toBe(true);
  });

  it("is false on Mock even when Live Draft toggle is still ON", () => {
    expect(
      isLiveDraftSurfaceActive({ liveDraftActive: true, preferLiveDraft: false }),
    ).toBe(false);
  });
});

describe("isConnectedLeagueLiveActive", () => {
  it("is true only on Live surface + Live ON + connected-league source", () => {
    expect(
      isConnectedLeagueLiveActive({
        liveDraftActive: true,
        preferLiveDraft: true,
        source: "connected-league",
      }),
    ).toBe(true);
  });

  it("Live → Mock with sticky Live ON → monitor disarmed", () => {
    expect(
      isConnectedLeagueLiveActive({
        liveDraftActive: true,
        preferLiveDraft: false,
        source: "connected-league",
      }),
    ).toBe(false);
  });

  it("is false when source is manual even on Live surface", () => {
    expect(
      isConnectedLeagueLiveActive({
        liveDraftActive: true,
        preferLiveDraft: true,
        source: "manual",
      }),
    ).toBe(false);
  });
});
