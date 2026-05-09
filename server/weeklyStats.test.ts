import { describe, it, expect } from "vitest";
import { normalizeWeeklyStats, computePlayerTrend, type WeeklyStatRow } from "./weeklyStatsService";

// ── normalizeWeeklyStats ──────────────────────────────────────────────────────

describe("normalizeWeeklyStats", () => {
  const makePlayer = (overrides: Record<string, unknown> = {}) => ({
    id: 1001,
    fullName: "Justin Jefferson",
    defaultPositionId: 3, // WR (4 = TE in ESPN's POSITION_MAP)
    proTeamId: 16, // MIN
    stats: [
      {
        statSplitTypeId: 1,
        statSourceId: 0,
        appliedStats: {
          58: 9,   // targets
          41: 7,   // receptions
          42: 120, // receiving yards
          43: 1,   // receiving TDs
          87: 65,  // snap count
          88: 92,  // snap pct
        },
        appliedTotal: 28.5,
      },
    ],
    ...overrides,
  });

  it("extracts targets, receptions, yards, TDs, snaps from the weekly split", () => {
    const rawRoster = {
      teams: [
        {
          id: 3,
          members: [{ firstName: "Rod", lastName: "" }],
          roster: {
            entries: [
              {
                playerPoolEntry: {
                  onTeamId: 3,
                  acquisitionType: "DRAFT",
                  player: makePlayer(),
                },
              },
            ],
          },
        },
      ],
    };
    const rows = normalizeWeeklyStats(rawRoster, 2025, 7);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.playerName).toBe("Justin Jefferson");
    expect(r.position).toBe("WR");
    expect(r.targets).toBe(9);
    expect(r.receptions).toBe(7);
    expect(r.receivingYards).toBe(120);
    expect(r.receivingTDs).toBe(1);
    expect(r.snapCount).toBe(65);
    expect(r.snapPct).toBe(92);
    expect(r.fantasyPoints).toBe(2850); // 28.5 * 100
    expect(r.ownerName).toBe("Rod");
    expect(r.week).toBe(7);
    expect(r.season).toBe(2025);
  });

  it("ignores projected stats (statSourceId !== 0)", () => {
    const playerWithProjection = makePlayer({
      stats: [
        {
          statSplitTypeId: 1,
          statSourceId: 1, // projected — should be ignored
          appliedStats: { 58: 99 },
          appliedTotal: 99,
        },
        {
          statSplitTypeId: 1,
          statSourceId: 0, // actual
          appliedStats: { 58: 6, 41: 4, 42: 55 },
          appliedTotal: 11.0,
        },
      ],
    });
    const rawRoster = {
      teams: [
        {
          id: 1,
          roster: {
            entries: [
              { playerPoolEntry: { onTeamId: 1, acquisitionType: "DRAFT", player: playerWithProjection } },
            ],
          },
        },
      ],
    };
    const rows = normalizeWeeklyStats(rawRoster, 2025, 3);
    expect(rows[0].targets).toBe(6);
    expect(rows[0].fantasyPoints).toBe(1100);
  });

  it("ignores season-total splits (statSplitTypeId !== 1)", () => {
    const playerWithSeasonTotal = makePlayer({
      stats: [
        {
          statSplitTypeId: 0, // season total — should be ignored
          statSourceId: 0,
          appliedStats: { 58: 99 },
          appliedTotal: 99,
        },
      ],
    });
    const rawRoster = {
      teams: [
        {
          id: 1,
          roster: {
            entries: [
              { playerPoolEntry: { onTeamId: 1, acquisitionType: "DRAFT", player: playerWithSeasonTotal } },
            ],
          },
        },
      ],
    };
    const rows = normalizeWeeklyStats(rawRoster, 2025, 3);
    expect(rows[0].targets).toBe(0);
    expect(rows[0].fantasyPoints).toBe(0);
  });

  it("skips players with no id or fullName", () => {
    const rawRoster = {
      teams: [
        {
          id: 1,
          roster: {
            entries: [
              { playerPoolEntry: { onTeamId: 1, acquisitionType: "DRAFT", player: { id: 0, fullName: "", stats: [] } } },
            ],
          },
        },
      ],
    };
    const rows = normalizeWeeklyStats(rawRoster, 2025, 3);
    expect(rows).toHaveLength(0);
  });

  it("handles free agents (no matching owner)", () => {
    const rawRoster = {
      teams: [
        {
          id: 5,
          roster: {
            entries: [
              { playerPoolEntry: { onTeamId: 5, acquisitionType: "FREEAGENT", player: makePlayer() } },
            ],
          },
        },
      ],
    };
    // No members on team 5 — ownerName should be null
    const rows = normalizeWeeklyStats(rawRoster, 2025, 5);
    expect(rows[0].ownerName).toBeNull();
  });
});

// ── computePlayerTrend ────────────────────────────────────────────────────────

