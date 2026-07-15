/**
 * Draft Moment Engine — owner identity resolution (person-first, franchise-safe).
 *
 * Resolution order per (season, teamId):
 *   1. gmTeams.ownerId  → stable person id (scope "person", key `oid:<id>`).
 *   2. Fallback via the existing resolveDraftPickOwner stack (season+teamId → gmTeams.ownerName,
 *      then team-name / cross-season continuity). If it yields a real owner:
 *        - link that owner name to a unique ownerId when one exists  → scope "person", key `oid:<id>`
 *          (so a person keyed by id in recent seasons and by name in older ones is NOT split);
 *        - else key by the resolved name                            → scope "person", key `name:<n>`.
 *   3. Ambiguous (name maps to MULTIPLE owner ids) or unresolved ("unknown") → scope "franchise".
 *
 * We never treat loose owner display-name equality as proof on its own: the fallback's evidence is
 * team-name continuity / recorded per-season ownerName (resolveDraftPickOwner `source`), and a
 * name→id link is only used when it is unique.
 */
import { eq } from "drizzle-orm";
import { buildTeamsBySeason, resolveDraftPickOwner, normalizeTeamNameForOwnerMatch, type TeamSeasonRow as RdpoRow } from "../../resolveDraftPickOwner";

const normName = (n: unknown) => String(n ?? "").toLowerCase().replace(/[.''`]/g, "").replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").trim();

export interface TeamSeasonRow {
  season: number;
  teamId: number | string;
  name: string;
  ownerName: string;
  ownerId: string;
}

export interface ResolvedOwner {
  teamId: string;
  ownerId: string | null;
  ownerName: string;
  identityScope: "person" | "franchise";
  identitySource: string;
  /** stable key for history bucketing */
  historyKey: string;
}

export interface IdentityResolver {
  resolve(season: number, teamId: number | string, fallbackName?: string, teamName?: string): ResolvedOwner;
  personRowCount: number;    // rows with a direct gmTeams.ownerId
  totalRowCount: number;
  distinctPersons: number;
}

export function buildIdentityResolver(rows: TeamSeasonRow[]): IdentityResolver {
  const bySeasonTeam = new Map<string, TeamSeasonRow>();

  const persons = new Set<string>();
  let personRowCount = 0;
  const nameToOwnerIds = new Map<string, Set<string>>(); // normName -> set of ownerIds seen with it
  for (const r of rows) {
    bySeasonTeam.set(`${r.season}|${r.teamId}`, r);
    if (r.ownerId) {
      persons.add(String(r.ownerId));
      personRowCount++;
      const k = normName(r.ownerName);
      if (k) (nameToOwnerIds.get(k) ?? nameToOwnerIds.set(k, new Set()).get(k)!).add(String(r.ownerId));
    }
  }

  // build the resolveDraftPickOwner team map once (existing stack)
  const rdpoRows: RdpoRow[] = rows.map((r) => ({ season: Number(r.season), teamId: Number(r.teamId), name: r.name, ownerName: r.ownerName, ownerId: r.ownerId || undefined }));
  const teamsBySeason = buildTeamsBySeason(rdpoRows);
  const cache = new Map<string, ResolvedOwner>();

  return {
    personRowCount,
    totalRowCount: rows.length,
    distinctPersons: persons.size,
    resolve(season, teamId, fallbackName, teamName) {
      const cacheKey = `${season}|${teamId}|${teamName ?? ""}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      const row = bySeasonTeam.get(`${season}|${teamId}`); // exact (season, teamId) only — no current-owner shadow
      let result: ResolvedOwner;

      if (row?.ownerId) {
        result = { teamId: String(teamId), ownerId: String(row.ownerId), ownerName: row.ownerName || fallbackName || String(teamId), identityScope: "person", identitySource: "gmTeams.ownerId", historyKey: `oid:${row.ownerId}` };
      } else {
        const res = resolveDraftPickOwner({ season: Number(season), teamId: Number(teamId), teamName: teamName ?? row?.name }, teamsBySeason);
        if (res.source === "unknown" || res.ownerName === "Unknown" || !res.ownerName.trim()) {
          result = { teamId: String(teamId), ownerId: null, ownerName: row?.ownerName || fallbackName || String(teamId), identityScope: "franchise", identitySource: "unresolved", historyKey: `team:${teamId}` };
        } else {
          const ids = nameToOwnerIds.get(normName(res.ownerName));
          if (ids && ids.size > 1) {
            result = { teamId: String(teamId), ownerId: null, ownerName: res.ownerName, identityScope: "franchise", identitySource: `ambiguous:name maps to ${ids.size} owner ids`, historyKey: `team:${teamId}` };
          } else if (ids && ids.size === 1) {
            const id = [...ids][0];
            result = { teamId: String(teamId), ownerId: id, ownerName: res.ownerName, identityScope: "person", identitySource: `resolveDraftPickOwner:${res.source}->ownerId`, historyKey: `oid:${id}` };
          } else {
            result = { teamId: String(teamId), ownerId: null, ownerName: res.ownerName, identityScope: "person", identitySource: `resolveDraftPickOwner:${res.source}`, historyKey: `name:${normName(res.ownerName)}` };
          }
        }
      }
      cache.set(cacheKey, result);
      return result;
    },
  };
}

/** DB loader: fetch team-season rows for a league (name included for the fallback). */
export async function loadTeamSeasonRows(db: any, gmTeams: any, leagueId: string): Promise<TeamSeasonRow[]> {
  const rows = await db.select().from(gmTeams).where(eq(gmTeams.leagueId, leagueId));
  return rows.map((t: any) => ({
    season: Number(t.season), teamId: t.teamId, name: String(t.name ?? ""),
    ownerName: String(t.ownerName ?? ""), ownerId: String(t.ownerId ?? ""),
  }));
}

export { normalizeTeamNameForOwnerMatch };
