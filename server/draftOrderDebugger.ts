/**
 * Row-for-row draft order comparison — no ordering fixes, diagnostics only.
 */
import { and, eq, desc } from "drizzle-orm";
import { gmDraftPicks } from "../drizzle/schema";
import { getDb } from "./db";
import {
  fetchDraftRecapSeason,
  fetchEspnViewsHardened,
  normalizeDraftPicks,
  resolveEspnCreds,
  hasCookies,
  type EspnCreds,
} from "./espnService";

export type DraftOrderDebugRow = {
  pickNumber: number;
  espnRecapPlayer: string | null;
  espnRecapTeam: string | null;
  apiPlayer: string | null;
  apiTeam: string | null;
  apiOverallPick: number | null;
  apiRoundId: number | null;
  apiRoundPick: number | null;
  dbPlayer: string | null;
  dbTeam: string | null;
  dbOverallPick: number | null;
  dbRoundId: number | null;
  dbRoundPick: number | null;
  uiPlayer: string | null;
  uiTeam: string | null;
  uiColumn: number | null;
  matchStatus: string;
};

export type DraftOrderDebugSummary = {
  season: number;
  round: number;
  leagueId: string;
  espnRecapSource: "pasted" | "default_sample" | "empty";
  apiFetchStatus: "ok" | "missing" | "auth_error";
  apiPickCount: number;
  dbPickCount: number;
  uiPickCount: number;
  apiVsEspnRecap: {
    playerOrderMatch: boolean;
    teamOrderMatch: boolean;
    playerMismatches: number[];
    teamMismatches: number[];
  };
  dbVsApi: {
    playerOrderMatch: boolean;
    teamOrderMatch: boolean;
    overallPickMismatches: number[];
    playerMismatches: number[];
    teamMismatches: number[];
  };
  uiVsDb: {
    playerOrderMatch: boolean;
    teamOrderMatch: boolean;
    columnMismatches: number[];
    playerMismatches: number[];
    teamMismatches: number[];
  };
  wrongLayer: string;
  nextCorrection: string;
};

export type EspnRecapPasteRow = { pickNumber: number; playerName: string; teamName: string };

/** Default Round 1 sample from user screenshot / task spec (editable via paste). */
export const DEFAULT_ESPN_ROUND1_2025: EspnRecapPasteRow[] = [
  { pickNumber: 1, playerName: "Ja'Marr Chase", teamName: "Dominus Thus" },
  { pickNumber: 2, playerName: "Saquon Barkley", teamName: "Winstradamus" },
  { pickNumber: 3, playerName: "Amon-Ra St. Brown", teamName: "TigerCommander" },
  { pickNumber: 4, playerName: "Christian McCaffrey", teamName: "Str8FrmHell, RodZilla" },
  { pickNumber: 5, playerName: "Puka Nacua", teamName: "What A Terrible" },
  { pickNumber: 6, playerName: "Breece Hall", teamName: "DraftU" },
  { pickNumber: 7, playerName: "Bijan Robinson", teamName: "DRAFTS ARE TEASE" },
  { pickNumber: 8, playerName: "Garrett Wilson", teamName: "REMY'S REVENGE" },
  { pickNumber: 9, playerName: "Drake London", teamName: "DRAFTS ARE TEASE" },
  { pickNumber: 10, playerName: "Davante Adams", teamName: "KEEPER/REMY'S REVENGE" },
  { pickNumber: 11, playerName: "CeeDee Lamb", teamName: "Camelot/STRICKLYBIDNESS" },
  { pickNumber: 12, playerName: "Kyren Williams", teamName: "The Playmakers" },
  { pickNumber: 13, playerName: "Justin Jefferson", teamName: "TigerCommander" },
  { pickNumber: 14, playerName: "Jahmyr Gibbs", teamName: "DOMINION" },
];

export function parseEspnRecapPaste(text: string): EspnRecapPasteRow[] {
  const rows: EspnRecapPasteRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m =
      line.match(/^(\d{1,2})[.)\s]+(.+?)(?:\s*(?:→|->|—|-|\|)\s*)(.+)$/i) ||
      line.match(/^(\d{1,2})[.)\s]+(.+)$/);
    if (!m) continue;
    const pickNumber = Number(m[1]);
    if (!Number.isFinite(pickNumber) || pickNumber < 1 || pickNumber > 32) continue;
    const playerName = (m[2] ?? "").trim();
    const teamName = (m[3] ?? "").trim();
    if (!playerName) continue;
    rows.push({ pickNumber, playerName, teamName: teamName || "" });
  }
  return rows.sort((a, b) => a.pickNumber - b.pickNumber);
}

