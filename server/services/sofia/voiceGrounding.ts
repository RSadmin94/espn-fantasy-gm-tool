/**
 * Voice grounding — deterministic backstops that ENFORCE the Fact Packet contract.
 *
 * Entity guard resolves player mentions via the player-registry oracle and rejects only
 * deterministically resolved, unauthorized player references.
 */
import { normalizePlayerName } from "../../playerStatsTypes";
import type { SubjectFallback } from "./sofiaDeterministicValidation";
import {
  checkDraftSlotNotation,
  licensedDraftSlotTokensInLine,
  parseDraftSlotToken,
} from "./draftSlotNotation";
import {
  DEFAULT_PLAYER_REGISTRY_ORACLE,
  type AmbiguousMention,
  type PlayerRegistryOracle,
  type ResolvedPlayerMention,
} from "./playerRegistryOracle";

export type AuthorizedPlayer = {
  playerId?: string;
  canonicalName: string;
  normalizedName: string;
};

export type EntityGuardViolation = {
  guard: "entity";
  playerId: string;
  canonicalName: string;
  matchedText: string;
  reason: "unauthorized_player_mention";
  start: number;
  end: number;
};

export type AuthorizedOwner = {
  fullName: string;
  normalizedName: string;
  firstName: string;
  surname: string;
};

export type EntityGuardResult = {
  pass: boolean;
  violations: EntityGuardViolation[];
  resolvedAuthorized: ResolvedPlayerMention[];
  ignoredAmbiguous: AmbiguousMention[];
};

/** Build authorized players (registry-backed) and owner identities from packet names. */
export function buildAuthorizedEntities(
  names: string[],
  oracle: PlayerRegistryOracle,
): { players: AuthorizedPlayer[]; owners: AuthorizedOwner[] } {
  const players: AuthorizedPlayer[] = [];
  const owners: AuthorizedOwner[] = [];
  const seenPlayer = new Set<string>();
  const seenOwner = new Set<string>();

  for (const name of names) {
    const normalized = normalizePlayerName(name);
    const registryPlayer = oracle.lookupByNormalizedName(normalized);
    if (registryPlayer && normalizePlayerName(registryPlayer.fullName) === normalized) {
      const key = registryPlayer.playerId;
      if (!seenPlayer.has(key)) {
        seenPlayer.add(key);
        players.push({
          playerId: registryPlayer.playerId,
          canonicalName: registryPlayer.fullName,
          normalizedName: registryPlayer.normalizedName,
        });
      }
      continue;
    }
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const ownerKey = normalized;
      if (!seenOwner.has(ownerKey)) {
        seenOwner.add(ownerKey);
        owners.push({
          fullName: name,
          normalizedName: normalized,
          firstName: parts[0]!,
          surname: parts[parts.length - 1]!,
        });
      }
    }
  }

  return { players, owners };
}

