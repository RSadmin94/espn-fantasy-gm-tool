import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * Activity DNA - deterministic owner management-style classification.
 *
 * Phase 1 archetypes (computable today from transactionCounter + draft keepers):
 *   Roster Builder, Waiver Aggressive, Trade Opportunist, Draft-and-Hold, Low Activity, High Activity.
 * Phase 2 archetypes (pending weekly-stats playerId crosswalk): Draft Reliant, Streamer.
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

const normGuid = (g: unknown) => String(g ?? "").toUpperCase().replace(/[^0-9A-F]/g, "");
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

    const archetypes: Record<ArchetypeKey, ArchetypeScore> = {
      rosterBuilder: { score: rosterBuilder, status: "ok" },
      waiverAggressive: { score: waiverAggressive, status: "ok" },
      tradeOpportunist: { score: tradeOpportunist, status: "ok" },
      draftAndHold: { score: draftAndHold, status: "ok" },
      lowActivity: { score: lowActivity, status: "ok" },
      highActivity: { score: highActivity, status: "ok" },
      // Phase 2 - pending playerId crosswalk
      draftReliant: { score: null, status: "pending-data" },
      streamer: { score: null, status: "pending-data" },
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
    evidence.push("Draft Reliant & Streamer pending deeper player-linking data (Phase 2).");

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
