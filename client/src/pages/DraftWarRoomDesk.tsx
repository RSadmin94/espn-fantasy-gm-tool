import { useMemo } from "react";
import {
  Crosshair, Flame, Shield, Activity, Clock, Target,
  AlertTriangle, ChevronRight, Radio, Quote,
} from "lucide-react";
import { useLeagueContext } from "@/hooks/useLeagueContext";

/* ── palette: navy desk · gold = priority/rank/pick · teal/cyan = live read · red/orange = risk ── */
const GOLD = "#f5c518";
const TEAL = "#a3e635";
const CYAN = "#22d3ee";
const RISK = "#f87171";
const WARN = "#fb923c";
const TEXT = "#eaf1fb";
const MUTED = "#8b97a8";

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

function archetype(pred: number, surp: number) {
  if (surp >= 72) return { label: "Panic Pivot", color: WARN };
  if (pred >= 68 && surp < 38) return { label: "By the Book", color: TEAL };
  if (pred < 46 || surp >= 58) return { label: "Wildcard", color: RISK };
  return { label: "Steady Hand", color: GOLD };
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

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const v = clamp(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
        <span className="text-[12px] font-bold" style={{ color }}>{v}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}>
        <div className="h-full rounded-full" style={{ width: v + "%", background: color }} />
      </div>
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
        {kicker && <div className="text-[10px] font-bold uppercase tracking-[0.18em] truncate" style={{ color: MUTED }}>{kicker}</div>}
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

/* ── main editorial desk ── */
export function DraftWarRoomDesk({ data }: { data: any }) {
  const lg: any = useLeagueContext();
  const scoring: string = lg?.scoringType || "PPR";
  const teamCount: number = data?.teamCount ?? lg?.teamCount ?? 0;

  const shockMeters: any[] = data?.shockMeters ?? [];
  const rosterNeeds: any[] = data?.rosterNeeds ?? [];
  const positionRunAlerts: any[] = data?.positionRunAlerts ?? [];
  const scarcityAlerts: any[] = data?.scarcityAlerts ?? [];
  const availablePool: any[] = data?.availablePool ?? [];
  const mockDraft: any[] = data?.mockDraft ?? [];
  const draftAfterKeepers: any = data?.draftAfterKeepers ?? null;
  const conf: any = data?.confidenceDashboard ?? {};

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

  const threats = useMemo(
    () => [...shockMeters].sort((a, b) => (b.surpriseProbability || 0) - (a.surpriseProbability || 0)).slice(0, 3),
    [shockMeters]
  );
  const topThreat = threats[0] || null;

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

  const dna = useMemo(
    () =>
      [...shockMeters]
        .sort((a, b) => (b.draftCapital || 0) - (a.draftCapital || 0))
        .slice(0, 8)
        .map((m) => {
          const pred = clamp(m.predictabilityScore || 0);
          const surp = clamp(m.surpriseProbability || 0);
          return {
            ...m,
            arc: archetype(pred, surp),
            scarcity: clamp((100 - pred) * 0.45 + surp * 0.25 + 30),
            risk: surp,
            volatility: clamp(100 - pred),
          };
        }),
    [shockMeters]
  );

  const timeline = useMemo(() => {
    const start = anchorPick?.pickNumber ?? 0;
    return mockDraft
      .filter((p) => p.pickNumber > start && !p.isKeeperSlot)
      .sort((a, b) => a.pickNumber - b.pickNumber)
      .slice(0, 8);
  }, [mockDraft, anchorPick]);
  const timelineConf = timeline.length
    ? clamp(timeline.reduce((s, p) => s + (p.confidence || 0), 0) / timeline.length)
    : 0;

  const triggers = useMemo(() => positionRunAlerts.slice(0, 4), [positionRunAlerts]);

  const memo = useMemo(() => {
    const out: { text: string; color: string }[] = [];
    if (usePersonalNeeds) {
      const crit = myNeeds.find((n) => n.urgency === "CRITICAL") || myNeeds.find((n) => n.urgency === "HIGH");
      if (crit) out.push({ text: `Lock ${crit.position} early — ${String(crit.urgency).toLowerCase()} hole on your roster.`, color: GOLD });
      else out.push({ text: `Roster is balanced — take best player available and bank value.`, color: TEAL });
    } else {
      out.push({
        text:
          "League-wide view — set your team in Settings to tie this memo to your roster holes.",
        color: TEAL,
      });
    }
    const run = positionRunAlerts[0];
    if (run) {
      const who = (run.affectedOwners || []).slice(0, 2).join(" & ");
      out.push({ text: `Pre-empt the ${run.position} run${who ? ` — ${who} circling` : ""} (Round ${run.expectedRound ?? run.roundWindow ?? "?"}).`, color: WARN });
    }
    const sc = scarcityAlerts[0];
    if (sc) out.push({ text: `Value window on ${sc.position} thinning — don't wait a full round.`, color: CYAN });
    const second = myNeeds[1];
    if (out.length < 3 && usePersonalNeeds && second) {
      out.push({ text: `Secondary target: ${second.position} (${String(second.urgency || "").toLowerCase()}).`, color: MUTED });
    }
    return out.slice(0, 3);
  }, [myNeeds, positionRunAlerts, scarcityAlerts, usePersonalNeeds]);

  const memoConfidence = clamp(conf?.mostPredictable?.score ?? timelineConf ?? 60);

  return (
    <div className="space-y-4 mb-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center rounded-2xl shrink-0" style={{ width: 46, height: 46, background: GOLD + "1a", border: `1px solid ${GOLD}44` }}>
            <Crosshair className="h-6 w-6" style={{ color: GOLD }} />
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.22em]" style={{ color: MUTED }}>League Intelligence Desk</div>
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

      {/* intelligence strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel>
          <SectionTitle icon={Flame} kicker="Live Read" title="Rival Threat Window" color={RISK} />
          <div className="space-y-3 mt-4">
            {threats.length === 0 && <Empty>No owner reads yet — sync league trends.</Empty>}
            {threats.map((t) => {
              const c = riskColor(t.surpriseProbability || 0);
              return (
                <div key={t.teamId} className="flex items-center gap-3 p-2.5" style={SUB}>
                  <Avatar name={t.ownerName} color={c} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold truncate" style={{ color: TEXT }}>{t.ownerName}</div>
                    <div className="text-[13px] truncate" style={{ color: MUTED }}>{t.teamName} · {t.mostLikelyPosition} threat</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[20px] font-black leading-none" style={{ color: c }}>{clamp(t.surpriseProbability || 0)}%</div>
                    <div className="text-[9px] uppercase tracking-wider mt-1" style={{ color: MUTED }}>surprise</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={Quote} kicker="The Receipt" title="Historical Read" color={GOLD} />
          {topThreat ? (
            <div className="mt-4">
              <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(245,197,24,.06)", border: `1px solid ${GOLD}26` }}>
                <p className="text-[15px] leading-snug" style={{ color: TEXT }}>
                  "{topThreat.ownerName} reads as a <span style={{ color: GOLD, fontWeight: 700 }}>{archetype(clamp(topThreat.predictabilityScore || 0), clamp(topThreat.surpriseProbability || 0)).label}</span> — most likely to attack <span style={{ color: GOLD, fontWeight: 700 }}>{topThreat.mostLikelyPosition}</span> when the board breaks."
                </p>
              </div>
              {(topThreat.evidence || []).slice(0, 2).map((e: string, i: number) => (
                <div key={i} className="flex items-start gap-2 mb-2">
                  <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" style={{ color: MUTED }} />
                  <span className="text-[13px]" style={{ color: MUTED }}>{e}</span>
                </div>
              ))}
              <div className="mt-3 text-[12px] font-bold uppercase tracking-wider" style={{ color: TEAL }}>
                Receipt confidence: {clamp(topThreat.predictabilityScore || 0) >= 60 ? "High" : "Moderate"}
              </div>
            </div>
          ) : (
            <Empty>No historical reads available yet.</Empty>
          )}
        </Panel>

        <Panel>
          <SectionTitle icon={Shield} kicker={usePersonalNeeds ? "Your Move" : "League lens"} title="Decision Memo" color={TEAL} />
          <div className="space-y-3 mt-4">
            {memo.map((m, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 shrink-0 rounded-full" style={{ width: 8, height: 8, background: m.color }} />
                <span className="text-[14px] leading-snug" style={{ color: TEXT }}>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.07] flex items-center justify-between">
            <span className="text-[12px] uppercase tracking-wider" style={{ color: MUTED }}>Memo confidence</span>
            <span className="text-[16px] font-black" style={{ color: TEAL }}>{memoConfidence}%</span>
          </div>
        </Panel>
      </div>

      {/* command board + owner dna */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
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
                      <div className="text-[9px] uppercase tracking-wider mt-1" style={{ color: MUTED }}>proj · MKT {p.marketValue != null ? Math.round(p.marketValue) : "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel>
          <SectionTitle icon={Activity} kicker="Behavioral" title="Owner DNA Map" color={CYAN} />
          <div className="space-y-3 mt-4 max-h-[620px] overflow-y-auto pr-1">
            {dna.length === 0 && <Empty>No owner profiles yet.</Empty>}
            {dna.map((m) => (
              <div key={m.teamId} className="p-3.5" style={SUB}>
                <div className="flex items-center gap-3 mb-3">
                  <Avatar name={m.ownerName} color={m.arc.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold truncate" style={{ color: TEXT }}>{m.ownerName}</div>
                    <div className="text-[12px] truncate" style={{ color: MUTED }}>{m.teamName}</div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ color: m.arc.color, background: m.arc.color + "18" }}>{m.arc.label}</span>
                </div>
                <div className="space-y-2">
                  <Bar label="Scarcity Seeking" value={m.scarcity} color={GOLD} />
                  <Bar label="Risk Tolerance" value={m.risk} color={RISK} />
                  <Bar label="Pick Volatility" value={m.volatility} color={CYAN} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* mock timeline + receipts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <SectionTitle icon={Clock} kicker={usePersonalNeeds ? "Projected" : "Projected · league order"} title="Mock Against Your League" color={TEAL} />
            <span className="text-[12px] font-bold px-2.5 py-1.5 rounded-full shrink-0" style={{ color: TEAL, background: TEAL + "14" }}>{timelineConf}% conf</span>
          </div>
          <div className="space-y-3 mt-4">
            {timeline.length === 0 && <Empty>No upcoming picks projected.</Empty>}
            {timeline.map((p) => (
              <div key={p.pickNumber} className="flex items-center gap-3.5">
                <div className="shrink-0 text-center" style={{ width: 46 }}>
                  <div className="text-[15px] font-black" style={{ color: GOLD }}>{p.round}.{pad2(p.roundPick)}</div>
                </div>
                <Avatar name={p.ownerName} color={CYAN} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold truncate" style={{ color: TEXT }}>{p.ownerName} <span style={{ color: MUTED, fontWeight: 400 }}>likely {p.position}</span></div>
                  <div className="text-[13px] truncate" style={{ color: MUTED }}>e.g. {p.player}</div>
                </div>
                <div className="text-[13px] font-bold shrink-0" style={{ color: riskColor(100 - (p.confidence || 0)) }}>{clamp(p.confidence || 0)}%</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={Radio} kicker="Watch For" title="Receipts & Triggers" color={WARN} />
          <div className="space-y-3 mt-4">
            {triggers.length === 0 && <Empty>No position-run triggers detected.</Empty>}
            {triggers.map((t, i) => {
              const c = (t.confidence || 0) >= 70 ? RISK : (t.confidence || 0) >= 50 ? WARN : TEAL;
              const owners = (t.affectedOwners || []).slice(0, 3).join(", ");
              const n = t.teamCount || (t.affectedOwners || []).length;
              return (
                <div key={i} className="p-3.5" style={SUB}>
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-[14px] font-bold" style={{ color: TEXT }}>{t.position} run forming</span>
                    <span className="text-[10px] font-black px-2.5 py-1 rounded-full shrink-0" style={{ color: c, background: c + "18" }}>{(t.confidence || 0) >= 70 ? "HIGH" : (t.confidence || 0) >= 50 ? "MED" : "LOW"} IMPACT</span>
                  </div>
                  <p className="text-[13px] leading-snug" style={{ color: MUTED }}>
                    {n} owners need {t.position} · projected window Round {t.expectedRound ?? t.roundWindow ?? "?"}{owners ? ` · ${owners}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
            <span className="text-[10px]" style={{ color: MUTED }}>Triggers are projected from current rosters &amp; tendencies, not past-season logs.</span>
          </div>
        </Panel>
      </div>

      {/* draft after keepers + my pick window */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                    <div className="text-[10px] uppercase tracking-wider mt-1.5" style={{ color: MUTED }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Top removed</div>
              <div className="flex flex-wrap gap-2">
                {(draftAfterKeepers.topRemoved ?? []).map((r: any) => (
                  <span key={r.playerId} className="text-[12px] font-bold px-2.5 py-1 rounded" style={{ color: TEXT, background: "rgba(255,255,255,.05)" }}>
                    {r.playerName} <span style={{ color: MUTED }}>· {r.position}</span>
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: MUTED }} />
                <span className="text-[10px]" style={{ color: MUTED }}>Keepers removed by player ID before the board, mock &amp; scarcity are built.</span>
              </div>
            </div>
          ) : (
            <Empty>No keepers removed — the board shows the full pool.</Empty>
          )}
        </Panel>

        <Panel>
          <SectionTitle icon={Target} kicker={usePersonalNeeds ? "Projected availability" : "Link your team for this"} title="My Pick Window" color={TEAL} />
          <div className="space-y-3 mt-4 max-h-[440px] overflow-y-auto pr-1">
            {myPickWindow.length === 0 && (
              <Empty>{usePersonalNeeds ? "No upcoming picks projected." : "Link your team in Settings to project who'll be there at your picks."}</Empty>
            )}
            {myPickWindow.map((w) => (
              <div key={w.pickNumber} className="p-3.5" style={SUB}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[15px] font-black" style={{ color: GOLD }}>Pick {w.round}.{pad2(w.roundPick)}</span>
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>projected available</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {w.projected.length === 0 && <span className="text-[12px]" style={{ color: MUTED }}>Board exhausted</span>}
                  {w.projected.slice(0, 8).map((p: any, i: number) => (
                    <span key={p.id || i} className="text-[12px] font-bold px-2 py-0.5 rounded" style={{ color: i < 3 ? TEXT : MUTED, background: i < 3 ? "rgba(46,212,191,.10)" : "rgba(255,255,255,.04)" }}>
                      {p.name} <span style={{ color: MUTED, fontWeight: 400 }}>{p.position}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