function isAuthorizedPlayer(
  mention: ResolvedPlayerMention,
  authorized: readonly AuthorizedPlayer[],
): boolean {
  return authorized.some(
    (a) =>
      (a.playerId != null && a.playerId === mention.playerId) ||
      normalizePlayerName(a.canonicalName) === normalizePlayerName(mention.canonicalName),
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function spansOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Owner full names in the line are authorized spans — skip player resolution inside them. */
function findOwnerNameSpans(line: string, owners: readonly AuthorizedOwner[]): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  for (const owner of owners) {
    const pattern = owner.fullName.trim().split(/\s+/).map(escapeRegex).join("\\s+");
    const re = new RegExp(`\\b${pattern}\\b`, "gi");
    for (const m of line.matchAll(re)) {
      if (m.index != null) spans.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return spans;
}

/** Owner surnames in authorized owner names must not resolve to unrelated NFL players. */
function isAuthorizedOwnerMention(
  line: string,
  mention: ResolvedPlayerMention,
  owners: readonly AuthorizedOwner[],
): boolean {
  const mentionNorm = normalizePlayerName(mention.matchedText);
  const lineNorm = normalizePlayerName(line);

  for (const owner of owners) {
    if (lineNorm.includes(owner.normalizedName)) return true;

    const ownerSurnameNorm = normalizePlayerName(owner.surname);
    if (mentionNorm !== ownerSurnameNorm && !ownerSurnameNorm.endsWith(mentionNorm)) continue;

    const before = line.slice(Math.max(0, mention.start - owner.firstName.length - 4), mention.start);
    if (new RegExp(`${escapeRegex(owner.firstName)}\\s*$`, "i").test(before)) {
      return true;
    }

    const possessive = new RegExp(`\\b${escapeRegex(owner.firstName)}['\u2019]s\\s+`, "i");
    if (possessive.test(line.slice(Math.max(0, mention.start - 20), mention.start + 4))) {
      return true;
    }
  }
  return false;
}

/** Idiomatic phrases that contain player-like tokens but are not player references. */
function isIdiomaticNonPlayerPhrase(line: string, mention: ResolvedPlayerMention): boolean {
  const window = line.slice(Math.max(0, mention.start - 8), mention.end + 16).toLowerCase();
  if (/\bhall\s+of\s+fame\b/.test(window)) return true;
  return false;
}

/**
 * Resolve player mentions and reject only deterministically identified, unauthorized players.
 * Ambiguous surname collisions are ignored — not treated as violations.
 */
export function checkEntityGuard(
  line: string,
  allowedNames: string[],
  oracle: PlayerRegistryOracle = DEFAULT_PLAYER_REGISTRY_ORACLE,
): EntityGuardResult {
  const { players, owners } = buildAuthorizedEntities(allowedNames, oracle);
  const { resolved, ambiguous } = oracle.resolveMentions(line);
  const ownerSpans = findOwnerNameSpans(line, owners);

  const violations: EntityGuardViolation[] = [];
  const resolvedAuthorized: ResolvedPlayerMention[] = [];

  for (const mention of resolved) {
    if (ownerSpans.some((span) => spansOverlap(span, mention))) {
      continue;
    }
    if (isAuthorizedPlayer(mention, players)) {
      resolvedAuthorized.push(mention);
      continue;
    }
    if (isAuthorizedOwnerMention(line, mention, owners)) {
      continue;
    }
    if (isIdiomaticNonPlayerPhrase(line, mention)) {
      continue;
    }
    if (mention.confidence === "surname") {
      const mentionNorm = normalizePlayerName(mention.matchedText);
      const ownerSurnameHit = owners.some((o) => normalizePlayerName(o.surname) === mentionNorm);
      const authPlayerSurnameHit = players.some((p) => {
        const parts = normalizePlayerName(p.canonicalName).split(" ");
        return parts[parts.length - 1] === mentionNorm;
      });
      if (ownerSurnameHit && !authPlayerSurnameHit) {
        continue;
      }
    }
    violations.push({
      guard: "entity",
      playerId: mention.playerId,
      canonicalName: mention.canonicalName,
      matchedText: mention.matchedText,
      reason: "unauthorized_player_mention",
      start: mention.start,
      end: mention.end,
    });
  }

  return {
    pass: violations.length === 0,
    violations,
    resolvedAuthorized,
    ignoredAmbiguous: ambiguous,
  };
}

/** @deprecated Use checkEntityGuard — retained for transitional callers/tests. */
export function disallowedEntities(
  line: string,
  allowedNames: string[],
  oracle: PlayerRegistryOracle = DEFAULT_PLAYER_REGISTRY_ORACLE,
): string[] {
  return checkEntityGuard(line, allowedNames, oracle).violations.map((v) => v.matchedText);
}

// ── Numeric tolerance guard ──────────────────────────────────────────────────────────────────────

const HEDGE_WORDS = ["nearly","about","around","almost","roughly","approximately","close to","just about","a little over","a little under","just over","just under","over","under","~"];

export function licensedNumbers(claims: string[], subject: SubjectFallback): Set<string> {
  const s = new Set<string>();
  for (const m of claims.join(" ").matchAll(/\d+(?:\.\d+)?/g)) s.add(m[0]);
  s.add(String(subject.overallPick));
  s.add(String(subject.round));
  return s;
}

export function checkNumbersWithTolerance(line: string, claims: string[], subject: SubjectFallback): { pass: boolean; invented: string[] } {
  const licensed = licensedNumbers(claims, subject);
  const licensedNums = [...licensed].map(Number).filter((n) => !Number.isNaN(n));
  const teamCount = subject.teamCount ?? 14;
  const slotTokens = licensedDraftSlotTokensInLine(line, subject, claims, teamCount);
  const invented: string[] = [];
  const lower = line.toLowerCase();
  for (const m of line.matchAll(/(?<![A-Za-z-])\d+(?:\.\d+)?/g)) {
    const hStr = m[0];
    const idx = m.index ?? 0;
    if (licensed.has(hStr)) continue;
    if ([...slotTokens].some((tok) => line.slice(idx, idx + tok.length) === tok || hStr === tok)) continue;
    if (parseDraftSlotToken(hStr)) {
      const slotCheck = checkDraftSlotNotation(line, subject, claims, teamCount);
      if (!slotCheck.pass && slotCheck.violations.includes(hStr)) {
        invented.push(hStr);
        continue;
      }
      if (slotCheck.pass) continue;
    }
    if (/\b(week|round|day|quarter|half)\s+$/.test(lower.slice(Math.max(0, idx - 10), idx))) continue;
    const H = Number(hStr);
    const after = line.slice(idx + hStr.length, idx + hStr.length + 8);
    const isPct = after.trimStart().startsWith("%") || /^\s*percent/i.test(after);
    const hedged = HEDGE_WORDS.some((h) => lower.slice(Math.max(0, idx - 24), idx).includes(h));
    const decH = (hStr.split(".")[1] || "").length;
    const ok = licensedNums.some((M) => {
      if ((H < 0) !== (M < 0)) return false;
      if (decH > (String(M).split(".")[1] || "").length) return false;
      if (isPct) return Math.abs(H - M) <= 1;
      if (!hedged) return false;
      return Math.abs(H - M) <= Math.max(1, 0.05 * Math.abs(M));
    });
    if (!ok) invented.push(hStr);
  }
  return { pass: invented.length === 0, invented };
}

// ── Round reference guard ─────────────────────────────────────────────────────────────────────────

const ROUND_ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
  seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
};

const ORDINAL_WORDS = Object.keys(ROUND_ORDINALS).join("|");

function licensedRounds(claims: string[], subject: SubjectFallback): Set<number> {
  const rounds = new Set<number>([subject.round]);
  for (const m of claims.join(" ").matchAll(/\bround\s+(\d{1,2})\b/gi)) {
    rounds.add(Number(m[1]));
  }
  for (const m of claims.join(" ").matchAll(new RegExp(`\\b(${ORDINAL_WORDS})\\b`, "gi"))) {
    const n = ROUND_ORDINALS[m[1]!.toLowerCase()];
    if (n) rounds.add(n);
  }
  return rounds;
}

function extractRoundReferences(line: string): number[] {
  const refs: number[] = [];
  const lower = line.toLowerCase();
  for (const m of lower.matchAll(new RegExp(`\\b(${ORDINAL_WORDS})[-\\s]+round\\b`, "g"))) {
    const n = ROUND_ORDINALS[m[1]!];
    if (n) refs.push(n);
  }
  for (const m of lower.matchAll(/\bround\s+(\d{1,2})\b/g)) {
    refs.push(Number(m[1]));
  }
  for (const m of lower.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)[-\s]*round\b/g)) {
    refs.push(Number(m[1]));
  }
  for (const m of lower.matchAll(new RegExp(`\\bin\\s+the\\s+(${ORDINAL_WORDS})\\b`, "g"))) {
    const n = ROUND_ORDINALS[m[1]!];
    if (n) refs.push(n);
  }
  return refs;
}

