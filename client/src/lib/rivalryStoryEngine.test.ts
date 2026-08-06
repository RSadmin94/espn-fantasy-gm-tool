import { describe, expect, it } from "vitest";
import {
  explanationForCard,
  formatRivalStoryRecordLine,
  selectExplanationBullets,
  truncateExplanationReason,
  THREAT_DEFINITION_DOSSIER,
} from "@/lib/rivalryStoryEngine";

describe("RFSN-048B presentation-only rivalryStoryEngine", () => {
  it("formats record · meetings without inventing narrative", () => {
    expect(
      formatRivalStoryRecordLine({
        opponentOwner: "Bruce Edwards",
        wins: 27,
        losses: 27,
        ties: 2,
        games: 56,
      }),
    ).toBe("27–27–2 · 56 meetings");
  });

  it("truncates reason text only", () => {
    const long = "A".repeat(250);
    const out = truncateExplanationReason(long, 50);
    expect(out?.endsWith("…")).toBe(true);
    expect(out!.length).toBeLessThanOrEqual(50);
  });

  it("selects at most three verified bullets", () => {
    const bullets = selectExplanationBullets(
      [
        { text: "one" },
        { text: "two" },
        { text: "three" },
        { text: "four" },
      ],
      3,
    );
    expect(bullets.map((b) => b.text)).toEqual(["one", "two", "three"]);
  });

  it("does not invent bullets when explanation is empty", () => {
    expect(selectExplanationBullets([])).toEqual([]);
    expect(truncateExplanationReason(null)).toBeNull();
  });

  it("picks explanation by card kind", () => {
    const hit = explanationForCard(
      [
        {
          cardKind: "historical",
          opponentOwnerKey: "id:vince",
          opponentOwnerName: "Vince Sellers",
          headline: "Historical nemesis",
          reason: "Vince remains your strongest historical nemesis across the recorded series.",
          bullets: [{ text: "Career: 0–7." }],
          provenance: ["rivalryStoryAuthority"],
          coverageQualifier: "across 7 recorded meetings",
          matchedAdvisorThreat: false,
        },
        {
          cardKind: "activeThreat",
          opponentOwnerKey: "id:demetri",
          opponentOwnerName: "Demetri Clark",
          headline: null,
          reason: "Advisor reason must not apply here",
          bullets: [],
          provenance: ["h2hAuthority"],
          coverageQualifier: null,
          matchedAdvisorThreat: false,
        },
      ],
      "historical",
      "id:vince",
    );
    expect(hit?.reason).toMatch(/historical nemesis/i);
    expect(hit?.matchedAdvisorThreat).toBe(false);
  });

  it("documents dossier threat label distinctly", () => {
    expect(THREAT_DEFINITION_DOSSIER).toBe("Active matchup threat");
  });
});
