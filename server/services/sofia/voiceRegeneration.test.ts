import { describe, it, expect, vi } from "vitest";
import { generateVoice, type FactPacket } from "./broadcastVoice";
import { COACH, SOFIA } from "./voicePersonalities";
import { emptyRegenerationTelemetry, isRegenerableRejection, toRegenerationInstruction } from "./voiceRegeneration";
import type { EntailmentChecker } from "./sofiaDeterministicValidation";

const packet: FactPacket = {
  subject: { ownerName: "Jan Graham", playerName: "Puka Nacua", position: "WR", overallPick: 130, round: 10 },
  verifiedFacts: [
    "Jan Graham selected Puka Nacua (WR) at pick 130, round 10.",
    "Jan Graham claimed Puka Nacua off waivers before the draft.",
  ],
  entities: ["Jan Graham", "Puka Nacua"],
};

const entailAlwaysNeutral: EntailmentChecker = { check: async () => "neutral" };
const entailAlwaysEntail: EntailmentChecker = { check: async () => "entail" };

describe("isRegenerableRejection", () => {
  it("allows polarity injury and coach lane failures", () => {
    expect(isRegenerableRejection("polarity", "unsupported injury/medical claim")).toBe(true);
    expect(isRegenerableRejection("polarity", "coach restated verified milestone — react with consequence or strategy")).toBe(true);
  });

  it("allows number guard wrong round and invented numbers", () => {
    expect(isRegenerableRejection("number", "wrong round reference: 6 (licensed round 12)")).toBe(true);
    expect(isRegenerableRejection("number", "invented number: 1.12")).toBe(true);
  });

  it("never retries entity or parse failures", () => {
    expect(isRegenerableRejection("entity", "unauthorized player: Jimmy Graham (Graham)")).toBe(false);
    expect(isRegenerableRejection("parse", "unparseable generation")).toBe(false);
    expect(isRegenerableRejection("entailment", "entailment 'neutral' fails FACT grounding rule")).toBe(false);
  });
});

describe("toRegenerationInstruction", () => {
  it("never includes rejected line text", () => {
    const msg = toRegenerationInstruction("polarity", "unsupported injury/medical claim");
    expect(msg).toContain("unsupported injury");
    expect(msg).not.toContain("Puka");
  });
});

describe("generateVoice regeneration", () => {
  const milestonePacket: FactPacket = {
    subject: { ownerName: "Nate West", playerName: "Sam LaPorta", position: "TE", overallPick: 41, round: 3 },
    verifiedFacts: [
      "Nate West selected Sam LaPorta (TE) at pick 41, round 3.",
      "This is the earliest a tight end has ever been drafted in this league.",
    ],
    entities: ["Nate West", "Sam LaPorta"],
  };

  it("regenerates once after coach lane rejection and accepts second attempt", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        line: "Nate West drafted Sam LaPorta in the third round — the earliest tight end ever taken in this league.",
        premise: "This is the earliest a tight end has ever been drafted in this league.",
      }))
      .mockResolvedValueOnce(JSON.stringify({
        line: "That tight end premium forces every other manager to rethink their middle-round board.",
        premise: "Nate West selected Sam LaPorta (TE) at pick 41, round 3.",
      }));

    const telemetry = emptyRegenerationTelemetry();
    const result = await generateVoice(milestonePacket, COACH, {
      generate,
      checker: entailAlwaysNeutral,
      regenerationTelemetry: telemetry,
      enableDeterministicRegeneration: true,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0]).toContain("CORRECTION REQUIRED");
    expect(generate.mock.calls[1]![0]).not.toContain("earliest tight end");
    expect(result.accepted).toBe(true);
    expect(result.regeneration?.attempted).toBe(true);
    expect(result.regeneration?.accepted).toBe(true);
    expect(telemetry.regenerated).toBe(1);
    expect(telemetry.regeneratedAccepted).toBe(1);
  });

  it("does not regenerate entity hallucinations", async () => {
    const generate = vi.fn().mockResolvedValueOnce(JSON.stringify({
      line: "This is the next Jimmy Graham at tight end.",
      premise: "Jan Graham selected Puka Nacua (WR) at pick 130, round 10.",
    }));

    const telemetry = emptyRegenerationTelemetry();
    const result = await generateVoice(packet, COACH, {
      generate,
      checker: entailAlwaysNeutral,
      regenerationTelemetry: telemetry,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.accepted).toBe(false);
    expect(result.rejectedBy).toBe("entity");
    expect(telemetry.regenerated).toBe(0);
  });

  it("regenerates redundant Sofia receipt", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        line: "Jan Graham selected Puka Nacua (WR) at pick 130, round 10.",
        premise: "Jan Graham selected Puka Nacua (WR) at pick 130, round 10.",
      }))
      .mockResolvedValueOnce(JSON.stringify({
        line: "Jan Graham adds Puka Nacua after claiming him off waivers before the draft.",
        premise: "Jan Graham claimed Puka Nacua off waivers before the draft.",
      }));

    const result = await generateVoice(packet, SOFIA, {
      generate,
      checker: entailAlwaysEntail,
      enableDeterministicRegeneration: true,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.accepted).toBe(true);
    expect(result.line).toContain("waivers");
  });
});
