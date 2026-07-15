/**
 * Dynasty Power Rankings + Dynasty Identity badge.
 *
 * Single source of truth for the dynasty roster-strength model validated in the
 * stability probe. Computes two axes per team and derives the identity badge from
 * them — NO separate scoring engine, NO age model / dynasty ECR / rookie multiplier.
 *
 *   Now Score   = Starter Strength (best lineup, by within-position market value)
 *   Later Score = 50% current dynasty value + 50% keeperValueFuture (round-inverted)
 *
 * Player value is the trusted `computeMarketValues` engine (within-position 0–100),
 * fed the same reduced inputs the badge model was validated on (projection +
 * percent-started; no ADP/history) so production badges reproduce the validated run.
 */
import { eq } from "drizzle-orm";
import { getCachedView, getDb } from "./db";
import { gmTeams } from "../drizzle/schema";
import { normalizeTeams, normalizeRosters, normalizeSettings } from "./espnService";
import { computeMarketValues, type MarketValueInput } from "./marketValue";
import { buildRawKeyToCanonicalProfileKey, buildNameToOwnerId, resolveOwnerKey, type GmTeamRow } from "./ownerProfileService";

// Tercile boundaries on percentile rank across the league (locked, per stability probe).
export const DYNASTY_BADGE_HI = 66.67;
export const DYNASTY_BADGE_LO = 33.34;

export type DynastyBadgeKey =
  | "built_to_last" | "win_now_window" | "rising_empire" | "crossroads" | "ground_floor";

export interface DynastyBadge {
  key: DynastyBadgeKey;
  label: string;
  icon: string;
  explanation: string;
}

export interface DynastyPowerRow {
  teamId: number;
  ownerName: string;
  ownerKey: string;        // canonical, merge-aware owner key (id:{GUID} / name:...); joins to ownerList
  rosterSize: number;
  nowScore: number;        // raw Starter Strength
  laterScore: number;      // raw future-weighted dynasty value
  nowPct: number;          // 0–100 percentile across the league
  laterPct: number;        // 0–100 percentile across the league
  powerScore: number;      // ordering metric only (mean of the two percentiles)
  powerRank: number;       // 1 = strongest
  badge: DynastyBadge;
}

export interface DynastyPowerRankingsResult {
  season: number;
  leagueId: string;
  teamCount: number;
  thresholds: { high: number; low: number };
  teams: DynastyPowerRow[];
}

/**
 * Derive the Dynasty Identity badge from the two percentile axes. Pure function —
 * the badge is computed FROM the Now/Later outputs, never from a parallel score.
 */
export function classifyDynastyBadge(nowPct: number, laterPct: number): DynastyBadge {
  const nowHi = nowPct >= DYNASTY_BADGE_HI;
  const laterHi = laterPct >= DYNASTY_BADGE_HI;
  const nowLo = nowPct <= DYNASTY_BADGE_LO;
  const laterLo = laterPct <= DYNASTY_BADGE_LO;

  if (nowHi && laterHi) return { key: "built_to_last", label: "Built to Last", icon: "🏛️", explanation: "Top-tier starting lineup and elite long-term value — strong right now and built to stay strong." };
  if (nowHi && !laterHi) return { key: "win_now_window", label: "Win-Now Window", icon: "⏳", explanation: "Elite starters, but a thinner long-term core. The contention window is open now — push while it is." };
  if (laterHi && !nowHi) return { key: "rising_empire", label: "Rising Empire", icon: "📈", explanation: "Loaded with long-term value that hasn't fully arrived yet. Built for what's coming." };
  if (nowLo && laterLo) return { key: "ground_floor", label: "Ground Floor", icon: "🧱", explanation: "Bottom of the league in both current strength and future value — a roster in rebuild." };
  return { key: "crossroads", label: "Crossroads", icon: "⚖️", explanation: "Middle of the pack in both win-now strength and future value. Could tip either way." };
}

