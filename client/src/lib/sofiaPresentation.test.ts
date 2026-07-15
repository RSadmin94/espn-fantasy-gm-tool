import { describe, expect, it } from "vitest";
import type { SofiaCommentary } from "../../../server/services/sofia/sofiaContract";
import {
  SOFIA_FEED_CONTAINER_CLASS,
  buildSofiaShareText,
  containsForbiddenModelTerms,
  formatStorylineLabel,
  getMomentCardDisplay,
  isGroundedCommentary,
  levelLabel,
  mapSofiaErrorCopy,
  resolveDraftCommentaryViewState,
  sortCommentaryNewestFirst,
} from "./sofiaPresentation";
import { getFeatureByRoute } from "./featureRegistry";

function fixture(overrides: Partial<SofiaCommentary> = {}): SofiaCommentary {
  return {
    contractVersion: "sofia.commentary.v1",
    momentId: "moment-1",
    draftId: "draft-1",
    leagueId: "457622",
    subject: {
      ownerName: "Jan Graham",
      playerName: "Jaxon Smith-Njigba",
      position: "WR",
      overallPick: 105,
      round: 8,
    },
    level: "historic",
    primaryStoryline: "STEAL",
    text: "Jan Graham selected Jaxon Smith-Njigba at pick 105, round 8. Jaxon Smith-Njigba fell 98.8 picks past ADP.",
    source: "template",
    budget: { maxWords: 60, actualWords: 22 },
    validation: { grounded: true, fabricationCount: 0 },
    ...overrides,
  };
}

describe("resolveDraftCommentaryViewState", () => {
  it("returns loading_commentary while commentary is loading", () => {
    expect(
      resolveDraftCommentaryViewState({
        gateLoading: false,
        profile: { isSetupComplete: true },
        activeLeagueId: "457622",
        commentaryLoading: true,
        commentaryError: false,
        commentary: undefined,
      }),
    ).toBe("loading_commentary");
  });

  it("returns setup_incomplete when team is not selected", () => {
    expect(
      resolveDraftCommentaryViewState({
        gateLoading: false,
        profile: { isSetupComplete: false },
        activeLeagueId: "457622",
        commentaryLoading: false,
        commentaryError: false,
        commentary: undefined,
      }),
    ).toBe("setup_incomplete");
  });

  it("returns empty when active league has no commentary", () => {
    expect(
      resolveDraftCommentaryViewState({
        gateLoading: false,
        profile: { isSetupComplete: true },
        activeLeagueId: "457622",
        commentaryLoading: false,
        commentaryError: false,
        commentary: [],
      }),
    ).toBe("empty");
  });

  it("returns error on query failure", () => {
    expect(
      resolveDraftCommentaryViewState({
        gateLoading: false,
        profile: { isSetupComplete: true },
        activeLeagueId: "457622",
        commentaryLoading: false,
        commentaryError: true,
        commentary: undefined,
      }),
    ).toBe("error");
  });
});

describe("Sofia moment presentation", () => {
  it("renders routine commentary fields", () => {
    const card = getMomentCardDisplay(
      fixture({
        level: "routine",
        primaryStoryline: null,
        text: "Routine pick note.",
      }),
    );
    expect(card.level).toBe("Routine");
    expect(card.ownerName).toBe("Jan Graham");
    expect(card.verified).toBe(true);
    expect(card.text).toContain("Routine pick");
  });

  it("renders historic level and storyline", () => {
    const card = getMomentCardDisplay(fixture());
    expect(card.level).toBe("Historic");
    expect(card.storyline).toBe("Steal");
    expect(formatStorylineLabel("PATTERN_BREAK")).toBe("Pattern Break");
  });

  it("shows verified only for grounded commentary", () => {
    expect(isGroundedCommentary(fixture())).toBe(true);
    expect(
      getMomentCardDisplay(fixture({ validation: { grounded: false, fabricationCount: 1 } })).verified,
    ).toBe(false);
    expect(
      getMomentCardDisplay(fixture({ validation: { grounded: false, fabricationCount: 1 } })).showShare,
    ).toBe(false);
  });

  it("never includes model source in share text", () => {
    const templateShare = buildSofiaShareText(fixture({ source: "template" }));
    const llmShare = buildSofiaShareText(fixture({ source: "llm" }));
    expect(templateShare).toContain("Sofia — Fantasy Football Rivals");
    expect(templateShare).toContain("Historic · Steal");
    expect(templateShare).toContain("pick 105");
    expect(containsForbiddenModelTerms(templateShare)).toBe(false);
    expect(containsForbiddenModelTerms(llmShare)).toBe(false);
    expect(templateShare).toBe(llmShare);
  });

  it("orders newest pick first", () => {
    const ordered = sortCommentaryNewestFirst([
      fixture({ momentId: "a", subject: { ...fixture().subject, overallPick: 10, round: 1 } }),
      fixture({ momentId: "b", subject: { ...fixture().subject, overallPick: 99, round: 8 } }),
    ]);
    expect(ordered[0]?.momentId).toBe("b");
    expect(ordered[1]?.momentId).toBe("a");
  });
});

describe("mapSofiaErrorCopy", () => {
  it("maps active-league errors without technical details", () => {
    const copy = mapSofiaErrorCopy(
      "Sofia commentary is scoped to your active league. Switch to league 457622 before requesting commentary.",
    );
    expect(copy.showLeagueSwitch).toBe(true);
    expect(copy.title).not.toContain("BAD_REQUEST");
    expect(copy.body).not.toContain("tRPC");
  });

  it("offers Draft War Room when season data is missing", () => {
    const copy = mapSofiaErrorCopy("Draft War Room data unavailable for the active league.");
    expect(copy.showDraftWarRoom).toBe(true);
  });
});

describe("navigation registry", () => {
  it("registers Draft Commentary in the Draft section", () => {
    const feature = getFeatureByRoute("/draft-commentary");
    expect(feature?.label).toBe("Draft Commentary");
    expect(feature?.navCategory).toBe("knowRivals");
    expect(feature?.requiredPlan).toBe("pro");
  });
});

describe("mobile-safe feed container", () => {
  it("avoids horizontal scroll classes", () => {
    expect(SOFIA_FEED_CONTAINER_CLASS).toContain("overflow-x-hidden");
    expect(SOFIA_FEED_CONTAINER_CLASS).toContain("max-w-[52rem]");
  });
});

describe("levelLabel", () => {
  it("covers all significance levels", () => {
    expect(levelLabel("routine")).toBe("Routine");
    expect(levelLabel("notable")).toBe("Notable");
    expect(levelLabel("major")).toBe("Major");
    expect(levelLabel("historic")).toBe("Historic");
  });
});
