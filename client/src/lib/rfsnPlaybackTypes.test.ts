import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parsePlaybackBundle, isDevPlaybackEnabled, playbackBundleUrl } from "@/lib/rfsnPlaybackTypes";
import { FEATURE_REGISTRY } from "@/lib/featureRegistry";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("rfsnPlaybackTypes", () => {
  it("parses valid playback bundle", () => {
    const bundle = parsePlaybackBundle({
      source: "mock",
      generatedAt: "2026-01-01T00:00:00.000Z",
      moments: [{
        pickNumber: 1,
        pickId: "x",
        editorialPlanId: "routine_pick",
        diagnostic: {
          pickIdentity: "d:1:x",
          sourceLevel: "routine",
          sourceSignals: "",
          commentaryBudgetEnabled: false,
          resolvedEditorialPlan: "routine_pick",
          voicesRequested: "",
          frameStatus: "suppressed",
          frameLeadVoice: null,
          snapshotPrimary: null,
          snapshotSecondary: null,
          commentedOrSilent: "silent",
          reason: "routine",
        },
        snapshot: {
          round: 1,
          pickInRound: 1,
          overallPick: "1.01",
          onClockTeam: "Alice",
          clockSeconds: 90,
          draftOrder: [],
          board: [],
          significance: "routine",
          championshipOdds: [],
          ticker: [],
          queue: [],
        },
      }],
    });
    expect(bundle.moments).toHaveLength(1);
  });

  it("rejects invalid bundle", () => {
    expect(() => parsePlaybackBundle({})).toThrow(/Invalid playback bundle/);
  });

  it("builds playback URL", () => {
    expect(playbackBundleUrl("scenario")).toBe("/dev-shadow/rfsn-playback/scenario.json");
  });

  it("reports dev mode availability", () => {
    expect(typeof isDevPlaybackEnabled()).toBe("boolean");
  });

  it("is not registered in production navigation", () => {
    const routes = FEATURE_REGISTRY.map((f) => f.route);
    expect(routes).not.toContain("/dev/rfsn-playback");
    expect(routes).not.toContain("/rfsn");
  });

  it("uses a standalone dev HTML entry outside production routing", () => {
    const html = fs.readFileSync(path.join(repoRoot, "client", "rfsn-playback.html"), "utf-8");
    expect(html).toContain("/src/rfsnPlaybackMain.tsx");
    expect(html).not.toContain("main.tsx");

    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).not.toContain("RfsnShadowPlayback");
    expect(main).not.toContain("/dev/rfsn-playback");
  });
});