/** Reject round labels in the line that contradict the moment's licensed round(s). */
export function checkRoundReferences(
  line: string,
  subject: SubjectFallback,
  claims: string[],
): { pass: boolean; mismatches: string[] } {
  const licensed = licensedRounds(claims, subject);
  const mismatches: string[] = [];
  for (const r of extractRoundReferences(line)) {
    if (!licensed.has(r)) mismatches.push(String(r));
  }
  return { pass: mismatches.length === 0, mismatches };
}

// ── Unsupported factual anchors (opinion/speculation) ───────────────────────────────────────────

const MEDICAL_RE = /\b(injur(?:y|ies|ed)|acl|torn|rehab|concussion|hurt|medical|hamstring|sprain|surgery|out for)\b/i;

export function checkUnsupportedFactualAnchors(
  line: string,
  claims: string[],
  commentaryType: "FACT" | "OPINION" | "SPECULATION",
): { pass: boolean; reason: string | null } {
  if (commentaryType === "FACT") return { pass: true, reason: null };
  if (!MEDICAL_RE.test(line)) return { pass: true, reason: null };
  const claimsText = claims.join(" ");
  if (MEDICAL_RE.test(claimsText)) return { pass: true, reason: null };
  return { pass: false, reason: "unsupported injury/medical claim" };
}

