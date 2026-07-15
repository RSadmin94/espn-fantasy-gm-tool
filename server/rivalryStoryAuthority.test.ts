import { describe, it, expect } from "vitest";
import {
  analyzeTurningPoint,
  classifyRivalryStory,
  classifyRivalryTier,
  eligibleStoryBlocks,
  selectRivalryHeadline,
  type RivalryStoryInputs,
} from "./rivalryStoryAuthority";
import type { H2HMeeting, H2HResult } from "./h2hAuthority";
import type { ChampionshipAuthority } from "./championshipAuthority";

const FOCAL = "id:{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}";
const RIVAL = "id:{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}";

function meeting(
  season: number,
  mpId: number,
  winner: string | null,
  marginA: number,
  isPlayoff = false,
): H2HMeeting {
  const scoreA = winner === FOCAL ? 100 + marginA : winner === RIVAL ? 100 : 95;
  const scoreB = winner === RIVAL ? 100 : winner === FOCAL ? 100 - marginA : 95;
  return {
    season,
    week: mpId,
    matchupPeriodId: mpId,
    isPlayoff,
    winner,
    scoreA,
    scoreB,
    marginA: winner === FOCAL ? marginA : winner === RIVAL ? -Math.abs(marginA) : 0,
  };
}

function buildH2H(meetings: H2HMeeting[]): H2HResult {
  const regular = meetings.filter((m) => !m.isPlayoff);
  const playoff = meetings.filter((m) => m.isPlayoff);
  const tally = (ms: H2HMeeting[]) => {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const m of ms) {
      if (m.winner === FOCAL) wins++;
      else if (m.winner === RIVAL) losses++;
      else ties++;
    }
    return { wins, losses, ties, games: ms.length };
  };
  const career = tally(regular);
  const playoffs = tally(playoff);
  let marginSum = 0;
  let largestVictory: H2HMeeting | null = null;
  let largestLoss: H2HMeeting | null = null;
  for (const m of regular) {
    marginSum += m.marginA;
    if (m.winner === FOCAL && (!largestVictory || m.marginA > largestVictory.marginA)) largestVictory = m;
    if (m.winner === RIVAL && (!largestLoss || m.marginA < largestLoss.marginA)) largestLoss = m;
  }
  return {
    personA: FOCAL,
    personB: RIVAL,
    displayA: "Focal",
    displayB: "Rival",
    career,
    playoffs,
    recent5: tally(regular.slice(-5)),
    recent10: tally(regular.slice(-10)),
    streak: { type: "none", count: 0 },
    lastMeeting: meetings[meetings.length - 1] ?? null,
    largestVictory,
    largestLoss,
    averageMarginA: regular.length ? marginSum / regular.length : 0,
    seasonHistory: [],
    meetings,
  };
}

const emptyChampionship: Pick<
  ChampionshipAuthority,
  "championKeyBySeason" | "championSeasonsByKey" | "latestCompletedSeason"
> = {
  championKeyBySeason: new Map(),
  championSeasonsByKey: new Map(),
  latestCompletedSeason: 2025,
};

function classify(overrides: Partial<RivalryStoryInputs>): ReturnType<typeof classifyRivalryStory> {
  const h2h = overrides.h2h ?? buildH2H([]);
  return classifyRivalryStory({
    focalOwnerKey: FOCAL,
    rivalOwnerKey: RIVAL,
    h2h,
    focalTitles: 0,
    rivalTitles: 0,
    pairTrades: [],
    positionalStatsAvailable: false,
    championship: emptyChampionship,
    ...overrides,
  });
}

