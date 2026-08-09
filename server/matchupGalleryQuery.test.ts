import { describe, expect, it } from "vitest";
import {
  NO_MERCY_MARGIN,
  assessChampionshipGameEvidence,
  galleryOwnerNameMatches,
  queryMatchupGallery,
  type GalleryGameRecord,
} from "./matchupGalleryQuery";
import { classifyEspnPlayoffTier } from "./matchupPlayoffTier";

let nextId = 1;

function g(
  partial: Partial<GalleryGameRecord> &
    Pick<
      GalleryGameRecord,
      | "season"
      | "week"
      | "homeScore"
      | "awayScore"
      | "homePersonId"
      | "awayPersonId"
      | "winnerPersonId"
    >,
): GalleryGameRecord {
  const isPlayoff = partial.isPlayoff ?? false;
  const playoffTierType =
    partial.playoffTierType === undefined
      ? isPlayoff
        ? "WINNERS_BRACKET"
        : "NONE"
      : partial.playoffTierType;
  const playoffKind =
    partial.playoffKind ?? classifyEspnPlayoffTier(playoffTierType, isPlayoff);
  const names: Record<string, string> = {
    "id:rod": "Rod Sellers",
    "id:bruce": "Bruce Edwards",
    "id:demetri": "Demetri Clark",
    "id:lozell": "LOZELL STYLES",
  };
  return {
    matchupId: partial.matchupId ?? nextId++,
    season: partial.season,
    week: partial.week,
    matchupPeriodId: partial.matchupPeriodId ?? partial.week,
    isPlayoff,
    playoffTierType,
    playoffKind,
    homeTeamId: partial.homeTeamId ?? 1,
    awayTeamId: partial.awayTeamId ?? 2,
    homeScore: partial.homeScore,
    awayScore: partial.awayScore,
    homePersonId: partial.homePersonId,
    awayPersonId: partial.awayPersonId,
    homePersonName: partial.homePersonName ?? names[partial.homePersonId ?? ""] ?? null,
    awayPersonName: partial.awayPersonName ?? names[partial.awayPersonId ?? ""] ?? null,
    homeTeamName: partial.homeTeamName ?? "Home FC",
    awayTeamName: partial.awayTeamName ?? "Away FC",
    homeLogoUrl: partial.homeLogoUrl ?? null,
    awayLogoUrl: partial.awayLogoUrl ?? null,
    winnerPersonId: partial.winnerPersonId,
  };
}

/** Good playoff-tier coverage + identifiable 2018 title game. */
function leagueGames(): GalleryGameRecord[] {
  nextId = 1;
  return [
    g({
      season: 2011,
      week: 1,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 180,
      awayScore: 120,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2012,
      week: 3,
      homePersonId: "id:demetri",
      awayPersonId: "id:rod",
      homeScore: 100,
      awayScore: 155,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2013,
      week: 5,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 140,
      awayScore: 130,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2014,
      week: 2,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 100.8,
      awayScore: 100.0,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2015,
      week: 4,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 100.0,
      awayScore: 100.8,
      winnerPersonId: "id:bruce",
    }),
    g({
      season: 2016,
      week: 8,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 90,
      awayScore: 90,
      winnerPersonId: null,
    }),
    g({
      season: 2017,
      week: 6,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 100,
      awayScore: 101.5,
      winnerPersonId: "id:bruce",
    }),
    g({
      season: 2018,
      week: 10,
      homePersonId: "id:rod",
      awayPersonId: "id:lozell",
      homeScore: 210,
      awayScore: 150,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2019,
      week: 1,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 78,
      awayScore: 82,
      winnerPersonId: "id:bruce",
    }),
    g({
      season: 2020,
      week: 12,
      homePersonId: "id:demetri",
      awayPersonId: "id:lozell",
      homeScore: 100.2,
      awayScore: 99.8,
      winnerPersonId: "id:demetri",
    }),
    g({
      season: 2023,
      week: 7,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 160,
      awayScore: 108,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2019,
      week: 15,
      matchupPeriodId: 15,
      isPlayoff: true,
      playoffTierType: "LOSERS_BRACKET",
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 170,
      awayScore: 110,
      winnerPersonId: "id:rod",
    }),
    // 2018 championship bracket: semis → title + 3rd place
    g({
      season: 2018,
      week: 15,
      matchupPeriodId: 15,
      isPlayoff: true,
      playoffTierType: "WINNERS_BRACKET",
      homePersonId: "id:rod",
      awayPersonId: "id:demetri",
      homeScore: 130,
      awayScore: 120,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2018,
      week: 15,
      matchupPeriodId: 15,
      isPlayoff: true,
      playoffTierType: "WINNERS_BRACKET",
      homePersonId: "id:bruce",
      awayPersonId: "id:lozell",
      homeScore: 110,
      awayScore: 125,
      winnerPersonId: "id:lozell",
    }),
    g({
      season: 2018,
      week: 16,
      matchupPeriodId: 16,
      isPlayoff: true,
      playoffTierType: "WINNERS_BRACKET",
      homePersonId: "id:rod",
      awayPersonId: "id:lozell",
      homeScore: 140,
      awayScore: 148,
      winnerPersonId: "id:lozell",
    }),
    g({
      season: 2018,
      week: 16,
      matchupPeriodId: 16,
      isPlayoff: true,
      playoffTierType: "WINNERS_BRACKET",
      homePersonId: "id:bruce",
      awayPersonId: "id:demetri",
      homeScore: 118,
      awayScore: 111,
      winnerPersonId: "id:bruce",
    }),
  ];
}

