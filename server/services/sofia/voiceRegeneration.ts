/**
 * One-shot regeneration after deterministic guard rejection.
 * Terminal failures (entity, parse, generation, timeout, stale) never retry.
 */
import type { VoiceResult } from "./broadcastVoice";

export type RegenerationTelemetry = {
  regenerated: number;
  regeneratedAccepted: number;
  regeneratedRejected: number;
  finalSuppression: number;
  addedLatencyMs: number;
};

export function emptyRegenerationTelemetry(): RegenerationTelemetry {
  return {
    regenerated: 0,
    regeneratedAccepted: 0,
    regeneratedRejected: 0,
    finalSuppression: 0,
    addedLatencyMs: 0,
  };
}

/** Deterministic rejections eligible for exactly one rewrite attempt. */
export function isRegenerableRejection(
  rejectedBy: VoiceResult["rejectedBy"],
  suppressReason: string | null,
): boolean {
  if (!rejectedBy || !suppressReason) return false;
  if (rejectedBy === "entity" || rejectedBy === "generation" || rejectedBy === "parse") return false;
  if (rejectedBy === "entailment") return false;

  if (rejectedBy === "number") {
    return (
      suppressReason.startsWith("wrong round reference:") ||
      suppressReason.startsWith("invented number:")
    );
  }

  if (rejectedBy === "polarity") {
    if (suppressReason.includes("unsupported injury")) return true;
    if (suppressReason === "premise not anchored to verified facts") return true;
    if (suppressReason.includes("redundant receipt")) return true;
    if (suppressReason.includes("coach restated") || suppressReason.includes("coach lane")) return true;
    return false;
  }

  return false;
}

/** Concise correction passed to the model — never includes the rejected line. */
export function toRegenerationInstruction(
  rejectedBy: VoiceResult["rejectedBy"],
  suppressReason: string,
): string {
  if (suppressReason.includes("unsupported injury")) {
    return "Your previous response referenced an unsupported injury or medical history. Rewrite using only verified facts.";
  }
  if (suppressReason.startsWith("wrong round reference:")) {
    return "Your previous response used the wrong round number. Use only the round and pick values from VERIFIED FACTS.";
  }
  if (suppressReason.startsWith("invented number:")) {
    return "Your previous response used numbers not present in VERIFIED FACTS. Use only pick, round, and ADP values from verified facts — never draft-slot notation like 1.12.";
  }
  if (suppressReason.includes("redundant receipt")) {
    return "Your previous response restated the pick receipt without adding value. Lead with the storyline, milestone, or ADP fact from VERIFIED FACTS.";
  }
  if (suppressReason.includes("coach restated") || suppressReason.includes("coach lane")) {
    return "Your previous response restated a milestone Sofia already reported. React with why it matters — consequence, strategy, or roster implication — without repeating the record or receipt.";
  }
  if (suppressReason === "premise not anchored to verified facts") {
    return "Your previous response premise was not grounded in verified facts. Anchor your judgment to a specific verified fact in your premise field.";
  }
  if (rejectedBy === "polarity") {
    return "Your previous response failed a grounding check. Rewrite using only verified facts.";
  }
  return "Your previous response failed a grounding check. Rewrite using only verified facts.";
}

export function recordRegenerationOutcome(
  telemetry: RegenerationTelemetry | undefined,
  accepted: boolean,
  addedLatencyMs: number,
): void {
  if (!telemetry) return;
  telemetry.regenerated++;
  telemetry.addedLatencyMs += addedLatencyMs;
  if (accepted) telemetry.regeneratedAccepted++;
  else {
    telemetry.regeneratedRejected++;
    telemetry.finalSuppression++;
  }
}
