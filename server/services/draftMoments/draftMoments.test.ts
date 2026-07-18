import { describe, it, expect } from "vitest";
import { classifyMoment, type ClassifierInput } from "./draftMomentClassifier";
import { collectReceipts, type ReceiptContext, type MockPickLike } from "./draftMomentReceiptService";
import { finalizeClaims } from "./draftMomentEvidenceValidator";
import { buildIdentityResolver } from "./draftMomentIdentityService";
import { buildDraftMomentsFromContext } from "./draftMomentBuilder";
import { DEFAULT_MOMENT_CONFIG } from "./draftMomentTypes";

const base: ClassifierInput = { position: "WR", round: 1, adpDelta: null, tierCliffGap: null, positionRunIncludingThis: 1, ownerTiming: null, dpDeviation: null };
const C = (o: Partial<ClassifierInput>) => classifyMoment({ ...base, ...o });

describe("classifier — recalibrated gates", () => {
  it("routine on-ADP early pick", () => { expect(C({ position: "WR", round: 1, adpDelta: 2, tierCliffGap: 5 }).level).toBe("routine"); });
  it("notable mild reach (12 early in R3)", () => {
    const r = C({ position: "RB", round: 3, adpDelta: -12, overallPick: 30, tierCliffGap: 5 });
    expect(r.level).toBe("notable");
    expect(r.signals.map(s => s.name)).toEqual(["REACH"]);
    expect(r.reach?.severity).toBe("mild");
  });
  it("major big/massive reach (30 early in R1) — Coach owns until 40", () => {
    const r = C({ position: "QB", round: 1, adpDelta: -30, overallPick: 5, tierCliffGap: 5 });
    expect(r.level).toBe("major");
    expect(r.strongCount).toBe(1);
    expect(r.reach?.severity).toBe("massive");
    expect(r.reach?.personaOwner).toBe("coach");
  });
  it("historic strong steal + tier cliff", () => { const r = C({ position: "WR", round: 5, adpDelta: 40, tierCliffGap: 30 }); expect(r.level).toBe("historic"); expect(r.strongCount).toBe(2); });
  it("late-round STEAL is capped (no signal past round 10 for DEFAULT config)", () => { expect(C({ position: "WR", round: 13, adpDelta: 80 }).level).toBe("routine"); });
  it("late-round REACH uses phase thresholds (not ADP maxRound cap)", () => {
    const mild = C({ position: "WR", round: 14, adpDelta: -20, overallPick: 180 });
    expect(mild.signals.map(s => s.name)).toEqual(["REACH"]);
    expect(mild.reach?.severity).toBe("mild");
    const below = C({ position: "WR", round: 14, adpDelta: -14, overallPick: 180 });
    expect(below.level).toBe("routine");
  });
  it("roster need alone stays routine (need is not a classifier signal)", () => { expect(C({ position: "QB", round: 2, adpDelta: 3, tierCliffGap: 4 }).level).toBe("routine"); });
  it("latest-ever is context only", () => { expect(C({ position: "K", round: 14, ownerTiming: { anomaly: "latest_ever", priorEarliest: 10, seasons: 5 } }).level).toBe("routine"); });
  it("position frequency is context only (no anomaly, no signal)", () => { expect(C({ position: "WR", round: 6, ownerTiming: { anomaly: null, priorEarliest: 4, seasons: 8 } }).level).toBe("routine"); });
  it("position run needs a tier consequence", () => {
    expect(C({ position: "WR", round: 4, positionRunIncludingThis: 4, tierCliffGap: 5 }).level).toBe("routine"); // run, no cliff
    const withCliff = C({ position: "WR", round: 4, positionRunIncludingThis: 4, tierCliffGap: 15 });
    expect(withCliff.signals.map(s => s.name).sort()).toEqual(["CONSEQUENTIAL_RUN", "TIER_CLIFF"]);
    expect(withCliff.level).toBe("major");
  });
  it("IDP uses DP-timing authority, never offense ADP", () => {
    const r = C({ position: "DP", round: 5, adpDelta: -40, tierCliffGap: 50, dpDeviation: 4 });
    expect(r.signals.map(s => s.name)).toEqual(["DP_TIMING"]); // NOT reach/steal/cliff
    expect(r.level).toBe("notable");
  });
  it("pattern break requires >=3 seasons and >=3 round break", () => {
    expect(C({ position: "QB", round: 1, ownerTiming: { anomaly: "earliest_ever", priorEarliest: 2, seasons: 5 } }).level).toBe("routine"); // only 1-round break
    expect(C({ position: "QB", round: 1, ownerTiming: { anomaly: "earliest_ever", priorEarliest: 5, seasons: 5 } }).signals.map(s => s.name)).toContain("PATTERN_BREAK");
  });
});

