import { describe, expect, it } from "vitest";
import {
  normalizeApostrophesForTts,
  normalizePossessivesForTts,
  normalizeSpeechForTts,
} from "./rfsnSpeechNormalize";

describe("normalizeSpeechForTts — football abbreviations", () => {
  it("expands position abbreviations for speech", () => {
    expect(normalizeSpeechForTts("That WR is a steal at this ADP.")).toBe(
      "That wide receiver is a steal at this ADP.",
    );
    expect(normalizeSpeechForTts("Need a QB, then a RB and TE.")).toBe(
      "Need a quarterback, then a running back and tight end.",
    );
    expect(normalizeSpeechForTts("A solid DEF / DST streaming call.")).toBe(
      "A solid defense / defense streaming call.",
    );
  });

  it("expands defensive back and line labels", () => {
    expect(normalizeSpeechForTts("He drafts CB, S, FS, and SS early.")).toBe(
      "He drafts cornerback, safety, free safety, and strong safety early.",
    );
    expect(normalizeSpeechForTts("DL DE DT LB K fill late.")).toBe(
      "defensive lineman defensive end defensive tackle linebacker kicker fill late.",
    );
  });

  it("does not alter surrounding non-abbreviation words", () => {
    const line = "Sofia likes Jahmyr Gibbs as the lead back.";
    expect(normalizeSpeechForTts(line)).toBe(line);
  });

  it("does not false-replace inside ordinary English words", () => {
    expect(normalizeSpeechForTts("This class stays solid.")).toBe("This class stays solid.");
    expect(normalizeSpeechForTts("Best value in the draft.")).toBe("Best value in the draft.");
    expect(normalizeSpeechForTts("ASK anything else.")).toBe("ASK anything else.");
  });

  it("preserves display-ready punctuation around expansions", () => {
    expect(normalizeSpeechForTts("Late WR.")).toBe("Late wide receiver.");
    expect(normalizeSpeechForTts("(QB)")).toBe("(quarterback)");
  });
});

describe("normalizeSpeechForTts — apostrophe / possessive", () => {
  it("folds curly apostrophes to ASCII before other work", () => {
    expect(normalizeApostrophesForTts("Rod\u2019s roster")).toBe("Rod's roster");
    expect(normalizeApostrophesForTts("we\u2019re live")).toBe("we're live");
  });

  it("rewrites ordinary possessives into natural of-forms", () => {
    expect(normalizePossessivesForTts("Rod's roster")).toBe("the roster of Rod");
    expect(normalizePossessivesForTts("Mike's pick")).toBe("the pick of Mike");
    expect(normalizePossessivesForTts("Atlanta's Finest")).toBe("the Finest of Atlanta");
    expect(normalizePossessivesForTts("the team's need")).toBe("the need of the team");
    expect(normalizePossessivesForTts("Collins's value")).toBe("the value of Collins");
  });

  it("handles plural / s-ending names", () => {
    expect(normalizePossessivesForTts("James' roster")).toBe("the roster of James");
    expect(normalizePossessivesForTts("James’s roster")).toBe("the roster of James");
  });

  it("preserves contractions", () => {
    expect(normalizePossessivesForTts("don't cut Coach's mic")).toBe("don't cut the mic of Coach");
    expect(normalizePossessivesForTts("can't believe it's live")).toBe("can't believe it's live");
    expect(normalizePossessivesForTts("he's ready and they're drafting")).toBe(
      "he's ready and they're drafting",
    );
    expect(normalizePossessivesForTts("it's a steal")).toBe("it's a steal");
  });

  it("handles curly possessives on team names", () => {
    expect(normalizeSpeechForTts("Atlanta\u2019s Finest adds a WR")).toBe(
      "the Finest of Atlanta adds a wide receiver",
    );
  });

  it("preserves contractions through abbreviation expansion", () => {
    expect(normalizeSpeechForTts("Don't worry — it's fine and they're drafting.")).toBe(
      "Don't worry — it's fine and they're drafting.",
    );
  });
});
