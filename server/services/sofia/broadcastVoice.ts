/**
 * Broadcast Voice Generator — generic, personality-driven commentary pipeline.
 *
 * One engine, many voices. A PersonalityModule supplies the persona text, the commentary TYPE, and the
 * grounding ACCEPTANCE RULE for that type. The engine builds the prompt, generates (injected model),
 * and validates with the EXISTING grounding stack — unchanged. No voice-specific code lives here.
 *
 * Type-aware grounding (the keystone from the entail/neutral/contradict checker):
 *   - FACT (Sofia): must ENTAIL — fully supported.
 *   - OPINION (Coach) / SPECULATION (Roxanne): must NOT CONTRADICT — may add judgment/questions that
 *     land as "neutral", but may never contradict the facts.
 *
 * Entity/number discipline is ENFORCED by deterministic backstops (voiceGrounding.ts) that run BEFORE
 * the expensive entailment call — prompts guide, validators enforce. The ALLOWED NAMES prompt clause
 * reduces violations; the entity guard rejects the ones that slip through.
 */
import { verifyDeterministicGrounding, type EntailmentChecker, type SubjectFallback } from "./sofiaDeterministicValidation";
import type { EntityGuardViolation } from "./voiceGrounding";
import type { AmbiguousMention, PlayerRegistryOracle } from "./playerRegistryOracle";
import { checkEntityGuard, checkNumbersWithTolerance } from "./voiceGrounding";

export type CommentaryType = "FACT" | "OPINION" | "SPECULATION";

export interface FactPacket {
  subject: SubjectFallback;
  verifiedFacts: string[];
  storylines?: string[];
  entities: string[]; // the ONLY people/players any voice may mention
}

export interface PersonalityModule {
  id: string;
  name: string;
  commentaryType: CommentaryType;
  persona: string; // voice + rules, inserted at the top of the prompt
  acceptEntailment: (v: "entail" | "neutral" | "contradict") => boolean;
  frameCheck?: (line: string) => boolean; // advisory only — is the line in this voice's register?
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
  /** Internal shadow-eval diagnostics — never surfaced in user-facing commentary. */
  entityDiagnostics?: EntityGuardViolation[];
  ignoredAmbiguous?: AmbiguousMention[];
}

// Shared across every voice. The ALLOWED NAMES clause is the tightened entity constraint.
const SHARED_RULES = `HARD RULES (never break):
- Use ONLY the VERIFIED FACTS provided. Never invent a stat, number, year, or piece of history.
- You may name ONLY the people and players listed in ALLOWED NAMES. Never mention any other player, person, coach, or team — not even as a comparison ("the next ___"). If a name is not in ALLOWED NAMES, you do not know it and must not say it.
- Never present opinion or speculation as established fact.
- One or two short sentences. Fantasy football only; never cruel, never personal.

Return ONLY JSON: {"line":"<your line>","premise":"<the single verified fact you lean on>"}`;

export function buildVoicePrompt(packet: FactPacket, p: PersonalityModule): string {
  const facts = packet.verifiedFacts.map((f, i) => `${i + 1}. ${f}`).join("\n");
  const hooks = packet.storylines?.length ? `\nSTORYLINE HOOKS (grounded, optional):\n${packet.storylines.map((s) => `- ${s}`).join("\n")}` : "";
  const s = packet.subject;
  return `${p.persona}

${SHARED_RULES}

ALLOWED NAMES (the ONLY people/players you may mention): ${packet.entities.join(", ")}

VERIFIED FACTS:
${facts}${hooks}

MOMENT: ${s.ownerName} selected ${s.playerName} (${s.position}) at pick ${s.overallPick}, round ${s.round}.

Write ${p.name}'s reaction. JSON:`;
}

export async function generateVoice(
  packet: FactPacket,
  p: PersonalityModule,
  deps: { generate: (prompt: string) => Promise<string>; checker: EntailmentChecker; playerOracle?: PlayerRegistryOracle },
): Promise<VoiceResult> {
  const base = { voice: p.id, commentaryType: p.commentaryType, premise: null as string | null };
  const fail = (line: string | null, entailment: VoiceResult["entailment"], rejectedBy: VoiceResult["rejectedBy"], reason: string): VoiceResult => ({
    ...base, line, accepted: false, entityPass: false, numberPass: false, polarityPass: false,
    entailment, inFrame: null, rejectedBy, suppressReason: reason,
  });

  let raw: string;
  try { raw = await deps.generate(buildVoicePrompt(packet, p)); } catch { return fail(null, "generation_failed", "generation", "generation failed"); }

  let parsed: any;
  try { parsed = JSON.parse(raw.replace(/```json\s*|\s*```/gi, "").trim()); } catch { return fail(null, "parse_failed", "parse", "unparseable generation"); }
  const line: string | undefined = parsed?.line;
  if (typeof line !== "string" || !line.trim()) return fail(null, "parse_failed", "parse", "empty line");
  const premise: string | null = typeof parsed?.premise === "string" ? parsed.premise : null;

  const s = packet.subject;
  const groundingClaims = [`${s.ownerName} selected ${s.playerName} (${s.position}) at pick ${s.overallPick}, round ${s.round}.`, ...packet.verifiedFacts];
  const inFrame = p.frameCheck ? p.frameCheck(line) : null;

  // ── Cheap deterministic first-pass: entity -> number -> polarity. Short-circuit before entailment. ──
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

  const polarityPass = verifyDeterministicGrounding(line, groundingClaims, s).polarityPass;
  if (!polarityPass) return { ...base, line, premise, accepted: false, entityPass: true, numberPass: true, polarityPass: false, entailment: "skipped", inFrame, rejectedBy: "polarity", suppressReason: "inverted a directional fact" };

  // ── Expensive semantic pass (only runs when deterministic guards pass). ──
  const entailment = await deps.checker.check({ sentence: line, claims: groundingClaims, subject: s });
  if (!p.acceptEntailment(entailment)) {
    return { ...base, line, premise, accepted: false, entityPass: true, numberPass: true, polarityPass: true, entailment, inFrame, rejectedBy: "entailment", suppressReason: `entailment '${entailment}' fails ${p.commentaryType} grounding rule` };
  }

  return { ...base, line, premise, accepted: true, entityPass: true, numberPass: true, polarityPass: true, entailment, inFrame, rejectedBy: null, suppressReason: null };
}
