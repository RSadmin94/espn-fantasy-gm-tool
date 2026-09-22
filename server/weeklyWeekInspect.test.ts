import { describe, it, expect } from "vitest";
import { selectNarratives, type DetectedEvent } from "./weeklyWeekInspect";
import { factFingerprint, groundNarrative, type NarrativeFactPacket } from "./weeklySeasonNarratives";

function ev(partial: Partial<DetectedEvent> & Pick<DetectedEvent, "eventId" | "canonicalId" | "significance">): DetectedEvent {
  return {
    eventType: "X",
    subject: "A",
    opponent: "B",
    facts: {},
    confidence: 80,
    source: "League Wire",
    ...partial,
  };
}

describe("weekly week inspect selection", () => {
  it("keeps one narrative per canonical event and drops low significance", () => {
    const selected = selectNarratives([
      ev({ eventId: "close-a", canonicalId: "m:1-2:close", significance: 95, eventType: "CLOSEST_GAME" }),
      ev({ eventId: "heart-a", canonicalId: "m:1-2:close", significance: 90, eventType: "HEARTBREAK" }),
      ev({ eventId: "pog", canonicalId: "m:1-2:result", significance: 40, eventType: "MATCHUP_PLAYER_OF_GAME" }),
      ev({ eventId: "blow", canonicalId: "m:3-4:blowout", significance: 80, eventType: "BIGGEST_BLOWOUT" }),
    ]);
    expect(selected.map((s) => s.eventId)).toEqual(["close-a", "blow"]);
  });
});

describe("weekly narrative fingerprint + grounding", () => {
  const packet: NarrativeFactPacket = {
    eventId: "matchup:1-2:w1:close",
    eventType: "CLOSEST_GAME",
    subject: "Marcus",
    opponent: "Jay",
    facts: { homeScore: 112.42, awayScore: 112, margin: 0.42, impact: "WIN_FLIP" },
    confidence: 95,
    tone: "booth",
  };

  it("fingerprint is stable for the same facts", () => {
    expect(factFingerprint(packet)).toBe(factFingerprint({ ...packet }));
  });

  it("marks numbers in the packet as supported", () => {
    const g = groundNarrative("Marcus escaped Jay 112.42 to 112, a 0.42-point knife fight.", packet);
    expect(g.contradicted).toBe(0);
    expect(g.unsupported).toBe(0);
    expect(g.supported).toBeGreaterThan(0);
  });

  it("does not treat a decimal score as a license for unrelated integers", () => {
    const g = groundNarrative("Week 1 was the 16th clash at 90% confidence.", packet);
    expect(g.unsupported).toBeGreaterThan(0);
    expect(g.claims.some((c) => c.text.includes("16") && c.verdict === "UNSUPPORTED")).toBe(true);
    expect(g.claims.some((c) => c.text.includes("%") && c.verdict === "UNSUPPORTED")).toBe(true);
  });

  it("flags a WIN_FLIP denial as contradicted", () => {
    const g = groundNarrative("Marcus won, but the bench would not have changed the outcome.", packet);
    expect(g.contradicted).toBeGreaterThan(0);
  });
});