// ── internal helpers (identical to the validated probe) ──────────────────────
function pctRank(vals: number[]): number[] {
  const idx = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(vals.length).fill(50);
  idx.forEach((x, rank) => { out[x.i] = vals.length > 1 ? (rank / (vals.length - 1)) * 100 : 50; });
  return out;
}
// keeperValueFuture is a keeper-round cost (lower round = more valuable). Invert to
// 0–100; fall back to current value when the future round is missing.
function keeperScore(kvf: number, currentValue: number): number {
  return kvf > 0 ? Math.max(0, Math.min(100, ((24 - kvf) / 23) * 100)) : currentValue;
}

/**
 * Compute Dynasty Power Rankings + identity badges for one league/season.
 * Returns null when the league has no cached combined payload.
 */
export async function computeDynastyPowerRankings(args: {
  season: number;
  leagueId?: string;
  userId?: number;
}): Promise<DynastyPowerRankingsResult | null> {
  const { season, leagueId, userId } = args;
  const cached: any = await getCachedView(season, "combined", leagueId, { userId });
  if (!cached) return null;
  const data: any = cached.payload;

  const rawTeams: any[] = normalizeTeams(data);
  const rosters: any[] = normalizeRosters(data);
  if (!rawTeams.length || !rosters.length) return null;

  // starting-lineup template from league settings (fallback: 1QB/2RB/3WR/1TE/1FLEX)
  let slotCounts: Record<string, number> = {};
  try {
    const s: any = normalizeSettings(data);
    slotCounts = s?.rosterSettings?.lineupSlotCounts || data?.settings?.rosterSettings?.lineupSlotCounts || {};
  } catch { /* fall through to default */ }
  const c = (id: number) => Number(slotCounts[String(id)] || 0);
  const tmpl = Object.keys(slotCounts).length
    ? { QB: c(0) + c(7), RB: c(2), WR: c(4), TE: c(6), FLEX: c(23) + c(3) + c(5), SF: c(7) }
    : { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SF: 0 };

  // trusted within-position market value over the whole league pool
  const mvInputs: MarketValueInput[] = rosters.map((p) => ({
    playerId: Number(p.playerId),
    position: String(p.position || "?"),
    adpRank: null,
    projection: (Number(p.projectedTotal) || (Number(p.appliedAverage) || 0) * 17) || null,
    keeperRoundSavings: null,
    percentStarted: p.percentStarted != null ? Number(p.percentStarted) : null,
    currentSeasonWeekly: [],
    history: [],
    currentSeason: season,
  }));
  const mv = computeMarketValues(mvInputs, { playedWeeks: 0 });
  const val = (p: any) => mv.get(Number(p.playerId))?.value ?? 0;
  const kvfOf = (p: any) => Number(p.keeperValueFuture) || 0;

  const ownerMap: Record<number, string> = {};
  const memberIdMap: Record<number, string> = {};
  for (const t of rawTeams) {
    const tid = Number(t.teamId);
    ownerMap[tid] = String(t.owners || t.ownerName || `Team ${t.teamId}`);
    memberIdMap[tid] = String((t.memberIds as string[] | undefined)?.[0] ?? "");
  }

  // Canonical, merge-aware owner key per team — the SAME resolution owners.ownerList
  // uses, so Owner Profiles can join dynasty rows by ownerKey instead of by name.
  // gmTeams.ownerId === ESPN memberId; remap.get(`id:${memberId}`) yields the canonical key.
  const resolvedLeagueId = String(cached.leagueId ?? leagueId ?? "");
  const ownerKeyMap: Record<number, string> = {};
  {
    const db = await getDb();
    const gmRows: GmTeamRow[] = db && resolvedLeagueId
      ? ((await db.select().from(gmTeams).where(eq(gmTeams.leagueId, resolvedLeagueId))) as GmTeamRow[])
      : [];
    const remap = buildRawKeyToCanonicalProfileKey(gmRows);
    const nameToOwnerId = buildNameToOwnerId(gmRows);
    const canonicalForMember = (mid: string, nm: string): string => {
      const direct = mid ? remap.get(`id:${mid}`) : undefined;
      if (direct) return direct;
      const raw = resolveOwnerKey("", nm, nm, nameToOwnerId);
      return remap.get(raw) ?? raw;
    };
    for (const t of rawTeams) {
      const tid = Number(t.teamId);
      ownerKeyMap[tid] = canonicalForMember(memberIdMap[tid], ownerMap[tid]);
    }
  }

  const byTeam = new Map<number, any[]>();
  for (const p of rosters) {
    const tid = Number(p.teamId);
    if (!byTeam.has(tid)) byTeam.set(tid, []);
    byTeam.get(tid)!.push(p);
  }

  // Now Score: best legal starting lineup, summed within-position value
  function starterStrength(roster: any[]): number {
    const pos = (P: string) => roster.filter((p) => String(p.position) === P)
      .map((p) => ({ id: Number(p.playerId), v: val(p) })).sort((a, b) => b.v - a.v);
    const pools: Record<string, { id: number; v: number }[]> = { QB: pos("QB"), RB: pos("RB"), WR: pos("WR"), TE: pos("TE") };
    const used = new Set<number>();
    let sum = 0;
    const take = (P: string, n: number) => { let k = 0; for (const pl of pools[P]) { if (k >= n) break; if (used.has(pl.id)) continue; used.add(pl.id); sum += pl.v; k++; } };
    take("QB", tmpl.QB - tmpl.SF > 0 ? tmpl.QB - tmpl.SF : (tmpl.SF ? 1 : tmpl.QB));
    take("RB", tmpl.RB); take("WR", tmpl.WR); take("TE", tmpl.TE);
    const flex = [...pools.RB, ...pools.WR, ...pools.TE].filter((p) => !used.has(p.id)).sort((a, b) => b.v - a.v);
    for (let i = 0; i < tmpl.FLEX; i++) if (flex[i]) { used.add(flex[i].id); sum += flex[i].v; }
    if (tmpl.SF) {
      const sf = [...pools.QB, ...pools.RB, ...pools.WR, ...pools.TE].filter((p) => !used.has(p.id)).sort((a, b) => b.v - a.v);
      for (let i = 0; i < tmpl.SF; i++) if (sf[i]) { used.add(sf[i].id); sum += sf[i].v; }
    }
    return sum;
  }

  const raw = rawTeams.map((t: any) => {
    const tid = Number(t.teamId);
    const r = byTeam.get(tid) || [];
    const now = starterStrength(r);
    // Later Score: 50% current dynasty value + 50% future (keeperValueFuture)
    const later = r.reduce((s, p) => s + (0.5 * val(p) + 0.5 * keeperScore(kvfOf(p), val(p))), 0);
    return { teamId: tid, ownerName: ownerMap[tid], ownerKey: ownerKeyMap[tid] || "", rosterSize: r.length, nowScore: now, laterScore: later };
  });

  const nowP = pctRank(raw.map((x) => x.nowScore));
  const latP = pctRank(raw.map((x) => x.laterScore));

  const teams: DynastyPowerRow[] = raw.map((x, i) => {
    const nowPct = Math.round(nowP[i] * 10) / 10;
    const laterPct = Math.round(latP[i] * 10) / 10;
    return {
      ...x,
      nowScore: Math.round(x.nowScore),
      laterScore: Math.round(x.laterScore),
      nowPct,
      laterPct,
      powerScore: Math.round((nowP[i] + latP[i]) / 2),
      powerRank: 0,
      badge: classifyDynastyBadge(nowP[i], latP[i]),
    };
  });

  teams.sort((a, b) => b.powerScore - a.powerScore || b.nowPct - a.nowPct);
  teams.forEach((t, i) => { t.powerRank = i + 1; });

  return {
    season,
    leagueId: String(cached.leagueId ?? leagueId ?? ""),
    teamCount: teams.length,
    thresholds: { high: DYNASTY_BADGE_HI, low: DYNASTY_BADGE_LO },
    teams,
  };
}
