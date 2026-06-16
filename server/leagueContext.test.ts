/**
 * League Context Foundation — Step 1 unit tests.
 *
 * Strategy: mock the I/O of the three composed resolvers (prompt context, draft geometry,
 * and the combined-cache read) but keep buildLeagueCapabilities REAL, so capability-derived
 * fields (keeper slots, auction, draft-pick trading, dynasty) are proven by true parity
 * against the legacy resolver rather than by construction. Fixtures model anchor league 457622
 * (14-team PPR redraft) plus the 2026-only cold-cache degradation path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./leaguePromptContext", () => ({ resolveLeaguePromptContext: vi.fn() }));
vi.mock("./keeperDraftGeometry", () => ({ resolveKeeperDraftGeometryForSeason: vi.fn() }));
vi.mock("./db", () => ({ getCachedView: vi.fn(), resolveActiveLeagueId: vi.fn() }));
vi.mock("./leagueFormatStore", () => ({ getDeclaredLeagueFormat: vi.fn() }));

import { resolveLeagueContext } from "./leagueContext";
import { buildLeagueCapabilities } from "./leagueCapabilities";
import { resolveLeaguePromptContext } from "./leaguePromptContext";
import { resolveKeeperDraftGeometryForSeason } from "./keeperDraftGeometry";
import { getCachedView } from "./db";
import { getDeclaredLeagueFormat } from "./leagueFormatStore";

const STANDARD_DEFAULT = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, DST: 1, K: 1, BENCH: 7, IR: 1 };

function basePrompt(overrides: Record<string, unknown> = {}) {
  return {
    leagueId: "457622",
    leagueName: "ATLANTAS FINEST FF",
    teamCount: 14,
    seasonRange: { start: 2009, end: 2026, count: 18 },
    focalOwnerName: "Rod Sellers",
    focalTeamName: "Rod's Team",
    scoringType: "PPR",
    leagueType: "14-team PPR league",
    keeperCount: 0,
    playoffTeams: 6,
    ...overrides,
  };
}

function combinedPayload(opts: {
  keeperCount?: number;
  withTradeSettings?: boolean;
  withRosterSlots?: boolean;
  settingsType?: string | null;
} = {}) {
  const { keeperCount = 0, withTradeSettings = true, withRosterSlots = true, settingsType = null } = opts;
  const settings: Record<string, unknown> = {
    name: "ATLANTAS FINEST FF",
    draftSettings: { keeperCount, orderType: "SNAKE" },
    scheduleSettings: { playoffTeamCount: 6 },
  };
  if (settingsType) settings.type = settingsType;
  if (withTradeSettings) settings.tradeSettings = { allowDraftPickTrading: true };
  if (withRosterSlots) {
    settings.rosterSettings = {
      lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "23": 1, "16": 1, "17": 1, "20": 7, "21": 1 },
    };
  }
  return { settings };
}

beforeEach(() => {
  vi.mocked(resolveKeeperDraftGeometryForSeason).mockResolvedValue({
    teamCount: 14,
    roundCount: 16,
    draftSlotCount: 224,
  } as never);
  vi.mocked(getDeclaredLeagueFormat).mockResolvedValue(null); // default: no declaration -> detection wins
});

describe("resolveLeagueContext (Step 1 composition)", () => {
  it("matches legacy resolvers for anchor league 457622", async () => {
    const prompt = basePrompt();
    const payload = combinedPayload();
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(prompt as never);
    vi.mocked(getCachedView).mockResolvedValue({ payload } as never);

    const ctx = await resolveLeagueContext(1, 2026);
    const caps = buildLeagueCapabilities("457622", 2026, payload as never);

    // Parity with the prompt resolver (carried through unchanged).
    expect(ctx.leagueId).toBe(prompt.leagueId);
    expect(ctx.leagueName).toBe(prompt.leagueName);
    expect(ctx.teamCount).toBe(prompt.teamCount);
    expect(ctx.scoring.type).toBe(prompt.scoringType);
    expect(ctx.seasonCoverage).toEqual(prompt.seasonRange);
    // Parity with the capabilities resolver (real, same payload).
    expect(ctx.keeperSlotsPerTeam).toBe(caps.keeperSlotsPerTeam);
    expect(ctx.auctionDraft).toBe(caps.auctionDraft);
    expect(ctx.draftPickTrading).toBe(caps.draftPickTrading);
    expect(ctx.dynastyFlag).toBe(caps.dynasty);
    // Parity with the geometry resolver.
    expect(ctx.draftGeometry).toEqual({ roundCount: 16, draftSlotCount: 224 });

    // Derived: 457622 is redraft, high confidence, no disclaimer, real roster slots.
    expect(ctx.format).toBe("redraft");
    expect(ctx.confidence).toBe("high");
    expect(ctx.requiresFormatDisclaimer).toBe(false);
    expect(ctx.fieldSources.rosterSlots).toBe("espn_reliable");
    expect(ctx.rosterSlots).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0, DST: 1, K: 1, BENCH: 7, IR: 1 });
  });

  it("edge 1: falls back to standard default roster slots when lineupSlotCounts missing", async () => {
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(basePrompt() as never);
    vi.mocked(getCachedView).mockResolvedValue({ payload: combinedPayload({ withRosterSlots: false }) } as never);

    const ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.rosterSlots).toEqual(STANDARD_DEFAULT);
    expect(ctx.fieldSources.rosterSlots).toBe("inferred_default");
    expect(ctx.reasons.some((r) => /lineupSlotCounts absent/i.test(r))).toBe(true);
  });

  it("edge 2: dynasty format triggers the disclaimer", async () => {
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(basePrompt() as never);
    vi.mocked(getCachedView).mockResolvedValue({ payload: combinedPayload({ settingsType: "DYNASTY" }) } as never);

    const ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.format).toBe("dynasty");
    expect(ctx.formatSource).toBe("inferred");
    expect(ctx.requiresFormatDisclaimer).toBe(true);
  });

  it("edge 2: keeper triggers the disclaimer only when confidence < high", async () => {
    // Medium confidence: omit tradeSettings so draft-pick-trading is unknown.
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(basePrompt({ keeperCount: 2 }) as never);
    vi.mocked(getCachedView).mockResolvedValue({
      payload: combinedPayload({ keeperCount: 2, withTradeSettings: false }),
    } as never);
    let ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.format).toBe("keeper");
    expect(ctx.confidence).not.toBe("high");
    expect(ctx.requiresFormatDisclaimer).toBe(true);

    // High confidence keeper: tradeSettings present -> no disclaimer.
    vi.mocked(getCachedView).mockResolvedValue({
      payload: combinedPayload({ keeperCount: 2, withTradeSettings: true }),
    } as never);
    ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.format).toBe("keeper");
    expect(ctx.confidence).toBe("high");
    expect(ctx.requiresFormatDisclaimer).toBe(false);
  });

  it("degrades safely when no combined payload (cold cache / 2026-only league)", async () => {
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(
      basePrompt({ leagueId: "480452315", leagueName: "", teamCount: 12, seasonRange: { start: 2026, end: 2026, count: 1 } }) as never,
    );
    vi.mocked(getCachedView).mockResolvedValue(null as never);

    const ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.format).toBe("unknown");
    expect(ctx.formatSource).toBe("default");
    expect(ctx.confidence).toBe("low");
    expect(ctx.fieldSources.rosterSlots).toBe("inferred_default");
    expect(ctx.reasons.some((r) => /No combined ESPN cache payload/i.test(r))).toBe(true);
    // unknown format + pick context is the Trade Analyzer's job; format must be exposed for it.
    expect(ctx.format).toBe("unknown");
  });

  it("edge 3: exposes rosterSlots + teamCount for replacement; playoff.teamCount stays separate", async () => {
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(basePrompt() as never);
    vi.mocked(getCachedView).mockResolvedValue({ payload: combinedPayload() } as never);

    const ctx = await resolveLeagueContext(1, 2026);
    const starters =
      ctx.rosterSlots.QB + ctx.rosterSlots.RB + ctx.rosterSlots.WR + ctx.rosterSlots.TE +
      ctx.rosterSlots.FLEX + ctx.rosterSlots.DST + ctx.rosterSlots.K;
    expect(ctx.teamCount).toBe(14);
    expect(starters).toBeGreaterThan(0);
    // playoff.teamCount is a distinct field and must not be conflated with league teamCount
    // or live inside rosterSlots (replacement baseline = rosterSlots x teamCount, NOT playoff).
    expect(ctx.playoff.teamCount).toBe(6);
    expect(ctx.playoff.teamCount).not.toBe(ctx.teamCount);
    expect(ctx.rosterSlots).not.toHaveProperty("teamCount");
  });
});

describe("resolveLeagueContext (Step 2A declared-format precedence)", () => {
  it("declared format overrides detected (keeper declared on a redraft-detected league)", async () => {
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(basePrompt() as never);
    vi.mocked(getCachedView).mockResolvedValue({ payload: combinedPayload({ keeperCount: 0 }) } as never);
    vi.mocked(getDeclaredLeagueFormat).mockResolvedValue("keeper");

    const ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.format).toBe("keeper");
    expect(ctx.formatSource).toBe("declared");
    expect(ctx.fieldSources.format).toBe("declared");
    expect(ctx.reasons.some((r) => /declared as "keeper".*overrides detected "redraft"/i.test(r))).toBe(true);
  });

  it("declared dynasty still triggers the disclaimer and drops the 'inferred' reason", async () => {
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(basePrompt() as never);
    vi.mocked(getCachedView).mockResolvedValue({ payload: combinedPayload() } as never);
    vi.mocked(getDeclaredLeagueFormat).mockResolvedValue("dynasty");

    const ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.format).toBe("dynasty");
    expect(ctx.formatSource).toBe("declared");
    expect(ctx.requiresFormatDisclaimer).toBe(true);
    expect(ctx.reasons.some((r) => /Dynasty inferred from ESPN/i.test(r))).toBe(false);
  });

  it("declared keeper clears the uncertainty disclaimer even at medium confidence", async () => {
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(basePrompt() as never);
    vi.mocked(getCachedView).mockResolvedValue({ payload: combinedPayload({ withTradeSettings: false }) } as never);
    vi.mocked(getDeclaredLeagueFormat).mockResolvedValue("keeper");

    const ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.format).toBe("keeper");
    expect(ctx.formatSource).toBe("declared");
    expect(ctx.confidence).not.toBe("high");
    expect(ctx.requiresFormatDisclaimer).toBe(false);
  });

  it("no declaration leaves detection untouched (Step 1 behavior preserved)", async () => {
    vi.mocked(resolveLeaguePromptContext).mockResolvedValue(basePrompt() as never);
    vi.mocked(getCachedView).mockResolvedValue({ payload: combinedPayload({ keeperCount: 0 }) } as never);
    // beforeEach defaults getDeclaredLeagueFormat -> null
    const ctx = await resolveLeagueContext(1, 2026);
    expect(ctx.format).toBe("redraft");
    expect(ctx.formatSource).toBe("espn_reliable");
    expect(ctx.fieldSources.format).not.toBe("declared");
  });
});