function makeRow(overrides: Partial<WeeklyStatRow>): WeeklyStatRow {
  return {
    season: 2025,
    week: 1,
    playerId: 1001,
    playerName: "Justin Jefferson",
    position: "WR",
    proTeam: "MIN",
    teamId: 3,
    ownerName: "Rod",
    targets: 8,
    receptions: 6,
    receivingYards: 90,
    receivingTDs: 1,
    rushingAttempts: 0,
    rushingYards: 0,
    rushingTDs: 0,
    passingAttempts: 0,
    completions: 0,
    passingYards: 0,
    passingTDs: 0,
    interceptions: 0,
    snapCount: 60,
    snapPct: 88,
    fantasyPoints: 2200, // 22.0 pts
    ...overrides,
  };
}

describe("computePlayerTrend", () => {
  it("returns null for unknown player", () => {
    const rows = [makeRow({ playerId: 1001, week: 1 })];
    expect(computePlayerTrend(rows, 9999, 4)).toBeNull();
  });

  it("computes correct averages over last N weeks", () => {
    const rows = [
      makeRow({ week: 1, targets: 6, snapPct: 80, fantasyPoints: 1500 }),
      makeRow({ week: 2, targets: 8, snapPct: 90, fantasyPoints: 2000 }),
      makeRow({ week: 3, targets: 10, snapPct: 95, fantasyPoints: 2500 }),
      makeRow({ week: 4, targets: 12, snapPct: 100, fantasyPoints: 3000 }),
    ];
    const trend = computePlayerTrend(rows, 1001, 4);
    expect(trend).not.toBeNull();
    expect(trend!.avgTargets).toBeCloseTo(9, 1);
    expect(trend!.avgSnapPct).toBeCloseTo(91.25, 1);
    expect(trend!.avgFantasyPoints).toBeCloseTo(22.5, 1); // (15+20+25+30)/4
  });

  it("only uses last N weeks when more data is available", () => {
    const rows = [
      makeRow({ week: 1, targets: 2, fantasyPoints: 500 }),
      makeRow({ week: 2, targets: 2, fantasyPoints: 500 }),
      makeRow({ week: 3, targets: 2, fantasyPoints: 500 }),
      makeRow({ week: 4, targets: 10, fantasyPoints: 3000 }),
      makeRow({ week: 5, targets: 10, fantasyPoints: 3000 }),
    ];
    const trend = computePlayerTrend(rows, 1001, 2);
    expect(trend!.weeks).toEqual([4, 5]);
    expect(trend!.avgTargets).toBe(10);
  });

  it("detects rising trend when second half > first half by 15%+", () => {
    const rows = [
      makeRow({ week: 1, fantasyPoints: 1000 }),  // 10 pts
      makeRow({ week: 2, fantasyPoints: 1000 }),  // 10 pts
      makeRow({ week: 3, fantasyPoints: 2500 }),  // 25 pts — big jump
      makeRow({ week: 4, fantasyPoints: 2500 }),  // 25 pts
    ];
    const trend = computePlayerTrend(rows, 1001, 4);
    expect(trend!.trend).toBe("rising");
  });

  it("detects falling trend when second half < first half by 15%+", () => {
    const rows = [
      makeRow({ week: 1, fantasyPoints: 3000 }),  // 30 pts
      makeRow({ week: 2, fantasyPoints: 3000 }),  // 30 pts
      makeRow({ week: 3, fantasyPoints: 500 }),   // 5 pts — big drop
      makeRow({ week: 4, fantasyPoints: 500 }),   // 5 pts
    ];
    const trend = computePlayerTrend(rows, 1001, 4);
    expect(trend!.trend).toBe("falling");
  });

  it("reports stable when change is within 15%", () => {
    const rows = [
      makeRow({ week: 1, fantasyPoints: 2000 }),
      makeRow({ week: 2, fantasyPoints: 2000 }),
      makeRow({ week: 3, fantasyPoints: 2100 }),
      makeRow({ week: 4, fantasyPoints: 2100 }),
    ];
    const trend = computePlayerTrend(rows, 1001, 4);
    expect(trend!.trend).toBe("stable");
  });

  it("returns single-week data when only one week available", () => {
    const rows = [makeRow({ week: 9, targets: 11, fantasyPoints: 3200 })];
    const trend = computePlayerTrend(rows, 1001, 4);
    expect(trend).not.toBeNull();
    expect(trend!.weeks).toEqual([9]);
    expect(trend!.avgTargets).toBe(11);
    expect(trend!.trend).toBe("stable"); // can't compute trend with 1 data point
  });

  it("fantasyPoints array is in actual points (divided by 100)", () => {
    const rows = [makeRow({ week: 1, fantasyPoints: 2850 })]; // 28.5 pts stored as 2850
    const trend = computePlayerTrend(rows, 1001, 4);
    expect(trend!.fantasyPoints[0]).toBeCloseTo(28.5, 1);
    expect(trend!.avgFantasyPoints).toBeCloseTo(28.5, 1);
  });
});
