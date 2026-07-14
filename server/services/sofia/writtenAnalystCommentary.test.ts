import { describe, expect, it } from "vitest";
import { buildVoicePrompt } from "./broadcastVoice";
import { SOFIA } from "./voicePersonalities";
import { createShadowGroundedVoiceProvider } from "./shadowGroundedVoiceProvider";
import {
  composeAnalystCommentary,
  parseVoicePromptForCommentary,
  type CommentaryFacts,
} from "./writtenAnalystCommentary";

const baseFacts = (over: Partial<CommentaryFacts> = {}): CommentaryFacts => ({
  subject: {
    ownerName: "Randy Broner Jr",
    playerName: "Jahmyr Gibbs",
    position: "RB",
    overallPick: 2,
    round: 1,
  },
  verifiedFacts: [
    "Randy Broner Jr selected Jahmyr Gibbs (RB) at pick 2, round 1.",
  ],
  storylines: [],
  significance: "notable",
  ...over,
});

describe("writtenAnalystCommentary", () => {
  it("eliminates transaction-log wording for Sofia on identity-only facts", () => {
    const { line } = composeAnalystCommentary("sofia", baseFacts());
    expect(line).not.toMatch(/selected .+ at pick \d+, round \d+/i);
    expect(line.toLowerCase()).toMatch(/gibbs|broner/);
  });

  it("Sofia leads with ADP evidence when available", () => {
    const { line, premise } = composeAnalystCommentary(
      "sofia",
      baseFacts({
        verifiedFacts: [
          "Randy Broner Jr selected Jahmyr Gibbs (RB) at pick 2, round 1.",
          "Randy Broner Jr took Jahmyr Gibbs 8 picks ahead of ADP.",
        ],
        significance: "major",
      }),
    );
    expect(line).toMatch(/ahead of ADP/i);
    expect(line).not.toMatch(/selected Jahmyr Gibbs \(RB\) at pick 2/i);
    expect(premise).toMatch(/ahead of ADP/i);
  });

  it("separates Coach (construction) from Roxanne (room reaction)", () => {
    const facts = baseFacts({
      verifiedFacts: [
        "Alice selected CeeDee Lamb (WR) at pick 5, round 1.",
        "Alice still needed a starting WR.",
      ],
      subject: {
        ownerName: "Alice",
        playerName: "CeeDee Lamb",
        position: "WR",
        overallPick: 5,
        round: 1,
      },
    });
    const coach = composeAnalystCommentary("coach", facts).line;
    const rox = composeAnalystCommentary("roxanne", facts).line;
    expect(coach.toLowerCase()).toMatch(/start|construct|build|need|roster|positional|board/);
    expect(rox.toLowerCase()).toMatch(/room|reaction|consequences|board|bookmark|screenshot|argument|replies|temperature|felt/);
    expect(coach).not.toEqual(rox);
  });

  it("keeps routine lines shorter than major ADP analysis", () => {
    const routine = composeAnalystCommentary("sofia", baseFacts({ significance: "routine" })).line;
    const major = composeAnalystCommentary(
      "sofia",
      baseFacts({
        significance: "major",
        verifiedFacts: [
          "Randy Broner Jr selected Jahmyr Gibbs (RB) at pick 2, round 1.",
          "Randy Broner Jr took Jahmyr Gibbs 12 picks ahead of ADP.",
          "Randy Broner Jr still needed a starting RB.",
        ],
      }),
    ).line;
    expect(routine.split(/\s+/).length).toBeLessThanOrEqual(18);
    expect(major.length).toBeGreaterThan(routine.length);
  });

  it("shadow provider parses prompt SIGNIFICANCE and facts", async () => {
    const prompt = buildVoicePrompt(
      {
        subject: {
          ownerName: "Alice",
          playerName: "CeeDee Lamb",
          position: "WR",
          overallPick: 10,
          round: 1,
        },
        verifiedFacts: [
          "Alice selected CeeDee Lamb (WR) at pick 10, round 1.",
          "CeeDee Lamb fell 14 picks past ADP.",
        ],
        entities: ["Alice", "CeeDee Lamb"],
        significance: "notable",
      },
      SOFIA,
    );
    expect(prompt).toContain("SIGNIFICANCE: notable");
    expect(prompt).toMatch(/transaction-log/i);
    const parsed = parseVoicePromptForCommentary(prompt);
    expect(parsed.voice).toBe("sofia");
    expect(parsed.facts.significance).toBe("notable");
    const raw = await createShadowGroundedVoiceProvider()(prompt);
    const { line } = JSON.parse(raw) as { line: string };
    expect(line).toMatch(/fell 14 picks past ADP/i);
    expect(line).not.toMatch(/selected CeeDee Lamb \(WR\) at pick 10/i);
  });

  it("does not mis-detect Coach when persona mentions Sofia", () => {
    const prompt = `You are Coach, a football lifer.
Sofia owns the receipt; you explain construction.
SIGNIFICANCE: notable
VERIFIED FACTS:
1. Alice selected CeeDee Lamb (WR) at pick 10, round 1.
MOMENT: Alice selected CeeDee Lamb (WR) at pick 10, round 1.
Write Coach's reaction. JSON:`;
    expect(parseVoicePromptForCommentary(prompt).voice).toBe("coach");
  });
});
