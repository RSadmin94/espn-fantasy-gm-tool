import { describe, expect, it } from "vitest";
import {
  expandContractionsForTts,
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
  });

  it("does not false-replace inside ordinary English words", () => {
    expect(normalizeSpeechForTts("This class stays solid.")).toBe("This class stays solid.");
    expect(normalizeSpeechForTts("ASK anything else.")).toBe("ASK anything else.");
  });
});

describe("normalizeSpeechForTts — contractions", () => {
  it("folds curly apostrophes then expands common contractions", () => {
    expect(normalizeApostrophesForTts("that\u2019s a reach")).toBe("that's a reach");
    expect(expandContractionsForTts("that's a reach")).toBe("that is a reach");
  });

  it("expands the documented failing phrases", () => {
    expect(normalizeSpeechForTts("that's a reach")).toBe("that is a reach");
    expect(normalizeSpeechForTts("he’s already loaded at wide receiver")).toBe(
      "he is already loaded at wide receiver",
    );
    expect(normalizeSpeechForTts("she’s watching this board closely")).toBe(
      "she is watching this board closely",
    );
    expect(normalizeSpeechForTts("it’s a strong selection")).toBe("it is a strong selection");
    expect(normalizeSpeechForTts("what’s the plan here")).toBe("what is the plan here");
    expect(normalizeSpeechForTts("there’s better value available")).toBe(
      "there is better value available",
    );
    expect(normalizeSpeechForTts("don’t force tight end")).toBe("do not force tight end");
    expect(normalizeSpeechForTts("he isn’t finished yet")).toBe("he is not finished yet");
    expect(normalizeSpeechForTts("that wasn’t expected")).toBe("that was not expected");
  });

  it("uses has when he's/she's clearly precedes a participle", () => {
    expect(normalizeSpeechForTts("he's been dominant")).toBe("he has been dominant");
    expect(normalizeSpeechForTts("she's taken the lead")).toBe("she has taken the lead");
  });

  it("still expands football abbreviations after contractions", () => {
    expect(normalizeSpeechForTts("he's already loaded at WR")).toBe(
      "he is already loaded at wide receiver",
    );
  });
});

describe("normalizeSpeechForTts — apostrophe / possessive", () => {
  it("rewrites ordinary possessives into natural of-forms", () => {
    expect(normalizePossessivesForTts(normalizeApostrophesForTts("Rod's roster"))).toBe(
      "the roster of Rod",
    );
    expect(normalizeSpeechForTts("Rod's roster")).toBe("the roster of Rod");
    expect(normalizeSpeechForTts("Mike's pick")).toBe("the pick of Mike");
    expect(normalizeSpeechForTts("the team's need")).toBe("the need of the team");
  });

  it("handles plural / s-ending names", () => {
    expect(normalizeSpeechForTts("James' roster")).toBe("the roster of James");
    expect(normalizeSpeechForTts("James’s roster")).toBe("the roster of James");
  });

  it("does not turn expanded contractions into of-forms", () => {
    expect(normalizeSpeechForTts("it's a steal")).toBe("it is a steal");
    expect(normalizeSpeechForTts("don't cut Coach's mic")).toBe("do not cut the mic of Coach");
  });
});
