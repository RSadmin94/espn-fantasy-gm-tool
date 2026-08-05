import type { LeagueProviderKind } from "@/lib/leagueProvider";

export type EspnTeamRow = {
  teamId: number;
  teamName: string;
  owners: string | unknown;
};

export type ResolvedMyTeam = {
  teamId: number;
  teamName: string | null;
  ownerName: string | null;
};

export type ConnectionTeamSelection = {
  selectedTeamId?: number | null;
  selectedOwnerName?: string | null;
  selectedFranchiseName?: string | null;
};

/**
 * ESPN owner-name clue matching (unchanged behavior for provider === "espn").
 */
export function resolveMyTeamByOwnerClues(
  teams: EspnTeamRow[],
  clues: string[],
): ResolvedMyTeam | null {
  const clean = clues.map((c) => c.trim().toLowerCase()).filter((c) => c.length >= 2);
  if (!clean.length) return null;
  for (const t of teams) {
    const raw =
      typeof t.owners === "string"
        ? t.owners
        : Array.isArray(t.owners)
          ? (t.owners as unknown[]).map(String).join(";")
          : "";
    const segments = raw.split(";").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      const low = seg.toLowerCase();
      for (const clue of clean) {
        if (low === clue || low.includes(clue) || clue.includes(low)) {
          return { teamId: t.teamId, teamName: t.teamName, ownerName: seg };
        }
      }
    }
  }
  return null;
}

/**
 * Canonical "my team" for Dashboard / league context.
 *
 * - ESPN: existing name-clue resolution only (selectedTeamId ignored).
 * - Non-ESPN: selectedTeamId wins when present; otherwise fall back to clue matching
 *   on whatever team rows are available (no new provider-specific heuristics).
 */
export function resolveCanonicalMyTeam(args: {
  provider: LeagueProviderKind | null;
  connection?: ConnectionTeamSelection | null;
  espnTeams: EspnTeamRow[];
  ownerClues: string[];
}): ResolvedMyTeam | null {
  const { provider, connection, espnTeams, ownerClues } = args;

  if (provider == null) return null;

  if (provider === "espn") {
    return resolveMyTeamByOwnerClues(espnTeams, ownerClues);
  }

  const selectedTeamId = connection?.selectedTeamId;
  if (selectedTeamId != null && Number.isFinite(selectedTeamId)) {
    const franchise = connection?.selectedFranchiseName?.trim() || null;
    const owner = connection?.selectedOwnerName?.trim() || null;
    // Prefer franchise/owner labels from the connection; enrich names from team rows if present.
    const fromRows = espnTeams.find((t) => t.teamId === selectedTeamId);
    return {
      teamId: selectedTeamId,
      teamName: franchise || fromRows?.teamName || null,
      ownerName: owner || null,
    };
  }

  return resolveMyTeamByOwnerClues(espnTeams, ownerClues);
}
