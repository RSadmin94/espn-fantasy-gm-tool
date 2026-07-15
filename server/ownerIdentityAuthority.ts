/**
 * Owner Identity Authority
 * ------------------------
 * The single source of truth for "which canonical PERSON owns this (season, teamId) row."
 * Every downstream authority (Historical Match, Head-to-Head, Championship, Legacy,
 * Owner Profiles) must resolve identity through this module and must never re-derive it.
 *
 * Encodes the eight locked Owner Identity rules:
 *   1. Blank ownerId      -> resolve via explicit mapping or exact canonical-name match; else Unresolved.
 *   2. Aliases            -> explicit registry only (never fuzzy).
 *   3. Relatives/surnames -> never merge on surname or partial name; full-name *similarity* is insufficient.
 *   4. ESPN id / SWID changes -> union two ids only via explicit registry evidence; resolves a PERSON, not an account.
 *   5. Team names         -> presentation only; identity fallback only when every stronger identifier is absent.
 *   6. Medals             -> resolve via canonical resolver; insufficient confidence -> Unresolved + diagnostics.
 *   7. Season isolation   -> (season, teamId) is the unit; teamId is never compared/merged across seasons.
 *   8. Confidence         -> every resolution carries a status + resolvedBy + evidence (no silent guesses).
 *
 * SCOPE: identity resolution only. No H2H, no match aggregation, no consumer migration.
 */

import { getDb } from "./db";
import { gmTeams } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export type ResolvedBy =
  | "espn-id"             // Rule 8: ownerId present and not aliased
  | "alias"              // Rule 2/4: explicit registry entry
  | "historical-mapping"  // Rule 1: blank id, exact full-name match to one known id'd person
  | "canonical-name"      // Rule 1: id-less person, exact unique full name
  | "team-name-fallback"  // Rule 5: identity recovered from team name only (weakest)
  | "unresolved";         // Rule 1/8: no confident mapping

export interface IdentityResolution {
  status: "resolved" | "unresolved";
  resolvedBy: ResolvedBy;
  /** Stable canonical person key: "id:{SWID}" | "name:{fullname}" | null when unresolved. */
  canonicalPersonId: string | null;
  /** Best display name for the person; null when unresolved. */
  canonicalName: string | null;
  /** Rule 8: human-readable account of HOW the match was made. */
  evidence: string;
}

// ---------------------------------------------------------------------------
// Explicit registry (Rules 2 & 4). ONLY confirmed, evidence-backed entries.
// Nothing fuzzy ever goes here. Two entries, both confirmed by the owner.
// ---------------------------------------------------------------------------

/** ESPN id -> canonical ESPN id. Same person whose ESPN identifier changed (Rule 4). */
const ID_ALIAS_REGISTRY: Readonly<Record<string, string>> = Object.freeze({
  // Jan Graham: SWID changed between 2018 and 2020. Confirmed same person.
  "{DE1D22CC-4F17-4463-B090-E06E460C5F1F}": "{F0C28C6B-C9FC-4D9E-828C-6BC9FC7D9EA8}",
});

/** Normalized full name -> canonical full name. Explicit alias only (Rules 2 & 3). */
const NAME_ALIAS_REGISTRY: Readonly<Record<string, string>> = Object.freeze({
  // "steve hibbard" (2010, id-less) is the same person as "steven hibbard" (id'd).
  "steve hibbard": "steven hibbard",
});

// ---------------------------------------------------------------------------
// Normalization. Operates on the FULL name only — never a surname or token
// subset (Rule 3). Two different full names are two different people unless an
// explicit registry entry says otherwise.
// ---------------------------------------------------------------------------

function normalizeName(raw: string | null | undefined): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeId(raw: string | null | undefined): string {
  return (raw || "").trim();
}

/** Collapse an ESPN id to its canonical id if the registry unions it (Rule 4). */
function applyIdAlias(id: string): string {
  return ID_ALIAS_REGISTRY[id] ?? id;
}