describe("analyzeTurningPoint", () => {
  it("detects a proven lead-flip that holds", () => {
    const meetings = [
      ...Array.from({ length: 3 }, (_, i) => meeting(2018, i + 1, FOCAL, 10)),
      ...Array.from({ length: 4 }, (_, i) => meeting(2019, i + 1, RIVAL, 8)),
    ];
    const h2h = buildH2H(meetings);
    const tp = analyzeTurningPoint(h2h, FOCAL, RIVAL);
    expect(tp.proven).toBe(true);
    expect(tp.flipMeetingId).toBe("gm:2019:4");
  });

  it("returns false when fewer than two regular-season meetings", () => {
    const h2h = buildH2H([meeting(2020, 1, FOCAL, 5)]);
    expect(analyzeTurningPoint(h2h, FOCAL, RIVAL).proven).toBe(false);
  });

  it("detects playoff-chapter turning point when RS is dead even", () => {
    const meetings = [
      ...Array.from({ length: 6 }, (_, i) =>
        meeting(2020, i + 1, i % 2 === 0 ? FOCAL : RIVAL, 5),
      ),
      meeting(2021, 1, RIVAL, 4, true),
      meeting(2022, 1, RIVAL, 3, true),
    ];
    const h2h = buildH2H(meetings);
    const tp = analyzeTurningPoint(h2h, FOCAL, RIVAL);
    expect(tp.proven).toBe(true);
    expect(tp.provenBy).toBe("playoff_chapter");
  });
});

describe("classifyRivalryTier", () => {
  it("returns legendary when playoff history, turning point, and ≥12 meetings", () => {
    const meetings = [
      ...Array.from({ length: 3 }, (_, i) => meeting(2018, i + 1, FOCAL, 10)),
      ...Array.from({ length: 9 }, (_, i) => meeting(2019, i + 1, RIVAL, 8)),
      meeting(2020, 1, RIVAL, 5, true),
    ];
    const h2h = buildH2H(meetings);
    expect(
      classifyRivalryTier({
        h2h,
        focalOwnerKey: FOCAL,
        rivalOwnerKey: RIVAL,
        focalTitles: 0,
        rivalTitles: 1,
        championship: {
          ...emptyChampionship,
          championKeyBySeason: new Map([[2020, RIVAL]]),
        },
      }),
    ).toBe("legendary");
  });

  it("returns real for ≥8 meetings without legendary qualifiers", () => {
    const meetings = Array.from({ length: 8 }, (_, i) =>
      meeting(2020, i + 1, i % 2 === 0 ? FOCAL : RIVAL, 5),
    );
    expect(
      classifyRivalryTier({
        h2h: buildH2H(meetings),
        focalOwnerKey: FOCAL,
        rivalOwnerKey: RIVAL,
        focalTitles: 0,
        rivalTitles: 0,
        championship: emptyChampionship,
      }),
    ).toBe("real");
  });

  it("returns quiet for thin history", () => {
    const meetings = [meeting(2024, 1, FOCAL, 3), meeting(2025, 1, RIVAL, 2)];
    expect(
      classifyRivalryTier({
        h2h: buildH2H(meetings),
        focalOwnerKey: FOCAL,
        rivalOwnerKey: RIVAL,
        focalTitles: 0,
        rivalTitles: 0,
        championship: emptyChampionship,
      }),
    ).toBe("quiet");
  });
});

describe("selectRivalryHeadline", () => {
  it("chooses exactly one headline with THREE_ELIMINATIONS at top precedence", () => {
    const meetings = [
      meeting(2020, 1, RIVAL, 4, true),
      meeting(2021, 1, RIVAL, 6, true),
      meeting(2022, 1, RIVAL, 2, true),
      meeting(2023, 1, FOCAL, 10),
    ];
    const h2h = buildH2H(meetings);
    const tp = analyzeTurningPoint(h2h, FOCAL, RIVAL);
    const headline = selectRivalryHeadline({
      h2h,
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      focalTitles: 0,
      rivalTitles: 2,
      championship: emptyChampionship,
      pairTrades: [],
      turningPoint: tp,
    });
    expect(headline.key).toBe("THREE_ELIMINATIONS");
    expect(headline.receiptIds.length).toBeGreaterThanOrEqual(3);
  });

  it("selects DEAD_EVEN_DIFFERENT_LEGACIES when record and titles diverge", () => {
    const meetings = Array.from({ length: 10 }, (_, i) =>
      meeting(2015 + Math.floor(i / 2), (i % 2) + 1, i % 2 === 0 ? FOCAL : RIVAL, 4),
    );
    const h2h = buildH2H(meetings);
    const tp = analyzeTurningPoint(h2h, FOCAL, RIVAL);
    const headline = selectRivalryHeadline({
      h2h,
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
      focalTitles: 0,
      rivalTitles: 2,
      championship: emptyChampionship,
      pairTrades: [],
      turningPoint: tp,
    });
    expect(headline.key).toBe("DEAD_EVEN_DIFFERENT_LEGACIES");
  });
});

