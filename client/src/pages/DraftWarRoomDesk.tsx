import { useMemo } from "react";
import {
  Crosshair, Shield, Clock, Target,
  TrendingDown, Gauge,
} from "lucide-react";
import { useLeagueContext } from "@/hooks/useLeagueContext";

/* ── palette: navy desk · gold = priority/rank/pick · teal/cyan = live read · red/orange = risk ── */
const GOLD = "#f5c518";
const TEAL = "#a3e635";
const CYAN = "#22d3ee";
const RISK = "#f87171";
const WARN = "#fb923c";
const TEXT = "#eaf1fb";
const MUTED = "var(--color-muted-foreground)";

/* match Command Dashboard panel system */
const PANEL: any = { background: "linear-gradient(180deg,#1f1624,#18111c)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 15 };
const SUB: any = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12 };

const pad2 = (n: number) => String(Math.max(0, n || 0)).padStart(2, "0");
const initials = (s: string) =>
  (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || "").toUpperCase()).join("") || "?";
const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(n || 0)));
const riskColor = (p: number) => (p >= 60 ? RISK : p >= 40 ? WARN : TEAL);

/**
 * Bounded, position-aware roster-need adjustment for the Command Board. Mirrors the server
 * mock-draft principle: real ADP leads and need only nudges within a position-capped window,
 * so a roster hole can never override draft capital. Shallow positions (you start one QB / one
 * K) get little or no boost — a K hole adds nothing, so kickers can never be lifted up the board.
 */
const POS_MAX_NEED_BOOST: Record<string, number> = { QB: 8, RB: 20, WR: 20, TE: 16, K: 0, DEF: 0 };
const NEED_URGENCY_FRACTION: Record<string, number> = { CRITICAL: 1, HIGH: 0.6, MEDIUM: 0.3 };
function needAdjustment(position: string, urgency: string | undefined): number {
  const max = POS_MAX_NEED_BOOST[position] ?? 10;
  const frac = urgency ? (NEED_URGENCY_FRACTION[urgency] ?? 0) : 0;
  return max * frac;
}

/**
 * Draft-capital priority straight from real ESPN ADP (lower ADP = more value available now):
 * adpPriority = 1000 − ADP. Players without an ADP fall back to server pool rank, ranked
 * strictly below every player who has a real ADP.
 */
function adpPriority(p: { adp?: number | null; rank?: number | null }): number {
  const adp = p.adp != null && Number.isFinite(Number(p.adp)) ? Number(p.adp) : null;
  const effective =
    adp != null && adp > 0
      ? adp
      : p.rank != null && Number.isFinite(Number(p.rank)) && Number(p.rank) > 0
        ? 300 + Number(p.rank)
        : 9999;
  return 1000 - effective;
}

/** Greedy top-N with max per position, then backfill if the pool is thin at some positions. */
function diversifyTopPlayers<T extends { position?: string; id?: string; name?: string }>(
  sorted: T[],
  take: number,
  maxPerPosition: number,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  const rowKey = (row: T) =>
    String(row.id ?? "").trim() ||
    `${String(row.position ?? "?")}:${String(row.name ?? "")
      .toLowerCase()
      .trim()}`;

  for (const p of sorted) {
    const pos = String(p.position ?? "?");
    if ((counts[pos] ?? 0) >= maxPerPosition) continue;
    const k = rowKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    counts[pos] = (counts[pos] ?? 0) + 1;
    if (out.length >= take) return out;
  }
  for (let i = 0; i < sorted.length && out.length < take; i++) {
    const p = sorted[i]!;
    const k = rowKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/* ── presentational helpers ── */
function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="shrink-0 grid place-items-center rounded-xl font-black"
      style={{ width: size, height: size, fontSize: size * 0.34, background: color + "1f", color, border: `1px solid ${color}44` }}
    >
      {initials(name)}
    </div>
  );
}

function SectionTitle({ icon: Icon, kicker, title, color }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid place-items-center rounded-xl shrink-0" style={{ width: 38, height: 38, background: color + "1a", border: `1px solid ${color}3a` }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        {kicker && <div className="text-label font-bold uppercase tracking-[0.18em] truncate" style={{ color: MUTED }}>{kicker}</div>}
        <div className="text-[20px] font-extrabold tracking-tight leading-tight" style={{ color: TEXT }}>{title}</div>
      </div>
    </div>
  );
}

