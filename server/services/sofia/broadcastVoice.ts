/**
 * Broadcast Voice Generator — generic, personality-driven commentary pipeline.
 *
 * One engine, many voices. A PersonalityModule supplies the persona text, the commentary TYPE, and the
 * grounding ACCEPTANCE RULE for that type. The engine builds the prompt, generates (injected model),
 * and validates with the EXISTING grounding stack — unchanged. No voice-specific code lives here.
 *
 * After eligible deterministic rejections, one regeneration attempt is made with a concise correction
 * instruction. Entity, parse, generation, timeout, and stale failures are terminal.
 */
import { verifyDeterministicGrounding, type EntailmentChecker, type SubjectFallback } from "./sofiaDeterministicValidation";
import type { EntityGuardViolation } from "./voiceGrounding";
import type { AmbiguousMention, PlayerRegistryOracle } from "./playerRegistryOracle";
import { checkEntityGuard, checkNumbersWithTolerance, checkRoundReferences, checkUnsupportedFactualAnchors, checkSofiaAddsValue, checkPremiseAnchored, checkCoachLaneProtection } from "./voiceGrounding";
import {
  isRegenerableRejection,
  recordRegenerationOutcome,
  toRegenerationInstruction,
  type RegenerationTelemetry,
} from "./voiceRegeneration";

export type CommentaryType = "FACT" | "OPINION" | "SPECULATION";

export interface FactPacket {
  subject: SubjectFallback;
  verifiedFacts: string[];
  storylines?: string[];
  entities: string[];
}

export interface PersonalityModule {
  id: string;
  name: string;
  commentaryType: CommentaryType;
  persona: string;
  acceptEntailment: (v: "entail" | "neutral" | "contradict") => boolean;
  frameCheck?: (line: string) => boolean;
}

export interface VoiceResult {
  voice: string;
  commentaryType: CommentaryType;
  line: string | null;
  premise: string | null;
  accepted: boolean;
  entityPass: boolean;
  numberPass: boolean;
  polarityPass: boolean;
  entailment: "entail" | "neutral" | "contradict" | "skipped" | "generation_failed" | "parse_failed";
  inFrame: boolean | null;
  rejectedBy: "generation" | "parse" | "entity" | "number" | "polarity" | "entailment" | null;
  suppressReason: string | null;
  entityDiagnostics?: EntityGuardViolation[];
  ignoredAmbiguous?: AmbiguousMention[];
  regeneration?: {
    attempted: boolean;
    accepted: boolean;
    addedLatencyMs: number;
  };
}

const SHARED_RULES = `HARD RULES (never break):
- Use ONLY the VERIFIED FACTS provided. Never invent a stat, number, year, injury, medical history, or piece of history.
- Round and pick labels in your line MUST match VERIFIED FACTS (if the moment is round 12, never say sixth-round or round 6).
- You may name ONLY the people and players listed in ALLOWED NAMES. Never mention any other player, person, coach, or team — not even as a comparison ("the next ___"). If a name is not in ALLOWED NAMES, you do not know it and must not say it.
- Never present opinion or speculation as established fact. Your "premise" field MUST quote or closely paraphrase one VERIFIED FACT you rely on.
- One or two short sentences. Fantasy football only; never cruel, never personal.

Return ONLY JSON: {"line":"<your line>","premise":"<the single verified fact you lean on>"}`;

export function buildVoicePrompt(packet: FactPacket, p: PersonalityModule, correction?: string): string {
  const facts = packet.verifiedFacts.map((f, i) => `${i + 1}. ${f}`).join("\n");
  const hooks = packet.storylines?.length ? `\nSTORYLINE HOOKS (grounded, optional):\n${packet.storylines.map((s) => `- ${s}`).join("\n")}` : "";
  const s = packet.subject;
  const correctionBlock = correction
    ? `\nCORRECTION REQUIRED: ${correction}\nRewrite in one or two sentences. Do not repeat the mistake.\n`
    : "";
  return `${p.persona}

${SHARED_RULES}
${correctionBlock}
ALLOWED NAMES (the ONLY people/players you may mention): ${packet.entities.join(", ")}

VERIFIED FACTS:
${facts}${hooks}

MOMENT: ${s.ownerName} selected ${s.playerName} (${s.position}) at pick ${s.overallPick}, round ${s.round}.

Write ${p.name}'s reaction. JSON:`;
}

type VoiceDeps = {
  generate: (prompt: string) => Promise<string>;
  checker: EntailmentChecker;
  playerOracle?: PlayerRegistryOracle;
  regenerationTelemetry?: RegenerationTelemetry;
  /** Shadow/cert only — production live broadcast keeps this false. */
  enableDeterministicRegeneration?: boolean;
};

