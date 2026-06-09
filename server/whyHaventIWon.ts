/**
 * "Why Haven't I Won?™" — deterministic diagnosis of why a focal owner has not won
 * (or what held them back before they won) a championship.
 *
 * Profile-aware: focal owner comes from resolveActiveProfile(); falls back to the
 * franchise that has played the most seasons in the league (stable, multi-league safe).
 * Multi-league: everything is keyed by the resolved leagueId.
 *
 * Deterministic-first: every "reason" is a measured fact with a severity score 0-100.
 * A templated LeagueDNA narrative is assembled from those facts (no LLM dependency;
 * a future LLM pass can consume `findings` directly).
 *
 * Data sources (all existing, no scraping):
 *  - teams                    (records, finalStanding, champion identity, owner GUID)
 *  - matchups                 (regular + playoff games, scores, winners)
 *  - gm_weekly_player_stats    (per-player weekly points, starter flag; league-scoped seasons)
 *  - gm_player_registry        (playerId <-> espnPlayerId, position)
 *  - espn_raw_cache 'combined' (draftDetail.picks -> drafted player sets per owner)
 */
import { sql } from "drizzle-orm";
import { getDb, resolveActiveProfile, memberIdFromOwnerKey } from "./db";
import { getWeeklyStatsSeasonsForLeague } from "./weeklyStatsLeagueCoverage";
import { buildChampionshipAuthority } from "./championshipAuthority";

// Phase B3: DEFAULT_LEAGUE_ID constant removed — setup required if no active league.

function rowsOf(res: any): any[] {
  if (Array.isArray(res)) return Array.isArray(res[0]) ? res[0] : res;
  if (res && Array.isArray(res.rows)) return res.rows;
  return [];
}
function r1(n: number): number { return Math.round(n * 10) / 10; }
function clamp(n: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, n)); }
function normGuid(g: string | null | undefined): string | null {
  if (!g) return null;
  return memberIdFromOwnerKey(g);
}

export type WhyFinding = {
  id: string;
  category: "playoffs" | "scoring" | "position" | "acquisitions" | "rivals" | "draft" | "close_games";
  severity: number;        // 0-100, higher = bigger reason they haven't won
  headline: string;        // short reason
  detail: string;          // supporting deterministic fact
  metricValue: number;
  leagueBenchmark: number;
};

export type WhyHaventIWonResult = {
  leagueId: string;
  ownerKey: string | null;
  ownerName: string;
  isSetupComplete: boolean;
  hasWon: boolean;
  titles: number;
  seasonsPlayed: number;
  bestFinish: number | null;
  playoffAppearances: number;
  findings: WhyFinding[];     // top 5, ranked by severity
  narrative: string;          // templated LeagueDNA summary
  confidence: "High" | "Medium" | "Limited";
  championSeasons: number[];
  isReigningChampion: boolean;
  pageMode: "why-havent-won" | "why-you-won" | "why-you-broke-through";
  /** True when no owner could be resolved for the active league -> UI prompts team selection. */
  needsOwnerSelection: boolean;
  note?: string;
};

type TeamRow = { season: number; teamId: number; ownerId: string; ownerName: string; wins: number; losses: number; ties: number; pf: number; finalStanding: number | null };
type MatchRow = { season: number; week: number; homeTeamId: number; awayTeamId: number; homeScore: number; awayScore: number; winnerTeamId: number | null; isPlayoff: number };

