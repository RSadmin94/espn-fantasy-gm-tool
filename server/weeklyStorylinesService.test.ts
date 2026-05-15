/**
 * weeklyStorylinesService.test.ts
 * ────────────────────────────────
 * Unit tests for Sprint 3: Weekly Storylines Feed
 *
 * Tests the deterministic trigger engine (computeWeeklyStorylines) for all
 * 8 story types. No DB or LLM calls — pure function tests.
 */

import { describe, it, expect } from "vitest";
import { computeWeeklyStorylines, type StorylinesInput, type StoryType } from "./weeklyStorylinesService";

// ─── Minimal test fixtures ────────────────────────────────────────────────────

function makeTeam(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    teamId: 1,
    wins: 5,
    losses: 5,
    pointsFor: 1200,
    pointsAgainst: 1100,
    memberIds: ["member-1"],
    ...overrides,
  };
}

function makeMatchup(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    matchupPeriodId: 10,
    homeTeamId: 1,
    awayTeamId: 2,
    homeTotalPoints: 120,
    awayTotalPoints: 100,
    ...overrides,
  };
}

function baseInput(overrides: Partial<StorylinesInput> = {}): StorylinesInput {
  return {
    season: 2025,
    week: 10,
    teams: [
      makeTeam({ teamId: 1, wins: 5, losses: 5, memberIds: ["rod-1"] }),
      makeTeam({ teamId: 2, wins: 5, losses: 5, memberIds: ["opp-1"] }),
    ],
    matchups: [
      makeMatchup({ matchupPeriodId: 10, homeTeamId: 1, awayTeamId: 2 }),
    ],
    transactions: [],
    settings: {},
    ownerMap: { 1: "Rod Sellers", 2: "Demetri Clark" },
    teamNameMap: { 1: "Str8FrmHell", 2: "Demetri's Team" },
    memberIdsMap: { 1: ["rod-1"], 2: ["opp-1"] },
    rivalryPairs: [],
    rodTeamId: 1,
    rodMemberIds: ["rod-1"],
    prevSeasonRanks: {},
    ...overrides,
  };
}

// ─── Helper: extract story types from result ──────────────────────────────────

