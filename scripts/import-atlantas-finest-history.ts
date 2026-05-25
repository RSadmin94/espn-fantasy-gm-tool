/**
 * One-shot import: `data/ATLANTAS_FINEST_FF_History.xls` → normalized MySQL tables.
 *
 * Usage:
 *   pnpm import:atlantas
 *   pnpm exec tsx scripts/import-atlantas-finest-history.ts [--file=path/to.xls] [--league-id=457622]
 *
 * Requires DATABASE_URL. Skips 2009. Sets raw JSON `source: "verified_manual"` on written rows.
 * No ESPN, no cache writes, no runtime workbook reads in the API.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import {
  listManualSeasonsFromParsed,
  manualMemberIdForOwnerName,
  parseManualHistoryWorkbookBuffer,
  teamIdRegistryForSeason,
  standingsRowsForSeasonOrDraftTeams,
  type ManualMatchupRow,
  type ManualStandingRow,
  type ParsedManualWorkbook,
} from "../server/manualWorkbookParser";

const SOURCE = "verified_manual" as const;

function safeStringify(value: unknown): string {
  try {
    if (value === undefined) return "null";
    return JSON.stringify(value, (_k, v) => (v === undefined ? null : v));
  } catch {
    return "{}";
  }
}

function parseArgs(argv: string[]) {
  let leagueId = String(process.env.ESPN_LEAGUE_ID ?? process.env.LEAGUE_ID ?? "457622").trim().slice(0, 32);
  let filePath = join(process.cwd(), "data", "ATLANTAS_FINEST_FF_History.xls");
  for (const a of argv.slice(2)) {
    if (a.startsWith("--league-id=")) leagueId = a.slice("--league-id=".length).trim().slice(0, 32);
    if (a.startsWith("--file=")) filePath = a.slice("--file=".length).trim();
  }
  return { leagueId, filePath };
}

/** Standings rows for a season, plus any team names seen only in matchups. */
function standingsForSeason(p: ParsedManualWorkbook, season: number): ManualStandingRow[] {
  const base = p.standings.filter((s) => s.season === season);
  const map = new Map<string, ManualStandingRow>();
  for (const r of base) map.set(r.teamName, { ...r });
  const add = (name: string) => {
    const n = name.trim();
    if (!n || map.has(n)) return;
    map.set(n, {
      season,
      teamName: n,
      ownerName: "",
      wins: 0,
      losses: 0,
      ties: 0,
      pf: 0,
      pa: 0,
      rank: null,
    });
  };
  for (const m of p.matchups) {
    if (m.season !== season) continue;
    add(m.homeTeam);
    add(m.awayTeam);
  }
  return [...map.values()];
}

function tidForPick(
  reg: Map<string, number>,
  teamName: string,
  ownerName: string,
): number {
  if (teamName && reg.has(teamName)) return reg.get(teamName)!;
  const key = teamName || ownerName || "Team";
  if (!reg.has(key)) {
    const next = reg.size + 1;
    reg.set(key, next);
  }
  return reg.get(key)!;
}