function normName(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ");
}

function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return na === nb;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

type LayerPick = {
  pickNumber: number;
  playerName: string | null;
  teamName: string | null;
  overallPick: number | null;
  roundId: number | null;
  roundPick: number | null;
  uiColumn?: number | null;
};

function round1ByOverall(
  picks: Array<{
    playerName: string | null;
    teamName: string | null;
    overallPickNumber?: number;
    overallPick?: number;
    roundId?: number;
    round?: number;
    roundPickNumber?: number;
    roundPick?: number;
  }>,
  round: number,
): LayerPick[] {
  const filtered = picks
    .map((p) => ({
      playerName: p.playerName ?? null,
      teamName: p.teamName ?? null,
      overallPick: Number(p.overallPickNumber ?? p.overallPick ?? 0),
      roundId: Number(p.roundId ?? p.round ?? 0),
      roundPick: Number(p.roundPickNumber ?? p.roundPick ?? 0),
    }))
    .filter((p) => p.roundId === round && p.overallPick > 0)
    .sort((a, b) => a.overallPick - b.overallPick);
  return filtered.map((p, i) => ({
    pickNumber: i + 1,
    playerName: p.playerName,
    teamName: p.teamName,
    overallPick: p.overallPick,
    roundId: p.roundId,
    roundPick: p.roundPick,
  }));
}

function draftPickSourceRank(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const j = JSON.parse(raw) as { source?: string };
    if (j.source === "espn_mDraftDetail_api") return 3;
    if (j.source === "draft_recap_html") return 2;
    return 1;
  } catch {
    return 0;
  }
}

