/**
 * Voice grounding — deterministic backstops that ENFORCE the Fact Packet contract.
 *
 * Entity guard resolves player mentions via the player-registry oracle and rejects only
 * deterministically resolved, unauthorized player references.
 */
import { normalizePlayerName } from "../../playerStatsTypes";
import type { SubjectFallback } from "./sofiaDeterministicValidation";
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

export type EntityGuardResult = {
  pass: boolean;
  violations: EntityGuardViolation[];
  resolvedAuthorized: ResolvedPlayerMention[];
  ignoredAmbiguous: AmbiguousMention[];
};

function normOwnerToken(tok: string): string {
  return tok.replace(/[\u2019']s$/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Build authorized players (registry-backed) and owner token allowlist from packet names. */
export function buildAuthorizedEntities(
  names: string[],
  oracle: PlayerRegistryOracle,
): { players: AuthorizedPlayer[]; ownerTokens: Set<string> } {
  const players: AuthorizedPlayer[] = [];
  const ownerTokens = new Set<string>();
  const seenPlayer = new Set<string>();

  for (const name of names) {
    const normalized = normalizePlayerName(name);
    const registryPlayer = oracle.lookupByNormalizedName(normalized);
    if (registryPlayer) {
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
    for (const tok of name.split(/\s+/)) {
      const n = normOwnerToken(tok);
      if (n.length >= 2) ownerTokens.add(n);
    }
  }

  return { players, ownerTokens };
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

/**
 * Resolve player mentions and reject only deterministically identified, unauthorized players.
 * Ambiguous surname collisions are ignored — not treated as violations.
 */
export function checkEntityGuard(
  line: string,
  allowedNames: string[],
  oracle: PlayerRegistryOracle = DEFAULT_PLAYER_REGISTRY_ORACLE,
): EntityGuardResult {
  const { players } = buildAuthorizedEntities(allowedNames, oracle);
  const { resolved, ambiguous } = oracle.resolveMentions(line);

  const violations: EntityGuardViolation[] = [];
  const resolvedAuthorized: ResolvedPlayerMention[] = [];

  for (const mention of resolved) {
    if (isAuthorizedPlayer(mention, players)) {
      resolvedAuthorized.push(mention);
      continue;
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
  const invented: string[] = [];
  const lower = line.toLowerCase();
  for (const m of line.matchAll(/(?<![A-Za-z-])\d+(?:\.\d+)?/g)) {
    const hStr = m[0];
    if (licensed.has(hStr)) continue;
    const idx = m.index ?? 0;
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
