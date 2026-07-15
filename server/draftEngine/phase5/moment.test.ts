import { describe, expect, it } from "vitest";
import { DRIVE_NAMES } from "../phase3/driveFeatures";
import type { PersonalityCoefficients } from "../phase3/discreteChoiceModel";
import type { OwnerSoulProfile } from "../phase4/fitAllSouls";
import { createInitialWeather, type SimPlayer } from "./weather";
import { resolveMoment } from "./moment";
import { mulberry32 } from "./rng";
import { league457622RosterRules } from "./leagueRosterRules";
import { emptyRosterCounts } from "./rosterConstruction";

const rosterRules = league457622RosterRules();
const poolHas = { QB: true, RB: true, WR: true, TE: true, K: true, DP: true };

function coefs(partial: Partial<PersonalityCoefficients>): PersonalityCoefficients {
  const base = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as PersonalityCoefficients;
  return { ...base, ...partial };
}

const pool: SimPlayer[] = [
  { playerName: "RB One", position: "RB", playerKey: "rb one", valueScore: 90, tier: "T1" },
  { playerName: "WR One", position: "WR", playerKey: "wr one", valueScore: 88, tier: "T1" },
  { playerName: "WR Two", position: "WR", playerKey: "wr two", valueScore: 70, tier: "T2" },
  { playerName: "QB One", position: "QB", playerKey: "qb one", valueScore: 60, tier: "T2" },
  { playerName: "TE One", position: "TE", playerKey: "te one", valueScore: 55, tier: "T3" },
];

function mockSoul(coefficients: PersonalityCoefficients): OwnerSoulProfile {
  return {
    leagueId: "457622",
    profileOwnerKey: "test",
    displayName: "Test",
    personalityFitTier: "full",
    choiceEventCount: 100,
    earlyRoundRbPct: 50,
    earlyRoundWrPct: 50,
    earlyRoundPickCount: 10,
    coefficients,
    deviationCoefficients: coefficients,
    distinctiveArchetype: "test",
    distinctiveDrives: [],
    inverseTemperature: 1.1,
    avgChosenProbability: 0.07,
    rawFit: {} as OwnerSoulProfile["rawFit"],
    clusterId: "c1",
    clusterLabel: "test",
    boardScopeNote: "test",
    records: [],
  };
}

describe("resolveMoment", () => {
  it("returns 5-12 consideration names", () => {
    const weather = createInitialWeather({ leagueId: "457622", season: 2026, teamCount: 14, pool });
    const soul = mockSoul(coefs({ value: 0.3, need: 0.2 }));
    const decision = resolveMoment({
      soul,
      weather,
      terrainLookup: new Map(),
      season: 2026,
      round: 1,
      totalRounds: 16,
      ownerPicksRemaining: 16,
      ownerRoster: emptyRosterCounts(),
      rosterRules,
      poolHas,
      ownerPriorKeys: new Set(),
      rng: mulberry32(42),
    });
    expect(decision).not.toBeNull();
    expect(decision!.consideration.length).toBeGreaterThanOrEqual(5);
    expect(decision!.consideration.length).toBeLessThanOrEqual(12);
  });

  it("differs across seeds (similar soul, not identical)", () => {
    const weather = createInitialWeather({ leagueId: "457622", season: 2026, teamCount: 14, pool });
    const soul = mockSoul(coefs({ wrEarlyModernEra: 0.4, wrEarlyRound: 0.3, need: 0.2 }));
    const picks = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const d = resolveMoment({
        soul,
        weather,
        terrainLookup: new Map(),
        season: 2026,
        round: 1,
        totalRounds: 16,
        ownerPicksRemaining: 16,
        ownerRoster: emptyRosterCounts(),
        rosterRules,
        poolHas,
        ownerPriorKeys: new Set(),
        rng: mulberry32(seed),
      });
      picks.add(d!.chosen.playerName);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it("avoids second TE in consideration when one TE already rostered", () => {
    const poolWithTes: SimPlayer[] = [
      ...pool,
      { playerName: "TE Two", position: "TE", playerKey: "te two", valueScore: 80, tier: "T2" },
    ];
    const weather = createInitialWeather({ leagueId: "457622", season: 2026, teamCount: 14, pool: poolWithTes });
    const soul = mockSoul(coefs({ herdFomo: 0.5, need: 0.2 }));
    const decision = resolveMoment({
      soul,
      weather,
      terrainLookup: new Map(),
      season: 2026,
      round: 3,
      totalRounds: 16,
      ownerPicksRemaining: 200,
      ownerRoster: { ...emptyRosterCounts(), TE: 1 },
      rosterRules,
      poolHas,
      ownerPriorKeys: new Set(),
      rng: mulberry32(99),
    });
    expect(decision!.consideration.filter((p) => p.position === "TE").length).toBeLessThanOrEqual(1);
  });
});