/** Playoff flags exist, but almost no playoffTierType — cannot prove title games. */
function thinTierGames(): GalleryGameRecord[] {
  nextId = 100;
  return [
    g({
      season: 2021,
      week: 4,
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 150,
      awayScore: 90,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2021,
      week: 15,
      isPlayoff: true,
      playoffTierType: null,
      playoffKind: "unknown",
      homePersonId: "id:rod",
      awayPersonId: "id:bruce",
      homeScore: 120,
      awayScore: 110,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2021,
      week: 16,
      isPlayoff: true,
      playoffTierType: null,
      playoffKind: "unknown",
      homePersonId: "id:rod",
      awayPersonId: "id:lozell",
      homeScore: 130,
      awayScore: 128,
      winnerPersonId: "id:rod",
    }),
    g({
      season: 2022,
      week: 16,
      isPlayoff: true,
      playoffTierType: "WINNERS_BRACKET",
      homePersonId: "id:demetri",
      awayPersonId: "id:lozell",
      homeScore: 141,
      awayScore: 130,
      winnerPersonId: "id:demetri",
    }),
  ];
}

describe("RFSN-053B matchup gallery query", () => {
  describe("name matching", () => {
    it("matches Rod / LOZELL by first or last token, not substring tokens", () => {
      expect(galleryOwnerNameMatches("Rod Sellers", "Rod")).toBe(true);
      expect(galleryOwnerNameMatches("Rod Sellers", "rod sellers")).toBe(true);
      expect(galleryOwnerNameMatches("LOZELL STYLES", "LOZELL")).toBe(true);
      expect(galleryOwnerNameMatches("LOZELL STYLES", "Styles")).toBe(true);
      expect(galleryOwnerNameMatches("Broderick James", "Rod")).toBe(false);
    });
  });

  describe("Rod 50+ point wins", () => {
    it("returns only Rod No Mercy wins (margin >= 50), including playoffs when phase=all", () => {
      const result = queryMatchupGallery(leagueGames(), {
        ownerName: "Rod",
        noMercy: true,
        phase: "all",
      });
      expect(result.empty).toBe(false);
      expect(result.emptyReason).toBeNull();
      expect(result.matchups.every((m) => m.margin >= NO_MERCY_MARGIN)).toBe(true);
      expect(result.matchups.every((m) => m.winnerPersonId === "id:rod")).toBe(true);
      expect(result.total).toBe(5); // 2011, 2012, 2018 high score, 2023 RS + 2019 consolation playoff
      expect(result.summary).toMatch(/Rod Sellers has 5 No Mercy Rule victories/i);
      expect(result.summary).not.toMatch(/\ball-time\b/i);
      expect(result.matchups.some((m) => m.season === 2019 && m.phase === "playoffs")).toBe(true);
      expect(result.matchups.some((m) => m.gameType === "blowout")).toBe(true);
    });

    it("regular-season only excludes the playoff blowout", () => {
      const result = queryMatchupGallery(leagueGames(), {
        ownerPersonId: "id:rod",
        marginMin: 50,
        result: "win",
        phase: "regular",
      });
      expect(result.total).toBe(4);
      expect(result.matchups.every((m) => m.phase === "regular")).toBe(true);
    });
  });

  describe("one-point wins/losses", () => {
    it("uses the decimal one-point band and excludes ties and 1.50", () => {
      const wins = queryMatchupGallery(leagueGames(), {
        ownerName: "Rod Sellers",
        onePoint: true,
        result: "win",
        phase: "regular",
      });
      const losses = queryMatchupGallery(leagueGames(), {
        ownerName: "Rod",
        onePoint: true,
        result: "loss",
        phase: "regular",
      });
      expect(wins.total).toBe(1);
      expect(wins.matchups[0]?.season).toBe(2014);
      expect(wins.matchups[0]?.margin).toBeCloseTo(0.8);
      expect(losses.total).toBe(1);
      expect(losses.matchups[0]?.season).toBe(2015);
      expect(wins.coverage.scoringPrecision).not.toBe("integer");
      expect(wins.summary).toMatch(/one-point win/i);
      expect(losses.summary).toMatch(/one-point loss/i);
    });
  });

  describe("all meetings versus a named owner", () => {
    it("returns the Rod vs Bruce pair only (RS + playoffs)", () => {
      const result = queryMatchupGallery(leagueGames(), {
        ownerName: "Rod",
        opponentName: "Bruce",
        phase: "all",
        sort: "oldest",
      });
      expect(result.empty).toBe(false);
      expect(result.total).toBeGreaterThanOrEqual(8);
      expect(
        result.matchups.every(
          (m) =>
            (m.homePersonId === "id:rod" && m.awayPersonId === "id:bruce") ||
            (m.homePersonId === "id:bruce" && m.awayPersonId === "id:rod"),
        ),
      ).toBe(true);
      expect(result.matchups.some((m) => m.homePersonId === "id:lozell" || m.awayPersonId === "id:lozell")).toBe(
        false,
      );
      expect(result.summary).toMatch(/Rod Sellers vs Bruce Edwards/i);
    });
  });

  describe("playoff-only games", () => {
    it("returns only isPlayoff rows", () => {
      const result = queryMatchupGallery(leagueGames(), { phase: "playoffs", sort: "oldest" });
      expect(result.empty).toBe(false);
      expect(result.matchups.every((m) => m.phase === "playoffs")).toBe(true);
      expect(result.total).toBe(5); // 2019 consolation + 4 winners-bracket 2018
      expect(result.summary).toMatch(/playoff/i);
    });
  });

  describe("season ranges", () => {
    it("clips Rod 50+ wins to 2011–2012", () => {
      const result = queryMatchupGallery(leagueGames(), {
        ownerName: "Rod",
        noMercy: true,
        phase: "regular",
        seasonFrom: 2011,
        seasonTo: 2012,
      });
      expect(result.total).toBe(2);
      expect(result.matchups.map((m) => m.season).sort()).toEqual([2011, 2012]);
      expect(result.matchups.some((m) => m.season === 2023)).toBe(false);
    });
  });

  describe("highest / lowest scoring games", () => {
    it("sorts highest by max team score and lowest by min team score", () => {
      const high = queryMatchupGallery(leagueGames(), {
        phase: "regular",
        sort: "highest_score",
        limit: 3,
      });
      expect(high.empty).toBe(false);
      expect(Math.max(high.matchups[0]!.homeScore, high.matchups[0]!.awayScore)).toBe(210);
      expect(high.matchups[0]?.season).toBe(2018);

      const low = queryMatchupGallery(leagueGames(), {
        phase: "regular",
        sort: "lowest_score",
        limit: 3,
      });
      expect(Math.min(low.matchups[0]!.homeScore, low.matchups[0]!.awayScore)).toBe(78);

      const over200 = queryMatchupGallery(leagueGames(), {
        ownerName: "Rod",
        scoreMin: 200,
        phase: "all",
      });
      expect(over200.total).toBe(1);
      expect(over200.matchups[0]?.homeScore === 210 || over200.matchups[0]?.awayScore === 210).toBe(true);
    });
  });

  describe("closest games", () => {
    it("sorts by abs margin, excludes ties, and leads with the 0.40 game", () => {
      const result = queryMatchupGallery(leagueGames(), {
        phase: "regular",
        sort: "closest",
        limit: 5,
      });
      expect(result.empty).toBe(false);
      expect(result.matchups[0]?.margin).toBeCloseTo(0.4);
      expect(result.matchups[0]?.season).toBe(2020);
      expect(result.matchups.every((m) => m.margin > 0)).toBe(true);
      expect(result.summary).toMatch(/closest/i);
    });
  });

  describe("championship-game candidates", () => {
    it("returns only the proven 2018 title game when tier evidence supports it", () => {
      const evidence = assessChampionshipGameEvidence(leagueGames());
      expect(evidence.canProve).toBe(true);
      expect(evidence.unknownRatio).toBeLessThanOrEqual(0.1);

      const result = queryMatchupGallery(leagueGames(), { championshipGames: true });
      expect(result.empty).toBe(false);
      expect(result.coverage.championshipScope).toBe("title_games");
      expect(result.total).toBe(1);
      const title = result.matchups[0]!;
      expect(title.season).toBe(2018);
      expect(title.week).toBe(16);
      expect(title.isChampionshipGame).toBe(true);
      expect(
        (title.homePersonId === "id:rod" && title.awayPersonId === "id:lozell") ||
          (title.homePersonId === "id:lozell" && title.awayPersonId === "id:rod"),
      ).toBe(true);
      expect(result.matchups.some((m) => m.homePersonId === "id:bruce" && m.awayPersonId === "id:demetri")).toBe(
        false,
      );
      expect(result.summary).toMatch(/championship-game candidate/i);
    });

    it("returns insufficient_playoff_tier when unknown-tier ratio is too high", () => {
      const evidence = assessChampionshipGameEvidence(thinTierGames());
      expect(evidence.canProve).toBe(false);
      expect(evidence.unknownRatio).toBeGreaterThan(0.1);

      const result = queryMatchupGallery(thinTierGames(), { championshipGames: true });
      expect(result.empty).toBe(true);
      expect(result.emptyReason).toBe("insufficient_playoff_tier");
      expect(result.matchups).toEqual([]);
      expect(result.coverage.championshipScope).toBe("insufficient_playoff_tier");
      expect(result.summary).toMatch(/playoffTierType coverage/i);
      expect(result.summary).not.toMatch(/all-time/i);
    });
  });

  describe("clean empty states", () => {
    it("missing_dataset when there are no completed games", () => {
      const result = queryMatchupGallery([], { ownerName: "Rod", noMercy: true });
      expect(result.empty).toBe(true);
      expect(result.emptyReason).toBe("missing_dataset");
      expect(result.matchups).toEqual([]);
      expect(result.summary).toMatch(/no recorded completed matchups/i);
    });

    it("unresolved_owner / unresolved_opponent", () => {
      const owner = queryMatchupGallery(leagueGames(), { ownerName: "Nobody McFake" });
      expect(owner.emptyReason).toBe("unresolved_owner");
      expect(owner.matchups).toEqual([]);

      const opp = queryMatchupGallery(leagueGames(), {
        ownerName: "Rod",
        opponentName: "Fake Rival",
      });
      expect(opp.emptyReason).toBe("unresolved_opponent");
      expect(opp.matchups).toEqual([]);
    });

    it("no_matching_games when the filter is valid but empty", () => {
      const result = queryMatchupGallery(leagueGames(), {
        ownerName: "Rod",
        noMercy: true,
        seasonFrom: 2009,
        seasonTo: 2009,
      });
      expect(result.empty).toBe(true);
      expect(result.emptyReason).toBe("no_matching_games");
      expect(result.matchups).toEqual([]);
      expect(result.summary).toMatch(/no recorded/i);
    });

    it("win/loss without an owner is unresolved_owner", () => {
      const result = queryMatchupGallery(leagueGames(), { result: "win", noMercy: false });
      expect(result.emptyReason).toBe("unresolved_owner");
    });
  });

  it("never labels coverage as all-time", () => {
    const result = queryMatchupGallery(leagueGames(), { phase: "all" });
    expect(result.summary).not.toMatch(/\ball-time\b/i);
    expect(result.seeAllHref).toBe("/league/history/matchups");
  });
});
