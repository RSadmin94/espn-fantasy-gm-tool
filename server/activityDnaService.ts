import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { resolveWeeklyPlayerStats, resolveLeagueDraftSet } from "./weeklyStatsResolver";

/**
 * Activity DNA - deterministic owner management-style classification.
 *
 * Phase 1 archetypes (computable today from transactionCounter + draft keepers):
 *   Roster Builder, Waiver Aggressive, Trade Opportunist, Draft-and-Hold, Low Activity, High Activity.
 * Phase 2 archetypes (live via gm_player_registry id crosswalk): Draft Reliant, Streamer.
 *   See docs/playerid-crosswalk-decision.md.
 *
 * No LLMs. Every score is league-relative (percentile rank) or an absolute rate,
 * and is always paired with at least one evidence string. See ACTIVITY_DNA_SPEC.md.
 */

export type ArchetypeKey =
  | "draftReliant"
  | "draftAndHold"
  | "rosterBuilder"
  | "waiverAggressive"
  | "tradeOpportunist"
  | "streamer"
  | "lowActivity"
  | "highActivity";

export interface ArchetypeScore {
  score: number | null;
  status: "ok" | "pending-data";
}

export interface ActivityDnaResult {
  leagueId: string;
  ownerId: string;
  ownerName: string;
  seasons: number;
  archetypes: Record<ArchetypeKey, ArchetypeScore>;
  primaryDNA: string;
  secondaryDNA: string;
  confidence: "High" | "Medium" | "Limited";
  evidence: string[];
}

const LABEL: Record<ArchetypeKey, string> = {
  draftReliant: "Draft Reliant",
  draftAndHold: "Draft-and-Hold",
  rosterBuilder: "Roster Builder",
  waiverAggressive: "Waiver Aggressive",
  tradeOpportunist: "Trade Opportunist",
  streamer: "Streamer",
  lowActivity: "Low Activity",
  highActivity: "High Activity",
};

// Decision 1: primaryDNA is chosen ONLY from descriptive archetypes.
// Tempo labels (high/low activity) may appear only as secondaryDNA.
const DESCRIPTIVE: ArchetypeKey[] = [
  "rosterBuilder",
  "waiverAggressive",
  "tradeOpportunist",
  "draftAndHold",
  "draftReliant",
  "streamer",
];
const TEMPO: ArchetypeKey[] = ["highActivity", "lowActivity"];

const normGuid = (g: unknown) =>
  String(g ?? "").replace(/^id:/i, "").toUpperCase().replace(/[^0-9A-F]/g, "");
const rowsOf = (res: any): any[] =>
  Array.isArray(res) ? (Array.isArray(res[0]) ? res[0] : res) : res?.rows ?? [];
