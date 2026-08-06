import { describe, expect, it } from "vitest";
import {
  activeDisplayTag,
  effectiveResultPct,
  filterMatchupIntelToActiveOwners,
  pickBiggestThreat,
  pickCurrentBiggestRival,
  pickRivalryHighlights,
  qualifiesAsActiveNemesis,
  rawWinRatePct,
  rankActiveRivalThreatCandidates,
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
    winPct: 0,
    ...partial,
  };
}

describe("RFSN-047 rivalry highlight selection", () => {
  const keyByName: Record<string, string> = {
    "Vince Sellers": "id:vince",
    "Kwame Arthur": "id:kwame",
    "Rod Sellers": "id:rod",
    "Demetri Clark": "id:demetri",
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
        winPct: 55.6,
        tag: "Rival",
      }),
      row({
        opponentOwner: "Demetri Clark",
        wins: 10,
        losses: 25,
        ties: 1,
        games: 36,
        winPct: 29.2,
        tag: "Difficult",
      }),
    ];
    const currentKeys = new Set(["id:kwame", "id:demetri"]);
    const currentNames = new Set(["kwame arthur", "demetri clark"]);

    const split = separateActiveHistoricalRivalHighlights({
      intel,
      currentSeasonOwnerKeys: currentKeys,
      currentSeasonOwnerNames: currentNames,
      resolveOwnerKey: resolve,
    });

    expect(split.historicalRival?.opponentOwner).toBe("Vince Sellers");
    expect(split.historicalIsActive).toBe(false);
    expect(split.currentRival?.opponentOwner).toBe("Kwame Arthur");
    expect(split.biggestThreat?.opponentOwner).toBe("Demetri Clark");
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
      row({ opponentOwner: "Kwame Arthur", games: 20, winPct: 55, tag: "Rival" }),
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

