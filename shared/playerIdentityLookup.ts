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

/** Test helper — clear singleton between artifact-reload tests. */
export function __resetDefaultPlayerIdentityIndexForTests(): void {
  cachedIndex = null;
}
