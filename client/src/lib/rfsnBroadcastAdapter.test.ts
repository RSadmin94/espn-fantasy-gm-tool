import { describe, expect, it } from "vitest";
import { resolveContextGraphic } from "./rfsnPresentation";
import {
  VOICE_PRIORITY,
  buildQueuedMomentFromPending,
  buildRfsnBroadcastSnapshot,
  discardStaleCommentary,
  enqueueBroadcastMoment,
  enqueuePendingMoments,
  filterAcceptedCommentary,
  identitiesMatch,
  isAcceptedCommentary,
  isCommentaryForActivePick,
  isStaleCommentary,
  mapDraftMomentSignificance,
  pickIdentityKey,
  promoteQueuedMoment,
  resolveContextFields,
  resolveDeferredCommentary,
  selectOnAirCommentary,
  type BroadcastPickIdentity,
  type RfsnBroadcastAdapterInput,
  type RfsnCommentaryResult,
  type RfsnDraftBoardInput,
} from "./rfsnBroadcastAdapter";

const DRAFT_ID = "draft-457622";
const PICK_ID = "457622:m:45";
const PICK_NUMBER = 45;

const identity = (overrides: Partial<BroadcastPickIdentity> = {}): BroadcastPickIdentity => ({
  draftId: DRAFT_ID,
  pickNumber: PICK_NUMBER,
  pickId: PICK_ID,
  ...overrides,
});

const baseDraft = (): RfsnDraftBoardInput => ({
  round: 5,
  pickInRound: 4,
  overallPick: "4.05",
  onClockTeam: "Team Mike",
  clockSeconds: 48,
  draftOrder: [
    { pickLabel: "5.04", teamName: "Team Mike", teamAbbr: "MIK", isOnClock: true },
  ],
  board: [
    { rank: 5, player: "J. Gibbs", position: "RB", team: "DET", bye: 5, adp: 5.1, isOnClock: true },
  ],
  championshipOdds: [
    { team: "Team Rod", pct: 28 },
    { team: "Team Bruce", pct: 24 },
  ],
});

function voice(
  commentator: RfsnCommentaryResult["commentator"],
  overrides: Partial<RfsnCommentaryResult> = {},
): RfsnCommentaryResult {
  return {
    draftId: DRAFT_ID,
    pickNumber: PICK_NUMBER,
    pickId: PICK_ID,
    commentator,
    label: "History Check",
    text: `${commentator} line`,
    status: "accepted",
    ...overrides,
  };
}

function adapterInput(
  overrides: Partial<RfsnBroadcastAdapterInput> = {},
): RfsnBroadcastAdapterInput {
  return {
    draft: baseDraft(),
    activeMoment: {
      identity: identity(),
      significance: "major",
      onAir: true,
    },
    commentaryResults: [],
    queue: [],
    ...overrides,
  };
}

describe("mapDraftMomentSignificance", () => {
  it("maps all public levels", () => {
    expect(mapDraftMomentSignificance("routine")).toBe("routine");
    expect(mapDraftMomentSignificance("notable")).toBe("notable");
    expect(mapDraftMomentSignificance("major")).toBe("major");
    expect(mapDraftMomentSignificance("historic")).toBe("historic");
  });

  it("falls back to routine when missing", () => {
    expect(mapDraftMomentSignificance(undefined)).toBe("routine");
    expect(mapDraftMomentSignificance(null)).toBe("routine");
  });
});

describe("commentary acceptance", () => {
  it("accepts only accepted non-empty text", () => {
    expect(isAcceptedCommentary(voice("sofia"))).toBe(true);
    expect(isAcceptedCommentary(voice("sofia", { status: "rejected" }))).toBe(false);
    expect(isAcceptedCommentary(voice("sofia", { status: "generation_failed" }))).toBe(false);
    expect(isAcceptedCommentary(voice("sofia", { status: "empty" }))).toBe(false);
    expect(isAcceptedCommentary(voice("sofia", { text: "   " }))).toBe(false);
  });

  it("filters accepted commentary", () => {
    const results = [
      voice("sofia"),
      voice("coach", { status: "rejected" }),
      voice("roxanne", { text: "" }),
    ];
    expect(filterAcceptedCommentary(results)).toHaveLength(1);
  });
});

