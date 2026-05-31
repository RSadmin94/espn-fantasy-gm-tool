/**
 * Draft History V2 — single canonical pipeline for board + owner profiles.
 * Order: chronological pickInRound per round (from overallPick), never snake slot / stored roundPick.
 */
import { getSeasonDraftPicks } from "./historicalDataService";
import {
  buildSeasonTeamMap,
  FALLBACK_TEAM_NAME_RE,
  nflTeamFromDraftRawPick,
  parseDraftRawPick,
  pickInRoundFromOverall,
  resolveSeasonTeamCount,
  roundFromOverall,
} from "./draftBoardHelpers";
import {
  countDraftRecapHtmlRows,
  canonicalSourceLabelForSeason,
  isEspnApiDraftRawPick,
  sourcePriorityDescription,
} from "./draftPickSourcePriority";

export type CanonicalDraftPick = {
  pickInRound: number;
  overallPick: number;
  teamId: number;
  playerName: string;
  position: string | null;
  nflTeam: string;
  fantasyTeamName: string;
  ownerName: string;
  source: string;
  rawSourceId: string | null;
  confidence: "high" | "medium" | "low" | "unresolved";
  isKeeper: boolean;
  bidAmount: number;
};

export type CanonicalDraftRound = {
  round: number;
  picks: CanonicalDraftPick[];
};

export type Round1OverrideDiagRow = {
  expectedPick: number;
  expectedPlayer: string;
  expectedTeam: string;
  actualPlayerBefore: string | null;
  actualTeamBefore: string | null;
  actualPlayerAfter: string | null;
  actualTeamAfter: string | null;
  status: "matched" | "player_not_found";
};

export type CanonicalDraftDiagnostics = {
  rawRows: number;
  cleanRows: number;
  invalidRows: number;
  duplicateRows: number;
  unresolvedTeams: Array<{
    overallPick: number;
    round: number;
    pickInRound: number;
    teamId: number;
    reason: string;
  }>;
  sourceConflicts: Array<{ overallPick: number; message: string }>;
  warnings: string[];
  scrapeRowCount: number;
  apiRowCount: number;
  dataSource: string;
  round1OverrideDiag: Round1OverrideDiagRow[];
};

export type CanonicalDraftBoard = {
  season: number;
  teamCount: number;
  sourceUsed: string;
  sourcePriority: string;
  rounds: CanonicalDraftRound[];
  diagnostics: CanonicalDraftDiagnostics;
};

type ResolvedTeam = {
  fantasyTeamName: string;
  ownerName: string;
  confidence: CanonicalDraftPick["confidence"];
  teamNameSource: string;
};

function resolveFantasyTeam(
  season: number,
  teamId: number,
  rawJson: ReturnType<typeof parseDraftRawPick>,
  storedTeamName: string,
  teamMap: Map<number, { name: string; ownerName: string }>,
): ResolvedTeam {
  const isScrape = rawJson.source === "draft_recap_html";
  const isApi = rawJson.source === "espn_mDraftDetail_api";

  if (isScrape && rawJson.teamName?.trim()) {
    return {
      fantasyTeamName: rawJson.teamName.trim(),
      ownerName: rawJson.ownerName?.trim() ?? "",
      confidence: "high",
      teamNameSource: "draft_recap_html.teamName",
    };
  }

  if (rawJson.teamName?.trim() && !FALLBACK_TEAM_NAME_RE.test(rawJson.teamName)) {
    return {
      fantasyTeamName: rawJson.teamName.trim(),
      ownerName: rawJson.ownerName?.trim() ?? "",
      confidence: isScrape ? "high" : "medium",
      teamNameSource: "rawPick.teamName",
    };
  }

  if (isApi && storedTeamName.trim() && !FALLBACK_TEAM_NAME_RE.test(storedTeamName)) {
    return {
      fantasyTeamName: storedTeamName.trim(),
      ownerName: rawJson.ownerName?.trim() ?? "",
      confidence: "medium",
      teamNameSource: "api.teamName",
    };
  }

  const mapEntry = teamMap.get(teamId);
  if (mapEntry?.name && !FALLBACK_TEAM_NAME_RE.test(mapEntry.name)) {
    return {
      fantasyTeamName: mapEntry.name,
      ownerName: mapEntry.ownerName,
      confidence: "low",
      teamNameSource: "gmTeams.fallback",
    };
  }

  if (storedTeamName.trim() && !FALLBACK_TEAM_NAME_RE.test(storedTeamName)) {
    return {
      fantasyTeamName: storedTeamName.trim(),
      ownerName: "",
      confidence: "low",
      teamNameSource: "db.teamName.fallback",
    };
  }

  return {
    fantasyTeamName: `Unresolved (season ${season}, teamId ${teamId})`,
    ownerName: "",
    confidence: "unresolved",
    teamNameSource: "unresolved",
  };
}

