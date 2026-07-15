/**
 * League-generic active-owner resolver (Souls v2 multi-league).
 * Derives the active managers for ANY league from its own data, and — crucially — resolves owner
 * IDENTITY across seasons. ESPN owner GUIDs are NOT stable: the same manager can have different
 * GUIDs in different seasons, which would orphan their draft history. We therefore treat the owner
 * NAME as the stable identity: every GUID that has appeared under a name is aliased to one canonical
 * key (the GUID with the most draft history), so a manager's full history links to their current seat.
 *
 * Returns:
 *   owners           - current-season active managers, keyed by canonical id, fit tier from total history
 *   allActiveKeys    - every GUID variant of the current owners (so the ledger marks them all "active")
 *   aliasToCanonical - id:${anyGuid} -> id:${canonicalGuid}  (remap ledger + pick order with this)
 */
import { sql } from "drizzle-orm";
import type { ActiveOwnerEntry } from "./activeOwners";

const FULL_FIT_MIN_PICKS = 40;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export type ResolvedOwners = {
  owners: ActiveOwnerEntry[];
  allActiveKeys: Set<string>;
  aliasToCanonical: Map<string, string>;
};

export async function resolveActiveOwnersFromLeague(args: {
  db: any;
  leagueId: string;
  season: number;
}): Promise<ResolvedOwners> {
  const { db, leagueId, season } = args;

  // Per (ownerId, name): how many draft picks that GUID has ever made in this league.
  const [hist] = (await db.execute(sql`
    SELECT t.ownerId, t.ownerName, COUNT(dp.overallPick) AS picks
    FROM teams t
    LEFT JOIN draft_picks dp ON dp.leagueId = t.leagueId AND dp.season = t.season AND dp.teamId = t.teamId
    WHERE t.leagueId = ${leagueId} AND t.ownerId IS NOT NULL AND t.ownerId <> ''
    GROUP BY t.ownerId, t.ownerName
  `)) as unknown as [Array<{ ownerId: unknown; ownerName: unknown; picks: unknown }>];

  // Group every GUID by normalized owner name.
  const byName = new Map<string, { name: string; guids: Array<{ guid: string; picks: number }>; totalPicks: number }>();
  for (const r of hist) {
    const guid = String(r.ownerId);
    const name = String(r.ownerName ?? "").trim();
    if (!guid || !name) continue;
    const key = norm(name);
    const entry = byName.get(key) ?? { name, guids: [], totalPicks: 0 };
    entry.guids.push({ guid, picks: Number(r.picks) || 0 });
    entry.totalPicks += Number(r.picks) || 0;
    byName.set(key, entry);
  }

  // Current-season active managers.
  const [current] = (await db.execute(sql`
    SELECT DISTINCT t.ownerId, t.ownerName
    FROM teams t
    WHERE t.leagueId = ${leagueId} AND t.season = ${season} AND t.ownerId IS NOT NULL AND t.ownerId <> ''
  `)) as unknown as [Array<{ ownerId: unknown; ownerName: unknown }>];

  const owners: ActiveOwnerEntry[] = [];
  const allActiveKeys = new Set<string>();
  const aliasToCanonical = new Map<string, string>();
  const seenCanonical = new Set<string>();

  for (const r of current) {
    const name = String(r.ownerName ?? "").trim();
    const nameKey = norm(name);
    const grp = byName.get(nameKey);
    const guids = grp?.guids ?? [{ guid: String(r.ownerId), picks: 0 }];
    // Canonical GUID = the one with the most draft history (links the fullest tendency signal).
    const canonicalGuid = [...guids].sort((a, b) => b.picks - a.picks)[0]!.guid;
    const canonicalKey = `id:${canonicalGuid}`;
    if (seenCanonical.has(canonicalKey)) continue;
    seenCanonical.add(canonicalKey);

    for (const g of guids) {
      const k = `id:${g.guid}`;
      allActiveKeys.add(k);
      aliasToCanonical.set(k, canonicalKey);
    }

    owners.push({
      profileOwnerKey: canonicalKey,
      displayName: name || canonicalGuid,
      memberGuid: canonicalGuid,
      lastSeenSeason: season,
      personalityFitTier: (grp?.totalPicks ?? 0) >= FULL_FIT_MIN_PICKS ? "full" : "shrinkage_cold",
    });
  }

  return { owners, allActiveKeys, aliasToCanonical };
}