describe("selectOnAirCommentary", () => {
  it("selects primary only for notable", () => {
    const sel = selectOnAirCommentary([voice("sofia")], "notable");
    expect(sel.primary?.commentator).toBe("sofia");
    expect(sel.secondary).toBeNull();
    expect(sel.overflow).toHaveLength(0);
  });

  it("selects primary plus secondary for major", () => {
    const sel = selectOnAirCommentary([voice("sofia"), voice("coach")], "major");
    expect(sel.primary?.commentator).toBe("sofia");
    expect(sel.secondary?.commentator).toBe("coach");
  });

  it("moves third voice to overflow", () => {
    const sel = selectOnAirCommentary(
      [voice("roxanne"), voice("coach"), voice("sofia")],
      "major",
    );
    expect(sel.primary?.commentator).toBe("sofia");
    expect(sel.secondary?.commentator).toBe("coach");
    expect(sel.overflow.map((o) => o.commentator)).toEqual(["roxanne"]);
  });

  it("uses deterministic voice priority regardless of insertion order", () => {
    const sel = selectOnAirCommentary(
      [voice("roxanne"), voice("coach"), voice("sofia")],
      "major",
    );
    expect(VOICE_PRIORITY.indexOf("sofia")).toBeLessThan(VOICE_PRIORITY.indexOf("coach"));
    expect(sel.primary?.commentator).toBe("sofia");
  });

  it("promotes highest-priority accepted voice when intended primary rejected", () => {
    const accepted = filterAcceptedCommentary([
      voice("sofia", { status: "rejected" }),
      voice("coach"),
      voice("roxanne"),
    ]);
    const sel = selectOnAirCommentary(accepted, "major");
    expect(sel.primary?.commentator).toBe("coach");
    expect(sel.secondary?.commentator).toBe("roxanne");
  });

  it("handles rejected secondary without placeholder", () => {
    const accepted = filterAcceptedCommentary([
      voice("sofia"),
      voice("coach", { status: "rejected" }),
    ]);
    const sel = selectOnAirCommentary(accepted, "major");
    expect(sel.primary?.commentator).toBe("sofia");
    expect(sel.secondary).toBeNull();
  });

  it("returns no cards when all voices rejected", () => {
    const accepted = filterAcceptedCommentary([
      voice("sofia", { status: "rejected" }),
      voice("coach", { status: "generation_failed" }),
    ]);
    const sel = selectOnAirCommentary(accepted, "major");
    expect(sel.primary).toBeNull();
    expect(sel.secondary).toBeNull();
  });

  it("suppresses routine commentary from cards and overflow", () => {
    const sel = selectOnAirCommentary([voice("sofia"), voice("coach")], "routine");
    expect(sel.primary).toBeNull();
    expect(sel.secondary).toBeNull();
    expect(sel.overflow).toHaveLength(0);
  });
});

describe("routine suppression", () => {
  it("does not defer routine commentary to ticker", () => {
    const overflow = selectOnAirCommentary([voice("coach")], "routine").overflow;
    expect(resolveDeferredCommentary(overflow, "routine")).toEqual([]);
  });

  it("does not create cards or ticker for routine in snapshot build", () => {
    const { snapshot } = buildRfsnBroadcastSnapshot(
      adapterInput({
        activeMoment: { identity: identity(), significance: "routine", onAir: true },
        commentaryResults: [voice("sofia"), voice("coach")],
      }),
    );
    expect(snapshot.primary).toBeUndefined();
    expect(snapshot.secondary).toBeUndefined();
    expect(snapshot.ticker).toHaveLength(0);
  });
});

describe("stale commentary protection", () => {
  const active = identity();

  it("matches valid commentary identity", () => {
    expect(isCommentaryForActivePick(voice("sofia"), active)).toBe(true);
  });

  it("discards wrong draft ID", () => {
    expect(isStaleCommentary(voice("sofia", { draftId: "other" }), active, false)).toBe(true);
  });

  it("discards old pick number", () => {
    expect(isStaleCommentary(voice("sofia", { pickNumber: 44 }), active, false)).toBe(true);
  });

  it("discards reused pick number with wrong pick ID", () => {
    expect(
      isStaleCommentary(voice("sofia", { pickId: "457622:m:44-stale" }), active, false),
    ).toBe(true);
  });

  it("does not treat future pick number as stale", () => {
    expect(isStaleCommentary(voice("sofia", { pickNumber: 46 }), active, false)).toBe(false);
  });

  it("discards all commentary after draft completion", () => {
    expect(isStaleCommentary(voice("sofia"), active, true)).toBe(true);
  });

  it("does not attach stale results in snapshot build", () => {
    const { snapshot } = buildRfsnBroadcastSnapshot(
      adapterInput({
        commentaryResults: [
          voice("sofia"),
          voice("coach", { draftId: "wrong-draft" }),
          voice("roxanne", { pickNumber: 44 }),
        ],
      }),
    );
    expect(snapshot.primary?.commentator).toBe("sofia");
    expect(snapshot.secondary).toBeUndefined();
  });

  it("discards commentary after board advances via stale pick number", () => {
    const stale = discardStaleCommentary(
      [voice("sofia", { pickNumber: 44 })],
      identity({ pickNumber: 45 }),
      false,
    );
    expect(stale).toHaveLength(0);
  });
});

