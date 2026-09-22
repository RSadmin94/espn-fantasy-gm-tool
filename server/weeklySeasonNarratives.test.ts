import { describe, it, expect } from "vitest";
import {
  collectAllowedNumbers,
  deterministicWeeklyNarrative,
  groundNarrative,
  isPublishableGrounding,
  sofiaSystemPrompt,
  type NarrativeFactPacket,
} from "./weeklySeasonNarratives";
import { storyFactPacket, type EditorialStory } from "./weeklyEdition";
import { shouldGenerateEditionNarratives } from "./weeklySeasonEngine";

function statementPacket(): NarrativeFactPacket {
  const story: EditorialStory = {
    eventId: "matchup:1-2:w1:statement",
    canonicalId: "matchup:1-2:w1",
    eventType: "BIGGEST_STATEMENT",
    presentationLabel: "AROUND THE LEAGUE",
    scope: "LEAGUE",
    role: "LEAGUE_STORY",
    subject: "Jan Graham",
    opponent: "Bruce Edwards",
    dek: "Jan Graham posted the league-high 175.26 and won by 64.",
    facts: {
      score: 175.26,
      margin: 64,
      winScore: 175.26,
      loseScore: 111.26,
      leagueAverage: 132.61,
      winner: "Jan Graham",
      loser: "Bruce Edwards",
      regularSeasonMeetingsEntering: 15,
      careerEntering: "11-4",
      careerAfter: "11-5",
    },
    composedFrom: ["BIGGEST_STATEMENT", "BIGGEST_BLOWOUT"],
    diversityKey: "statement",
    generateSofia: true,
  };
  return storyFactPacket(story, { week: 1, season: 2026 });
}

describe("weekly narrative contract", () => {
  it("does not license model confidence or inferred ordinals", () => {
    const packet = statementPacket();
    const allowed = collectAllowedNumbers(packet);
    expect(allowed.has("90")).toBe(false);
    expect(allowed.has("16")).toBe(false);
    expect(allowed.has("175.26")).toBe(true);
    expect(allowed.has("15")).toBe(true);
    const dirty = groundNarrative(
      "Jan Graham crushed Bruce Edwards in their 16th clash, 175.26 to 111.26, at 90% confidence.",
      packet,
      "Jan Graham Crushes Bruce Edwards",
    );
    expect(dirty.contradicted).toBe(0);
    expect(dirty.unsupported).toBeGreaterThan(0);
    expect(isPublishableGrounding(dirty)).toBe(false);
  });

  it("accepts a deterministic fallback with only packet quantities", () => {
    const packet = statementPacket();
    const copy = deterministicWeeklyNarrative(packet, 1);
    const g = groundNarrative(copy.body, packet, copy.headline);
    expect(g.unsupported).toBe(0);
    expect(g.contradicted).toBe(0);
    expect(copy.body).toContain("175.26");
    expect(copy.body).toContain("64");
  });

  it("licenses rivalry records without allowing calculated ordinals", () => {
    const story: EditorialStory = {
      eventId: "m:riv",
      canonicalId: "m:riv",
      eventType: "RIVALRY_RESULT",
      presentationLabel: "RIVALRY RECEIPT",
      scope: "HISTORICAL",
      role: "LEAGUE_STORY",
      subject: "Nate West",
      opponent: "Demetri Clark",
      dek: "note",
      facts: {
        careerEntering: "2-12",
        careerAfter: "3-12",
        playoffMeetings: 3,
        closeGames: 5,
        weekMargin: 34.32,
        winner: "Nate West",
        loser: "Demetri Clark",
      },
      composedFrom: ["RIVALRY_RESULT"],
      diversityKey: "rivalry",
      generateSofia: true,
    };
    const packet = storyFactPacket(story, { week: 1, season: 2026 });
    const copy = deterministicWeeklyNarrative(packet, 1);
    const g = groundNarrative(copy.body, packet, copy.headline);
    expect(isPublishableGrounding(g)).toBe(true);
    expect(copy.body).toContain("34.32");
    expect(copy.body).toContain("3-12");
    const dirty = groundNarrative("Nate West ended a 16-year drought in their 16th meeting.", packet);
    expect(isPublishableGrounding(dirty)).toBe(false);
  });

  it("forbids percentages unless a share/percent fact is supplied", () => {
    const packet = statementPacket();
    const g = groundNarrative("Jan won 175.26-111.26, a 90% lock.", packet);
    expect(g.claims.some((c) => c.text.includes("%") && c.verdict === "UNSUPPORTED")).toBe(true);
  });

  it("uses a stricter retry prompt", () => {
    expect(sofiaSystemPrompt(true)).toMatch(/STRICT RETRY/);
    expect(sofiaSystemPrompt(false)).not.toMatch(/STRICT RETRY/);
  });

  it("release gate: published copy must have UNSUPPORTED=0 and CONTRADICTED=0", () => {
    const packet = statementPacket();
    const copy = deterministicWeeklyNarrative(packet, 1);
    const clean = groundNarrative(copy.body, packet, copy.headline);
    expect(clean.unsupported).toBe(0);
    expect(clean.contradicted).toBe(0);
    expect(isPublishableGrounding(clean)).toBe(true);
    const dirty = groundNarrative("Week 1 was the 16th clash at 90% confidence.", packet);
    expect(dirty.unsupported).toBeGreaterThan(0);
    expect(isPublishableGrounding(dirty)).toBe(false);
  });
});

describe("edition automation policy", () => {
  it("generates Sofia editions only when the week is FINAL", () => {
    expect(shouldGenerateEditionNarratives("scheduled", "FINAL")).toBe(true);
    expect(shouldGenerateEditionNarratives("scheduled", "SCORING")).toBe(false);
    expect(shouldGenerateEditionNarratives("scheduled", "UPCOMING")).toBe(false);
    expect(shouldGenerateEditionNarratives("replay", "FINAL")).toBe(false);
    expect(shouldGenerateEditionNarratives("certify", "FINAL")).toBe(true);
  });
});