export async function computeWhyHaventIWon(userId?: number, ownerKeyOverride?: string | null): Promise<WhyHaventIWonResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const profile = await resolveActiveProfile(userId != null ? { id: userId } : null);
  // Phase B3: no fallback to hardcoded league — throw if no active league.
  const leagueId = profile?.leagueId ?? "";
  if (!leagueId || leagueId === "default") {
    throw new Error("SETUP_REQUIRED: No active league — connect a league in Settings.");
  }
  const isSetupComplete = !!profile?.isSetupComplete;

  const weeklyStatsSeasons = await getWeeklyStatsSeasonsForLeague(leagueId);
  const weeklySeasonSql =
    weeklyStatsSeasons.length > 0
      ? sql`AND w.season IN (${sql.join(
          weeklyStatsSeasons.map((s) => sql`${s}`),
          sql`, `,
        )})`
      : sql`AND FALSE`;

  // ── Load core tables (all seasons available) ──────────────────────────
  const teams: TeamRow[] = rowsOf(await db.execute(sql`
    SELECT season, teamId, ownerId, ownerName, wins, losses, ties, pointsFor AS pf, finalStanding
    FROM teams WHERE leagueId=${leagueId} AND ownerId IS NOT NULL AND ownerId<>'' `))
    .map((r: any) => ({ season: Number(r.season), teamId: Number(r.teamId), ownerId: String(r.ownerId), ownerName: String(r.ownerName ?? ""), wins: Number(r.wins ?? 0), losses: Number(r.losses ?? 0), ties: Number(r.ties ?? 0), pf: Number(r.pf ?? 0), finalStanding: r.finalStanding != null ? Number(r.finalStanding) : null }));

  const matches: MatchRow[] = rowsOf(await db.execute(sql`
    SELECT season, week, homeTeamId, awayTeamId, homeScore, awayScore, winnerTeamId, isPlayoff
    FROM matchups WHERE leagueId=${leagueId} AND isCompleted=1 `))
    .map((r: any) => ({ season: Number(r.season), week: Number(r.week), homeTeamId: Number(r.homeTeamId), awayTeamId: Number(r.awayTeamId), homeScore: Number(r.homeScore ?? 0), awayScore: Number(r.awayScore ?? 0), winnerTeamId: r.winnerTeamId != null ? Number(r.winnerTeamId) : null, isPlayoff: Number(r.isPlayoff ?? 0) }));

  // ── Resolve focal owner ───────────────────────────────────────────────
  // seasons-played per owner GUID (for fallback + tenure)
  const seasonsByOwner = new Map<string, Set<number>>();
  const nameByOwner = new Map<string, string>();
  const teamIdByOwnerSeason = new Map<string, number>(); // `${guid}:${season}` -> teamId
  for (const t of teams) {
    if (!seasonsByOwner.has(t.ownerId)) seasonsByOwner.set(t.ownerId, new Set());
    seasonsByOwner.get(t.ownerId)!.add(t.season);
    if (t.ownerName) nameByOwner.set(t.ownerId, t.ownerName);
    teamIdByOwnerSeason.set(`${t.ownerId}:${t.season}`, t.teamId);
  }

  let focal = normGuid(ownerKeyOverride) || (isSetupComplete ? normGuid(profile.selectedOwnerKey) : null);
  // Hardening: never silently fall back to the most-seasons owner (that shows another
  // member's career as the user's). Infer the user's own owner GUID from another league
  // connection where that same GUID exists in THIS league's teams; otherwise stay null.
  if (!focal && userId != null) {
    try {
      const connRows = rowsOf(
        await db.execute(
          sql`SELECT selectedOwnerKey FROM league_connections WHERE userId=${userId} AND selectedOwnerKey IS NOT NULL`,
        ),
      );
      for (const row of connRows) {
        const g = normGuid((row as { selectedOwnerKey?: string | null }).selectedOwnerKey ?? null);
        if (g && seasonsByOwner.has(g)) { focal = g; break; }
      }
    } catch { /* best-effort inference; fall through to setup-required */ }
  }
  const ownerName = (focal && nameByOwner.get(focal)) || profile?.selectedOwnerName || "This owner";

  if (!focal) {
    return { leagueId, ownerKey: null, ownerName, isSetupComplete, hasWon: false, titles: 0, seasonsPlayed: 0, bestFinish: null, playoffAppearances: 0, findings: [], narrative: "No league history available yet.", confidence: "Limited", championSeasons: [], isReigningChampion: false, pageMode: "why-havent-won", needsOwnerSelection: true, note: "Select your team for this league." };
  }

  // ── Championship authority (medals primary; standings fallback) ───────
  const champAuth = await buildChampionshipAuthority({ db, leagueId });
  const focalCanon = champAuth.canonicalKeyForOwnerId(focal);

  // ── Focal summary stats ───────────────────────────────────────────────
  const focalTeams = teams.filter((t) => t.ownerId === focal && (t.wins + t.losses + t.ties) > 0);
  const championSeasons = (champAuth.championSeasonsByKey.get(focalCanon) ?? []).slice().sort((a, b) => a - b);
  const titles = championSeasons.length;
  const bestFinish = focalTeams.length ? Math.min(...focalTeams.map((t) => t.finalStanding ?? 99).filter((x) => x < 99)) : null;
  const seasonsPlayed = focalTeams.length;

  // champion GUID per season (medals primary; standings fallback)
  const champBySeason = champAuth.championOwnerIdBySeason;

  // Championship status for the focal owner (medal-authoritative).
  const latestCompletedSeason = champAuth.latestCompletedSeason;
  const isReigningChampion = champAuth.reigningKey != null && champAuth.reigningKey === focalCanon;

  // playoff cutoff per season (finalStanding <= cutoff = made the playoff bracket).
  // ESPN flags consolation games isPlayoff=1 too, so finalStanding is the accurate gate.
  const playoffCutoffRows = rowsOf(await db.execute(sql`
    SELECT season, JSON_EXTRACT(payload, '$.settings.scheduleSettings.playoffTeamCount') AS pc
    FROM espn_raw_cache WHERE leagueId=${leagueId} AND viewName='combined'`));
  const cutoffBySeason = new Map<number, number>();
  for (const r of playoffCutoffRows) {
    const pc = Number(r.pc);
    if (Number.isFinite(pc) && pc > 0) cutoffBySeason.set(Number(r.season), pc);
  }
  const teamsInSeason = new Map<number, number>();
  for (const t of teams) teamsInSeason.set(t.season, (teamsInSeason.get(t.season) ?? 0) + (t.wins + t.losses + t.ties > 0 ? 1 : 0));
  const playoffCutoff = (season: number): number => cutoffBySeason.get(season) ?? Math.max(4, Math.round((teamsInSeason.get(season) ?? 12) / 2));
  const madePlayoffs = (t: TeamRow): boolean => t.finalStanding != null && t.finalStanding <= playoffCutoff(t.season);

  // playoff appearances: focal made the bracket (finalStanding within cutoff)
  const playoffAppearances = focalTeams.filter(madePlayoffs).length;

  const findings: WhyFinding[] = [];

  // ── Reason A: playoff appearance rate ─────────────────────────────────
  if (seasonsPlayed >= 2) {
    const rate = playoffAppearances / seasonsPlayed;
    // league avg appearance rate (per owner: bracket appearances / seasons played)
    const apprByOwner = new Map<string, { app: number; seas: number }>();
    for (const t of teams) {
      if (t.wins + t.losses + t.ties === 0) continue;
      const cur = apprByOwner.get(t.ownerId) ?? { app: 0, seas: 0 };
      cur.seas++;
      if (madePlayoffs(t)) cur.app++;
      apprByOwner.set(t.ownerId, cur);
    }
    const leagueRate = [...apprByOwner.values()].reduce((a, x) => a + x.app / Math.max(1, x.seas), 0) / Math.max(1, apprByOwner.size);
    if (rate < leagueRate) {
      findings.push({
        id: "playoff_drought", category: "playoffs",
        severity: clamp((leagueRate - rate) * 160 + 25),
        headline: `Missed the playoffs in ${seasonsPlayed - playoffAppearances} of ${seasonsPlayed} seasons`,
        detail: `Reached the playoffs ${Math.round(rate * 100)}% of the time vs a league average of ${Math.round(leagueRate * 100)}%.`,
        metricValue: r1(rate * 100), leagueBenchmark: r1(leagueRate * 100),
      });
    }
  }

  // ── Reason B: playoff scoring percentile ──────────────────────────────
  const playoffScores: { focal: boolean; pts: number }[] = [];
  for (const m of matches) {
    if (!m.isPlayoff) continue;
    const ht = teamIdByOwnerSeason.get(`${focal}:${m.season}`);
    playoffScores.push({ focal: m.homeTeamId === ht, pts: m.homeScore });
    playoffScores.push({ focal: m.awayTeamId === ht, pts: m.awayScore });
  }
  const focalPO = playoffScores.filter((x) => x.focal).map((x) => x.pts);
  const allPO = playoffScores.map((x) => x.pts);
  if (focalPO.length >= 2 && allPO.length >= 6) {
    const focalAvg = focalPO.reduce((a, b) => a + b, 0) / focalPO.length;
    const leagueAvg = allPO.reduce((a, b) => a + b, 0) / allPO.length;
    const pct = allPO.filter((p) => p < focalAvg).length / allPO.length; // percentile of focal avg
    if (focalAvg < leagueAvg) {
      findings.push({
        id: "playoff_scoring", category: "playoffs",
        severity: clamp((1 - pct) * 80 + (leagueAvg - focalAvg)),
        headline: `Bottom-tier playoff scoring (${Math.round((1 - pct) * 100)}th percentile from the bottom)`,
        detail: `Averaged ${r1(focalAvg)} pts in playoff games vs the league playoff average of ${r1(leagueAvg)}.`,
        metricValue: r1(focalAvg), leagueBenchmark: r1(leagueAvg),
      });
    }
  }

  // ── Load weekly stats + draft sets for scoring/position/acquisition reasons ──
  const weekly = rowsOf(await db.execute(sql`
    SELECT w.season AS season, w.week AS week, w.ownerKey AS ownerKey, w.isStarter AS isStarter,
           w.pointsScored AS pts, r.espnPlayerId AS espnId, r.position AS position
    FROM gm_weekly_player_stats w
    JOIN gm_player_registry r ON r.id = w.playerId
    INNER JOIN teams t ON w.teamId IS NOT NULL AND w.teamId = t.teamId AND w.season = t.season AND t.leagueId = ${leagueId}
    WHERE 1=1 ${weeklySeasonSql}`))
    .map((r: any) => ({ season: Number(r.season), week: Number(r.week), ownerKey: String(r.ownerKey), isStarter: Number(r.isStarter) === 1, pts: Number(r.pts ?? 0), espnId: Number(r.espnId), position: String(r.position ?? "") }));

  // drafted sets per owner GUID per season (from combined cache)
  const draftedByOwnerSeason = new Map<string, Set<number>>(); // `${guid}:${season}` -> espnIds
  for (const season of weeklyStatsSeasons) {
    const cache = rowsOf(await db.execute(sql`SELECT payload FROM espn_raw_cache WHERE leagueId=${leagueId} AND season=${season} AND viewName='combined' LIMIT 1`));
    if (!cache[0]?.payload) continue;
    const combined = typeof cache[0].payload === "string" ? JSON.parse(cache[0].payload) : cache[0].payload;
    for (const p of combined.draftDetail?.picks ?? []) {
      const g = normGuid(p.memberId); const id = Number(p.playerId);
      if (!g || !Number.isFinite(id)) continue;
      const k = `${g}:${season}`;
      if (!draftedByOwnerSeason.has(k)) draftedByOwnerSeason.set(k, new Set());
      draftedByOwnerSeason.get(k)!.add(id);
    }
  }
  const weeklyConfident = weekly.length > 0 && draftedByOwnerSeason.size > 0;

  // ── Reason C: position weakness (starter avg by position vs league) ───
  if (weeklyConfident) {
    const POS = ["QB", "RB", "WR", "TE"];
    // focal starter points by position (per game) and league
    const acc = (filterFocal: boolean) => {
      const sum: Record<string, number> = {}; const cnt: Record<string, number> = {};
      for (const w of weekly) {
        if (!w.isStarter || !POS.includes(w.position)) continue;
        if (filterFocal && w.ownerKey !== focal) continue;
        sum[w.position] = (sum[w.position] ?? 0) + w.pts;
        cnt[w.position] = (cnt[w.position] ?? 0) + 1;
      }
      const avg: Record<string, number> = {};
      for (const p of POS) avg[p] = cnt[p] ? sum[p] / cnt[p] : 0;
      return avg;
    };
    const focalAvg = acc(true); const leagueAvg = acc(false);
    let worstPos = ""; let worstGap = 0;
    for (const p of POS) {
      const gap = leagueAvg[p] - focalAvg[p];
      if (gap > worstGap && focalAvg[p] > 0) { worstGap = gap; worstPos = p; }
    }
    // Skip positional-weakness finding for reigning champion — they already won.
    if (worstPos && !isReigningChampion) {
      findings.push({
        id: "position_weakness", category: "position",
        severity: clamp(worstGap * 14 + 20),
        headline: `Underperformed at ${worstPos}`,
        detail: `Your starting ${worstPos}s averaged ${r1(focalAvg[worstPos])} pts/game vs the league's ${r1(leagueAvg[worstPos])}.`,
        metricValue: r1(focalAvg[worstPos]), leagueBenchmark: r1(leagueAvg[worstPos]),
      });
    }
  }

  // ── Reason D: acquisition value (transaction proxy: non-drafted starters) ──
  if (weeklyConfident) {
    const acqPoints = (guid: string) => {
      let drafted = 0, acquired = 0;
      for (const w of weekly) {
        if (w.ownerKey !== guid || !w.isStarter) continue;
        const draftSet = draftedByOwnerSeason.get(`${guid}:${w.season}`);
        if (draftSet && draftSet.has(w.espnId)) drafted += w.pts; else acquired += w.pts;
      }
      const total = drafted + acquired;
      return { acquired, share: total > 0 ? acquired / total : 0 };
    };
    const focalAcq = acqPoints(focal);
    const others = [...seasonsByOwner.keys()].filter((g) => weekly.some((w) => w.ownerKey === g));
    const leagueShare = others.reduce((a, g) => a + acqPoints(g).share, 0) / Math.max(1, others.length);
    if (focalAcq.share < leagueShare) {
      findings.push({
        id: "low_acquisitions", category: "acquisitions",
        severity: clamp((leagueShare - focalAcq.share) * 220 + 15),
        headline: `Got little from in-season pickups`,
        detail: `Only ${Math.round(focalAcq.share * 100)}% of your starting points came from non-drafted (waiver/trade) players vs a league average of ${Math.round(leagueShare * 100)}%.`,
        metricValue: r1(focalAcq.share * 100), leagueBenchmark: r1(leagueShare * 100),
      });
    }
  }

  // ── Reason E: losses to the eventual champion ─────────────────────────
  let lossesToChamp = 0, gamesVsChamp = 0;
  for (const m of matches) {
    const champ = champBySeason.get(m.season);
    if (!champ || champ === focal) continue;
    const focalTid = teamIdByOwnerSeason.get(`${focal}:${m.season}`);
    const champTid = teamIdByOwnerSeason.get(`${champ}:${m.season}`);
    if (focalTid == null || champTid == null) continue;
    const involvesFocal = m.homeTeamId === focalTid || m.awayTeamId === focalTid;
    const involvesChamp = m.homeTeamId === champTid || m.awayTeamId === champTid;
    if (involvesFocal && involvesChamp) {
      gamesVsChamp++;
      if (m.winnerTeamId === champTid) lossesToChamp++;
    }
  }
  if (lossesToChamp >= 2) {
    findings.push({
      id: "losses_to_champ", category: "rivals",
      severity: clamp(lossesToChamp * 16 + 10),
      headline: `Repeatedly knocked off by eventual champions`,
      detail: `Lost ${lossesToChamp} of ${gamesVsChamp} games to the owner who went on to win the title that season.`,
      metricValue: lossesToChamp, leagueBenchmark: gamesVsChamp,
    });
  }

  // ── Reason F: season scoring vs champion average ──────────────────────
  const focalSeasonPF = focalTeams.map((t) => t.pf).filter((x) => x > 0);
  const champPFs = teams.filter((t) => champAuth.championTeamIdBySeason.get(t.season) === t.teamId && t.pf > 0).map((t) => t.pf);
  if (focalSeasonPF.length && champPFs.length) {
    const focalAvgPF = focalSeasonPF.reduce((a, b) => a + b, 0) / focalSeasonPF.length;
    const champAvgPF = champPFs.reduce((a, b) => a + b, 0) / champPFs.length;
    if (focalAvgPF < champAvgPF) {
      findings.push({
        id: "below_champ_scoring", category: "scoring",
        severity: clamp((champAvgPF - focalAvgPF) / 4 + 15),
        headline: `Scored below the championship benchmark`,
        detail: `Averaged ${r1(focalAvgPF)} points/season vs the average champion's ${r1(champAvgPF)}.`,
        metricValue: r1(focalAvgPF), leagueBenchmark: r1(champAvgPF),
      });
    }
  }

  // ── Reason H: close losses (<10 pts) ──────────────────────────────────
  let closeLosses = 0, totalLosses = 0;
  for (const m of matches) {
    const focalTid = teamIdByOwnerSeason.get(`${focal}:${m.season}`);
    if (focalTid == null) continue;
    const isHome = m.homeTeamId === focalTid, isAway = m.awayTeamId === focalTid;
    if (!isHome && !isAway) continue;
    const my = isHome ? m.homeScore : m.awayScore;
    const opp = isHome ? m.awayScore : m.homeScore;
    if (my < opp) { totalLosses++; if (opp - my < 10) closeLosses++; }
  }
  if (closeLosses >= 3) {
    findings.push({
      id: "close_losses", category: "close_games",
      severity: clamp(closeLosses * 7 + 10),
      headline: `Lost a pile of close games`,
      detail: `Dropped ${closeLosses} games by fewer than 10 points (of ${totalLosses} total losses) — small margins added up.`,
      metricValue: closeLosses, leagueBenchmark: totalLosses,
    });
  }

  // ── Rank + take top 5 ─────────────────────────────────────────────────
  findings.sort((a, b) => b.severity - a.severity);
  const top = findings.slice(0, 5);

  // ── Templated LeagueDNA narrative ─────────────────────────────────────
  const hasWon = titles > 0;
  let narrative: string;
  if (top.length === 0) {
    narrative = hasWon
      ? `${ownerName} has ${titles} title${titles > 1 ? "s" : ""} and no glaring weaknesses in the data — a complete résumé.`
      : `${ownerName}'s profile is balanced; no single dominant reason stands out in the data.`;
  } else {
    const lead = top[0];
    const intro = hasWon
      ? (isReigningChampion
          ? `${ownerName} is the reigning champion. Here's what made the title season work - and what must continue. `
          : `${ownerName} broke through for ${titles === 1 ? "a title" : titles + " titles"}. Here's what made it work - and the patterns to keep in check. `)
      : `Across ${seasonsPlayed} seasons (best finish: ${bestFinish ?? "—"}), the data points to a clear story. `;
    const reasonLine = `The biggest factor: ${lead.headline.toLowerCase()} — ${lead.detail}`;
    const secondary = top.length > 1 ? ` It compounds with ${top.length - 1} other issue${top.length - 1 > 1 ? "s" : ""}, led by ${top[1].headline.toLowerCase()}.` : "";
    narrative = intro + reasonLine + secondary;
  }

  const confidence: WhyHaventIWonResult["confidence"] = weeklyConfident ? "High" : matches.length > 0 ? "Medium" : "Limited";

  const pageMode: WhyHaventIWonResult["pageMode"] = !hasWon
    ? "why-havent-won"
    : isReigningChampion
      ? "why-you-won"
      : "why-you-broke-through";

  return {
    leagueId, ownerKey: focal, ownerName, isSetupComplete,
    hasWon, titles, seasonsPlayed, bestFinish, playoffAppearances,
    findings: top, narrative, confidence,
    championSeasons, isReigningChampion, pageMode,
    needsOwnerSelection: false,
  };
}