describe("draft completion", () => {
  it("clears on-air commentary and queue at draft completion", () => {
    const queued = buildQueuedMomentFromPending({
      identity: identity({ pickNumber: 46, pickId: "457622:m:46" }),
      significance: "major",
      commentaryResults: [voice("roxanne", { pickNumber: 46, pickId: "457622:m:46" })],
    })!;
    const { snapshot, queue } = buildRfsnBroadcastSnapshot(
      adapterInput({
        draftComplete: true,
        queue: [queued],
        commentaryResults: [voice("sofia")],
      }),
    );
    expect(snapshot.significance).toBe("routine");
    expect(snapshot.primary).toBeUndefined();
    expect(snapshot.secondary).toBeUndefined();
    expect(snapshot.queue).toHaveLength(0);
    expect(queue).toHaveLength(0);
  });

  it("does not promote queue on completion build", () => {
    const { snapshot } = buildRfsnBroadcastSnapshot(
      adapterInput({ draftComplete: true, queue: [{ id: "q1", significance: "major", primary: { id: "p", commentator: "sofia", label: "X", text: "Y" } }] }),
    );
    expect(snapshot.primary).toBeUndefined();
  });
});

describe("queue behavior", () => {
  it("enqueues pending moment while preserving FIFO", () => {
    const pending = {
      identity: identity({ pickNumber: 46, pickId: "457622:m:46" }),
      significance: "major" as const,
      commentaryResults: [
        voice("roxanne", { pickNumber: 46, pickId: "457622:m:46", label: "Hot Take" }),
      ],
    };
    const queue = enqueuePendingMoments([], [pending]);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.primary.commentator).toBe("roxanne");
  });

  it("prevents duplicate queue entries for same pick identity", () => {
    const moment = buildQueuedMomentFromPending({
      identity: identity(),
      significance: "major",
      commentaryResults: [voice("sofia")],
    })!;
    const q1 = enqueueBroadcastMoment([], moment);
    const q2 = enqueueBroadcastMoment(q1, moment);
    expect(q2).toHaveLength(1);
  });

  it("promotes exactly one queued moment", () => {
    const a = { id: "a", significance: "notable" as const, primary: { id: "p1", commentator: "sofia" as const, label: "L", text: "T" } };
    const b = { id: "b", significance: "major" as const, primary: { id: "p2", commentator: "coach" as const, label: "L", text: "T" } };
    const { promoted, remaining } = promoteQueuedMoment([a, b]);
    expect(promoted?.id).toBe("a");
    expect(remaining).toHaveLength(1);
  });

  it("returns empty promotion for empty queue", () => {
    const { promoted, remaining } = promoteQueuedMoment([]);
    expect(promoted).toBeNull();
    expect(remaining).toEqual([]);
  });

  it("merges pending enqueues during snapshot build", () => {
    const pending = {
      identity: identity({ pickNumber: 46, pickId: "457622:m:46" }),
      significance: "major" as const,
      commentaryResults: [
        voice("coach", { pickNumber: 46, pickId: "457622:m:46" }),
      ],
    };
    const { queue } = buildRfsnBroadcastSnapshot(
      adapterInput({ pendingEnqueues: [pending] }),
    );
    expect(queue).toHaveLength(1);
    expect(pickIdentityKey(pending.identity)).toBe(
      `draft-457622:46:457622:m:46`,
    );
  });

  it("skips enqueue for stale pending identity commentary", () => {
    const built = buildQueuedMomentFromPending({
      identity: identity({ pickNumber: 44, pickId: "old" }),
      significance: "major",
      commentaryResults: [voice("sofia", { pickNumber: 45 })],
    });
    expect(built).toBeNull();
  });
});

