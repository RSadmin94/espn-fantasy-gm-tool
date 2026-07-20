/**
 * Default compact Sleeper lookup — bundled into Rivals + bookmarklet.
 * Rebuild: `npx tsx scripts/generateSleeperPlayerLookup.mts`
 */
import type { CompactPlayerLookupArtifact, PlayerIdentityIndex } from "./playerIdentity";
import {
  createPlayerIdentityIndex,
  resolvePlayerIdentity,
  type PlayerIdentityQuery,
  type PlayerIdentityResult,
} from "./playerIdentity";
import {
  espnPlayerHeadshotUrl,
  extractEspnPlayerId,
  resolvePlayerHeadshotUrl,
  sleeperPlayerHeadshotUrl,
} from "./playerHeadshot";

export type PlayerHeadshotCandidateOpts = {
  /** thumb defaults ESPN-first; full HD tiles use Sleeper-first when prefer=sleeper. */
  prefer?: "espn" | "sleeper";
};

type PlayerHeadshotInput = Parameters<typeof getPlayerHeadshotUrl>[0];

function resolveHeadshotIdentity(player: PlayerHeadshotInput) {
  const espnPlayerId =
    extractEspnPlayerId(player.espnPlayerId) ||
    extractEspnPlayerId(player.espnId) ||
    extractEspnPlayerId(player.playerId) ||
    extractEspnPlayerId(player.id);
  const sleeperPlayerId =
    player.sleeperPlayerId != null && String(player.sleeperPlayerId).trim()
      ? String(player.sleeperPlayerId).trim()
      : null;
  const playerName = player.playerName ?? player.name ?? null;

  const resolved = resolvePlayerIdentityDefault({
    espnPlayerId,
    sleeperPlayerId,
    playerName,
    position: player.position ?? null,
    nflTeam: player.nflTeam ?? null,
  });

  return {
    espnResolved: resolved.espnPlayerId ?? espnPlayerId,
    sleeperResolved: resolved.sleeperPlayerId ?? sleeperPlayerId,
  };
}

function pushUnique(list: string[], url: string | null | undefined): void {
  if (url && !list.includes(url)) list.push(url);
}
import artifactJson from "./data/sleeperPlayerLookup.compact.json";

const artifact = artifactJson as CompactPlayerLookupArtifact;

let cachedIndex: PlayerIdentityIndex | null = null;

export function getPlayerIdentityArtifact(): CompactPlayerLookupArtifact {
  return artifact;
}

export function getDefaultPlayerIdentityIndex(): PlayerIdentityIndex {
  if (!cachedIndex) {
    cachedIndex = createPlayerIdentityIndex(artifact);
  }
  return cachedIndex;
}

/** Same resolver Rivals + bookmarklet call — uses the bundled compact artifact. */
export function resolvePlayerIdentityDefault(
  query: PlayerIdentityQuery,
): PlayerIdentityResult {
  return resolvePlayerIdentity(query, getDefaultPlayerIdentityIndex());
}

/**
 * Thin presentation helper: resolve identity then return ESPN-first headshot URL.
 * Returns null when neither ESPN nor Sleeper CDN can be built (caller shows initials).
 */
export function getPlayerHeadshotUrl(
  player: {
    espnPlayerId?: string | number | null;
    espnId?: string | number | null;
    playerId?: string | number | null;
    id?: string | number | null;
    sleeperPlayerId?: string | null;
    name?: string | null;
    playerName?: string | null;
    position?: string | null;
    nflTeam?: string | null;
  },
  size: "thumb" | "full" = "thumb",
): string | null {
  const espnPlayerId =
    extractEspnPlayerId(player.espnPlayerId) ||
    extractEspnPlayerId(player.espnId) ||
    extractEspnPlayerId(player.playerId) ||
    extractEspnPlayerId(player.id);
  const sleeperPlayerId =
    player.sleeperPlayerId != null && String(player.sleeperPlayerId).trim()
      ? String(player.sleeperPlayerId).trim()
      : null;
  const playerName = player.playerName ?? player.name ?? null;

  const resolved = resolvePlayerIdentityDefault({
    espnPlayerId,
    sleeperPlayerId,
    playerName,
    position: player.position ?? null,
    nflTeam: player.nflTeam ?? null,
  });

  return resolvePlayerHeadshotUrl({
    espnPlayerId: resolved.espnPlayerId ?? espnPlayerId,
    sleeperPlayerId: resolved.sleeperPlayerId ?? sleeperPlayerId,
    size,
  });
}

/**
 * Ordered CDN candidates for img onError fallback.
 * Default thumb: ESPN-first, then Sleeper thumb.
 * Full + prefer sleeper: Sleeper full (helmet background), then ESPN full.
 * Empty array → render initials placeholder.
 */
export function getPlayerHeadshotCandidates(
  player: PlayerHeadshotInput,
  size: "thumb" | "full" = "thumb",
  opts?: PlayerHeadshotCandidateOpts,
): string[] {
  const { espnResolved, sleeperResolved } = resolveHeadshotIdentity(player);
  const prefer = opts?.prefer ?? "espn";
  const list: string[] = [];

  if (prefer === "sleeper" && size === "full") {
    pushUnique(list, sleeperPlayerHeadshotUrl(sleeperResolved, { size: "full" }));
    pushUnique(list, espnPlayerHeadshotUrl(espnResolved, { w: 200, h: 145 }));
    return list;
  }

  const primary = resolvePlayerHeadshotUrl({
    espnPlayerId: espnResolved,
    sleeperPlayerId: sleeperResolved,
    size,
  });
  if (primary) list.push(primary);
  const sleeperOnly = resolvePlayerHeadshotUrl({
    espnPlayerId: null,
    sleeperPlayerId: sleeperResolved,
    size,
  });
  if (sleeperOnly && sleeperOnly !== primary) list.push(sleeperOnly);
  return list;
}

/** Test helper — clear singleton between artifact-reload tests. */
export function __resetDefaultPlayerIdentityIndexForTests(): void {
  cachedIndex = null;
}
