import { describe, expect, it } from "vitest";
import { slotLabelForWeekly, sortLineupPlayers, type ViewerLineupPlayer } from "./matchupGalleryViewer";

describe("RFSN-053C matchup viewer lineup helpers", () => {
  it("labels starters by position and bench/IR by slot", () => {
    expect(slotLabelForWeekly(true, 1, "QB")).toBe("QB");
    expect(slotLabelForWeekly(false, 0, "RB")).toBe("BN");
    expect(slotLabelForWeekly(false, 2, "WR")).toBe("IR");
  });

  it("sorts lineup players by position then points without inventing names", () => {
    const rows: ViewerLineupPlayer[] = [
      { playerId: 2, playerName: "Julio", position: "WR", slotLabel: "WR", points: 12, isStarter: true, isBench: false },
      { playerId: 1, playerName: "Matt", position: "QB", slotLabel: "QB", points: 20, isStarter: true, isBench: false },
      { playerId: 3, playerName: "Roddy", position: "WR", slotLabel: "WR", points: 18, isStarter: true, isBench: false },
    ];
    expect(sortLineupPlayers(rows).map((p) => p.playerName)).toEqual(["Matt", "Roddy", "Julio"]);
  });
});