/** Collapse a full-name key to its canonical name if the registry aliases it (Rule 2). */
function applyNameAlias(nameKey: string): string {
  return NAME_ALIAS_REGISTRY[nameKey] ?? nameKey;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface OwnerRow {
  season: number;
  teamId: number;
  ownerId: string | null;
  ownerName: string | null;
  teamName: string | null;
}

export interface OwnerIdentityAuthority {
  /** Resolve a single (season, teamId) row. teamId is used ONLY to locate the row (Rule 7). */
  resolve(season: number, teamId: number): IdentityResolution;
  /** Resolve an arbitrary row object directly. */
  resolveRow(row: OwnerRow): IdentityResolution;
  /** Rule 6: resolve a medal recipient by its in-season team label. */
  resolveMedalOwner(season: number, teamLabel: string): IdentityResolution;
  /** Every distinct canonical person discovered, with how they were resolved. */
  listPersons(): Array<{ canonicalPersonId: string; canonicalName: string; resolvedBy: ResolvedBy }>;
  /** All rows resolved, for auditing. */
  resolveAll(): Array<OwnerRow & { resolution: IdentityResolution }>;
}

export async function buildOwnerIdentityAuthority(leagueId: string): Promise<OwnerIdentityAuthority> {
  const db = await getDb();
  if (!db) throw new Error("ownerIdentityAuthority: no database connection");

  const raw = await db
    .select({
      season: gmTeams.season,
      teamId: gmTeams.teamId,
      ownerId: gmTeams.ownerId,
      ownerName: gmTeams.ownerName,
      teamName: gmTeams.name,
    })
    .from(gmTeams)
    .where(eq(gmTeams.leagueId, leagueId));

  // Rule 7: a row is identified by (season, teamId). teamId<=0 is a placeholder, dropped.
  const rows: OwnerRow[] = raw.filter((r) => (r.teamId ?? 0) > 0);

  // name -> set of canonical ids (built ONLY from id-bearing rows, after id-alias collapse).
  const nameToCanonicalIds = new Map<string, Set<string>>();
  // canonical id -> best display name (latest season wins).
  const canonicalIdToName = new Map<string, { name: string; season: number }>();

  for (const r of rows) {
    const id = normalizeId(r.ownerId);
    if (!id) continue;
    const canonId = applyIdAlias(id);
    const nameKey = normalizeName(r.ownerName);
    if (nameKey) {
      if (!nameToCanonicalIds.has(nameKey)) nameToCanonicalIds.set(nameKey, new Set());
      nameToCanonicalIds.get(nameKey)!.add(canonId);
    }
    const prev = canonicalIdToName.get(canonId);
    if (!prev || r.season > prev.season) {
      canonicalIdToName.set(canonId, { name: (r.ownerName || "").trim() || nameKey, season: r.season });
    }
  }

  // Index for O(1) (season, teamId) lookup. The key encodes the season so a
  // teamId is NEVER matched outside its own season (Rule 7).
  const rowIndex = new Map<string, OwnerRow>();
  for (const r of rows) rowIndex.set(`${r.season}:${r.teamId}`, r);

  const displayForCanonId = (canonId: string): string =>
    canonicalIdToName.get(canonId)?.name || canonId;

  const titleCase = (s: string): string =>
    s.replace(/\b\w/g, (c) => c.toUpperCase());

  const unresolved = (reason: string): IdentityResolution => ({
    status: "unresolved",
    resolvedBy: "unresolved",
    canonicalPersonId: null,
    canonicalName: null,
    evidence: reason,
  });

  function resolveRow(row: OwnerRow): IdentityResolution {
    const id = normalizeId(row.ownerId);

    // ownerId present.
    if (id) {
      const canonId = applyIdAlias(id);
      if (canonId !== id) {
        return {
          status: "resolved",
          resolvedBy: "alias",
          canonicalPersonId: `id:${canonId}`,
          canonicalName: displayForCanonId(canonId),
          evidence: `ESPN id ${id} unioned to ${canonId} via explicit id-alias registry (Rule 4).`,
        };
      }
      return {
        status: "resolved",
        resolvedBy: "espn-id",
        canonicalPersonId: `id:${id}`,
        canonicalName: displayForCanonId(id),
        evidence: `Resolved by ESPN owner id ${id}.`,
      };
    }

    // ownerId blank — resolve by explicit mapping or exact full-name match (Rule 1).
    let nameKey = normalizeName(row.ownerName);
    let usedTeamName = false;
    if (!nameKey) {
      // Rule 5: team name is identity evidence only when every stronger identifier is absent.
      nameKey = normalizeName(row.teamName);
      usedTeamName = true;
    }
    if (!nameKey) return unresolved("No owner id and no usable owner/team name on this row.");

    // Rule 2: explicit name alias.
    const aliased = applyNameAlias(nameKey);
    if (aliased !== nameKey) {
      const ids = nameToCanonicalIds.get(aliased);
      if (ids && ids.size === 1) {
        const canonId = [...ids][0];
        return {
          status: "resolved",
          resolvedBy: "alias",
          canonicalPersonId: `id:${canonId}`,
          canonicalName: displayForCanonId(canonId),
          evidence: `Name "${nameKey}" aliased to "${aliased}" via explicit name-alias registry (Rule 2); "${aliased}" -> ESPN id ${canonId}.`,
        };
      }
      return {
        status: "resolved",
        resolvedBy: "alias",
        canonicalPersonId: `name:${aliased}`,
        canonicalName: titleCase(aliased),
        evidence: `Name "${nameKey}" aliased to "${aliased}" via explicit name-alias registry (Rule 2).`,
      };
    }

    // Rule 1: exact full-name match to a known id'd person -> historical mapping.
    const ids = nameToCanonicalIds.get(nameKey);
    if (ids && ids.size === 1) {
      const canonId = [...ids][0];
      return {
        status: "resolved",
        resolvedBy: usedTeamName ? "team-name-fallback" : "historical-mapping",
        canonicalPersonId: `id:${canonId}`,
        canonicalName: displayForCanonId(canonId),
        evidence: usedTeamName
          ? `No owner id/name; team name "${nameKey}" exact-matched one id'd person ${canonId} (Rule 5 fallback).`
          : `Blank owner id; full name "${nameKey}" exact-matched exactly one id'd person ${canonId} (Rule 1 historical mapping).`,
      };
    }
    if (ids && ids.size > 1) {
      // Collision not resolved by the registry -> never guess (Rule 1/8).
      return unresolved(
        `Full name "${nameKey}" maps to ${ids.size} distinct ESPN ids and no registry entry disambiguates (Rule 1/8).`,
      );
    }

    // No id ever carried this exact full name -> an id-less canonical person.
    return {
      status: "resolved",
      resolvedBy: usedTeamName ? "team-name-fallback" : "canonical-name",
      canonicalPersonId: `name:${nameKey}`,
      canonicalName: titleCase(nameKey),
      evidence: usedTeamName
        ? `No owner id/name; identity keyed by team name "${nameKey}" (Rule 5 fallback).`
        : `Blank owner id; no id ever carried "${nameKey}". Keyed as an id-less canonical person (Rule 1 canonical name).`,
    };
  }

  function resolve(season: number, teamId: number): IdentityResolution {
    const row = rowIndex.get(`${season}:${teamId}`);
    if (!row) return unresolved(`No (season ${season}, teamId ${teamId}) row exists in league ${leagueId}.`);
    return resolveRow(row);
  }

  // Rule 6: resolve a medal recipient by its in-season team label, via the same
  // canonical resolver. Insufficient confidence -> Unresolved (never silently assign).
  function resolveMedalOwner(season: number, teamLabel: string): IdentityResolution {
    const key = normalizeName(teamLabel);
    const inSeason = rows.filter((r) => r.season === season);
    const byTeamName = inSeason.filter((r) => normalizeName(r.teamName) === key);
    const byOwnerName = inSeason.filter((r) => normalizeName(r.ownerName) === key);
    const hits = byOwnerName.length ? byOwnerName : byTeamName;
    if (hits.length === 1) return resolveRow(hits[0]);
    if (hits.length === 0)
      return unresolved(`Medal: no ${season} team matched label "${teamLabel}" (Rule 6).`);
    return unresolved(`Medal: label "${teamLabel}" matched ${hits.length} ${season} teams; ambiguous (Rule 6).`);
  }

  function resolveAll(): Array<OwnerRow & { resolution: IdentityResolution }> {
    return rows.map((r) => ({ ...r, resolution: resolveRow(r) }));
  }

  function listPersons(): Array<{ canonicalPersonId: string; canonicalName: string; resolvedBy: ResolvedBy }> {
    const seen = new Map<string, { canonicalPersonId: string; canonicalName: string; resolvedBy: ResolvedBy }>();
    for (const r of rows) {
      const res = resolveRow(r);
      if (res.status !== "resolved" || !res.canonicalPersonId) continue;
      if (!seen.has(res.canonicalPersonId)) {
        seen.set(res.canonicalPersonId, {
          canonicalPersonId: res.canonicalPersonId,
          canonicalName: res.canonicalName || res.canonicalPersonId,
          resolvedBy: res.resolvedBy,
        });
      }
    }
    return [...seen.values()];
  }

  return { resolve, resolveRow, resolveMedalOwner, listPersons, resolveAll };
}