async function main() {
  const { leagueId, filePath } = parseArgs(process.argv);
  if (!existsSync(filePath)) {
    console.error(`Workbook not found: ${filePath}`);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const buf = readFileSync(filePath);
  const parsed = parseManualHistoryWorkbookBuffer(buf, filePath);
  const seasons = listManualSeasonsFromParsed(parsed);
  if (seasons.length === 0) {
    console.error("No seasons found in workbook (after excluding 2009).");
    process.exit(1);
  }

  const db = drizzle(url, { schema, mode: "default" });
  const lid = leagueId;
  const now = new Date();

  let teamsUpserted = 0;
  let standingsUpserted = 0;
  let matchupsUpserted = 0;
  let picksUpserted = 0;

  for (const season of seasons) {
    const stRows = standingsForSeason(parsed, season);
    const reg = teamIdRegistryForSeason(season, stRows);

    for (const r of stRows) {
      const teamId = reg.get(r.teamName);
      if (!teamId) continue;
      const ownerId = r.ownerName ? manualMemberIdForOwnerName(r.ownerName) : "";
      const rawTeamObj: Record<string, unknown> = {
        source: SOURCE,
        season,
        teamId,
        teamName: r.teamName,
        owners: r.ownerName || "",
        memberIds: r.ownerName ? [manualMemberIdForOwnerName(r.ownerName)] : [],
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        pointsFor: r.pf,
        pointsAgainst: r.pa,
        rankFinal: r.rank,
        playoffSeed: r.rank != null && r.rank > 0 && r.rank <= 8 ? r.rank : null,
        abbrev: r.teamName.slice(0, 4).toUpperCase(),
      };
      await db
        .insert(schema.gmTeams)
        .values({
          leagueId: lid,
          season,
          teamId,
          name: r.teamName,
          abbreviation: String(rawTeamObj.abbrev ?? "").slice(0, 16),
          ownerName: r.ownerName,
          ownerId,
          logoUrl: "",
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          pointsFor: r.pf,
          pointsAgainst: r.pa,
          playoffSeed: rawTeamObj.playoffSeed != null ? Number(rawTeamObj.playoffSeed) : null,
          finalStanding: r.rank != null && r.rank > 0 ? r.rank : null,
          rawTeam: safeStringify(rawTeamObj),
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            name: r.teamName,
            abbreviation: String(rawTeamObj.abbrev ?? "").slice(0, 16),
            ownerName: r.ownerName,
            ownerId,
            wins: r.wins,
            losses: r.losses,
            ties: r.ties,
            pointsFor: r.pf,
            pointsAgainst: r.pa,
            playoffSeed: rawTeamObj.playoffSeed != null ? Number(rawTeamObj.playoffSeed) : null,
            finalStanding: r.rank != null && r.rank > 0 ? r.rank : null,
            rawTeam: safeStringify(rawTeamObj),
            updatedAt: now,
          },
        });
      teamsUpserted++;

      const rk = r.rank != null && r.rank > 0 ? r.rank : 0;
      const rawSt = { source: SOURCE, teamId, week: 0, ...r };
      await db
        .insert(schema.gmStandingsSnapshots)
        .values({
          leagueId: lid,
          season,
          week: 0,
          teamId,
          rank: rk,
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          pointsFor: r.pf,
          pointsAgainst: r.pa,
          rawStanding: safeStringify(rawSt),
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            rank: rk,
            wins: r.wins,
            losses: r.losses,
            ties: r.ties,
            pointsFor: r.pf,
            pointsAgainst: r.pa,
            rawStanding: safeStringify(rawSt),
            updatedAt: now,
          },
        });
      standingsUpserted++;
    }

    const ch = parsed.champions.find((c) => c.season === season);
    if (ch) {
      for (const r of stRows) {
        const tn = r.teamName.toLowerCase();
        const cn = ch.championName.toLowerCase();
        if (!tn.includes(cn) && !cn.includes(tn)) continue;
        const teamId = reg.get(r.teamName)!;
        const rawTeamObj = {
          source: SOURCE,
          season,
          teamId,
          championSheet: true,
          championName: ch.championName,
        };
        await db
          .update(schema.gmTeams)
          .set({
            finalStanding: 1,
            rawTeam: safeStringify(rawTeamObj),
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.gmTeams.leagueId, lid),
              eq(schema.gmTeams.season, season),
              eq(schema.gmTeams.teamId, teamId),
            ),
          );
      }
    }

    const mlist = parsed.matchups.filter((m) => m.season === season);
    const byWeek = new Map<number, ManualMatchupRow[]>();
    for (const m of mlist) {
      const arr = byWeek.get(m.week) ?? [];
      arr.push(m);
      byWeek.set(m.week, arr);
    }
    const weeks = [...byWeek.keys()].sort((a, b) => a - b);

    for (const w of weeks) {
      const weekRows = byWeek.get(w)!;
      weekRows.sort((a, b) => a.homeTeam.localeCompare(b.homeTeam));
      for (let idx = 0; idx < weekRows.length; idx++) {
        const m = weekRows[idx]!;
        const matchupPeriodId = w * 64 + idx;
        const hid = reg.get(m.homeTeam);
        const aid = reg.get(m.awayTeam);
        if (!hid || !aid) continue;
        const hs = m.homeScore;
        const as = m.awayScore;
        let winnerTeamId: number | null = null;
        if (hs > as) winnerTeamId = hid;
        else if (as > hs) winnerTeamId = aid;
        const isCompleted = hs + as > 0 ? 1 : 0;
        const isPlayoff = m.isPlayoff ? 1 : 0;
        const rawM = {
          source: SOURCE,
          season,
          week: w,
          homeTeamId: hid,
          awayTeamId: aid,
          homeScore: hs,
          awayScore: as,
          winnerTeamId,
          isPlayoff: m.isPlayoff,
        };
        await db
          .insert(schema.gmMatchups)
          .values({
            leagueId: lid,
            season,
            week: w,
            matchupPeriodId,
            homeTeamId: hid,
            awayTeamId: aid,
            homeScore: hs,
            awayScore: as,
            homeProjected: null,
            awayProjected: null,
            winnerTeamId,
            isPlayoff,
            isCompleted,
            rawMatchup: safeStringify(rawM),
            updatedAt: now,
          })
          .onDuplicateKeyUpdate({
            set: {
              week: w,
              homeScore: hs,
              awayScore: as,
              winnerTeamId,
              isPlayoff,
              isCompleted,
              rawMatchup: safeStringify(rawM),
              updatedAt: now,
            },
          });
        matchupsUpserted++;
      }
    }

    const draftReg = teamIdRegistryForSeason(season, standingsRowsForSeasonOrDraftTeams(parsed, season));
    const picks = parsed.drafts.filter((d) => d.season === season).sort((a, b) => a.overallPick - b.overallPick);
    for (const d of picks) {
      const teamId = tidForPick(draftReg, d.teamName, d.ownerName);
      const rawPick = {
        source: SOURCE,
        overallPickNumber: d.overallPick,
        roundId: d.round,
        roundPickNumber: d.roundPick,
        teamId,
        playerName: d.playerName,
        position: d.position,
        proTeam: d.nflTeam,
        keeper: d.isKeeper,
        ownerName: d.ownerName,
      };
      await db
        .insert(schema.gmDraftPicks)
        .values({
          leagueId: lid,
          season,
          overallPick: d.overallPick,
          roundId: d.round,
          roundPick: d.roundPick,
          teamId,
          owningTeamId: null,
          playerId: null,
          playerName: d.playerName.slice(0, 255),
          position: (d.position || "?").slice(0, 16),
          isKeeper: d.isKeeper ? 1 : 0,
          bidAmount: 0,
          rawPick: safeStringify(rawPick),
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            roundId: d.round,
            roundPick: d.roundPick,
            teamId,
            playerName: d.playerName.slice(0, 255),
            position: (d.position || "?").slice(0, 16),
            isKeeper: d.isKeeper ? 1 : 0,
            rawPick: safeStringify(rawPick),
            updatedAt: now,
          },
        });
        picksUpserted++;
    }

    console.log(`Imported season ${season}`);
  }

  console.log("Atlantas Finest workbook import complete.");
  console.log({
    leagueId: lid,
    workbook: filePath,
    seasons,
    teamsUpserted,
    standingsUpserted,
    matchupsUpserted,
    picksUpserted,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
