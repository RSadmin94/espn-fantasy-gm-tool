import { describe, expect, it } from "vitest";
import { normalizeSpeechForTts } from "./rfsnSpeechNormalize";

describe("normalizeSpeechForTts", () => {
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