/** Ground-truth first-pass override for 2025 Round 1 picks 1-4. Source: ESPN Draft Recap screenshot. */
const RECAP_2025_R1_OVERRIDE: Array<{ pickInRound: number; playerName: string; fantasyTeamName: string }> = [
  { pickInRound: 1, playerName: "ja'marr chase",       fantasyTeamName: "Dominus Thus" },
  { pickInRound: 2, playerName: "saquon barkley",       fantasyTeamName: "Winkstradamus" },
  { pickInRound: 3, playerName: "amon-ra st. brown",    fantasyTeamName: "TigerCommander" },
  { pickInRound: 4, playerName: "christian mccaffrey",  fantasyTeamName: "Str8FrmHell, RodZilla" },
];

function inferRowSource(raw: string, fbSource: string): string {
  const j = parseDraftRawPick(raw);
  if (j.source) return j.source;
  if (fbSource === "normalized") return "draft_picks_db";
  return fbSource;
}

export async function buildCanonicalDraftBoard(
  season: number,
  leagueId: string,
  userId?: number,
): Promise<CanonicalDraftBoard> {
  const yr = Math.floor(season);
  const fb = await getSeasonDraftPicks(yr, leagueId, userId);
  const teamCount = await resolveSeasonTeamCount(leagueId, yr, userId);
  const teamMap = await buildSeasonTeamMap(leagueId, yr, userId);
  const scrapeRowCount = await countDraftRecapHtmlRows(leagueId, yr);

  const diagnostics: CanonicalDraftDiagnostics = {
    rawRows: fb.rawCount ?? fb.count,
    cleanRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    unresolvedTeams: [],
    sourceConflicts: [],
    warnings: [],
    scrapeRowCount,
    apiRowCount: 0,
    dataSource: fb.source,
    round1OverrideDiag: [],
  };

  const empty: CanonicalDraftBoard = {
    season: yr,
    teamCount,
    sourceUsed: canonicalSourceLabelForSeason(yr, scrapeRowCount),
    sourcePriority: sourcePriorityDescription(yr),
    rounds: [],
    diagnostics,
  };

  if (fb.count === 0) {
    diagnostics.warnings.push("No draft picks in database or cache for this season.");
    if (yr === 2025 && scrapeRowCount === 0) {
      diagnostics.warnings.push("2025: ingest draft_recap_html from extension before trusting mDraftDetail API.");
    }
    return empty;
  }

  const rows = fb.rows as Record<string, unknown>[];
  let apiRowCount = 0;

  type Internal = CanonicalDraftPick & { round: number };
  const parsed: Internal[] = [];

  for (const p of rows) {
    const raw = p.rawPick != null ? String(p.rawPick) : "";
    const rawJson = parseDraftRawPick(raw);
    if (isEspnApiDraftRawPick(raw)) apiRowCount++;
    const overallPick = Number(p.overallPickNumber ?? 0);
    const storedRound = Number(p.roundId ?? 0);
    const teamId = Number(p.teamId ?? 0);
    const storedTeamName = String(p.teamName ?? "").trim();
    const source = inferRowSource(raw, fb.source);

    let round = storedRound;
    if (teamCount > 0 && overallPick > 0) {
      const computedRound = roundFromOverall(overallPick, teamCount);
      if (round <= 0) {
        round = computedRound;
        if (storedRound === 0) {
          diagnostics.warnings.push(
            `overallPick ${overallPick}: stored round 0 corrected to ${computedRound}`,
          );
        }
      } else if (round !== computedRound) {
        diagnostics.sourceConflicts.push({
          overallPick,
          message: `stored round ${round} ≠ chronological round ${computedRound} — using chronological`,
        });
        round = computedRound;
      }
    }

    const pickInRound =
      teamCount > 0 && overallPick > 0
        ? pickInRoundFromOverall(overallPick, teamCount)
        : Number(p.roundPickNumber ?? 0);

    const teamRes = resolveFantasyTeam(yr, teamId, rawJson, storedTeamName, teamMap);
    if (teamRes.confidence === "unresolved") {
      diagnostics.unresolvedTeams.push({
        overallPick,
        round,
        pickInRound,
        teamId,
        reason: teamRes.teamNameSource,
      });
    }

    const playerName = String(p.playerName ?? "").trim();
    parsed.push({
      pickInRound,
      overallPick,
      round,
      teamId,
      playerName,
      position: (p.position as string | null) ?? null,
      nflTeam: nflTeamFromDraftRawPick(raw) || String(p.proTeam ?? "").trim(),
      fantasyTeamName: teamRes.fantasyTeamName,
      ownerName: teamRes.ownerName,
      source,
      rawSourceId: raw ? raw.slice(0, 120) : null,
      confidence: teamRes.confidence,
      isKeeper: Boolean(p.keeper || p.reservedForKeeper),
      bidAmount: p.bidAmount != null ? Number(p.bidAmount) : 0,
    });
  }

  const byOverall = new Map<number, Internal>();
  for (const p of parsed) {
    if (byOverall.has(p.overallPick)) {
      diagnostics.duplicateRows++;
      diagnostics.sourceConflicts.push({
        overallPick: p.overallPick,
        message: "duplicate overallPick after getSeasonDraftPicks dedup — kept first",
      });
      continue;
    }
    byOverall.set(p.overallPick, p);
  }

  const deduped = [...byOverall.values()].sort((a, b) => a.overallPick - b.overallPick);
  const pickInRoundByRound = new Map<number, Set<number>>();
  const valid: Internal[] = [];

  for (const p of deduped) {
    if (p.overallPick <= 0 || p.round <= 0 || p.pickInRound <= 0) {
      diagnostics.invalidRows++;
      continue;
    }
    if (!p.playerName) {
      diagnostics.invalidRows++;
      continue;
    }
    if (teamCount > 0 && p.pickInRound > teamCount) {
      diagnostics.warnings.push(
        `overallPick ${p.overallPick}: pickInRound ${p.pickInRound} exceeds teamCount ${teamCount}`,
      );
    }
    const set = pickInRoundByRound.get(p.round) ?? new Set<number>();
    if (set.has(p.pickInRound)) {
      diagnostics.sourceConflicts.push({
        overallPick: p.overallPick,
        message: `duplicate pickInRound ${p.pickInRound} in round ${p.round}`,
      });
    }
    set.add(p.pickInRound);
    pickInRoundByRound.set(p.round, set);
    valid.push(p);
  }

  diagnostics.apiRowCount = apiRowCount;
  diagnostics.cleanRows = valid.length;

  // 2025 Round 1 ground-truth override: force pickInRound + fantasyTeamName for first 4 picks
  if (yr === 2025) {
    for (const expected of RECAP_2025_R1_OVERRIDE) {
      const normExpected = expected.playerName.trim().toLowerCase();
      const hit = valid.find(
        (p) => p.round === 1 && p.playerName.trim().toLowerCase() === normExpected,
      );
      if (!hit) {
        diagnostics.round1OverrideDiag.push({
          expectedPick: expected.pickInRound,
          expectedPlayer: expected.playerName,
          expectedTeam: expected.fantasyTeamName,
          actualPlayerBefore: null,
          actualTeamBefore: null,
          actualPlayerAfter: null,
          actualTeamAfter: null,
          status: "player_not_found",
        });
        diagnostics.warnings.push(
          `2025 R1 override: expected player "${expected.playerName}" not found in round 1`,
        );
        continue;
      }
      const playerBefore = hit.playerName;
      const teamBefore = hit.fantasyTeamName;
      hit.pickInRound = expected.pickInRound;
      hit.fantasyTeamName = expected.fantasyTeamName;
      hit.confidence = "high";
      hit.source = "recap_override_2025";
      diagnostics.round1OverrideDiag.push({
        expectedPick: expected.pickInRound,
        expectedPlayer: expected.playerName,
        expectedTeam: expected.fantasyTeamName,
        actualPlayerBefore: playerBefore,
        actualTeamBefore: teamBefore,
        actualPlayerAfter: hit.playerName,
        actualTeamAfter: hit.fantasyTeamName,
        status: "matched",
      });
    }
  }

  const roundMap = new Map<number, CanonicalDraftPick[]>();
  for (const p of valid) {
    const { round, ...pick } = p;
    const arr = roundMap.get(round) ?? [];
    arr.push(pick);
    roundMap.set(round, arr);
  }

  const rounds: CanonicalDraftRound[] = [...roundMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, picks]) => ({
      round,
      picks: picks.sort((a, b) => a.pickInRound - b.pickInRound || a.overallPick - b.overallPick),
    }));

  for (const r of rounds) {
    if (teamCount > 0 && r.picks.length > teamCount) {
      diagnostics.warnings.push(
        `Round ${r.round} has ${r.picks.length} picks (max ${teamCount}) — check duplicate sources`,
      );
    }
  }

  let sourceUsed = canonicalSourceLabelForSeason(yr, scrapeRowCount);
  if (scrapeRowCount === 0 && apiRowCount > 0) {
    sourceUsed = "espn_mDraftDetail_api";
    diagnostics.warnings.push("No draft_recap_html rows — using API/cache; order may differ from ESPN visual recap.");
  } else if (scrapeRowCount > 0 && scrapeRowCount < valid.length) {
    diagnostics.warnings.push(
      `Partial scrape coverage: ${scrapeRowCount} recap rows vs ${valid.length} canonical picks.`,
    );
  }

  if (yr === 2025 && scrapeRowCount > 0 && apiRowCount > 0) {
    diagnostics.warnings.push(
      "2025: mDraftDetail API retained for diagnostics only; board uses draft_recap_html.",
    );
  }

  return {
    season: yr,
    teamCount,
    sourceUsed,
    sourcePriority: sourcePriorityDescription(yr),
    rounds,
    diagnostics,
  };
}

/** Flat picks for legacy callers (draft order debug script). */
export function flattenCanonicalBoard(board: CanonicalDraftBoard): Array<{
  overallPick: number;
  round: number;
  roundPick: number;
  teamId: number;
  teamName: string;
  ownerName: string;
  playerId: number | null;
  playerName: string;
  position: string | null;
  nflTeam: string;
  isKeeper: boolean;
  bidAmount: number;
}> {
  return board.rounds.flatMap((r) =>
    r.picks.map((p) => ({
      overallPick: p.overallPick,
      round: r.round,
      roundPick: p.pickInRound,
      teamId: p.teamId,
      teamName: p.fantasyTeamName,
      ownerName: p.ownerName,
      playerId: null,
      playerName: p.playerName,
      position: p.position,
      nflTeam: p.nflTeam,
      isKeeper: p.isKeeper,
      bidAmount: p.bidAmount,
    })),
  );
}
