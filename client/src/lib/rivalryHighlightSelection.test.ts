import { describe, expect, it } from "vitest";
import {
  filterMatchupIntelToActiveOwners,
  pickRivalryHighlights,
  separateActiveHistoricalRivalHighlights,
  type MatchupIntelHighlightRow,
} from "@/lib/rivalryHighlightSelection";
import {
  buildCurrentSeasonOwnerKeys,
  buildCurrentSeasonOwnerNames,
} from "@/lib/rivalryOwnerEligibility";

function row(
  partial: Partial<MatchupIntelHighlightRow> & { opponentOwner: string },
): MatchupIntelHighlightRow {
  return {
    wins: 0,
    losses: 0,
    ties: 0,
    games: 0,
    winPct: 0.5,
    ...partial,
  };
}

describe("RFSN-047 rivalry highlight selection", () => {
  const keyByName: Record<string, string> = {
    "Vince Sellers": "id:vince",
    "Kwame Arthur": "id:kwame",
    "Rod Sellers": "id:rod",
  };
  const resolve = (name: string) => keyByName[name.trim()] ?? "";

  it("buildCurrentSeasonOwnerKeys keeps only current-season franchises", () => {
    const keys = buildCurrentSeasonOwnerKeys(
      [
        { ownerKey: "id:vince", seasons: [2018, 2019, 2024], championships: 0 },
        { ownerKey: "id:kwame", seasons: [2024, 2025, 2026], championships: 0 },
        { ownerKey: "id:champ", seasons: [2019], championships: 2 },
      ],
      2026,
    );
    expect(keys).toEqual(["id:kwame"]);
  });

  it("does not promote a retired nemesis as current rival or threat", () => {
    const intel = [
      row({
        opponentOwner: "Vince Sellers",
        wins: 0,
        losses: 7,
        games: 7,
        winPct: 0,
        tag: "Nemesis",
      }),
      row({
        opponentOwner: "Kwame Arthur",
        wins: 5,
        losses: 4,
        games: 9,
        winPct: 5 / 9,
        tag: "Rival",
      }),
    ];
    const currentKeys = new Set(["id:kwame"]);
    const currentNames = new Set(["kwame arthur"]);

    const split = separateActiveHistoricalRivalHighlights({
      intel,
      currentSeasonOwnerKeys: currentKeys,
      currentSeasonOwnerNames: currentNames,
      resolveOwnerKey: resolve,
    });

    expect(split.historicalRival?.opponentOwner).toBe("Vince Sellers");
    expect(split.historicalIsActive).toBe(false);
    expect(split.currentRival?.opponentOwner).toBe("Kwame Arthur");
    expect(split.biggestThreat?.opponentOwner).toBe("Kwame Arthur");
  });

  it("returns empty current rival when no active-owner H2H exists", () => {
    const intel = [
      row({
        opponentOwner: "Vince Sellers",
        wins: 0,
        losses: 7,
        games: 7,
        winPct: 0,
        tag: "Nemesis",
      }),
    ];
    const split = separateActiveHistoricalRivalHighlights({
      intel,
      currentSeasonOwnerKeys: new Set(["id:kwame"]),
      resolveOwnerKey: resolve,
    });
    expect(split.historicalRival?.opponentOwner).toBe("Vince Sellers");
    expect(split.currentRival).toBeNull();
    expect(split.biggestThreat).toBeNull();
  });

  it("filterMatchupIntelToActiveOwners matches by resolved key", () => {
    const filtered = filterMatchupIntelToActiveOwners(
      [
        row({ opponentOwner: "Vince Sellers", games: 7 }),
        row({ opponentOwner: "Kwame Arthur", games: 9 }),
      ],
      {
        currentSeasonOwnerKeys: new Set(["id:kwame"]),
        resolveOwnerKey: resolve,
      },
    );
    expect(filtered.map((r) => r.opponentOwner)).toEqual(["Kwame Arthur"]);
  });

  it("pickRivalryHighlights still prefers Nemesis for all-time", () => {
    const { topRival, biggestThreat } = pickRivalryHighlights([
      row({ opponentOwner: "Vince Sellers", games: 7, winPct: 0, tag: "Nemesis" }),
      row({ opponentOwner: "Kwame Arthur", games: 20, winPct: 0.55, tag: "Rival" }),
    ]);
    expect(topRival?.opponentOwner).toBe("Vince Sellers");
    expect(biggestThreat?.opponentOwner).toBe("Vince Sellers");
  });

  it("buildCurrentSeasonOwnerNames lowercases display names", () => {
    expect(
      buildCurrentSeasonOwnerNames(
        [
          { ownerName: "Kwame Arthur", seasons: [2026] },
          { ownerName: "Vince Sellers", seasons: [2024] },
        ],
        2026,
      ),
    ).toEqual(["kwame arthur"]);
  });
});
