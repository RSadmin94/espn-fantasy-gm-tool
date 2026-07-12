/**
 * Player-registry oracle — resolves player mentions from commentary text using gm_player_registry.
 *
 * Resolution hierarchy:
 * 1. Exact normalized full-name match
 * 2. Exact normalized alias (suffix-stripped variant)
 * 3. First-initial + surname when globally unambiguous
 * 4. Surname-only when globally unambiguous
 * 5. Otherwise ambiguous/unresolved — ignored (not a violation)
 *
 * Load once → immutable index → validate many lines (no per-line DB access).
 */
import { gmPlayerRegistry } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { normalizePlayerName } from "../../playerStatsTypes";
import { PLAYER_REGISTRY_SEED } from "./playerRegistrySeed";

export type RegistryPlayer = {
  playerId: string;
  fullName: string;
  normalizedName: string;
};

export type MentionConfidence = "exact" | "alias" | "initial_surname" | "surname";

export type ResolvedPlayerMention = {
  playerId: string;
  canonicalName: string;
  matchedText: string;
  start: number;
  end: number;
  confidence: MentionConfidence;
};

export type AmbiguousMention = {
  matchedText: string;
  start: number;
  end: number;
  candidatePlayerIds: string[];
  reason: string;
};

export type MentionResolutionResult = {
  resolved: ResolvedPlayerMention[];
  ambiguous: AmbiguousMention[];
};

export type OracleSource = "db" | "seed";

export interface PlayerRegistryOracle {
  readonly source: OracleSource;
  readonly playerCount: number;
  resolveMentions(text: string): MentionResolutionResult;
  lookupPlayer(playerId: string): RegistryPlayer | undefined;
  lookupByNormalizedName(normalizedName: string): RegistryPlayer | undefined;
}

type PlayerIndex = {
  players: Map<string, RegistryPlayer>;
  byNormalizedFull: Map<string, string>;
  byAlias: Map<string, string>;
  bySurname: Map<string, string[]>;
  byInitialSurname: Map<string, string[]>;
};

type TextToken = {
  raw: string;
  clean: string;
  start: number;
  end: number;
  clauseInitial: boolean;
};

const NAME_WORD = /^[A-Z][A-Za-z]*(?:['\u2019]s)?$|^[A-Z][A-Za-z]*-[A-Z][A-Za-z]+(?:['\u2019]s)?$|^[A-Z]\.$/;