function storyTypes(result: ReturnType<typeof computeWeeklyStorylines>): StoryType[] {
  return result.map((s) => s.storyType);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeWeeklyStorylines", () => {
  // ── 1. REVENGE_GAME ────────────────────────────────────────────────────────

  describe("REVENGE_GAME", () => {
    it("triggers when Rod faces a rival with 3+ H2H losses", () => {
      const input = baseInput({
        rivalryPairs: [
          { rivalId: "opp-1", rivalName: "Demetri Clark", h2hLosses: 4, playoffEliminations: 0 },
        ],
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).toContain("REVENGE_GAME");
    });

    it("does NOT trigger when H2H losses < 3", () => {
      const input = baseInput({
        rivalryPairs: [
          { rivalId: "opp-1", rivalName: "Demetri Clark", h2hLosses: 2, playoffEliminations: 0 },
        ],
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).not.toContain("REVENGE_GAME");
    });

    it("does NOT trigger when Rod has no current matchup opponent", () => {
      const input = baseInput({
        matchups: [], // no current week matchup
        rivalryPairs: [
          { rivalId: "opp-1", rivalName: "Demetri Clark", h2hLosses: 5, playoffEliminations: 0 },
        ],
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).not.toContain("REVENGE_GAME");
    });

    it("sets intensityScore based on h2hLosses", () => {
      const input = baseInput({
        rivalryPairs: [
          { rivalId: "opp-1", rivalName: "Demetri Clark", h2hLosses: 6, playoffEliminations: 0 },
        ],
      });
      const result = computeWeeklyStorylines(input);
      const story = result.find((s) => s.storyType === "REVENGE_GAME");
      expect(story).toBeDefined();
      expect(story!.intensityScore).toBe(Math.min(100, 50 + 6 * 5)); // 80
    });
  });

  // ── 2. HEARTBREAK_PENDING ──────────────────────────────────────────────────

  describe("HEARTBREAK_PENDING", () => {
    it("triggers when Rod faces a playoff eliminator", () => {
      const input = baseInput({
        rivalryPairs: [
          { rivalId: "opp-1", rivalName: "Demetri Clark", h2hLosses: 1, playoffEliminations: 2 },
        ],
      });
      const result = computeWeeklyStorylines(input);
      // HEARTBREAK_PENDING may be deduped in favour of REVENGE_GAME if both fire;
      // here h2hLosses=1 so REVENGE_GAME won't fire
      expect(storyTypes(result)).toContain("HEARTBREAK_PENDING");
    });

    it("does NOT trigger when opponent has 0 playoff eliminations", () => {
      const input = baseInput({
        rivalryPairs: [
          { rivalId: "opp-1", rivalName: "Demetri Clark", h2hLosses: 1, playoffEliminations: 0 },
        ],
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).not.toContain("HEARTBREAK_PENDING");
    });

    it("uses UNFINISHED BUSINESS as emotional tag", () => {
      const input = baseInput({
        rivalryPairs: [
          { rivalId: "opp-1", rivalName: "Demetri Clark", h2hLosses: 1, playoffEliminations: 1 },
        ],
      });
      const result = computeWeeklyStorylines(input);
      const story = result.find((s) => s.storyType === "HEARTBREAK_PENDING");
      expect(story?.emotionalTag).toBe("UNFINISHED BUSINESS");
    });
  });

  // ── 3. COLLAPSE ────────────────────────────────────────────────────────────

  describe("COLLAPSE", () => {
    it("triggers when a top-3 last season team is now bottom-3 (rank >= 10)", () => {
      const input = baseInput({
        teams: [
          makeTeam({ teamId: 1, wins: 2, losses: 8, memberIds: ["rod-1"] }),
          makeTeam({ teamId: 2, wins: 8, losses: 2, memberIds: ["opp-1"] }),
          // Add 12 more teams to push teamId=1 to rank 10+
          ...Array.from({ length: 12 }, (_, i) => makeTeam({ teamId: i + 3, wins: 5, losses: 5, memberIds: [`m-${i}`] })),
        ],
        ownerMap: {
          1: "Rod Sellers", 2: "Demetri Clark",
          ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 3, `Owner ${i + 3}`])),
        },
        prevSeasonRanks: { 1: 2 }, // was #2 last season
        rodTeamId: null, // not Rod's story
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).toContain("COLLAPSE");
    });

    it("does NOT trigger when previous rank was not top-3", () => {
      const input = baseInput({
        prevSeasonRanks: { 1: 5 }, // was #5 last season
        teams: [
          makeTeam({ teamId: 1, wins: 1, losses: 9, memberIds: ["rod-1"] }),
          makeTeam({ teamId: 2, wins: 9, losses: 1, memberIds: ["opp-1"] }),
        ],
        rodTeamId: null,
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).not.toContain("COLLAPSE");
    });
  });

  // ── 4. SILENT_THREAT ───────────────────────────────────────────────────────

  describe("SILENT_THREAT", () => {
    it("triggers when team is 6+ wins, rank ≤ 3, and ≤ 3 total transactions", () => {
      const input = baseInput({
        teams: [
          makeTeam({ teamId: 1, wins: 7, losses: 2, memberIds: ["rod-1"] }),
          makeTeam({ teamId: 2, wins: 6, losses: 3, memberIds: ["opp-1"] }),
        ],
        transactions: [], // 0 transactions for both
        rodTeamId: null,
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).toContain("SILENT_THREAT");
    });

    it("does NOT trigger when team has wins < 6", () => {
      // SILENT_THREAT requires wins >= 6. A 5-win team should not trigger it.
      const teams = [
        makeTeam({ teamId: 1, wins: 5, losses: 5, memberIds: ["m-1"] }),
        makeTeam({ teamId: 2, wins: 4, losses: 6, memberIds: ["m-2"] }),
      ];
      const ownerMap = { 1: "Owner One", 2: "Owner Two" };
      const input = baseInput({
        teams,
        ownerMap,
        transactions: [],
        rodTeamId: null,
        matchups: [],
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).not.toContain("SILENT_THREAT");
    });
  });

  // ── 5. DESPERATION_WINDOW ──────────────────────────────────────────────────

  describe("DESPERATION_WINDOW", () => {
    it("triggers for non-Rod team with desperation score ≥ 60 (1-9 record + last week loss)", () => {
      // desperation = (1-0.1)*60 + 0*5 + 10 = 54+10 = 64 ≥ 60
      const input = baseInput({
        teams: [
          makeTeam({ teamId: 1, wins: 5, losses: 5, memberIds: ["rod-1"] }),
          makeTeam({ teamId: 2, wins: 1, losses: 9, memberIds: ["opp-1"] }),
        ],
        matchups: [
          // Last week (week 9): team 2 lost
          makeMatchup({ matchupPeriodId: 9, homeTeamId: 1, awayTeamId: 2, homeTotalPoints: 130, awayTotalPoints: 90 }),
          // Current week (week 10)
          makeMatchup({ matchupPeriodId: 10, homeTeamId: 1, awayTeamId: 2 }),
        ],
        rodTeamId: 1,
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).toContain("DESPERATION_WINDOW");
    });

    it("does NOT trigger for Rod even with high desperation", () => {
      const input = baseInput({
        teams: [
          makeTeam({ teamId: 1, wins: 1, losses: 9, memberIds: ["rod-1"] }),
          makeTeam({ teamId: 2, wins: 8, losses: 2, memberIds: ["opp-1"] }),
        ],
        rodTeamId: 1,
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).not.toContain("DESPERATION_WINDOW");
    });

    it("does NOT trigger when desperation score < 60 (balanced record)", () => {
      const input = baseInput({
        teams: [
          makeTeam({ teamId: 1, wins: 5, losses: 5, memberIds: ["rod-1"] }),
          makeTeam({ teamId: 2, wins: 5, losses: 5, memberIds: ["opp-1"] }),
        ],
        rodTeamId: 1,
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).not.toContain("DESPERATION_WINDOW");
    });
  });

  // ── 6. PLAYOFF_BUBBLE ──────────────────────────────────────────────────────

  describe("PLAYOFF_BUBBLE", () => {
    it("triggers for the team ranked exactly 7th", () => {
      // Build 14 teams sorted by wins so rank 7 is deterministic
      const teams = Array.from({ length: 14 }, (_, i) => makeTeam({
        teamId: i + 1,
        wins: 14 - i,
        losses: i,
        memberIds: [`m-${i + 1}`],
      }));
      const ownerMap = Object.fromEntries(teams.map((t) => [t.teamId, `Owner ${t.teamId}`]));
      const input = baseInput({
        teams,
        ownerMap,
        rodTeamId: null,
        matchups: [],
      });
      const result = computeWeeklyStorylines(input);
      const bubbleStories = result.filter((s) => s.storyType === "PLAYOFF_BUBBLE");
      expect(bubbleStories.length).toBeGreaterThanOrEqual(1);
      // The team ranked 7 should be in the bubble stories
      const rank7Team = bubbleStories.find((s) => s.ownerName === "Owner 7");
      expect(rank7Team).toBeDefined();
    });

    it("triggers for the team ranked exactly 8th", () => {
      const teams = Array.from({ length: 14 }, (_, i) => makeTeam({
        teamId: i + 1,
        wins: 14 - i,
        losses: i,
        memberIds: [`m-${i + 1}`],
      }));
      const ownerMap = Object.fromEntries(teams.map((t) => [t.teamId, `Owner ${t.teamId}`]));
      const input = baseInput({
        teams,
        ownerMap,
        rodTeamId: null,
        matchups: [],
      });
      const result = computeWeeklyStorylines(input);
      const bubbleStories = result.filter((s) => s.storyType === "PLAYOFF_BUBBLE");
      const rank8Team = bubbleStories.find((s) => s.ownerName === "Owner 8");
      expect(rank8Team).toBeDefined();
    });

    it("does NOT trigger for teams ranked 1-6 or 9+", () => {
      const teams = Array.from({ length: 14 }, (_, i) => makeTeam({
        teamId: i + 1,
        wins: 14 - i,
        losses: i,
        memberIds: [`m-${i + 1}`],
      }));
      const ownerMap = Object.fromEntries(teams.map((t) => [t.teamId, `Owner ${t.teamId}`]));
      const input = baseInput({
        teams,
        ownerMap,
        rodTeamId: null,
        matchups: [],
      });
      const result = computeWeeklyStorylines(input);
      const bubbleOwners = result
        .filter((s) => s.storyType === "PLAYOFF_BUBBLE")
        .map((s) => s.ownerName);
      // Owners 1-6 and 9-14 should NOT be in bubble stories
      for (const id of [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14]) {
        expect(bubbleOwners).not.toContain(`Owner ${id}`);
      }
    });
  });

  // ── 7. MOMENTUM_SHIFT ──────────────────────────────────────────────────────

  describe("MOMENTUM_SHIFT", () => {
    it("triggers for a team with a 3+ game win streak and prior losses", () => {
      // Use 6 teams so FEAR_RISING top-2 slots are taken by high-scoring teams,
      // leaving team 1 (moderate scorer) to qualify for MOMENTUM_SHIFT instead.
      // Team 1: 4 wins, 5 losses (losses >= 2 satisfies hadLosses check)
      // Weeks 7, 8, 9: team 1 wins all three (3-game streak) with moderate scores
      const teams = [
        makeTeam({ teamId: 1, wins: 4, losses: 5, memberIds: ["m-1"] }),
        makeTeam({ teamId: 2, wins: 5, losses: 4, memberIds: ["m-2"] }),
        makeTeam({ teamId: 3, wins: 7, losses: 2, memberIds: ["m-3"] }),
        makeTeam({ teamId: 4, wins: 7, losses: 2, memberIds: ["m-4"] }),
        makeTeam({ teamId: 5, wins: 3, losses: 6, memberIds: ["m-5"] }),
        makeTeam({ teamId: 6, wins: 3, losses: 6, memberIds: ["m-6"] }),
      ];
      // Teams 3 and 4 score very high in recent weeks (they take the FEAR_RISING slots)
      const matchups = [
        // Teams 3 and 4 dominate recent weeks
        ...Array.from({ length: 4 }, (_, i) => makeMatchup({
          matchupPeriodId: 6 + i, homeTeamId: 3, awayTeamId: 5,
          homeTotalPoints: 200, awayTotalPoints: 80,
        })),
        ...Array.from({ length: 4 }, (_, i) => makeMatchup({
          matchupPeriodId: 6 + i, homeTeamId: 4, awayTeamId: 6,
          homeTotalPoints: 190, awayTotalPoints: 80,
        })),
        // Team 1 wins weeks 7, 8, 9 with moderate scores
        makeMatchup({ matchupPeriodId: 7, homeTeamId: 1, awayTeamId: 2, homeTotalPoints: 130, awayTotalPoints: 100 }),
        makeMatchup({ matchupPeriodId: 8, homeTeamId: 1, awayTeamId: 2, homeTotalPoints: 140, awayTotalPoints: 110 }),
        makeMatchup({ matchupPeriodId: 9, homeTeamId: 1, awayTeamId: 2, homeTotalPoints: 125, awayTotalPoints: 105 }),
        makeMatchup({ matchupPeriodId: 10, homeTeamId: 1, awayTeamId: 2 }),
      ];
      const ownerMap = { 1: "Owner One", 2: "Owner Two", 3: "Owner Three", 4: "Owner Four", 5: "Owner Five", 6: "Owner Six" };
      const input = baseInput({ teams, matchups, ownerMap, rodTeamId: null });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).toContain("MOMENTUM_SHIFT");
    });

    it("does NOT trigger for a team with only 2 wins in a row", () => {
      const teams = [
        makeTeam({ teamId: 1, wins: 4, losses: 5, memberIds: ["rod-1"] }),
        makeTeam({ teamId: 2, wins: 5, losses: 4, memberIds: ["opp-1"] }),
      ];
      const matchups = [
        makeMatchup({ matchupPeriodId: 8, homeTeamId: 1, awayTeamId: 2, homeTotalPoints: 130, awayTotalPoints: 100 }),
        makeMatchup({ matchupPeriodId: 9, homeTeamId: 1, awayTeamId: 2, homeTotalPoints: 125, awayTotalPoints: 105 }),
        makeMatchup({ matchupPeriodId: 10, homeTeamId: 1, awayTeamId: 2 }),
      ];
      const input = baseInput({ teams, matchups, rodTeamId: null });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).not.toContain("MOMENTUM_SHIFT");
    });
  });

  // ── 8. FEAR_RISING ─────────────────────────────────────────────────────────

  describe("FEAR_RISING", () => {
    it("triggers for the top-2 scoring non-Rod teams in last 4 weeks", () => {
      const teams = [
        makeTeam({ teamId: 1, wins: 5, losses: 5, memberIds: ["rod-1"] }),
        makeTeam({ teamId: 2, wins: 5, losses: 5, memberIds: ["opp-1"] }),
        makeTeam({ teamId: 3, wins: 5, losses: 5, memberIds: ["opp-2"] }),
        makeTeam({ teamId: 4, wins: 5, losses: 5, memberIds: ["opp-3"] }),
      ];
      // Team 2 and 3 are top scorers in weeks 6-9
      const matchups = [
        // Week 6-9: team 2 scores very high
        ...Array.from({ length: 4 }, (_, i) => makeMatchup({
          matchupPeriodId: 6 + i,
          homeTeamId: 2,
          awayTeamId: 1,
          homeTotalPoints: 160,
          awayTotalPoints: 100,
        })),
        // Week 6-9: team 3 scores high
        ...Array.from({ length: 4 }, (_, i) => makeMatchup({
          matchupPeriodId: 6 + i,
          homeTeamId: 3,
          awayTeamId: 4,
          homeTotalPoints: 155,
          awayTotalPoints: 100,
        })),
        // Current week
        makeMatchup({ matchupPeriodId: 10, homeTeamId: 1, awayTeamId: 2 }),
      ];
      const input = baseInput({
        teams,
        matchups,
        ownerMap: { 1: "Rod Sellers", 2: "Demetri Clark", 3: "Marcus Jones", 4: "Kevin Smith" },
        rodTeamId: 1,
      });
      const result = computeWeeklyStorylines(input);
      expect(storyTypes(result)).toContain("FEAR_RISING");
      // Should not be Rod's story
      const fearStories = result.filter((s) => s.storyType === "FEAR_RISING");
      expect(fearStories.every((s) => s.teamId !== 1)).toBe(true);
    });

    it("does NOT trigger for Rod even if he is top scorer", () => {
      const teams = [
        makeTeam({ teamId: 1, wins: 8, losses: 2, memberIds: ["rod-1"] }),
        makeTeam({ teamId: 2, wins: 2, losses: 8, memberIds: ["opp-1"] }),
      ];
      const matchups = [
        ...Array.from({ length: 4 }, (_, i) => makeMatchup({
          matchupPeriodId: 6 + i,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTotalPoints: 180,
          awayTotalPoints: 80,
        })),
        makeMatchup({ matchupPeriodId: 10, homeTeamId: 1, awayTeamId: 2 }),
      ];
      const input = baseInput({ teams, matchups, rodTeamId: 1 });
      const result = computeWeeklyStorylines(input);
      const fearStories = result.filter((s) => s.storyType === "FEAR_RISING");
      expect(fearStories.every((s) => s.teamId !== 1)).toBe(true);
    });
  });

  // ── General ────────────────────────────────────────────────────────────────

  describe("general", () => {
    it("fires only PLAYOFF_BUBBLE and FEAR_RISING when teams are balanced with no history", () => {
      // 14 teams all 4-6 (wins < 6 so SILENT_THREAT won't fire),
      // no matchup history, no rivalry data, no transactions, no prevSeasonRanks.
      // PLAYOFF_BUBBLE fires for ranks 7 and 8.
      // FEAR_RISING fires for top-2 recent scorers — with all teams at 0 recent points
      // (no matchup history), the sort picks the first 2 entries as top-2, so
      // FEAR_RISING fires for 2 teams as a tie-break artifact.
      // No other story types should fire.
      const teams = Array.from({ length: 14 }, (_, i) => makeTeam({
        teamId: i + 1,
        wins: 4,
        losses: 6,
        memberIds: [`m-${i + 1}`],
      }));
      const ownerMap = Object.fromEntries(teams.map((t) => [t.teamId, `Owner ${t.teamId}`]));
      const input = baseInput({
        teams,
        ownerMap,
        matchups: [],
        transactions: [],
        rivalryPairs: [],
        prevSeasonRanks: {},
        rodTeamId: null,
      });
      const result = computeWeeklyStorylines(input);
      const allowedTypes = new Set(["PLAYOFF_BUBBLE", "FEAR_RISING"]);
      const unexpected = result.filter((s) => !allowedTypes.has(s.storyType));
      expect(unexpected.length).toBe(0);
      // Exactly 2 bubble stories (rank 7 and rank 8)
      const bubbleStories = result.filter((s) => s.storyType === "PLAYOFF_BUBBLE");
      expect(bubbleStories.length).toBe(2);
    });

    it("results are sorted by intensityScore descending", () => {
      const teams = Array.from({ length: 14 }, (_, i) => makeTeam({
        teamId: i + 1,
        wins: 14 - i,
        losses: i,
        memberIds: [`m-${i + 1}`],
      }));
      const ownerMap = Object.fromEntries(teams.map((t) => [t.teamId, `Owner ${t.teamId}`]));
      const input = baseInput({ teams, ownerMap, rodTeamId: null, matchups: [] });
      const result = computeWeeklyStorylines(input);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].intensityScore).toBeGreaterThanOrEqual(result[i].intensityScore);
      }
    });

    it("deduplicates: keeps only higher-intensity story for same team+opponent", () => {
      // Both REVENGE_GAME and HEARTBREAK_PENDING fire for Rod vs same opponent
      const input = baseInput({
        rivalryPairs: [
          { rivalId: "opp-1", rivalName: "Demetri Clark", h2hLosses: 5, playoffEliminations: 2 },
        ],
      });
      const result = computeWeeklyStorylines(input);
      // Both have the same team+opponent key — only the higher intensity one survives
      const rodStories = result.filter((s) => s.teamId === 1);
      const rodStoryTypes = rodStories.map((s) => s.storyType);
      // Should not have both REVENGE_GAME and HEARTBREAK_PENDING for the same opponent
      const hasBoth = rodStoryTypes.includes("REVENGE_GAME") && rodStoryTypes.includes("HEARTBREAK_PENDING");
      expect(hasBoth).toBe(false);
    });
  });
});