describe("resolveContextFields", () => {
  it("prefers breaking news over all other context", () => {
    const fields = resolveContextFields("historic", {
      breakingNews: { headline: "BREAKING", body: "Body" },
      positionRun: { count: 6, position: "RB" },
      leagueStoryline: { title: "Story", body: "Body" },
    });
    expect(fields.breakingNews?.headline).toBe("BREAKING");
    expect(fields.positionRun).toBeUndefined();
    expect(fields.leagueStoryline).toBeUndefined();
  });

  it("shows position run when no breaking news", () => {
    const fields = resolveContextFields("major", {
      positionRun: { count: 6, position: "RB" },
      leagueStoryline: { title: "Story", body: "Body" },
    });
    expect(fields.positionRun?.count).toBe(6);
    expect(fields.leagueStoryline).toBeUndefined();
  });

  it("shows league storyline without higher-priority context", () => {
    const fields = resolveContextFields("notable", {
      leagueStoryline: { title: "Mike's RB Roulette", body: "Pattern break" },
    });
    expect(fields.leagueStoryline?.title).toContain("Roulette");
  });

  it("returns no prominent fields when no context supplied", () => {
    expect(resolveContextFields("routine", {})).toEqual({});
  });
});

describe("buildRfsnBroadcastSnapshot", () => {
  it("builds full major moment with primary and secondary", () => {
    const { snapshot } = buildRfsnBroadcastSnapshot(
      adapterInput({
        commentaryResults: [voice("sofia"), voice("coach"), voice("roxanne")],
      }),
    );
    expect(snapshot.significance).toBe("major");
    expect(snapshot.primary?.commentator).toBe("sofia");
    expect(snapshot.secondary?.commentator).toBe("coach");
    expect(snapshot.ticker.some((t) => t.commentator === "roxanne")).toBe(true);
  });

  it("builds routine moment without cards", () => {
    const { snapshot } = buildRfsnBroadcastSnapshot(
      adapterInput({
        activeMoment: { identity: identity(), significance: "routine", onAir: true },
        commentaryResults: [],
      }),
    );
    expect(snapshot.significance).toBe("routine");
    expect(snapshot.primary).toBeUndefined();
  });

  it("includes quiet championship odds on every snapshot", () => {
    const { snapshot } = buildRfsnBroadcastSnapshot(adapterInput());
    expect(snapshot.championshipOdds.length).toBeGreaterThan(0);
    const ctx = resolveContextGraphic(snapshot);
    expect(ctx.showQuietOdds).toBe(true);
  });

  it("sets only one prominent context graphic on snapshot", () => {
    const { snapshot } = buildRfsnBroadcastSnapshot(
      adapterInput({
        activeMoment: {
          identity: identity(),
          significance: "historic",
          context: {
            breakingNews: { headline: "EARLIEST TE EVER!", body: "Record" },
            positionRun: { count: 6, position: "RB" },
          },
          onAir: true,
        },
      }),
    );
    expect(snapshot.breakingNews).toBeDefined();
    expect(snapshot.positionRun).toBeUndefined();
    expect(resolveContextGraphic(snapshot).prominent).toBe("breaking_news");
  });

  it("does not mutate input arrays", () => {
    const input = adapterInput({
      commentaryResults: [voice("sofia")],
      queue: [],
      draft: baseDraft(),
    });
    const orderBefore = [...input.draft.draftOrder];
    const boardBefore = [...input.draft.board];
    const commentaryBefore = [...input.commentaryResults];
    buildRfsnBroadcastSnapshot(input);
    expect(input.draft.draftOrder).toEqual(orderBefore);
    expect(input.draft.board).toEqual(boardBefore);
    expect(input.commentaryResults).toEqual(commentaryBefore);
  });

  it("produces deterministic output for identical input", () => {
    const input = adapterInput({
      commentaryResults: [voice("coach"), voice("sofia")],
    });
    const a = buildRfsnBroadcastSnapshot(input);
    const b = buildRfsnBroadcastSnapshot(input);
    expect(a.snapshot).toEqual(b.snapshot);
    expect(a.queue).toEqual(b.queue);
  });

  it("omits internal scoring metadata from snapshot", () => {
    const { snapshot } = buildRfsnBroadcastSnapshot(adapterInput());
    const json = JSON.stringify(snapshot);
    expect(json).not.toMatch(/confidence|grounded|validation|fabrication|model/i);
  });
});

describe("identity helpers", () => {
  it("builds stable pick identity keys with full draft/pick identity", () => {
    expect(pickIdentityKey(identity())).toBe(`${DRAFT_ID}:${PICK_NUMBER}:${PICK_ID}`);
  });

  it("matches identical identities", () => {
    expect(identitiesMatch(identity(), identity())).toBe(true);
    expect(identitiesMatch(identity(), identity({ pickId: "other" }))).toBe(false);
  });
});