function stripPossessive(s: string): string {
  return s.replace(/['\u2019]s$/i, "");
}

function cleanMentionToken(raw: string): string {
  let t = raw.replace(/^[^A-Za-z0-9]+/, "");
  if (/^[A-Z]\./.test(t)) {
    const initial = t.match(/^[A-Z]\./)?.[0] ?? t;
    return stripPossessive(initial);
  }
  t = t.replace(/[^A-Za-z0-9]+$/, "");
  return stripPossessive(t);
}

function surnameOf(normalizedFull: string): string {
  const parts = normalizedFull.split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function buildIndex(players: readonly RegistryPlayer[]): PlayerIndex {
  const index: PlayerIndex = {
    players: new Map(),
    byNormalizedFull: new Map(),
    byAlias: new Map(),
    bySurname: new Map(),
    byInitialSurname: new Map(),
  };

  const push = (map: Map<string, string[]>, key: string, playerId: string) => {
    const list = map.get(key) ?? [];
    if (!list.includes(playerId)) list.push(playerId);
    map.set(key, list);
  };

  for (const player of players) {
    if (!player.playerId || !player.fullName || !player.normalizedName) continue;
    index.players.set(player.playerId, { ...player });

    const claim = (key: string, alias = false) => {
      if (!key) return;
      if (alias) {
        if (!index.byAlias.has(key)) index.byAlias.set(key, player.playerId);
        return;
      }
      if (!index.byNormalizedFull.has(key)) index.byNormalizedFull.set(key, player.playerId);
    };

    claim(player.normalizedName);
    const alias = normalizePlayerName(player.fullName.replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, ""));
    if (alias && alias !== player.normalizedName) claim(alias, true);

    const sur = surnameOf(player.normalizedName);
    if (sur.length >= 2) push(index.bySurname, sur, player.playerId);

    const parts = player.normalizedName.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      const initial = parts[0]![0];
      const last = parts[parts.length - 1]!;
      if (initial && last) push(index.byInitialSurname, `${initial}|${last}`, player.playerId);
    }
  }

  return index;
}

function tokenizeForMentions(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  for (const clause of text.split(/(?<=[.!?:;])\s+/)) {
    const clauseOffset = text.indexOf(clause);
    const words = clause.split(/\s+/);
    let cursor = 0;
    words.forEach((raw, idx) => {
      const localStart = clause.indexOf(raw, cursor);
      cursor = localStart + raw.length;
      const start = clauseOffset + localStart;
      const end = start + raw.length;
      const clean = cleanMentionToken(raw);
      tokens.push({ raw, clean, start, end, clauseInitial: idx === 0 });
    });
  }
  return tokens;
}

function spanText(tokens: TextToken[], startIdx: number, length: number): string {
  return tokens.slice(startIdx, startIdx + length).map((t) => t.clean).join(" ");
}

function spanRange(tokens: TextToken[], startIdx: number, length: number): { start: number; end: number; matchedText: string } {
  const slice = tokens.slice(startIdx, startIdx + length);
  const matchedText = textRaw(slice);
  return { start: slice[0]!.start, end: slice[slice.length - 1]!.end, matchedText };
}

function textRaw(tokens: TextToken[]): string {
  return tokens.map((t) => t.raw).join(" ").replace(/[.!?,;:]+$/, "");
}

function isMentionStarter(token: TextToken): boolean {
  if (token.clauseInitial) return false;
  if (!token.clean) return false;
  if (/^[A-Z]\.$/.test(token.clean)) return true;
  if (token.clean.length < 2) return false;
  if (/['\u2019]/.test(token.clean)) return false;
  if (!NAME_WORD.test(token.clean)) return false;
  if (/^[A-Z]+$/.test(token.clean)) return false; // acronyms
  return true;
}

function isMentionContinuation(token: TextToken): boolean {
  if (!token.clean) return false;
  if (/['\u2019]/.test(token.clean)) return false;
  return NAME_WORD.test(token.clean);
}

function uniqueOrNull(ids: string[]): string | null {
  return ids.length === 1 ? ids[0]! : null;
}

function resolveSpan(
  index: PlayerIndex,
  spanNorm: string,
  tokens: TextToken[],
  startIdx: number,
  length: number,
): ResolvedPlayerMention | AmbiguousMention | null {
  const range = spanRange(tokens, startIdx, length);
  const parts = spanNorm.split(" ").filter(Boolean);

  const exactId = index.byNormalizedFull.get(spanNorm) ?? index.byAlias.get(spanNorm);
  if (exactId) {
    const p = index.players.get(exactId)!;
    return {
      playerId: p.playerId,
      canonicalName: p.fullName,
      matchedText: range.matchedText,
      start: range.start,
      end: range.end,
      confidence: index.byAlias.get(spanNorm) ? "alias" : "exact",
    };
  }

  if (parts.length === 2) {
    const firstTok = tokens[startIdx]!.clean;
    if (/^[A-Z]\.$/.test(firstTok)) {
      const key = `${firstTok[0]!.toLowerCase()}|${parts[1]}`;
      const ids = index.byInitialSurname.get(key) ?? [];
      const id = uniqueOrNull(ids);
      if (id) {
        const p = index.players.get(id)!;
        return {
          playerId: p.playerId,
          canonicalName: p.fullName,
          matchedText: range.matchedText,
          start: range.start,
          end: range.end,
          confidence: "initial_surname",
        };
      }
      if (ids.length > 1) {
        return {
          matchedText: range.matchedText,
          start: range.start,
          end: range.end,
          candidatePlayerIds: ids,
          reason: "ambiguous_initial_surname",
        };
      }
    }
  }

  if (parts.length === 1) {
    const ids = index.bySurname.get(parts[0]!) ?? [];
    const id = uniqueOrNull(ids);
    if (id) {
      const p = index.players.get(id)!;
      return {
        playerId: p.playerId,
        canonicalName: p.fullName,
        matchedText: range.matchedText,
        start: range.start,
        end: range.end,
        confidence: "surname",
      };
    }
    if (ids.length > 1) {
      return {
        matchedText: range.matchedText,
        start: range.start,
        end: range.end,
        candidatePlayerIds: ids,
        reason: "ambiguous_surname",
      };
    }
  }

  return null;
}

function resolveMentionsFromIndex(index: PlayerIndex, text: string): MentionResolutionResult {
  const tokens = tokenizeForMentions(text);
  const resolved: ResolvedPlayerMention[] = [];
  const ambiguous: AmbiguousMention[] = [];
  const consumed = new Set<number>();

  const candidates: { startIdx: number; length: number; spanNorm: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isMentionStarter(tokens[i]!)) continue;
    for (let len = Math.min(4, tokens.length - i); len >= 1; len--) {
      const slice = tokens.slice(i, i + len);
      if (!slice.every((t, j) => (j === 0 ? isMentionStarter(t) : isMentionContinuation(t)))) continue;
      const spanNorm = normalizePlayerName(spanText(tokens, i, len));
      if (!spanNorm) continue;
      candidates.push({ startIdx: i, length: len, spanNorm });
    }
  }

  candidates.sort((a, b) => b.length - a.length || a.startIdx - b.startIdx);

  for (const cand of candidates) {
    const idxs = Array.from({ length: cand.length }, (_, j) => cand.startIdx + j);
    if (idxs.some((j) => consumed.has(j))) continue;

    const outcome = resolveSpan(index, cand.spanNorm, tokens, cand.startIdx, cand.length);
    if (!outcome) continue;

    if ("candidatePlayerIds" in outcome) {
      ambiguous.push(outcome);
      idxs.forEach((j) => consumed.add(j));
      continue;
    }

    resolved.push(outcome);
    idxs.forEach((j) => consumed.add(j));
  }

  return { resolved, ambiguous };
}

export function buildPlayerRegistryOracle(
  players: readonly RegistryPlayer[],
  source: OracleSource = "seed",
): PlayerRegistryOracle {
  const index = buildIndex(players);
  const frozen = Object.freeze([...players]);

  return Object.freeze({
    source,
    playerCount: index.players.size,
    resolveMentions(text: string) {
      return resolveMentionsFromIndex(index, text);
    },
    lookupPlayer(playerId: string) {
      return index.players.get(playerId);
    },
    lookupByNormalizedName(normalizedName: string) {
      const id = index.byNormalizedFull.get(normalizedName) ?? index.byAlias.get(normalizedName);
      return id ? index.players.get(id) : undefined;
    },
  });
}

export const DEFAULT_PLAYER_REGISTRY_ORACLE = buildPlayerRegistryOracle(PLAYER_REGISTRY_SEED, "seed");

let cachedOracle: PlayerRegistryOracle | null = null;

export function getCachedPlayerRegistryOracle(): PlayerRegistryOracle | null {
  return cachedOracle;
}

export function resetPlayerRegistryOracleCache(): void {
  cachedOracle = null;
}

/** Load oracle from gm_player_registry; falls back to embedded seed with observable logging. */
export async function loadPlayerRegistryOracleFromDb(): Promise<PlayerRegistryOracle> {
  if (cachedOracle) return cachedOracle;

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[player-registry oracle] DB unavailable — using embedded seed fallback");
      cachedOracle = DEFAULT_PLAYER_REGISTRY_ORACLE;
      return cachedOracle;
    }

    const rows = await db
      .select({
        id: gmPlayerRegistry.id,
        espnPlayerId: gmPlayerRegistry.espnPlayerId,
        fullName: gmPlayerRegistry.fullName,
        normalizedName: gmPlayerRegistry.normalizedName,
      })
      .from(gmPlayerRegistry);

    if (rows.length === 0) {
      console.warn("[player-registry oracle] registry empty — using embedded seed fallback");
      cachedOracle = DEFAULT_PLAYER_REGISTRY_ORACLE;
      return cachedOracle;
    }

    const players: RegistryPlayer[] = rows
      .filter((r) => r.fullName && r.normalizedName)
      .map((r) => ({
        playerId: r.espnPlayerId ?? `registry:${r.id}`,
        fullName: r.fullName,
        normalizedName: r.normalizedName,
      }));

    cachedOracle = buildPlayerRegistryOracle(players, "db");
    console.log(`[player-registry oracle] loaded ${cachedOracle.playerCount} players from gm_player_registry`);
    return cachedOracle;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[player-registry oracle] load failed (${msg}) — using embedded seed fallback`);
    cachedOracle = DEFAULT_PLAYER_REGISTRY_ORACLE;
    return cachedOracle;
  }
}
