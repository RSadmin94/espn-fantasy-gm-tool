/**
 * Draft History V3 — canonical read path ONLY.
 *
 * Display rule: ESPN visual Draft Recap (`draft_recap_html` rows) is the sole source.
 *
 * DO NOT use for Draft History UI:
 *   - getSeasonDraftPicks (legacy: DB + mDraftDetail + combined cache, mixed sources)
 *   - trpc.espn.draftPicks (live combined-cache normalizeDraftPicks)
 *   - importSeasonDraftFromEspnApi / espn_mDraftDetail_api rows
 *
 * See docs/DRAFT_HISTORY_CANONICAL.md
 */
import { and, eq, asc } from "drizzle-orm";
import { gmDraftPicks, gmLeagueSettings, gmTeams } from "../drizzle/schema";
import { getDb } from "./db";

export const DRAFT_RECAP_HTML_SOURCE = "draft_recap_html" as const;

export type DraftRecapCanonicalPick = {
  overallPick: number;
  round: number;
  pickInRound: number;
  playerName: string;
  position: string | null;
  fantasyTeamName: string;
  nflTeam: string;
  source: typeof DRAFT_RECAP_HTML_SOURCE;
};

export type DraftRecapCanonicalBoard = {
  season: number;
  leagueId: string;
  teamCount: number;
  sourceUsed: "draft_recap_canonical";
  picks: DraftRecapCanonicalPick[];
  warnings: string[];
};

function parseRecapRaw(raw: string | null): {
  teamName: string;
  nflTeam: string;
  source: string;
} {
  if (!raw) return { teamName: "", nflTeam: "", source: "" };
  try {
    const j = JSON.parse(raw) as { source?: string; teamName?: string; nflTeam?: string; proTeam?: string };
    return {
      teamName: String(j.teamName ?? "").trim(),
      nflTeam: String(j.nflTeam ?? j.proTeam ?? "").trim(),
      source: String(j.source ?? ""),
    };
  } catch {
    return { teamName: "", nflTeam: "", source: "" };
  }
}

async function resolveTeamCount(leagueId: string, season: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [settings] = await db
    .select({ teamCount: gmLeagueSettings.teamCount })
    .from(gmLeagueSettings)
    .where(and(eq(gmLeagueSettings.leagueId, leagueId), eq(gmLeagueSettings.season, season)));
  const fromSettings = Number(settings?.teamCount ?? 0);
  if (fromSettings > 0) return fromSettings;
  const teamRows = await db
    .select({ teamId: gmTeams.teamId })
    .from(gmTeams)
    .where(and(eq(gmTeams.leagueId, leagueId), eq(gmTeams.season, season)));
  return teamRows.length;
}

function roundFromOverall(overallPick: number, teamCount: number): number {
  if (teamCount <= 0 || overallPick <= 0) return 0;
  return Math.ceil(overallPick / teamCount);
}

function pickInRoundFromOverall(overallPick: number, teamCount: number): number {
  if (teamCount <= 0 || overallPick <= 0) return 0;
  const round = roundFromOverall(overallPick, teamCount);
  return overallPick - (round - 1) * teamCount;
}

/**
 * Canonical Draft History read — `draft_recap_html` rows only, chronological order within round.
 */
export async function getDraftRecapCanonicalBoard(
  leagueId: string,
  season: number,
): Promise<DraftRecapCanonicalBoard> {
  const lid = String(leagueId).trim().slice(0, 32);
  const yr = Math.floor(season);
  const warnings: string[] = [];
  const empty: DraftRecapCanonicalBoard = {
    season: yr,
    leagueId: lid,
    teamCount: 0,
    sourceUsed: "draft_recap_canonical",
    picks: [],
    warnings: ["No database connection."],
  };

  const db = await getDb();
  if (!db) return empty;

  const teamCount = await resolveTeamCount(lid, yr);
  const rows = await db
    .select({
      overallPick: gmDraftPicks.overallPick,
      roundId: gmDraftPicks.roundId,
      roundPick: gmDraftPicks.roundPick,
      playerName: gmDraftPicks.playerName,
      position: gmDraftPicks.position,
      rawPick: gmDraftPicks.rawPick,
    })
    .from(gmDraftPicks)
    .where(and(eq(gmDraftPicks.leagueId, lid), eq(gmDraftPicks.season, yr)))
    .orderBy(asc(gmDraftPicks.overallPick));

  const recapRows = rows.filter((r) => parseRecapRaw(r.rawPick).source === DRAFT_RECAP_HTML_SOURCE);
  if (recapRows.length === 0) {
    warnings.push(
      "No draft_recap_html rows for this season. Run extension Draft Recap import — do not use mDraftDetail API for display.",
    );
    return { season: yr, leagueId: lid, teamCount, sourceUsed: "draft_recap_canonical", picks: [], warnings };
  }

  if (recapRows.length < rows.length) {
    warnings.push(
      `${rows.length - recapRows.length} non-recap row(s) in draft_picks ignored (API/legacy).`,
    );
  }

  const byOverall = new Map<number, (typeof recapRows)[number]>();
  for (const row of recapRows) {
    if (!byOverall.has(row.overallPick)) byOverall.set(row.overallPick, row);
  }

  const picks: DraftRecapCanonicalPick[] = [];
  for (const row of [...byOverall.values()].sort((a, b) => a.overallPick - b.overallPick)) {
    const parsed = parseRecapRaw(row.rawPick);
    const overallPick = row.overallPick;
    const round =
      teamCount > 0 ? roundFromOverall(overallPick, teamCount) : Math.max(1, row.roundId);
    const pickInRound =
      teamCount > 0 ? pickInRoundFromOverall(overallPick, teamCount) : row.roundPick;
    const playerName = String(row.playerName ?? "").trim();
    if (!playerName) continue;

    picks.push({
      overallPick,
      round,
      pickInRound,
      playerName,
      position: row.position,
      fantasyTeamName: parsed.teamName || "—",
      nflTeam: parsed.nflTeam,
      source: DRAFT_RECAP_HTML_SOURCE,
    });
  }

  return {
    season: yr,
    leagueId: lid,
    teamCount,
    sourceUsed: "draft_recap_canonical",
    picks,
    warnings,
  };
}
