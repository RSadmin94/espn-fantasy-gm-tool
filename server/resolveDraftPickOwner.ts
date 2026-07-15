/**
 * Historical fantasy-team → human owner resolution for draft_picks rows,
 * using only gmTeams (and pick.teamName from rawPick / gmDraftPicks semantics).
 */

export type TeamSeasonRow = {
  season: number;
  teamId: number;
  name: string;
  ownerName: string;
  /** ESPN `{leagueId}{year}` style id when present — used for canonical ownerKey. */
  ownerId?: string;
};

/** Minimal pick shape: season + teamId + optional fantasy team display from draft row. */
export type DraftPickOwnerPickInput = {
  season: number;
  teamId: number;
  /** Fantasy team label from draft (e.g. rawPick.teamName on gmDraftPicks). */
  teamName?: string;
};

export type DraftPickOwnerResolution = {
  ownerName: string;
  source: "team_id" | "team_name" | "cross_season" | "unknown";
};

/** Same normalization as legacy draft / Owner Profiles team matching: lower, collapse spaces, trim. */
export function normalizeTeamNameForOwnerMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTeamsBySeason(rows: TeamSeasonRow[]): Map<number, TeamSeasonRow[]> {
  const m = new Map<number, TeamSeasonRow[]>();
  for (const r of rows) {
    const y = Math.floor(Number(r.season));
    if (!Number.isFinite(y)) continue;
    const list = m.get(y) ?? [];
    list.push({
      season: y,
      teamId: Number(r.teamId),
      name: String(r.name ?? ""),
      ownerName: String(r.ownerName ?? ""),
      ownerId: r.ownerId?.trim() ? r.ownerId.trim() : undefined,
    });
    m.set(y, list);
  }
  return m;
}

/**
 * For each normalized gmTeams.name (any season), pick the most frequent non-empty ownerName.
 * Ties: lexicographically smallest ownerName for stability.
 */
export function buildCrossSeasonOwnerByNormTeamName(teamsBySeason: Map<number, TeamSeasonRow[]>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const teams of teamsBySeason.values()) {
    for (const t of teams) {
      const nk = normalizeTeamNameForOwnerMatch(t.name);
      if (!nk) continue;
      const on = String(t.ownerName ?? "").trim();
      if (!on) continue;
      if (!counts.has(nk)) counts.set(nk, new Map());
      const inner = counts.get(nk)!;
      inner.set(on, (inner.get(on) ?? 0) + 1);
    }
  }
  const out = new Map<string, string>();
  for (const [nk, ownerCounts] of counts) {
    let bestOwner = "";
    let best = -1;
    for (const [o, c] of ownerCounts) {
      if (c > best || (c === best && o.localeCompare(bestOwner) < 0)) {
        best = c;
        bestOwner = o;
      }
    }
    if (bestOwner) out.set(nk, bestOwner);
  }
  return out;
}

export function parseDraftPickTeamNameFromRawPick(rawPick: string | null | undefined): string | undefined {
  if (rawPick == null || rawPick === "") return undefined;
  try {
    const raw = JSON.parse(rawPick) as Record<string, unknown>;
    const tn = String(raw.teamName ?? "").trim();
    return tn || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolution order:
 * 1. season + teamId → gmTeams.ownerName (non-empty)
 * 2. season + normalized teamName === normalized gmTeams.name → ownerName (non-empty)
 * 3. normalized fantasy team name (pick or name from step-1 row) → most common owner across seasons
 * 4. Unknown
 */
export function resolveDraftPickOwner(
  pick: DraftPickOwnerPickInput,
  teamsBySeason: Map<number, TeamSeasonRow[]>,
): DraftPickOwnerResolution {
  const season = Math.floor(Number(pick.season));
  const teamId = Number(pick.teamId);
  const seasonTeams = Number.isFinite(season) ? teamsBySeason.get(season) ?? [] : [];

  let rowById: TeamSeasonRow | undefined;
  if (Number.isFinite(teamId)) {
    rowById = seasonTeams.find((t) => t.teamId === teamId);
    const on = String(rowById?.ownerName ?? "").trim();
    if (on) return { ownerName: on, source: "team_id" };
  }

  const pickNorm = normalizeTeamNameForOwnerMatch(pick.teamName);
  if (pickNorm) {
    const rowByName = seasonTeams.find((t) => normalizeTeamNameForOwnerMatch(t.name) === pickNorm);
    const on2 = String(rowByName?.ownerName ?? "").trim();
    if (on2) return { ownerName: on2, source: "team_name" };
  }

  const cross = buildCrossSeasonOwnerByNormTeamName(teamsBySeason);
  let normKey = pickNorm;
  if (!normKey && rowById) normKey = normalizeTeamNameForOwnerMatch(rowById.name);
  if (normKey) {
    const o3 = cross.get(normKey);
    if (o3) return { ownerName: o3, source: "cross_season" };
  }

  return { ownerName: "Unknown", source: "unknown" };
}
