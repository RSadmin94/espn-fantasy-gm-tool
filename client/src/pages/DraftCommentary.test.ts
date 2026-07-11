import { describe, expect, it } from "vitest";
import { SOFIA_EMPTY_COPY } from "../components/sofia/SofiaEmptyState";
import { SofiaLoadingState } from "../components/sofia/SofiaLoadingState";
import { SofiaErrorState } from "../components/sofia/SofiaErrorState";
import { SofiaEmptyState } from "../components/sofia/SofiaEmptyState";

describe("DraftCommentary empty and loading states", () => {
  it("points setup-incomplete users to Connected Leagues", () => {
    expect(SOFIA_EMPTY_COPY.setup_incomplete.ctaHref).toBe("/connected-leagues");
    expect(SOFIA_EMPTY_COPY.setup_incomplete.ctaLabel).toBe("Manage Connected Leagues");
  });

  it("points no-commentary users to Draft War Room", () => {
    expect(SOFIA_EMPTY_COPY.no_commentary.ctaHref).toBe("/draft-war-room");
    expect(SOFIA_EMPTY_COPY.no_commentary.ctaLabel).toBe("Open Draft War Room");
  });

  it("exports skeleton loading state component", () => {
    expect(SofiaLoadingState).toBeTypeOf("function");
  });

  it("exports retryable error state component", () => {
    expect(SofiaErrorState).toBeTypeOf("function");
    expect(SofiaEmptyState).toBeTypeOf("function");
  });
});