export async function buildDraftOrderDebugReport(input: {
  leagueId: string;
  season: number;
  round: number;
  userId?: number;
  espnRecapPaste?: string;
  /** Picks exactly as returned by cleanSeasonDraftPicks / draftHistory UI */
  uiPicks: Array<{
    overallPick: number;
    round: number;
    roundPick: number;
    teamName: string;
    playerName: string | null;
  }>;
}): Promise<{ rows: DraftOrderDebugRow[]; summary: DraftOrderDebugSummary }> {
  const { leagueId, season, round, userId, uiPicks } = input;
  const yr = Math.floor(season);
  const rd = Math.floor(round);

  let espnRecap: EspnRecapPasteRow[] = [];
  let espnRecapSource: DraftOrderDebugSummary["espnRecapSource"] = "empty";
  if (input.espnRecapPaste?.trim()) {
    espnRecap = parseEspnRecapPaste(input.espnRecapPaste);
    espnRecapSource = espnRecap.length > 0 ? "pasted" : "empty";
  }
  if (espnRecap.length === 0) {
    espnRecap = DEFAULT_ESPN_ROUND1_2025;
    espnRecapSource = "default_sample";
  }

  const creds = await resolveEspnCreds(undefined, userId);
  const credsWithLeague: EspnCreds = { ...creds, leagueId };

  let apiFetchStatus: DraftOrderDebugSummary["apiFetchStatus"] = "missing";
  let apiNormalized: ReturnType<typeof normalizeDraftPicks> = [];

  if (hasCookies(credsWithLeague)) {
    try {
      let payload: Record<string, unknown> | null = null;
      const direct = await fetchDraftRecapSeason(yr, credsWithLeague);
      if (direct.data) {
        payload = direct.data;
        apiFetchStatus = "ok";
      } else {
        const hardened = await fetchEspnViewsHardened(
          yr,
          ["mDraftDetail", "mTeam", "mSettings"],
          credsWithLeague,
          userId,
        );
        if (hardened.merged && Object.keys(hardened.merged).length > 0) {
          payload = hardened.merged;
          apiFetchStatus = "ok";
        }
      }
      if (payload) {
        apiNormalized = normalizeDraftPicks(payload);
      }
    } catch {
      apiFetchStatus = "auth_error";
    }
  } else {
    apiFetchStatus = "auth_error";
  }

  const apiLayer = round1ByOverall(apiNormalized, rd);

  const db = await getDb();
  let dbLayer: LayerPick[] = [];
  if (db) {
    const dbRows = await db
      .select()
      .from(gmDraftPicks)
      .where(and(eq(gmDraftPicks.leagueId, leagueId), eq(gmDraftPicks.season, yr)))
      .orderBy(gmDraftPicks.overallPick, desc(gmDraftPicks.id));

    const byOverall = new Map<number, (typeof dbRows)[number]>();
    for (const row of dbRows) {
      const existing = byOverall.get(row.overallPick);
      if (!existing) {
        byOverall.set(row.overallPick, row);
        continue;
      }
      if (draftPickSourceRank(row.rawPick) > draftPickSourceRank(existing.rawPick)) {
        byOverall.set(row.overallPick, row);
      } else if (draftPickSourceRank(row.rawPick) === draftPickSourceRank(existing.rawPick) && row.id > existing.id) {
        byOverall.set(row.overallPick, row);
      }
    }

    const shaped = [...byOverall.values()].map((r) => {
      let teamName = "";
      if (r.rawPick) {
        try {
          const j = JSON.parse(String(r.rawPick)) as { teamName?: string };
          if (j.teamName?.trim()) teamName = j.teamName.trim();
        } catch {
          /* ignore */
        }
      }
      return {
        playerName: r.playerName,
        teamName,
        overallPick: r.overallPick,
        roundId: r.roundId,
        roundPick: r.roundPick,
      };
    });
    dbLayer = round1ByOverall(shaped, rd);
  }

  const uiRound = uiPicks
    .filter((p) => p.round === rd)
    .sort((a, b) => a.overallPick - b.overallPick);
  const uiLayer: LayerPick[] = uiRound.map((p, i) => ({
    pickNumber: i + 1,
    playerName: p.playerName,
    teamName: p.teamName,
    overallPick: p.overallPick,
    roundId: p.round,
    roundPick: p.roundPick,
    uiColumn: i + 1,
  }));

  const maxPick = Math.max(
    14,
    espnRecap.length,
    apiLayer.length,
    dbLayer.length,
    uiLayer.length,
  );

  const rows: DraftOrderDebugRow[] = [];
  const apiVsEspnPlayer: number[] = [];
  const apiVsEspnTeam: number[] = [];
  const dbVsApiPlayer: number[] = [];
  const dbVsApiTeam: number[] = [];
  const dbVsApiOverall: number[] = [];
  const uiVsDbPlayer: number[] = [];
  const uiVsDbTeam: number[] = [];
  const uiVsDbColumn: number[] = [];

  for (let n = 1; n <= maxPick; n++) {
    const espn = espnRecap.find((r) => r.pickNumber === n);
    const api = apiLayer.find((r) => r.pickNumber === n);
    const db = dbLayer.find((r) => r.pickNumber === n);
    const ui = uiLayer.find((r) => r.pickNumber === n);

    const flags: string[] = [];
    if (espn && api && !namesMatch(espn.playerName, api.playerName)) {
      flags.push("espn≠api_player");
      apiVsEspnPlayer.push(n);
    }
    if (espn && api && espn.teamName && api.teamName && !namesMatch(espn.teamName, api.teamName)) {
      flags.push("espn≠api_team");
      apiVsEspnTeam.push(n);
    }
    if (api && db && !namesMatch(api.playerName, db.playerName)) {
      flags.push("api≠db_player");
      dbVsApiPlayer.push(n);
    }
    if (api && db && api.teamName && db.teamName && !namesMatch(api.teamName, db.teamName)) {
      flags.push("api≠db_team");
      dbVsApiTeam.push(n);
    }
    if (api && db && api.overallPick != null && db.overallPick != null && api.overallPick !== db.overallPick) {
      flags.push("api≠db_overall");
      dbVsApiOverall.push(n);
    }
    if (db && ui && !namesMatch(db.playerName, ui.playerName)) {
      flags.push("db≠ui_player");
      uiVsDbPlayer.push(n);
    }
    if (db && ui && db.teamName && ui.teamName && !namesMatch(db.teamName, ui.teamName)) {
      flags.push("db≠ui_team");
      uiVsDbTeam.push(n);
    }
    if (db && ui && ui.uiColumn != null && db.overallPick != null) {
      const expectedCol = n;
      if (ui.uiColumn !== expectedCol) {
        flags.push(`ui_col=${ui.uiColumn}`);
        uiVsDbColumn.push(n);
      }
    }
    if (!espn) flags.push("no_espn_row");
    if (!api) flags.push("no_api_row");
    if (!db) flags.push("no_db_row");
    if (!ui) flags.push("no_ui_row");

    rows.push({
      pickNumber: n,
      espnRecapPlayer: espn?.playerName ?? null,
      espnRecapTeam: espn?.teamName ?? null,
      apiPlayer: api?.playerName ?? null,
      apiTeam: api?.teamName ?? null,
      apiOverallPick: api?.overallPick ?? null,
      apiRoundId: api?.roundId ?? null,
      apiRoundPick: api?.roundPick ?? null,
      dbPlayer: db?.playerName ?? null,
      dbTeam: db?.teamName ?? null,
      dbOverallPick: db?.overallPick ?? null,
      dbRoundId: db?.roundId ?? null,
      dbRoundPick: db?.roundPick ?? null,
      uiPlayer: ui?.playerName ?? null,
      uiTeam: ui?.teamName ?? null,
      uiColumn: ui?.uiColumn ?? null,
      matchStatus: flags.length === 0 ? "all_match" : flags.join("; "),
    });
  }

  const apiVsEspnRecap = {
    playerOrderMatch: apiVsEspnPlayer.length === 0 && apiLayer.length >= espnRecap.length,
    teamOrderMatch: apiVsEspnTeam.length === 0,
    playerMismatches: apiVsEspnPlayer,
    teamMismatches: apiVsEspnTeam,
  };
  const dbVsApi = {
    playerOrderMatch: dbVsApiPlayer.length === 0 && dbLayer.length === apiLayer.length,
    teamOrderMatch: dbVsApiTeam.length === 0,
    overallPickMismatches: dbVsApiOverall,
    playerMismatches: dbVsApiPlayer,
    teamMismatches: dbVsApiTeam,
  };
  const uiVsDb = {
    playerOrderMatch: uiVsDbPlayer.length === 0 && uiLayer.length === dbLayer.length,
    teamOrderMatch: uiVsDbTeam.length === 0,
    columnMismatches: uiVsDbColumn,
    playerMismatches: uiVsDbPlayer,
    teamMismatches: uiVsDbTeam,
  };

  let wrongLayer = "unknown";
  let nextCorrection = "Re-run debugger after fixing credentials or pasting ESPN recap.";

  if (apiFetchStatus !== "ok") {
    wrongLayer = "API (fetch failed)";
    nextCorrection = "Fix ESPN cookies / league id, then re-run. Cannot compare until API returns mDraftDetail.";
  } else if (!apiVsEspnRecap.playerOrderMatch) {
    wrongLayer = "API vs ESPN recap";
    nextCorrection =
      "ESPN HTML recap differs from mDraftDetail API — use pasted ESPN recap as 2025 truth for import, not API slot fields alone.";
  } else if (!dbVsApi.playerOrderMatch || dbVsApi.overallPickMismatches.length > 0) {
    wrongLayer = "DB";
    nextCorrection = "Run Import 2025 from ESPN API (or ingest matching ESPN recap) to replace draft_picks rows.";
  } else if (!dbVsApi.teamOrderMatch && dbVsApi.playerOrderMatch) {
    wrongLayer = "DB team mapping";
    nextCorrection = "Players match API but team names differ — fix teamId/teamName on import (rawPick.teamName from API).";
  } else if (!uiVsDb.playerOrderMatch) {
    wrongLayer = "UI rendering";
    nextCorrection = "DB matches API but UI differs — fix Draft History board sort/column mapping only.";
  } else if (!uiVsDb.teamOrderMatch && uiVsDb.playerOrderMatch) {
    wrongLayer = "UI team display";
    nextCorrection = "Fix cleanSeasonDraftPicks team name resolution for display.";
  } else if (!apiVsEspnRecap.teamOrderMatch && apiVsEspnRecap.playerOrderMatch) {
    wrongLayer = "team names only (ESPN vs API)";
    nextCorrection = "Player order matches; align team label source to ESPN recap names.";
  } else {
    wrongLayer = "none";
    nextCorrection = "All layers match for compared picks — if board still looks wrong, check a different round or hard-refresh.";
  }

  const summary: DraftOrderDebugSummary = {
    season: yr,
    round: rd,
    leagueId,
    espnRecapSource,
    apiFetchStatus,
    apiPickCount: apiLayer.length,
    dbPickCount: dbLayer.length,
    uiPickCount: uiLayer.length,
    apiVsEspnRecap,
    dbVsApi,
    uiVsDb,
    wrongLayer,
    nextCorrection,
  };

  return { rows, summary };
}
