import { describe, expect, it } from "vitest";
import {
  espnOffenseSeasonsToTry,
  shouldPersistEspnOffenseCache,
} from "./playerStatsRouter";
import {
  countSkillPlayers,
  excludeIdentitiesFromPool,
  isSkillStarvedPool,
  mockDraftPlayerKey,
} from "./mockDraftPoolGuards";
import { AdpScoringUnavailableError, resolveMoment } from "./draftEngine/phase5/moment";
import { simulateDraft } from "./draftEngine/phase5/simulateDraft";
import { DRIVE_NAMES } from "./draftEngine/phase3/driveFeatures";
import type { PersonalityCoefficients } from "./draftEngine/phase3/discreteChoiceModel";
import type { OwnerSoulProfile } from "./draftEngine/phase4/fitAllSouls";
import { createInitialWeather, type SimPlayer } from "./draftEngine/phase5/weather";
import { mulberry32 } from "./draftEngine/phase5/rng";
import { league457622RosterRules } from "./draftEngine/phase5/leagueRosterRules";
import { emptyRosterCounts } from "./draftEngine/phase5/rosterConstruction";
import type { SeasonTerrain } from "./draftEngine/phase2/types";

const rosterRules = league457622RosterRules();
const poolHas = { QB: true, RB: true, WR: true, TE: true, K: true, DP: true };

function coefs(partial: Partial<PersonalityCoefficients>): PersonalityCoefficients {
  const base = Object.fromEntries(DRIVE_NAMES.map((d) => [d, 0])) as PersonalityCoefficients;
  return { ...base, ...partial };
}

function mockSoul(coefficients: PersonalityCoefficients): OwnerSoulProfile {
  return {
    leagueId: "457622",
    profileOwnerKey: "id:test",
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

describe("ESPN offense feed cache / season fallback", () => {
  it("tries requested season then season − 1", () => {
    expect(espnOffenseSeasonsToTry(2026)).toEqual([2026, 2025]);
    expect(espnOffenseSeasonsToTry(2025)).toEqual([2025, 2024]);
  });

  it("rejects persisting an empty offense feed into the long-lived cache", () => {
    expect(shouldPersistEspnOffenseCache(0)).toBe(false);
    expect(shouldPersistEspnOffenseCache(1025)).toBe(true);
  });
});

describe("mock draft pool composition + drafted exclusion", () => {
  it("detects skill-starved (DP-flooded) boards that trigger soft-include", () => {
    const dps = Array.from({ length: 143 }, (_, i) => ({
      name: `Defender ${i}`,
      position: "DP",
      espnId: String(1000 + i),
    }));
    const thin = [
      ...dps,
      { name: "Nick Bellore", position: "RB", espnId: "15971" },
      { name: "Some WR", position: "WR", espnId: "2" },
    ];
    expect(countSkillPlayers(thin)).toBe(2);
    expect(isSkillStarvedPool(thin)).toBe(true);
  });

  it("excludes drafted players by espnId", () => {
    const pool = [
      { name: "Nick Bellore", position: "RB", espnId: "15971" },
      { name: "Bijan Robinson", position: "RB", espnId: "4430807" },
    ];
    const remaining = excludeIdentitiesFromPool(pool, [{ name: "Nick Bellore Sr.", espnId: "15971" }]);
    expect(remaining.map((p) => p.name)).toEqual(["Bijan Robinson"]);
  });

  it("excludes drafted players by normalized identity", () => {
    const pool = [
      { name: "A.J. Brown", position: "WR", espnId: null },
      { name: "AJ Brown", position: "WR", espnId: null },
      { name: "Ja'Marr Chase", position: "WR", espnId: null },
    ];
    const remaining = excludeIdentitiesFromPool(pool, [{ name: "A.J. Brown", espnId: null }]);
    expect(remaining.map((p) => p.name)).toEqual(["Ja'Marr Chase"]);
    expect(mockDraftPlayerKey({ name: "Kyle Pitts Sr.", espnId: null })).toBe(
      mockDraftPlayerKey({ name: "Kyle Pitts", espnId: null }),
    );
  });
});

describe("ADP scoring guard + controlled orchestration", () => {
  it("resolveMoment throws AdpScoringUnavailableError when scoring requested without ADP", () => {
    const pool: SimPlayer[] = [
      { playerName: "RB One", position: "RB", playerKey: "rb one", valueScore: 90, tier: "T1", adp: null },
      { playerName: "WR One", position: "WR", playerKey: "wr one", valueScore: 88, tier: "T1", adp: null },
      { playerName: "WR Two", position: "WR", playerKey: "wr two", valueScore: 70, tier: "T2", adp: null },
      { playerName: "QB One", position: "QB", playerKey: "qb one", valueScore: 60, tier: "T2", adp: null },
      { playerName: "TE One", position: "TE", playerKey: "te one", valueScore: 55, tier: "T3", adp: null },
    ];
    const weather = createInitialWeather({ leagueId: "457622", season: 2026, teamCount: 14, pool });
    expect(() =>
      resolveMoment({
        soul: mockSoul(coefs({ value: 0.3, need: 0.2 })),
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
        scoring: { adp: 0.4, soul: 0.3, need: 0.2, pos: 0.1, T: 1, N: 10 },
      }),
    ).toThrow(AdpScoringUnavailableError);
  });

  it("simulateDraft catches AdpScoringUnavailableError and returns a controlled partial board", () => {
    const pool: SimPlayer[] = [
      { playerName: "RB One", position: "RB", playerKey: "rb one", valueScore: 90, tier: "T1", adp: null },
      { playerName: "WR One", position: "WR", playerKey: "wr one", valueScore: 88, tier: "T1", adp: null },
      { playerName: "TE One", position: "TE", playerKey: "te one", valueScore: 55, tier: "T3", adp: null },
    ];
    const terrain = {
      season: 2026,
      cards: pool.map((p) => ({
        playerName: p.playerName,
        position: p.position,
        playerKey: p.playerKey,
        valueScore: p.valueScore,
        tier: p.tier,
        adp: null,
      })),
    } as SeasonTerrain;
    const soul = mockSoul(coefs({ value: 0.3, need: 0.2 }));
    const result = simulateDraft({
      leagueId: "457622",
      season: 2026,
      terrain,
      souls: [soul],
      draftOrder: [{ profileOwnerKey: soul.profileOwnerKey, displayName: soul.displayName }],
      ledger: {
        leagueId: "457622",
        choiceRecords: [],
        stats: {
          totalBoardSlots: 0,
          openChoiceEvents: 0,
          activeChooserChoices: 0,
          departedChooserChoices: 0,
          seasons: 0,
        },
      },
      rosterRules,
      rounds: 2,
      seed: 7,
      scoring: { adp: 0.4, soul: 0.3, need: 0.2, pos: 0.1, T: 1, N: 10 },
    });
    // Does not throw — ends early with a finite result object.
    expect(result.picksCompleted).toBe(0);
    expect(result.picks).toEqual([]);
    expect(result.leagueId).toBe("457622");
  });
});