async function generateOnce(
  packet: FactPacket,
  p: PersonalityModule,
  deps: VoiceDeps,
  correction?: string,
): Promise<VoiceResult> {
  const base = { voice: p.id, commentaryType: p.commentaryType, premise: null as string | null };
  const fail = (line: string | null, entailment: VoiceResult["entailment"], rejectedBy: VoiceResult["rejectedBy"], reason: string): VoiceResult => ({
    ...base, line, accepted: false, entityPass: false, numberPass: false, polarityPass: false,
    entailment, inFrame: null, rejectedBy, suppressReason: reason,
  });

  let raw: string;
  try { raw = await deps.generate(buildVoicePrompt(packet, p, correction)); } catch { return fail(null, "generation_failed", "generation", "generation failed"); }

  let parsed: any;
  try { parsed = JSON.parse(raw.replace(/```json\s*|\s*```/gi, "").trim()); } catch { return fail(null, "parse_failed", "parse", "unparseable generation"); }
  const line: string | undefined = parsed?.line;
  if (typeof line !== "string" || !line.trim()) return fail(null, "parse_failed", "parse", "empty line");
  const premise: string | null = typeof parsed?.premise === "string" ? parsed.premise : null;

  const s = packet.subject;
  const groundingClaims = [`${s.ownerName} selected ${s.playerName} (${s.position}) at pick ${s.overallPick}, round ${s.round}.`, ...packet.verifiedFacts];
  const inFrame = p.frameCheck ? p.frameCheck(line) : null;

  const entity = checkEntityGuard(line, [...packet.entities, s.ownerName, s.playerName], deps.playerOracle);
  if (!entity.pass) {
    const v = entity.violations[0]!;
    return {
      ...base, line, premise, accepted: false, entityPass: false, numberPass: false, polarityPass: false,
      entailment: "skipped", inFrame, rejectedBy: "entity",
      suppressReason: `unauthorized player: ${v.canonicalName} (${v.matchedText})`,
      entityDiagnostics: entity.violations,
      ignoredAmbiguous: entity.ignoredAmbiguous,
    };
  }

  const num = checkNumbersWithTolerance(line, groundingClaims, s);
  if (!num.pass) return { ...base, line, premise, accepted: false, entityPass: true, numberPass: false, polarityPass: false, entailment: "skipped", inFrame, rejectedBy: "number", suppressReason: `invented number: ${num.invented.join(", ")}` };

  const roundRef = checkRoundReferences(line, s, groundingClaims);
  if (!roundRef.pass) return { ...base, line, premise, accepted: false, entityPass: true, numberPass: false, polarityPass: false, entailment: "skipped", inFrame, rejectedBy: "number", suppressReason: `wrong round reference: ${roundRef.mismatches.join(", ")} (licensed round ${s.round})` };

  const anchors = checkUnsupportedFactualAnchors(line, groundingClaims, p.commentaryType);
  if (!anchors.pass) return { ...base, line, premise, accepted: false, entityPass: true, numberPass: true, polarityPass: false, entailment: "skipped", inFrame, rejectedBy: "polarity", suppressReason: anchors.reason ?? "unsupported factual anchor" };

  if (p.commentaryType !== "FACT") {
    const premiseCheck = checkPremiseAnchored(premise, groundingClaims);
    if (!premiseCheck.pass) return { ...base, line, premise, accepted: false, entityPass: true, numberPass: true, polarityPass: false, entailment: "skipped", inFrame, rejectedBy: "polarity", suppressReason: "premise not anchored to verified facts" };
  }

  if (p.id === "sofia") {
    const sofiaValue = checkSofiaAddsValue(line, packet);
    if (!sofiaValue.pass) return { ...base, line, premise, accepted: false, entityPass: true, numberPass: true, polarityPass: false, entailment: "skipped", inFrame, rejectedBy: "polarity", suppressReason: sofiaValue.reason ?? "redundant receipt" };
  }

  if (p.id === "coach") {
    const coachLane = checkCoachLaneProtection(line, packet);
    if (!coachLane.pass) return { ...base, line, premise, accepted: false, entityPass: true, numberPass: true, polarityPass: false, entailment: "skipped", inFrame, rejectedBy: "polarity", suppressReason: coachLane.reason ?? "coach lane collision" };
  }

  const polarityPass = verifyDeterministicGrounding(line, groundingClaims, s).polarityPass;
  if (!polarityPass) return { ...base, line, premise, accepted: false, entityPass: true, numberPass: true, polarityPass: false, entailment: "skipped", inFrame, rejectedBy: "polarity", suppressReason: "inverted a directional fact" };

  const entailment = await deps.checker.check({ sentence: line, claims: groundingClaims, subject: s });
  if (!p.acceptEntailment(entailment)) {
    return { ...base, line, premise, accepted: false, entityPass: true, numberPass: true, polarityPass: true, entailment, inFrame, rejectedBy: "entailment", suppressReason: `entailment '${entailment}' fails ${p.commentaryType} grounding rule` };
  }

  return { ...base, line, premise, accepted: true, entityPass: true, numberPass: true, polarityPass: true, entailment, inFrame, rejectedBy: null, suppressReason: null };
}

export async function generateVoice(
  packet: FactPacket,
  p: PersonalityModule,
  deps: VoiceDeps,
): Promise<VoiceResult> {
  const first = await generateOnce(packet, p, deps);
  if (first.accepted) return first;

  if (!isRegenerableRejection(first.rejectedBy, first.suppressReason) || !deps.enableDeterministicRegeneration) {
    return first;
  }

  const instruction = toRegenerationInstruction(first.rejectedBy, first.suppressReason!);
  const regenStart = Date.now();
  const second = await generateOnce(packet, p, deps, instruction);
  const addedLatencyMs = Date.now() - regenStart;

  recordRegenerationOutcome(deps.regenerationTelemetry, second.accepted, addedLatencyMs);

  const regeneration = { attempted: true, accepted: second.accepted, addedLatencyMs };
  if (second.accepted) return { ...second, regeneration };
  return { ...second, regeneration };
}