// ── fixed context for receipt/validator/builder tests ──
function makeCtx(over: Partial<ReceiptContext> = {}): ReceiptContext {
  return {
    leagueId: "TEST", adpByName: new Map([["josh allen", 24], ["backup qb", 120]]),
    registry: [{ norm: "josh allen", position: "QB", adp: 24 }, { norm: "backup qb", position: "QB", adp: 120 }],
    historyByKey: new Map(), seasonsByKey: new Map(), rivalById: new Map(), focalMemberId: "", dpWindow: null, teamCount: 14,
    starters: { QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, K: 1, DP: 1 }, ...over,
  };
}
const pick = (o: Partial<MockPickLike> = {}): MockPickLike => ({ overall: 9, round: 1, roundPick: 9, teamId: "1", ownerName: "Alice", playerId: "p1", playerName: "Josh Allen", position: "QB", nflTeam: null, ...o });
const personResolver = buildIdentityResolver([{ season: 2026, teamId: 1, name: "Alice Team", ownerName: "Alice", ownerId: "PID_ALICE" }, { season: 2025, teamId: 1, name: "Alice Team", ownerName: "Alice", ownerId: "PID_ALICE" }, { season: 2024, teamId: 1, name: "Alice Team", ownerName: "Alice", ownerId: "PID_ALICE" }]);
const franchiseResolver = buildIdentityResolver([{ season: 2026, teamId: 7, name: "T7", ownerName: "Dup", ownerId: "PID_D1" }, { season: 2025, teamId: 8, name: "T8", ownerName: "Dup", ownerId: "PID_D2" }, { season: 2019, teamId: 2, name: "T2", ownerName: "Dup", ownerId: "" }]);