const pctRank = (vals: number[], v: number): number => {
  const n = vals.length;
  if (n <= 1) return 50;
  return (vals.filter((x) => x <= v).length / n) * 100;
};
function ordinalPct(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

interface RawOwner {
  ok: string;
  origId: string;
  name: string;
  seasons: number;
  acq: number;
  drops: number;
  trades: number;
  ir: number;
  moves: number;
  acqPS: number;
  tradesPS: number;
  movesPS: number;
  keeperRate: number;
  keeperK: number;
  keeperTot: number;
}

/**
 * Compute Activity DNA for every owner in a league. Percentile scores are league-relative,
 * so the whole league is the unit of computation.
 */
export async function computeActivityDna(leagueId: string): Promise<ActivityDnaResult[]> {
  const db = await getDb();
  if (!db) return [];

  // team -> owner per season, display names, original (braced) owner ids, seasons played
  const teamRows = rowsOf(
    await db.execute(
      sql`SELECT season, teamId, ownerId, ownerName FROM teams WHERE leagueId=${leagueId} AND ownerId IS NOT NULL AND ownerId<>''`
    )
  );
  const ownerOfTeamSeason = new Map<string, string>();
  const nameByOwner = new Map<string, string>();
  const origByOwner = new Map<string, string>();
  const seasonsByOwner = new Map<string, Set<number>>();
  for (const t of teamRows) {
    const ok = normGuid(t.ownerId);
    if (!ok) continue;
    ownerOfTeamSeason.set(`${t.season}:${Number(t.teamId)}`, ok);
    if (t.ownerName) nameByOwner.set(ok, String(t.ownerName));
    if (!origByOwner.has(ok)) origByOwner.set(ok, String(t.ownerId));
    if (!seasonsByOwner.has(ok)) seasonsByOwner.set(ok, new Set());
    seasonsByOwner.get(ok)!.add(Number(t.season));
  }

  // transactionCounter per owner from raw cache (acquisitions / drops / trades / moves)
  const txn = new Map<string, { acq: number; drops: number; trades: number; ir: number; moves: number }>();
  const ensureTxn = (k: string) => {
    if (!txn.has(k)) txn.set(k, { acq: 0, drops: 0, trades: 0, ir: 0, moves: 0 });
    return txn.get(k)!;
  };
  const cacheRows = rowsOf(
    await db.execute(
      sql`SELECT season, payload FROM espn_raw_cache WHERE leagueId=${leagueId} AND payload LIKE '%transactionCounter%'`
    )
  );
  for (const cr of cacheRows) {
    let parsed: any;
    try {
      parsed = JSON.parse(cr.payload);
    } catch {
      continue;
    }
    for (const tm of parsed?.teams ?? []) {
      const ok = ownerOfTeamSeason.get(`${cr.season}:${Number(tm.id)}`);
      if (!ok) continue;
      const tc = tm.transactionCounter ?? {};
      const acq = Number(tc.acquisitions || 0);
      const drops = Number(tc.drops || 0);
      const trades = Number(tc.trades || 0);
      const mta = Number(tc.moveToActive || 0);
      const ir = Number(tc.moveToIR || 0);
      const a = ensureTxn(ok);
      a.acq += acq;
      a.drops += drops;
      a.trades += trades;
      a.ir += ir;
      a.moves += acq + drops + trades + mta + ir;
    }
  }

  // keeper usage from draft_picks
  const keep = new Map<string, { k: number; tot: number }>();
  const dpRows = rowsOf(
    await db.execute(sql`SELECT season, teamId, isKeeper FROM draft_picks WHERE leagueId=${leagueId}`)
  );
  for (const d of dpRows) {
    const ok = ownerOfTeamSeason.get(`${d.season}:${Number(d.teamId)}`);
    if (!ok) continue;
    if (!keep.has(ok)) keep.set(ok, { k: 0, tot: 0 });
    const a = keep.get(ok)!;
    a.tot += 1;
    if (Number(d.isKeeper) === 1 || d.isKeeper === true) a.k += 1;
  }

  // assemble per-owner raw metrics (per-season rates)
  const owners: RawOwner[] = [];
  for (const [ok, seasons] of seasonsByOwner) {
    const n = seasons.size;
    if (!n) continue;
    const a = txn.get(ok) ?? { acq: 0, drops: 0, trades: 0, ir: 0, moves: 0 };
    const kp = keep.get(ok) ?? { k: 0, tot: 0 };
    owners.push({
      ok,
      origId: origByOwner.get(ok) ?? ok,
      name: nameByOwner.get(ok) ?? ok,
      seasons: n,
      acq: a.acq,
      drops: a.drops,
      trades: a.trades,
      ir: a.ir,
      moves: a.moves,
      acqPS: a.acq / n,
      tradesPS: a.trades / n,
      movesPS: a.moves / n,
      keeperRate: kp.tot ? kp.k / kp.tot : 0,
      keeperK: kp.k,
      keeperTot: kp.tot,
    });
  }
  if (!owners.length) return [];

  // ---- Phase 2 (live): weekly-stats-derived archetypes (Draft Reliant, Streamer) ----
  // The crosswalk to global ids is a JOIN (docs/playerid-crosswalk-decision.md). Weekly
  // stats are multi-league + leagueId-less, so the resolver tuple-scopes by
  // (ownerGUID, season, teamId) against this league's roster.
  const weekly = await resolveWeeklyPlayerStats(leagueId, { startersOnly: true });
  const draftSet = await resolveLeagueDraftSet(leagueId);

  // global ids each owner drafted, per season
  const draftedKey = new Set<string>();
  for (const d of draftSet) {
    const ok = normGuid(d.ownerId);
    if (ok && d.espnPlayerId) draftedKey.add(`${ok}:${d.season}:${d.espnPlayerId}`);
  }

  // Draft Reliant: starter points total vs from self-drafted players.
  const drAcc = new Map<string, { drafted: number; total: number }>();
  // Streamer: per owner, per `${season}:${pos}` -> distinct starters / weeks played.
  const STREAM_POS = new Set(["QB", "TE", "K", "DEF"]);
  const streamCells = new Map<string, Map<string, { ids: Set<number>; weeks: Set<number> }>>();

  for (const w of weekly) {
    const ok = normGuid(w.ownerId);
    if (!ok) continue;
    const acc = drAcc.get(ok) ?? { drafted: 0, total: 0 };
    acc.total += w.points;
    if (draftedKey.has(`${ok}:${w.season}:${w.espnPlayerId}`)) acc.drafted += w.points;
    drAcc.set(ok, acc);
    if (STREAM_POS.has(w.position)) {
      let m = streamCells.get(ok);
      if (!m) streamCells.set(ok, (m = new Map()));
      const key = `${w.season}:${w.position}`;
      let cell = m.get(key);
      if (!cell) m.set(key, (cell = { ids: new Set<number>(), weeks: new Set<number>() }));
      cell.ids.add(w.espnPlayerId);
      cell.weeks.add(w.week);
    }
  }

  // Draft Reliant = absolute % of starter points from self-drafted players (spec §2).
  const draftReliantByOwner = new Map<string, number>();
  for (const [ok, a] of drAcc) {
    if (a.total > 0) draftReliantByOwner.set(ok, Math.round((100 * a.drafted) / a.total));
  }
  const drScoreVals = [...draftReliantByOwner.values()];

  // Stream index = mean over (season,pos) of distinctStarters/weeks; streamer = league percentile.
  const streamIndexByOwner = new Map<string, number>();
  const streamDistinctByOwner = new Map<string, number>();
  for (const [ok, m] of streamCells) {
    const ratios: number[] = [];
    const distinct = new Set<number>();
    for (const cell of m.values()) {
      if (cell.weeks.size > 0) ratios.push(cell.ids.size / cell.weeks.size);
      for (const id of cell.ids) distinct.add(id);
    }
    if (ratios.length) {
      streamIndexByOwner.set(ok, ratios.reduce((s, v) => s + v, 0) / ratios.length);
      streamDistinctByOwner.set(ok, distinct.size);
    }
  }
  const streamVals = [...streamIndexByOwner.values()];

  // league distributions for percentile ranking
  const acqA = owners.map((o) => o.acqPS);
  const trA = owners.map((o) => o.tradesPS);
  const mvA = owners.map((o) => o.movesPS);
  const kpA = owners.map((o) => o.keeperRate);

  // Decision 2: keeper influence is capped; only material in keeper/dynasty leagues.
  const leagueKeeperMax = Math.max(0, ...kpA);
  const keeperWeight = leagueKeeperMax >= 0.15 ? 0.3 : 0.1;

  return owners.map((o) => {
    const highActivity = Math.round(pctRank(mvA, o.movesPS));
    const lowActivity = 100 - highActivity;
    const waiverAggressive = Math.round(pctRank(acqA, o.acqPS));
    const tradeOpportunist = Math.round(pctRank(trA, o.tradesPS));
    const rosterBuilder = Math.round(0.5 * waiverAggressive + 0.5 * tradeOpportunist);
    const keeperPct = Math.round(pctRank(kpA, o.keeperRate));
    const draftAndHold = Math.round((1 - keeperWeight) * lowActivity + keeperWeight * keeperPct);

    // Phase 2 (live): Draft Reliant = absolute %, Streamer = league percentile of stream index.
    const drScore = draftReliantByOwner.has(o.ok) ? draftReliantByOwner.get(o.ok)! : null;
    const siOwn = streamIndexByOwner.get(o.ok);
    const streamerScore =
      siOwn != null && streamVals.length ? Math.round(pctRank(streamVals, siOwn)) : null;

    const archetypes: Record<ArchetypeKey, ArchetypeScore> = {
      rosterBuilder: { score: rosterBuilder, status: "ok" },
      waiverAggressive: { score: waiverAggressive, status: "ok" },
      tradeOpportunist: { score: tradeOpportunist, status: "ok" },
      draftAndHold: { score: draftAndHold, status: "ok" },
      lowActivity: { score: lowActivity, status: "ok" },
      highActivity: { score: highActivity, status: "ok" },
      draftReliant:
        drScore != null ? { score: drScore, status: "ok" } : { score: null, status: "pending-data" },
      streamer:
        streamerScore != null
          ? { score: streamerScore, status: "ok" }
          : { score: null, status: "pending-data" },
    };

    const scored = (keys: ArchetypeKey[]) =>
      keys
        .map((k) => ({ k, s: archetypes[k].score }))
        .filter((x): x is { k: ArchetypeKey; s: number } => x.s != null);

    // Decision 1: primary from descriptive only; secondary from the rest (tempo allowed).
    const descRanked = scored(DESCRIPTIVE).sort((a, b) => b.s - a.s);
    const primaryKey: ArchetypeKey = descRanked[0]?.k ?? "rosterBuilder";
    const restRanked = scored([...DESCRIPTIVE, ...TEMPO])
      .filter((x) => x.k !== primaryKey)
      .sort((a, b) => b.s - a.s);
    const secondaryKey: ArchetypeKey = restRanked[0]?.k ?? "highActivity";

    const sep = (descRanked[0]?.s ?? 0) - (descRanked[1]?.s ?? 0);
    const confidence: ActivityDnaResult["confidence"] =
      o.seasons >= 5 ? (sep >= 12 ? "High" : "Medium") : o.seasons >= 3 ? "Medium" : "Limited";

    const evidence: string[] = [
      `Completed ${o.moves} roster moves across ${o.seasons} seasons (${o.movesPS.toFixed(0)}/season).`,
      `${o.trades} career trades (${o.tradesPS.toFixed(1)}/season) - ${ordinalPct(tradeOpportunist)} percentile league-wide.`,
      `${o.acq} waiver/FA acquisitions (${o.acqPS.toFixed(0)}/season) - ${ordinalPct(waiverAggressive)} percentile.`,
    ];
    if (o.keeperTot > 0 && o.keeperK > 0) {
      evidence.push(`Kept ${o.keeperK} of ${o.keeperTot} tracked draft picks.`);
    }
    if (drScore != null) {
      const a = drAcc.get(o.ok)!;
      const pc = Math.round(pctRank(drScoreVals, drScore));
      evidence.push(
        `${drScore}% of starting-lineup points came from self-drafted players ` +
          `(${Math.round(a.drafted)} of ${Math.round(a.total)} pts) - ${ordinalPct(pc)} percentile in draft dependence.`,
      );
    }
    if (streamerScore != null) {
      const si = streamIndexByOwner.get(o.ok) ?? 0;
      const distinct = streamDistinctByOwner.get(o.ok) ?? 0;
      evidence.push(
        `Started ${distinct} different players at QB/TE/K/DEF (stream index ${si.toFixed(2)}) - ` +
          `${ordinalPct(streamerScore)} percentile streaming.`,
      );
    }
    if (drScore == null && streamerScore == null) {
      evidence.push("Draft Reliant & Streamer pending weekly-stats data for this owner.");
    }

    return {
      leagueId,
      ownerId: o.origId,
      ownerName: o.name,
      seasons: o.seasons,
      archetypes,
      primaryDNA: LABEL[primaryKey],
      secondaryDNA: LABEL[secondaryKey],
      confidence,
      evidence,
    };
  });
}

/** Single-owner read. Computes the league (percentiles need the full field) and filters. */
export async function getActivityDnaForOwner(
  leagueId: string,
  ownerKey: string
): Promise<ActivityDnaResult | null> {
  const all = await computeActivityDna(leagueId);
  const target = normGuid(ownerKey);
  return all.find((r) => normGuid(r.ownerId) === target) ?? null;
}

/**
 * Deterministic one-line activity narrative built from an Activity DNA result.
 * Used by the Owner Profile snapshot. No LLM and no hardcoded owner names - the
 * wording is derived purely from the owner's primary/secondary archetypes.
 * Returns null when DNA is unavailable so callers can fall back to legacy text.
 */
export function activityDnaNarrative(dna: ActivityDnaResult | null | undefined): string | null {
  if (!dna || !dna.primaryDNA) return null;
  const primary = dna.primaryDNA;
  const secondary = dna.secondaryDNA;

  // Opening clause per primary archetype (only descriptive archetypes rank primary).
  const primaryClause: Record<string, string> = {
    "Trade Opportunist": "Trade Opportunist",
    "Waiver Aggressive": "Waiver Aggressive manager who generates value through acquisitions",
    "Roster Builder": "Roster Builder who upgrades the roster through steady moves",
    "Draft-and-Hold": "Draft-and-Hold owner",
    "Draft Reliant": "Draft Reliant owner who leans on draft-day capital",
    "Streamer": "Streamer who churns the back of the roster weekly",
  };

  // Trailing clause per secondary archetype.
  const secondaryTail: Record<string, string> = {
    "Roster Builder": " with strong roster-building tendencies",
    "Trade Opportunist": " with a clear willingness to trade",
    "Waiver Aggressive": " backed by aggressive waiver-wire activity",
    "Draft-and-Hold": " that tends to hold its drafted core",
    "High Activity": " and a high overall transaction volume",
    "Low Activity": " with below-average transaction activity",
  };

  const head = primaryClause[primary] ?? primary;
  let tail = secondaryTail[secondary] ?? "";

  // Redundancy guards: an active primary already implies high tempo, so a
  // "High Activity" secondary adds nothing; never restate the same archetype;
  // the Waiver Aggressive head already carries a clause, so keep it clean.
  const activePrimaries = new Set(["Trade Opportunist", "Waiver Aggressive", "Roster Builder"]);
  if (secondary === "High Activity" && activePrimaries.has(primary)) tail = "";
  if (secondary === primary) tail = "";
  if (primary === "Waiver Aggressive" && (secondary === "High Activity" || secondary === "Low Activity")) tail = "";

  return head + tail;
}
