/**
 * Deterministic voice provider for written live broadcast (and shadow/offline checks).
 * Builds voice-separated lines from verified facts — not transaction-log restatements.
 */
import {
  composeAnalystCommentary,
  composeWrapUpCommentary,
  parseVoicePromptForCommentary,
} from "./writtenAnalystCommentary";

export function createShadowGroundedVoiceProvider(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const parsed = parseVoicePromptForCommentary(prompt);
    const result = parsed.isWrapUp
      ? composeWrapUpCommentary(parsed.voice, parsed.facts.verifiedFacts)
      : composeAnalystCommentary(parsed.voice, parsed.facts);
    return JSON.stringify({ line: result.line, premise: result.premise });
  };
}