function normalizeAnchor(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Opinion/speculation premise must anchor to a verified fact. */
export function checkPremiseAnchored(
  premise: string | null,
  claims: string[],
): { pass: boolean } {
  if (!premise?.trim()) return { pass: false };
  const p = normalizeAnchor(premise);
  if (p.length < 8) return { pass: false };
  for (const c of claims) {
    const n = normalizeAnchor(c);
    if (n.includes(p) || p.includes(n)) return { pass: true };
    const pWords = p.split(" ").filter((w) => w.length > 3);
    const matched = pWords.filter((w) => n.includes(w)).length;
    if (pWords.length >= 3 && matched / pWords.length >= 0.6) return { pass: true };
  }
  return { pass: false };
}

const VALUE_HOOK_RE = /record|earliest|latest|fell|ahead|behind|past adp|championship|dynasty|keeper|rivalry|league.?first|milestone|history|ever been|never been|clinch/i;

function normalizeReceiptText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** When extra verified facts exist, Sofia must not deliver a bare pick receipt alone. */
export function checkSofiaAddsValue(
  line: string,
  packet: { verifiedFacts: string[]; storylines?: string[]; subject: SubjectFallback },
): { pass: boolean; reason: string | null } {
  const extraFacts = packet.verifiedFacts.length > 1;
  const hasStorylines = (packet.storylines?.length ?? 0) > 0;
  if (!extraFacts && !hasStorylines) return { pass: true, reason: null };

  if (VALUE_HOOK_RE.test(line)) return { pass: true, reason: null };

  const baseNorm = normalizeReceiptText(packet.verifiedFacts[0] ?? "");
  const lineNorm = normalizeReceiptText(line);

  const hasExtraContent = packet.verifiedFacts.slice(1).some((f) => {
    const factNorm = normalizeReceiptText(f);
    const distinctive = factNorm.split(" ").filter((w) => w.length > 3 && !baseNorm.includes(w));
    return distinctive.some((w) => lineNorm.includes(w));
  });
  if (hasExtraContent) return { pass: true, reason: null };

  if (hasStorylines) {
    const hookHit = packet.storylines!.some((h) => lineNorm.includes(normalizeReceiptText(h).slice(0, 12)));
    if (hookHit) return { pass: true, reason: null };
  }

  const lineWords = lineNorm.split(" ").filter((w) => w.length > 3);
  const overlap = lineWords.length > 0
    ? lineWords.filter((w) => baseNorm.includes(w)).length / lineWords.length
    : 0;
  if (overlap >= 0.75 && /\bselected\b/.test(lineNorm)) {
    return { pass: false, reason: "redundant receipt — lead with storyline or milestone fact" };
  }
  return { pass: true, reason: null };
}

const MILESTONE_RE =
  /\b(record|earliest|latest|first time|never been|league.?first|milestone|history|clinch|championship|keeper|dynasty|fell|ahead of adp|behind adp|adp)\b/i;

const COACH_RECORD_RECITE_RE = [
  /\bleague\s+record\b/i,
  /\bearliest\b/i,
  /\bfirst\s+time\b/i,
  /\bnever\s+been\b/i,
  /\bmade\s+history\b/i,
  /\bever\s+(been|drafted|taken|selected)\b/i,
  /\bmost\s+\w+\s+ever\b/i,
];

/** Coach must react — not restate verified milestones Sofia already reported. */
export function checkCoachLaneProtection(
  line: string,
  packet: { verifiedFacts: string[] },
): { pass: boolean; reason: string | null } {
  const milestoneFacts = packet.verifiedFacts.filter((f) => MILESTONE_RE.test(f));
  if (milestoneFacts.length === 0) return { pass: true, reason: null };

  const lineNorm = normalizeReceiptText(line);
  const hasRecordRecitation = COACH_RECORD_RECITE_RE.some((re) => re.test(line));
  if (hasRecordRecitation) {
    return { pass: false, reason: "coach restated verified milestone — react with consequence or strategy" };
  }

  for (const fact of milestoneFacts) {
    const factNorm = normalizeReceiptText(fact);
    const factWords = factNorm.split(" ").filter((w) => w.length > 3);
    if (factWords.length < 3) continue;
    const overlap = factWords.filter((w) => lineNorm.includes(w)).length / factWords.length;
    if (overlap >= 0.65) {
      return { pass: false, reason: "coach restated verified milestone — react with consequence or strategy" };
    }
  }
  return { pass: true, reason: null };
}
