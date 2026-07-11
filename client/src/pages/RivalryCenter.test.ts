import { describe, expect, it } from "vitest";
import {
  RIVALRY_SETUP_GATE,
  resolveFocalOwnerState,
  resolveRivalryCenterBodyState,
} from "./RivalryCenter";

const ALL_OWNERS = [
  { ownerKey: "id:rod", ownerName: "Rod Sellers" },
  { ownerKey: "id:mark", ownerName: "Mark Deroux" },
];

describe("resolveFocalOwnerState", () => {
  it("does not impersonate another owner when setup is incomplete", () => {
    const result = resolveFocalOwnerState(
      { isSetupComplete: false, selectedOwnerKey: null },
      ALL_OWNERS,
    );
    expect(result.focalResolved).toBe(false);
    expect(result.focalOwnerKey).toBe("");
  });

  it("does not fall back to the first owner when setup is incomplete", () => {
    const result = resolveFocalOwnerState(undefined, ALL_OWNERS);
    expect(result.focalResolved).toBe(false);
    expect(result.focalOwnerKey).not.toBe("id:rod");
  });

  it("resolves the selected owner when setup is complete", () => {
    const result = resolveFocalOwnerState(
      { isSetupComplete: true, selectedOwnerKey: "id:mark" },
      ALL_OWNERS,
    );
    expect(result.focalResolved).toBe(true);
    expect(result.focalOwnerKey).toBe("id:mark");
  });

  it("treats unknown selected owner as unresolved", () => {
    const result = resolveFocalOwnerState(
      { isSetupComplete: true, selectedOwnerKey: "id:missing" },
      ALL_OWNERS,
    );
    expect(result.focalResolved).toBe(false);
    expect(result.focalOwnerKey).toBe("");
  });
});

describe("RIVALRY_SETUP_GATE", () => {
  it("points the CTA to /connect", () => {
    expect(RIVALRY_SETUP_GATE.ctaHref).toBe("/connect");
    expect(RIVALRY_SETUP_GATE.ctaLabel).toBe("Select My Team");
  });
});

describe("resolveRivalryCenterBodyState", () => {
  it("shows loading while data is loading", () => {
    expect(
      resolveRivalryCenterBodyState({ loading: true, focalResolved: false, allEmpty: true }),
    ).toBe("loading");
  });

  it("gates unresolved users before the empty wall", () => {
    expect(
      resolveRivalryCenterBodyState({ loading: false, focalResolved: false, allEmpty: true }),
    ).toBe("setup_incomplete");
    expect(
      resolveRivalryCenterBodyState({ loading: false, focalResolved: false, allEmpty: false }),
    ).toBe("setup_incomplete");
  });

  it("shows the empty wall for resolved owners with no history", () => {
    expect(
      resolveRivalryCenterBodyState({ loading: false, focalResolved: true, allEmpty: true }),
    ).toBe("empty");
  });

  it("shows the rivalry wall for resolved owners with data", () => {
    expect(
      resolveRivalryCenterBodyState({ loading: false, focalResolved: true, allEmpty: false }),
    ).toBe("wall");
  });
});