describe("classifyRivalryStory integration", () => {
  it("produces multiple blocks for a legendary-grade rivalry", () => {
    const meetings = [
      ...Array.from({ length: 3 }, (_, i) => meeting(2016, i + 1, FOCAL, 12)),
      ...Array.from({ length: 9 }, (_, i) => meeting(2017, i + 1, RIVAL, 10)),
      meeting(2018, 1, RIVAL, 2, true),
      meeting(2019, 1, RIVAL, 1, true),
    ];
    const result = classify({
      h2h: buildH2H(meetings),
      focalTitles: 0,
      rivalTitles: 2,
      positionalStatsAvailable: true,
      championship: {
        ...emptyChampionship,
        championKeyBySeason: new Map([
          [2018, RIVAL],
          [2019, RIVAL],
        ]),
        championSeasonsByKey: new Map([[RIVAL, [2018, 2019]]]),
      },
    });
    expect(result.tier).toBe("legendary");
    expect(result.headline.key).not.toBe("SERIES_ACTIVE");
    expect(result.availableBlocks.length).toBeGreaterThan(3);
    expect(result.availableBlocks).toContain("turningPoint");
    expect(result.availableBlocks).toContain("playoffWar");
    expect(result.documentaryFacts.some((f) => f.factKey === "LEAD_FLIP")).toBe(true);
  });

  it("limits quiet rivalries to minimal blocks", () => {
    const result = classify({
      h2h: buildH2H([meeting(2024, 1, FOCAL, 5), meeting(2025, 1, RIVAL, 3)]),
    });
    expect(result.tier).toBe("quiet");
    expect(result.availableBlocks).toEqual(["coldOpen", "taleOfTape"]);
  });

  it("returns different headlines for different rivalry shapes", () => {
    const marlonLike = classify({
      h2h: buildH2H([
        ...Array.from({ length: 3 }, (_, i) => meeting(2016, i + 1, FOCAL, 8)),
        ...Array.from({ length: 9 }, (_, i) => meeting(2017, i + 1, RIVAL, 9)),
        meeting(2018, 1, RIVAL, 3, true),
        meeting(2019, 1, RIVAL, 2, true),
      ]),
      focalTitles: 0,
      rivalTitles: 2,
      championship: {
        ...emptyChampionship,
        championKeyBySeason: new Map([[2019, RIVAL]]),
        championSeasonsByKey: new Map([[RIVAL, [2018, 2019]]]),
      },
    });

    const sheldonLike = classify({
      h2h: buildH2H([
        meeting(2024, 1, FOCAL, 10),
        meeting(2025, 1, FOCAL, 8),
      ]),
    });

    expect(marlonLike.tier).not.toBe(sheldonLike.tier);
    expect(marlonLike.headline.key).not.toBe(sheldonLike.headline.key);
  });
});

describe("eligibleStoryBlocks", () => {
  it("includes ghosts when heartbreak facts exist", () => {
    const meetings = [
      meeting(2023, 1, RIVAL, 2),
      meeting(2024, 1, RIVAL, 1),
      meeting(2025, 1, FOCAL, 10),
    ];
    const h2h = buildH2H(meetings);
    const tp = analyzeTurningPoint(h2h, FOCAL, RIVAL);
    const blocks = eligibleStoryBlocks({
      tier: "real",
      h2h,
      turningPoint: tp,
      focalTitles: 0,
      rivalTitles: 0,
      pairTrades: [],
      documentaryFacts: [
        { factKey: "HEARTBREAK_LOSS", supportingGameIds: ["gm:2023:1"], confidence: 0.9 },
      ],
      positionalStatsAvailable: false,
      championship: emptyChampionship,
      focalOwnerKey: FOCAL,
      rivalOwnerKey: RIVAL,
    });
    expect(blocks).toContain("ghosts");
  });
});
