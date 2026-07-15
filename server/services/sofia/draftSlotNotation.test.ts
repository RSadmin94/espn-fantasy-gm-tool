import { describe, it, expect } from "vitest";
import {
  parseDraftSlotToken,
  licensedDraftSlots,
  checkDraftSlotNotation,
  licensedDraftSlotTokensInLine,
} from "./draftSlotNotation";
import type { SubjectFallback } from "./sofiaGrounding";
import { checkNumbersWithTolerance } from "./voiceGrounding";

const subject: SubjectFallback = {
  ownerName: "Tony Dorsey",
  playerName: "CeeDee Lamb",
  position: "WR",
  overallPick: 12,
  round: 1,
  roundPick: 12,
  teamCount: 14,
};

describe("parseDraftSlotToken", () => {
  it("parses valid draft slots", () => {
    expect(parseDraftSlotToken("1.12")).toEqual({ round: 1, roundPick: 12 });
    expect(parseDraftSlotToken("2.15")).toEqual({ round: 2, roundPick: 15 });
  });

  it("rejects arbitrary decimals and malformed slots", () => {
    expect(parseDraftSlotToken("98.8")).toBeNull();
    expect(parseDraftSlotToken("4.55")).toBeNull();
    expect(parseDraftSlotToken("1.123")).toBeNull();
  });
});

describe("licensed draft slots", () => {
  it("licenses 1.12 for round 1 pick 12", () => {
    const slots = licensedDraftSlots(subject, [
      "Tony Dorsey selected CeeDee Lamb (WR) at pick 12, round 1.",
    ]);
    expect(slots.has("1.12")).toBe(true);
  });

  it("rejects incorrect slot for the moment", () => {
    const r = checkDraftSlotNotation(
      "Tony Dorsey picks CeeDee Lamb at 2.15.",
      subject,
      ["Tony Dorsey selected CeeDee Lamb (WR) at pick 12, round 1."],
    );
    expect(r.pass).toBe(false);
    expect(r.violations).toContain("2.15");
  });

  it("accepts licensed 1.12 in commentary", () => {
    const r = checkDraftSlotNotation(
      "Tony Dorsey takes CeeDee Lamb at 1.12.",
      subject,
      ["Tony Dorsey selected CeeDee Lamb (WR) at pick 12, round 1."],
    );
    expect(r.pass).toBe(true);
  });
});

describe("number guard integration", () => {
  const claims = ["Tony Dorsey selected CeeDee Lamb (WR) at pick 12, round 1."];

  it("accepts licensed draft-slot notation", () => {
    expect(checkNumbersWithTolerance("Lamb goes at 1.12 in round one.", claims, subject).pass).toBe(true);
  });

  it("still rejects invented draft-slot notation", () => {
    expect(checkNumbersWithTolerance("Lamb goes at 2.15.", claims, subject).pass).toBe(false);
  });

  it("still governs ordinary decimal statistics", () => {
    const adpSubject: SubjectFallback = { ...subject, overallPick: 105, round: 8, roundPick: 5 };
    const adpClaims = ["Jaxon Smith-Njigba fell 98.8 picks past ADP."];
    expect(checkNumbersWithTolerance("fell nearly 99 picks past ADP", adpClaims, adpSubject).pass).toBe(true);
    expect(checkNumbersWithTolerance("fell 50 picks past ADP", adpClaims, adpSubject).pass).toBe(false);
  });

  it("licensed tokens excluded from invented list", () => {
    const tokens = licensedDraftSlotTokensInLine("pick 1.12", subject, claims);
    expect(tokens.has("1.12")).toBe(true);
  });
});

describe("14-team round pick derivation", () => {
  it("derives round pick from overall when omitted", () => {
    const s: SubjectFallback = { ...subject, roundPick: undefined, overallPick: 15, round: 2 };
    const slots = licensedDraftSlots(s, ["pick 15, round 2"], 14);
    expect(slots.has("2.1")).toBe(true);
  });
});
