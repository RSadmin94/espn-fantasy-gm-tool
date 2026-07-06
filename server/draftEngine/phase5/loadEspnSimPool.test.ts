import { describe, expect, it } from "vitest";
import {
  addIdpFromDraftHistory,
  adpToTier,
  adpToValueScore,
  draftRowIsIdp,
  registryPositionToSim,
} from "./loadEspnSimPool";
import { buildScarcityByPos } from "./boardScarcity";
import type { SimPlayer } from "./weather";

describe("loadEspnSimPool helpers", () => {
  it("maps IDP registry positions to DP", () => {
    expect(registryPositionToSim("LB")).toBe("DP");
    expect(registryPositionToSim("K")).toBe("K");
    expect(registryPositionToSim("WR")).toBe("WR");
  });

  it("derives value score from ADP", () => {
    expect(adpToValueScore(12, null)).toBeGreaterThan(adpToValueScore(120, null));
    expect(adpToTier(24)).toBe("T1");
    expect(adpToTier(200)).toBe("T5");
  });

  it("adds distinct IDP players from draft history with pick-based ADP", () => {
    const byKey = new Map<string, SimPlayer>();
    expect(draftRowIsIdp("LB")).toBe(true);
    const added = addIdpFromDraftHistory(byKey, [
      { playerName: "Roquan Smith", position: "LB", overallPick: 95, season: 2025 },
      { playerName: "Roquan Smith", position: "LB", overallPick: 120, season: 2024 },
      { playerName: "Zack Baun", position: "LB", overallPick: 110, season: 2025 },
    ]);
    expect(added).toBe(2);
    expect(byKey.get("roquan smith")?.adp).toBe(95);
    expect(byKey.get("zack baun")?.position).toBe("DP");
  });
});

describe("boardScarcity", () => {
  it("counts tier1/2 remaining per position", () => {
    const available: SimPlayer[] = [
      { playerName: "A", position: "WR", playerKey: "a", valueScore: 90, tier: "T1" },
      { playerName: "B", position: "WR", playerKey: "b", valueScore: 80, tier: "T2" },
      { playerName: "C", position: "WR", playerKey: "c", valueScore: 50, tier: "T4" },
      { playerName: "D", position: "RB", playerKey: "d", valueScore: 70, tier: "T3" },
    ];
    const s = buildScarcityByPos(available);
    expect(s.get("WR")).toEqual({ availCount: 3, tier12Remaining: 2 });
    expect(s.get("RB")).toEqual({ availCount: 1, tier12Remaining: 0 });
  });
});