describe("receipts + evidence validator", () => {
  it("rivalry context without impact does not raise level and emits no impact claim", () => {
    const ctx = makeCtx({ focalMemberId: "FOCAL", rivalById: new Map([["PID_ALICE", { rivalName: "Alice", heat: "Heated" }]]),
      adpByName: new Map([["josh allen", 9], ["other qb", 15]]), registry: [{ norm: "josh allen", position: "QB", adp: 9 }, { norm: "other qb", position: "QB", adp: 15 }] });
    const owner = personResolver.resolve(2026, 1);
    const { receipts, facts } = collectReceipts(pick(), ctx, owner, {}, [], new Set());
    expect(classifyMoment(facts).level).toBe("routine"); // on-ADP, no cliff → rivalry present but adds no significance
    expect(receipts.find(r => r.id === "rivalry")?.status).toBe("available");
    expect(receipts.find(r => r.id === "rivalryImpact")?.status).toBe("not_applicable");
    const fin = finalizeClaims({ receipts, owner });
    expect(fin.permittedClaims.some(c => /at the expense of|hurts|denies|costs/i.test(c))).toBe(false);
  });

  it("person-level identity claim is allowed under person scope", () => {
    const hist = new Map([["oid:PID_ALICE", new Map([["QB", [{ season: 2024, round: 5 }, { season: 2025, round: 6 }, { season: 2023, round: 5 }]]])]]);
    const seasons = new Map([["oid:PID_ALICE", new Set([2023, 2024, 2025])]]);
    const ctx = makeCtx({ historyByKey: hist as any, seasonsByKey: seasons as any });
    const owner = personResolver.resolve(2026, 1);
    const { receipts } = collectReceipts(pick(), ctx, owner, {}, [], new Set());
    const fin = finalizeClaims({ receipts, owner });
    expect(owner.identityScope).toBe("person");
    expect(fin.permittedClaims.some(c => /Alice's earliest QB/i.test(c))).toBe(true);
    expect(fin.validation.valid).toBe(true);
  });

  it("franchise-only identity restricts person-level phrasing (uses 'This franchise')", () => {
    const hist = new Map([["team:2", new Map([["QB", [{ season: 2024, round: 5 }, { season: 2025, round: 6 }, { season: 2023, round: 5 }]]])]]);
    const seasons = new Map([["team:2", new Set([2023, 2024, 2025])]]);
    const ctx = makeCtx({ historyByKey: hist as any, seasonsByKey: seasons as any });
    const owner = franchiseResolver.resolve(2019, 2);
    const { receipts } = collectReceipts(pick({ teamId: "2", ownerName: "Dup" }), ctx, owner, {}, [], new Set());
    const fin = finalizeClaims({ receipts, owner });
    expect(owner.identityScope).toBe("franchise");
    expect(fin.permittedClaims.some(c => /Dup's earliest/i.test(c))).toBe(false);
    expect(fin.permittedClaims.some(c => /This franchise/i.test(c))).toBe(true);
  });

  it("unsupported receipt cannot create a permitted claim", () => {
    const fin = finalizeClaims({ owner: personResolver.resolve(2026, 1), receipts: [{ id: "x", type: "x", status: "unsupported", source: "s", authority: "a", confidence: 0, supportedClaim: "This should never appear." }] });
    expect(fin.permittedClaims).not.toContain("This should never appear.");
  });

  it("forbidden motive/emotion language is rejected", () => {
    const fin = finalizeClaims({ owner: personResolver.resolve(2026, 1), receipts: [{ id: "identity", type: "identity", status: "available", source: "s", authority: "a", confidence: 0.9, supportedClaim: "Alice panicked and reached because she was scared." }] });
    expect(fin.validation.valid).toBe(false);
    expect(fin.permittedClaims.some(c => /panicked/i.test(c))).toBe(false);
  });
});

describe("DP timing — verified PositionTimingProfile window shape", () => {
  // real dp shape carries windowStartPick / windowEndPick (overall-pick bounds)
  const idpPick = (overall: number) => pick({ overall, round: Math.ceil(overall / 14), roundPick: ((overall - 1) % 14) + 1, playerName: "Fred Warner", position: "DP" });
  it("IDP inside the window → available receipt, no DP_TIMING signal", () => {
    const ctx = makeCtx({ dpWindow: { startPick: 100, endPick: 180 }, teamCount: 14, adpByName: new Map(), registry: [] });
    const { receipts, facts } = collectReceipts(idpPick(140), ctx, personResolver.resolve(2026, 1), {}, [], new Set());
    expect(receipts.find(r => r.id === "dpTiming")?.status).toBe("available");
    expect(facts.dpDeviation).toBe(0);
    expect(classifyMoment(facts).signals.find(s => s.name === "DP_TIMING")).toBeUndefined();
  });
  it("IDP well before the window → DP_TIMING fires from the verified fields", () => {
    const ctx = makeCtx({ dpWindow: { startPick: 100, endPick: 180 }, teamCount: 14, adpByName: new Map(), registry: [] });
    const { receipts, facts } = collectReceipts(idpPick(30), ctx, personResolver.resolve(2026, 1), {}, [], new Set()); // 5 rounds early
    const dp = receipts.find(r => r.id === "dpTiming");
    expect(dp?.status).toBe("available");
    expect((dp?.value as any).windowStartPick).toBe(100);
    expect(facts.dpDeviation).toBe(5);
    expect(classifyMoment(facts).signals.map(s => s.name)).toContain("DP_TIMING");
  });
  it("no dp window → unsupported (never guesses)", () => {
    const ctx = makeCtx({ dpWindow: null, adpByName: new Map(), registry: [] });
    const { receipts } = collectReceipts(idpPick(30), ctx, personResolver.resolve(2026, 1), {}, [], new Set());
    expect(receipts.find(r => r.id === "dpTiming")?.status).toBe("unsupported");
  });
});

describe("identity resolution + resolveDraftPickOwner fallback", () => {
  const idResolver = buildIdentityResolver([
    { season: 2026, teamId: 1, name: "Alice Team", ownerName: "Alice", ownerId: "PID_A" }, // direct id
    { season: 2025, teamId: 1, name: "Alice Team", ownerName: "Alice", ownerId: "PID_A" },
    { season: 2020, teamId: 5, name: "Eve Team", ownerName: "Eve", ownerId: "" },           // fallback person (name key)
    { season: 2026, teamId: 2, name: "T2", ownerName: "Sam", ownerId: "PID_S1" },           // Sam → two ids …
    { season: 2025, teamId: 3, name: "T3", ownerName: "Sam", ownerId: "PID_S2" },           // … ambiguous
    { season: 2019, teamId: 9, name: "T9", ownerName: "Sam", ownerId: "" },                 // fallback resolves "Sam" but ambiguous
  ]);
  it("direct ownerId → person keyed by oid", () => {
    const r = idResolver.resolve(2026, 1);
    expect(r.identityScope).toBe("person"); expect(r.identitySource).toBe("gmTeams.ownerId"); expect(r.historyKey).toBe("oid:PID_A");
  });
  it("fallback resolves a person (no id) → person keyed by name", () => {
    const r = idResolver.resolve(2020, 5);
    expect(r.identityScope).toBe("person"); expect(r.identitySource).toMatch(/resolveDraftPickOwner/); expect(r.historyKey).toBe("name:eve");
  });
  it("ambiguous fallback (name maps to multiple owner ids) → stays franchise", () => {
    const r = idResolver.resolve(2019, 9);
    expect(r.identityScope).toBe("franchise"); expect(r.identitySource).toMatch(/ambiguous/); expect(r.historyKey).toBe("team:9");
  });
  it("unresolved history (no row, no continuity) → stays franchise", () => {
    const r = idResolver.resolve(2015, 99);
    expect(r.identityScope).toBe("franchise"); expect(r.identitySource).toBe("unresolved"); expect(r.historyKey).toBe("team:99");
  });
  it("team-name fallback (teamId 0 legacy row) resolves via cross-season to the linked person", () => {
    // legacy pick with teamId 0 but a rawPick team name that matches Alice's franchise across seasons
    const r = idResolver.resolve(2015, 0, undefined, "Alice Team");
    expect(r.identityScope).toBe("person"); expect(r.identitySource).toMatch(/resolveDraftPickOwner/); expect(r.historyKey).toBe("oid:PID_A");
  });
});

describe("builder integration", () => {
  it("builds a moment per pick and validation fallback never throws / never drops picks", () => {
    const ctx = makeCtx();
    // second pick has a broken context slice (registry not iterable) to force the per-pick catch
    const picks = [pick({ overall: 1 }), pick({ overall: 2, playerName: "Boom" })];
    const brokenCtx = { ...ctx, get registry() { throw new Error("boom"); } } as any;
    const moments = buildDraftMomentsFromContext({ leagueId: "TEST", draftId: "d", season: 2026, mockPicks: picks, ctx: brokenCtx, resolver: personResolver });
    expect(moments).toHaveLength(2); // no pick dropped despite the thrown error
    expect(moments.every(m => m.permittedClaims.length >= 1)).toBe(true); // each still has a selection claim
    expect(moments.every(m => m.level === "routine")).toBe(true); // safe degrade
  });

  it("deterministic: same input yields identical output", () => {
    const ctx = makeCtx();
    const picks = [pick({ overall: 9 })];
    const a = buildDraftMomentsFromContext({ leagueId: "TEST", draftId: "d", season: 2026, mockPicks: picks, ctx, resolver: personResolver });
    const b = buildDraftMomentsFromContext({ leagueId: "TEST", draftId: "d", season: 2026, mockPicks: picks, ctx, resolver: personResolver });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