function Panel({ children, className = "" }: any) {
  return (
    <div style={PANEL} className={`overflow-hidden ${className}`}>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Pill({ children, color, strong, dot }: any) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold"
      style={{
        background: strong ? color : "rgba(255,255,255,.05)",
        color: strong ? "#140e17" : color,
        border: strong ? "none" : "1px solid rgba(255,255,255,.10)",
      }}
    >
      {dot && <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: color }} />}
      {children}
    </span>
  );
}

function Empty({ children }: any) {
  return <div className="text-[13px] py-5 text-center" style={{ color: MUTED }}>{children}</div>;
}

/* ── Draft Reality Mode — presentation layer over existing DWR outputs (no new math) ── */
function realityRisk(score: number): { label: string; color: string; meaning: string } {
  if (score >= 70) return { label: "High", color: RISK, meaning: "Target pool becomes thin after this point — act decisively." };
  if (score >= 40) return { label: "Medium", color: WARN, meaning: "Most preferred targets are likely available." };
  return { label: "Low", color: TEAL, meaning: "Plenty of your targets should be available." };
}

/** Prep-only: pick windows / targets / risk. Scarcity + DNA live in detail sections (RFSN-027A). */
function DraftRealityMode({
  myPickWindow, mockDraft, myNeeds, usePersonalNeeds, pressureByRound,
}: any) {
  const picks = (myPickWindow ?? []).slice(0, 5);
  const firstPick = picks[0]?.pickNumber ?? null;
  const noTeam = picks.length === 0;

  // Team-need positions (FLEX → RB/WR/TE), reused from existing rosterNeeds — no scoring.
  const needPositions = useMemo(() => {
    const s = new Set<string>();
    if (usePersonalNeeds) for (const n of (myNeeds ?? [])) {
      const p = String(n.position || "").toUpperCase();
      if (p === "FLEX") { s.add("RB"); s.add("WR"); s.add("TE"); }
      else if (["QB", "RB", "WR", "TE"].includes(p)) s.add(p);
    }
    return s;
  }, [myNeeds, usePersonalNeeds]);

  // 2 — probably gone before your first pick (existing mock + ADP only)
  const probablyGone = useMemo(() => {
    if (firstPick == null) return [] as any[];
    return mockDraft
      .filter((p: any) => !p.isKeeperSlot && p.player && Number(p.pickNumber) < firstPick)
      .sort((a: any, b: any) => a.pickNumber - b.pickNumber)
      .slice(0, 12)
      .map((p: any) => ({ name: p.player, position: p.position }));
  }, [mockDraft, firstPick]);

  // 3 — targets per pick: Tier A = need-matched by board rank, Tier B = best available beyond needs
  const targets = useMemo(() => picks.map((w: any) => {
    const proj = w.projected ?? [];
    const tierA = needPositions.size
      ? proj.filter((p: any) => needPositions.has(String(p.position).toUpperCase())).slice(0, 3)
      : [];
    const aIds = new Set(tierA.map((p: any) => p.id));
    const tierB = proj.filter((p: any) => !aIds.has(p.id)).slice(0, 3);
    return { round: w.round, roundPick: w.roundPick, tierA, tierB };
  }), [picks, needPositions]);

  // 4 — pick risk: existing pressureByRound.hottestScore, banded for display only
  const pressureMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const r of (pressureByRound ?? [])) m.set(Number(r.round), r);
    return m;
  }, [pressureByRound]);
  const risks = picks.map((w: any) => {
    const score = Number(pressureMap.get(Number(w.round))?.hottestScore ?? 0);
    return { round: w.round, roundPick: w.roundPick, ...realityRisk(score) };
  });

  const chip = (name: string, pos: string, bg: string, key: any) => (
    <span key={key} className="text-[12px] font-bold px-2 py-0.5 rounded" style={{ color: TEXT, background: bg }}>
      {name} <span style={{ color: MUTED, fontWeight: 400 }}>{pos}</span>
    </span>
  );

  return (
    <Panel>
      <SectionTitle icon={Crosshair} kicker="Draft preparation" title="Draft Reality Mode" color={GOLD} />
      <div className="text-[12px] mt-2 mb-5" style={{ color: MUTED }}>
        Given the current keeper landscape, who'll actually be there when you pick — built from the keeper-aware mock, ADP, and market value already on this board.
      </div>

      {/* 1 — Likely available at my pick (the pick window, folded in) */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4" style={{ color: TEAL }} />
          <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: TEXT }}>Likely available at my pick</span>
        </div>
        {noTeam ? (
          <Empty>Link your team in Settings to project who'll be available at your picks.</Empty>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {picks.map((w: any) => (
              <div key={w.pickNumber} className="p-3" style={SUB}>
                <div className="text-[14px] font-black mb-1.5" style={{ color: GOLD }}>Pick {w.round}.{pad2(w.roundPick)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(w.projected ?? []).slice(0, 5).map((p: any, i: number) => chip(p.name, p.position, "rgba(46,212,191,.10)", p.id || i))}
                  {(w.projected ?? []).length === 0 && <span className="text-[12px]" style={{ color: MUTED }}>Board exhausted</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2 — probably gone before your pick */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4" style={{ color: RISK }} />
          <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: TEXT }}>Probably gone before your pick</span>
        </div>
        {noTeam ? (
          <Empty>Link your team to see who'll be gone before your first pick.</Empty>
        ) : probablyGone.length === 0 ? (
          <Empty>You pick early — nobody projects to go before you.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {probablyGone.map((p: any, i: number) => chip(p.name, p.position, "rgba(248,113,113,.10)", i))}
            </div>
            <div className="text-label" style={{ color: MUTED }}>Current ADP projects these selected before your slot.</div>
          </>
        )}
      </div>

      {/* 3 — draft targets */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Crosshair className="h-4 w-4" style={{ color: GOLD }} />
          <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: TEXT }}>Draft targets</span>
        </div>
        {noTeam ? (
          <Empty>Link your team to get per-pick targets.</Empty>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {targets.map((t: any) => (
              <div key={`${t.round}.${t.roundPick}`} className="p-3" style={SUB}>
                <div className="text-[14px] font-black mb-2" style={{ color: GOLD }}>Pick {t.round}.{pad2(t.roundPick)} targets</div>
                <div className="mb-2">
                  <div className="text-label uppercase tracking-wider mb-1" style={{ color: TEAL }}>Tier A · fits your need</div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.tierA.length === 0 && <span className="text-[12px]" style={{ color: MUTED }}>No need-fit available</span>}
                    {t.tierA.map((p: any, i: number) => chip(p.name, p.position, "rgba(46,212,191,.12)", p.id || i))}
                  </div>
                </div>
                <div>
                  <div className="text-label uppercase tracking-wider mb-1" style={{ color: MUTED }}>Tier B · best available</div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.tierB.map((p: any, i: number) => (
                      <span key={p.id || i} className="text-[12px] font-bold px-2 py-0.5 rounded" style={{ color: MUTED, background: "rgba(255,255,255,.04)" }}>
                        {p.name} <span style={{ fontWeight: 400 }}>{p.position}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4 — pick risk meter */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="h-4 w-4" style={{ color: WARN }} />
          <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: TEXT }}>Pick risk meter</span>
        </div>
        {noTeam ? (
          <Empty>Link your team to gauge per-pick risk.</Empty>
        ) : (
          <div className="space-y-2">
            {risks.map((r: any) => (
              <div key={`${r.round}.${r.roundPick}`} className="flex items-center gap-3 p-2.5" style={SUB}>
                <span className="text-[13px] font-black shrink-0" style={{ color: GOLD, width: 70 }}>Pick {r.round}.{pad2(r.roundPick)}</span>
                <span className="text-label font-black uppercase tracking-wider px-2 py-0.5 rounded shrink-0" style={{ color: r.color, background: r.color + "1f", minWidth: 64, textAlign: "center" }}>{r.label}</span>
                <span className="text-[12px]" style={{ color: MUTED }}>{r.meaning}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ── main prep desk (RFSN-027A: no duplicate DNA / roster / landscape intel) ── */
export function DraftWarRoomDesk({ data }: { data: any }) {
  const lg: any = useLeagueContext();
  const scoring: string = lg?.scoringType || "PPR";
  const teamCount: number = data?.teamCount ?? lg?.teamCount ?? 0;

  const rosterNeeds: any[] = data?.rosterNeeds ?? [];
  const shockMeters: any[] = data?.shockMeters ?? [];
  const availablePool: any[] = data?.availablePool ?? [];
  const mockDraft: any[] = data?.mockDraft ?? [];
  const draftAfterKeepers: any = data?.draftAfterKeepers ?? null;
  const pressureByRound: any[] = data?.pressureByRound ?? [];

  const myTeamId: number | null =
    lg?.myTeamId != null && Number.isFinite(Number(lg.myTeamId)) && Number(lg.myTeamId) > 0
      ? Number(lg.myTeamId)
      : null;

  const minePicks = useMemo(
    () => (myTeamId == null ? [] : mockDraft.filter((p) => Number(p.teamId) === myTeamId && !p.isKeeperSlot)),
    [mockDraft, myTeamId],
  );
  const personalNextPick = useMemo(() => {
    if (!minePicks.length) return null;
    return [...minePicks].sort((a, b) => a.pickNumber - b.pickNumber)[0];
  }, [minePicks]);

  // My Pick Window — for each of my upcoming slots, who's projected available (keeper-aware
  // board minus everyone the mock takes before that pick). Matched by playerId, then name.
  const myPickWindow = useMemo(() => {
    if (!minePicks.length) return [] as Array<{ pickNumber: number; round: number; roundPick: number; projected: any[] }>;
    const sortedMine = [...minePicks].sort((a, b) => a.pickNumber - b.pickNumber).slice(0, 6);
    const allPicks = mockDraft.filter((p) => !p.isKeeperSlot).sort((a, b) => a.pickNumber - b.pickNumber);
    return sortedMine.map((mp) => {
      const beforeIds = new Set<number>();
      const beforeNames = new Set<string>();
      for (const pk of allPicks) {
        if (pk.pickNumber >= mp.pickNumber) break;
        if (pk.espnId != null) beforeIds.add(Number(pk.espnId));
        if (pk.player) beforeNames.add(String(pk.player).toLowerCase());
      }
      const projected = availablePool
        .filter((p) => !beforeIds.has(Number(p.espnId)) && !beforeNames.has(String(p.name).toLowerCase()))
        .slice(0, 10);
      return { pickNumber: mp.pickNumber, round: mp.round, roundPick: mp.roundPick, projected };
    });
  }, [minePicks, mockDraft, availablePool]);

  const leagueAnchorPick = useMemo(
    () => mockDraft.find((p) => !p.isKeeperSlot) || mockDraft[0] || null,
    [mockDraft],
  );

  /** Personal roster needs apply to Command Board scoring only when we know the user's team and they have a mock slot. */
  const usePersonalNeeds = Boolean(myTeamId) && minePicks.length > 0;
  const anchorPick = personalNextPick ?? leagueAnchorPick;

  const myNeedsRow = useMemo(
    () => (myTeamId == null ? null : rosterNeeds.find((n) => Number(n.teamId) === myTeamId) || null),
    [rosterNeeds, myTeamId],
  );
  const myNeeds: any[] = myNeedsRow?.needs ?? [];
  const needByPos = useMemo(() => {
    const m: Record<string, string> = {};
    if (!usePersonalNeeds) return m;
    for (const n of myNeeds) m[n.position] = n.urgency;
    return m;
  }, [myNeeds, usePersonalNeeds]);

  const round = anchorPick?.round ?? 1;
  const roundPick = anchorPick?.roundPick ?? 1;

  const commandBoardKicker = usePersonalNeeds
    ? `Your next slot · Pick ${round}.${pad2(roundPick)} · best available`
    : `League draft board · Pick ${round}.${pad2(roundPick)} · best available`;

  const headerPickLabel = usePersonalNeeds ? `Pick ${round}.${pad2(roundPick)}` : `Next slot ${round}.${pad2(roundPick)}`;

  const board = useMemo(() => {
    const posSeen: Record<string, number> = {};
    const scored = availablePool.map((p) => {
      posSeen[p.position] = (posSeen[p.position] || 0) + 1;
      const posRank = posSeen[p.position];
      const urg = needByPos[p.position];
      // Draft-capital opportunity cost (mirrors the server mock engine): real ADP leads, roster
      // need only nudges within a position-capped window, Market Value and projection are tiny
      // tie-breakers — never cross-position drivers. No within-position value inflation, no
      // unbounded CRITICAL boost, no raw projection dominance.
      const adpPart = adpPriority(p); // 1000 − real ADP
      const needPart = needAdjustment(p.position, urg); // bounded per position (K/DEF = 0)
      const marketTieBreaker = (p.marketValue || 0) * 0.05; // 0–5, tie-breaker only
      const projTieBreaker = (p.projectedPoints || 0) * 0.005; // ~0–2, tie-breaker only
      const score = adpPart + needPart + marketTieBreaker + projTieBreaker;
      // Prep cue only — full owner behavior lives in dwr-dna (RFSN-027A).
      const rival = [...shockMeters]
        .filter((s) => s.mostLikelyPosition === p.position)
        .sort((a, b) => (b.surpriseProbability || 0) - (a.surpriseProbability || 0))[0] || null;
      return { ...p, posRank, urg, score, rival };
    });
    const sorted = scored.sort((a, b) => b.score - a.score);
    // Cap 3 per position (was 2): with ADP-led scoring the natural top is elite RB/WR, and a
    // cap of 2 would evict the third elite skill player to force in a QB/TE. Cap 3 keeps the
    // board on the best available draft capital.
    return diversifyTopPlayers(sorted, 6, 3);
  }, [availablePool, needByPos, shockMeters]);

  const timeline = useMemo(() => {
    const start = anchorPick?.pickNumber ?? 0;
    return mockDraft
      .filter((p) => p.pickNumber > start && !p.isKeeperSlot)
      .sort((a, b) => a.pickNumber - b.pickNumber)
      .slice(0, 8);
  }, [mockDraft, anchorPick]);

  return (
    <div className="space-y-4 mb-6" data-rfsn-027a-desk>
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center rounded-2xl shrink-0" style={{ width: 46, height: 46, background: GOLD + "1a", border: `1px solid ${GOLD}44` }}>
            <Crosshair className="h-6 w-6" style={{ color: GOLD }} />
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.22em]" style={{ color: MUTED }}>Draft Prep Desk</div>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-none" style={{ color: TEXT }}>On the Clock</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Pill color={GOLD} strong>{headerPickLabel}</Pill>
          <Pill color={TEXT}>Round {round}</Pill>
          <Pill color={TEXT}>{teamCount}-Team {scoring}</Pill>
          <Pill color={TEAL} dot>Synced</Pill>
          <Pill color={TEXT}>{usePersonalNeeds ? "Your team linked" : "League-wide board"}</Pill>
        </div>
      </div>

      {/* Next-Pick Command Board — full width (DNA lives in dwr-dna) */}
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <SectionTitle icon={Target} kicker={commandBoardKicker} title="Next-Pick Command Board" color={GOLD} />
          <span className="text-[12px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-full shrink-0" style={{ color: GOLD, background: GOLD + "14" }}>Top {board.length}</span>
        </div>
        <div className="space-y-2.5 mt-4">
          {board.length === 0 && <Empty>No available players — sync player registry.</Empty>}
          {board.map((p, i) => {
            const fit =
              p.urg === "CRITICAL" ? { t: "Perfect fit", c: GOLD }
              : p.urg === "HIGH" ? { t: "Strong fit", c: TEAL }
              : p.urg === "MEDIUM" ? { t: "Solid fit", c: CYAN }
              : { t: "Depth / BPA", c: MUTED };
            return (
              <div key={p.id || i} className="flex items-center gap-3.5 p-3.5" style={{ ...SUB, background: i === 0 ? "rgba(245,197,24,.07)" : SUB.background, border: i === 0 ? `1px solid ${GOLD}33` : SUB.border }}>
                <div className="grid place-items-center shrink-0" style={{ width: 34 }}>
                  <span className="text-[26px] font-black leading-none" style={{ color: i === 0 ? GOLD : TEXT }}>{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-bold truncate" style={{ color: TEXT }}>{p.name}</span>
                    <span className="text-[12px] font-bold px-2 py-0.5 rounded shrink-0" style={{ color: MUTED, background: "rgba(255,255,255,.05)" }}>{p.position} · #{p.posRank}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[12px] font-bold px-2 py-0.5 rounded" style={{ color: fit.c, background: fit.c + "18" }}>{fit.t}</span>
                    {p.rival && (
                      <span className="text-[12px] px-2 py-0.5 rounded" style={{ color: riskColor(p.rival.surpriseProbability || 0), background: riskColor(p.rival.surpriseProbability || 0) + "14" }}>
                        Also on {p.position} radar: {p.rival.ownerName} ({clamp(p.rival.surpriseProbability || 0)}%)
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[18px] font-black leading-none" style={{ color: TEAL }}>{Math.round(p.projectedPoints || 0)}</div>
                  <div className="text-2xs uppercase tracking-wider mt-1" style={{ color: MUTED }}>proj · MKT {p.marketValue != null ? Math.round(p.marketValue) : "—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Upcoming picks from synced draft board */}
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <SectionTitle icon={Clock} kicker="Draft board" title="Upcoming Picks" color={TEAL} />
          {timeline.length > 0 ? (
            <span className="text-caption font-bold px-2.5 py-1.5 rounded-full shrink-0" style={{ color: TEAL, background: TEAL + "14" }}>
              {timeline.length} on the clock
            </span>
          ) : null}
        </div>
        <div className="space-y-3 mt-4">
          {timeline.length === 0 && <Empty>No upcoming picks on the synced board.</Empty>}
          {timeline.map((p) => (
            <div key={p.pickNumber} className="flex items-center gap-3.5">
              <div className="shrink-0 text-center" style={{ width: 46 }}>
                <div className="text-[15px] font-black" style={{ color: GOLD }}>{p.round}.{pad2(p.roundPick)}</div>
              </div>
              <Avatar name={p.ownerName ?? p.teamName} color={CYAN} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold truncate" style={{ color: TEXT }}>
                  {p.ownerName ?? p.teamName ?? "TBD"}
                </div>
                <div className="text-caption truncate" style={{ color: MUTED }}>
                  {p.teamName ?? "Pick order from synced league"}
                  {p.isKeeperSlot ? " · Keeper slot" : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-2xs leading-snug" style={{ color: MUTED }}>
          Pick order from your synced league — open the Mock Draft Board for full simulation.
        </p>
      </Panel>

      {/* draft after keepers */}
      <Panel>
        <SectionTitle icon={Shield} kicker="Board reality" title="Draft After Keepers" color={GOLD} />
        {draftAfterKeepers && draftAfterKeepers.totalRemoved > 0 ? (
          <div className="mt-4">
            <div className="flex items-end gap-3 mb-4">
              <span className="text-[44px] font-black leading-none" style={{ color: GOLD }}>{draftAfterKeepers.totalRemoved}</span>
              <span className="text-[14px] font-bold uppercase tracking-wider mb-1.5" style={{ color: MUTED }}>players removed</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {[
                { label: "Manual", val: draftAfterKeepers.manual, c: TEAL },
                { label: "Confirmed", val: draftAfterKeepers.confirmed, c: CYAN },
                { label: "Predicted", val: draftAfterKeepers.predicted, c: GOLD },
              ].map((s) => (
                <div key={s.label} className="p-3 text-center" style={SUB}>
                  <div className="text-[24px] font-black leading-none" style={{ color: s.c }}>{s.val}</div>
                  <div className="text-label uppercase tracking-wider mt-1.5" style={{ color: MUTED }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="text-label font-bold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Top removed</div>
            <div className="flex flex-wrap gap-2">
              {(draftAfterKeepers.topRemoved ?? []).map((r: any) => (
                <span key={r.playerId} className="text-[12px] font-bold px-2.5 py-1 rounded" style={{ color: TEXT, background: "rgba(255,255,255,.05)" }}>
                  {r.playerName} <span style={{ color: MUTED }}>· {r.position}</span>
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
              <span className="text-label" style={{ color: MUTED }}>Keepers removed by player ID before the board, mock &amp; scarcity are built.</span>
            </div>
          </div>
        ) : (
          <Empty>No keepers removed — the board shows the full pool.</Empty>
        )}
      </Panel>

      <DraftRealityMode
        myPickWindow={myPickWindow}
        mockDraft={mockDraft}
        myNeeds={myNeeds}
        usePersonalNeeds={usePersonalNeeds}
        pressureByRound={pressureByRound}
      />
    </div>
  );
}