describe("RFSN-048 current rival / threat ranking", () => {
  const keyByName: Record<string, string> = {
    "Vince Sellers": "id:vince",
    "Marcus Reese": "id:marcus",
    "Bruce Edwards": "id:bruce",
    "Demetri Clark": "id:demetri",
    "Christian Graham": "id:christian",
    "Jan Graham": "id:jan",
    "LOZELL STYLES": "id:lozell",
    "Nate West": "id:nate",
  };
  const resolve = (name: string) => keyByName[name.trim()] ?? "";

  /** Rod Sellers active-season H2H snapshot (production Matchup Intelligence, 2026-08-05). */
  const rodActiveIntel: MatchupIntelHighlightRow[] = [
    row({ opponentOwner: "Christian Graham", wins: 23, losses: 37, ties: 3, games: 63, tag: "Difficult" }),
    row({ opponentOwner: "Jan Graham", wins: 28, losses: 31, ties: 2, games: 61, tag: "Rival" }),
    row({ opponentOwner: "LOZELL STYLES", wins: 21, losses: 34, ties: 2, games: 57, tag: "Difficult" }),
    row({ opponentOwner: "Bruce Edwards", wins: 27, losses: 27, ties: 2, games: 56, tag: "Rival" }),
    row({ opponentOwner: "Steffon Bizzell", wins: 21, losses: 31, ties: 3, games: 55, tag: "Rival" }),
    row({ opponentOwner: "Demetri Clark", wins: 19, losses: 32, ties: 3, games: 54, tag: "Difficult" }),
    row({ opponentOwner: "Randy Broner Jr", wins: 24, losses: 28, ties: 2, games: 54, tag: "Rival" }),
    row({ opponentOwner: "Nate West", wins: 25, losses: 17, ties: 2, games: 44, tag: "Rival" }),
    row({ opponentOwner: "Mark Deroux", wins: 17, losses: 22, ties: 0, games: 39, tag: "Rival" }),
    row({ opponentOwner: "Marlon Moore", wins: 14, losses: 10, ties: 2, games: 26, tag: "Rival" }),
    row({ opponentOwner: "Sheldon deRoux", wins: 13, losses: 9, ties: 2, games: 24, tag: "Rival" }),
    row({ opponentOwner: "Tony Dorsey", wins: 2, losses: 2, ties: 2, games: 6, tag: "Difficult" }),
    row({ opponentOwner: "Marcus Reese", wins: 1, losses: 1, ties: 2, games: 4, tag: "Nemesis" }),
  ];

  it("1–1–2 over four games is not automatically a rivalry or threat", () => {
    const marcus = row({
      opponentOwner: "Marcus Reese",
      wins: 1,
      losses: 1,
      ties: 2,
      games: 4,
      tag: "Nemesis",
    });
    expect(pickCurrentBiggestRival([marcus])).toBeNull();
    expect(pickBiggestThreat([marcus])).toBeNull();
    expect(qualifiesAsActiveNemesis(marcus)).toBe(false);
    expect(activeDisplayTag(marcus)).toBeUndefined();
  });

  it("tie-aware percentage for 1–1–2 equals 50.0%", () => {
    const marcus = row({
      opponentOwner: "Marcus Reese",
      wins: 1,
      losses: 1,
      ties: 2,
      games: 4,
    });
    expect(effectiveResultPct(marcus)).toBe(50);
    expect(rawWinRatePct(marcus)).toBe(25);
  });

  it("weak active candidates produce empty states", () => {
    const weak = [
      row({ opponentOwner: "Marcus Reese", wins: 1, losses: 1, ties: 2, games: 4, tag: "Nemesis" }),
      row({ opponentOwner: "Tony Dorsey", wins: 2, losses: 2, ties: 2, games: 6, tag: "Difficult" }),
    ];
    expect(pickCurrentBiggestRival(weak)).toBeNull();
    expect(pickBiggestThreat(weak)).toBeNull();
  });

  it("a close, high-volume active matchup can qualify as biggest rival", () => {
    const bruce = row({
      opponentOwner: "Bruce Edwards",
      wins: 27,
      losses: 27,
      ties: 2,
      games: 56,
      tag: "Rival",
    });
    expect(pickCurrentBiggestRival([bruce])?.opponentOwner).toBe("Bruce Edwards");
  });

  it("a dominant active opponent can qualify as biggest threat", () => {
    const demetri = row({
      opponentOwner: "Demetri Clark",
      wins: 19,
      losses: 32,
      ties: 3,
      games: 54,
      tag: "Difficult",
    });
    expect(pickBiggestThreat([demetri])?.opponentOwner).toBe("Demetri Clark");
  });

  it("rival and threat can select different owners", () => {
    const rival = pickCurrentBiggestRival(rodActiveIntel);
    const threat = pickBiggestThreat(rodActiveIntel);
    expect(rival?.opponentOwner).toBe("Bruce Edwards");
    expect(threat?.opponentOwner).toBe("Demetri Clark");
    expect(rival?.opponentOwner).not.toBe(threat?.opponentOwner);
  });

  it("same owner can win both only through independent scores", () => {
    const only = [
      row({
        opponentOwner: "Christian Graham",
        wins: 20,
        losses: 40,
        ties: 0,
        games: 60,
        tag: "Difficult",
      }),
    ];
    // Close enough for rivalry (|33.3-50|=16.7 > 15) → not rival; is threat
    expect(pickCurrentBiggestRival(only)).toBeNull();
    expect(pickBiggestThreat(only)?.opponentOwner).toBe("Christian Graham");

    const balancedThreat = [
      row({
        opponentOwner: "Demetri Clark",
        wins: 22,
        losses: 30,
        ties: 2,
        games: 54,
        tag: "Difficult",
      }),
    ];
    // eff = (22+1)/54 = 42.6 > 42 → not threat; |42.6-50|=7.4 rival yes
    expect(pickCurrentBiggestRival(balancedThreat)?.opponentOwner).toBe("Demetri Clark");
    expect(pickBiggestThreat(balancedThreat)).toBeNull();

    const both = [
      row({
        opponentOwner: "LOZELL STYLES",
        wins: 21,
        losses: 34,
        ties: 2,
        games: 57,
        tag: "Difficult",
      }),
    ];
    // eff 38.6 — within rival band and threat band
    expect(pickCurrentBiggestRival(both)?.opponentOwner).toBe("LOZELL STYLES");
    expect(pickBiggestThreat(both)?.opponentOwner).toBe("LOZELL STYLES");
  });

  it("Nemesis requires meaningful opponent advantage and sufficient sample", () => {
    expect(
      qualifiesAsActiveNemesis(
        row({ opponentOwner: "Marcus Reese", wins: 1, losses: 1, ties: 2, games: 4, tag: "Nemesis" }),
      ),
    ).toBe(false);
    expect(
      qualifiesAsActiveNemesis(
        row({ opponentOwner: "Vince Sellers", wins: 0, losses: 7, games: 7, tag: "Nemesis" }),
      ),
    ).toBe(false); // 7 < 8 active minimum
    expect(
      qualifiesAsActiveNemesis(
        row({ opponentOwner: "Demetri Clark", wins: 8, losses: 30, ties: 0, games: 38, tag: "Nemesis" }),
      ),
    ).toBe(true); // 21.1% over 38 games
  });

  it("retired owners remain eligible only for historical rival", () => {
    const split = separateActiveHistoricalRivalHighlights({
      intel: [
        row({
          opponentOwner: "Vince Sellers",
          wins: 0,
          losses: 7,
          games: 7,
          tag: "Nemesis",
        }),
        ...rodActiveIntel,
      ],
      currentSeasonOwnerKeys: new Set(
        rodActiveIntel.map((r) => keyByName[r.opponentOwner]).filter(Boolean),
      ),
      resolveOwnerKey: resolve,
    });
    expect(split.historicalRival?.opponentOwner).toBe("Vince Sellers");
    expect(split.historicalIsActive).toBe(false);
    expect(split.currentRival?.opponentOwner).not.toBe("Vince Sellers");
    expect(split.biggestThreat?.opponentOwner).not.toBe("Vince Sellers");
  });

  it("Rod active-candidate ranking: Marcus is not top rival/threat after correction", () => {
    const ranked = rankActiveRivalThreatCandidates(rodActiveIntel);
    const marcus = ranked.find((c) => c.row.opponentOwner === "Marcus Reese");
    expect(marcus?.effectivePct).toBe(50);
    expect(marcus?.rivalryEligible).toBe(false);
    expect(marcus?.threatEligible).toBe(false);

    const split = separateActiveHistoricalRivalHighlights({
      intel: [
        row({ opponentOwner: "Vince Sellers", wins: 0, losses: 7, games: 7, tag: "Nemesis" }),
        ...rodActiveIntel,
      ],
      currentSeasonOwnerKeys: new Set(
        rodActiveIntel.map((r) => keyByName[r.opponentOwner] ?? `name:${r.opponentOwner}`),
      ),
      currentSeasonOwnerNames: new Set(rodActiveIntel.map((r) => r.opponentOwner.toLowerCase())),
      resolveOwnerKey: (name) => keyByName[name.trim()] ?? `name:${name.trim()}`,
    });

    expect(split.currentRival?.opponentOwner).toBe("Bruce Edwards");
    expect(split.biggestThreat?.opponentOwner).toBe("Demetri Clark");
    expect(split.historicalRival?.opponentOwner).toBe("Vince Sellers");
  });
});
