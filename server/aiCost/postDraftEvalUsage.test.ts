import { describe, expect, it } from "vitest";
import { FEATURE_LABELS, isAiFeatureId } from "./aiFeatures";

describe("POST_DRAFT_STORYTELLING usage attribution", () => {
  it("is a first-class AI feature with a Usage Center label", () => {
    expect(isAiFeatureId("POST_DRAFT_STORYTELLING")).toBe(true);
    expect(FEATURE_LABELS.POST_DRAFT_STORYTELLING).toBe("Post-Draft Storytelling");
  });

  it("keeps the legacy Post-Draft Evaluation feature id for historical rows", () => {
    expect(isAiFeatureId("POST_DRAFT_EVALUATION")).toBe(true);
    expect(FEATURE_LABELS.POST_DRAFT_EVALUATION).toBe("Post-Draft Evaluation");
  });

  it("Admin Usage can distinguish storytelling from other AI features", () => {
    expect(FEATURE_LABELS.POST_DRAFT_STORYTELLING).not.toEqual(FEATURE_LABELS.ADVISOR);
    expect(FEATURE_LABELS.POST_DRAFT_STORYTELLING).not.toEqual(FEATURE_LABELS.POST_DRAFT_EVALUATION);
  });
});
