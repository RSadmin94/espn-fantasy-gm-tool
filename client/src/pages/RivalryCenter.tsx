import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  RivalryDossierPanel,
  type RivalryPickerOption,
} from "@/components/RivalryDossierPanel";
import { buildDefaultRivalryEligibleOwnerKeys } from "@/lib/rivalryOwnerEligibility";
import {
  Swords,
  Flame,
  Skull,
  HeartCrack,
  Trophy,
  Crosshair,
  Crown,
  ScrollText,
  X,
  ChevronRight,
} from "lucide-react";

// ── theme (editorial: ESPN / NFL Films / The Athletic — not neon) ───────────
const INK = "#0a0e16";
const PAGEBG = "radial-gradient(circle at 80% -10%,rgba(45,212,191,.16),transparent 42%),linear-gradient(180deg,#0a0e16,#070a11)";
const PAPER = "linear-gradient(180deg,#141a24,#0e131c)";
const PAPER2 = "#141a24";
const LINE = "rgba(255,255,255,0.07)";
const TEXT = "#f3f8ff";
const MUTED = "#8b97a8";
const CRIMSON = "#e23b3b";
const GOLD = "#f5c518";

const ROD_NAMES = ["rod sellers", "rodzilla", "str8frmhell", "rod s"];

const HEAT: Record<string, { c: string; label: string }> = {
  Cold: { c: "#6b7280", label: "Cold" },
  Simmering: { c: "#d8a23a", label: "Simmering" },
  Heated: { c: "#f0883e", label: "Heated" },
  Burning: { c: "#e8552e", label: "Burning" },
  Inferno: { c: "#d62828", label: "Inferno" },
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const n = (v: unknown) => Number(v ?? 0);

type Pair = {
  rivalId?: string;
  rivalName?: string;
  rivalryScore?: number;
  h2hWins?: number;
  h2hLosses?: number;
  h2hTies?: number;
  playoffEliminations?: number;
  closeLossCount?: number;
  recentLosses?: number;
  heatLabel?: string;
  painfulLossSeason?: number | null;
  painfulLossMargin?: number | null;
  painfulLossOpponentScore?: number | null;
  revengeAchieved?: boolean;
  lastMatchupSeason?: number | null;
  loreSentence?: string | null;
  rivalPlayoffWins?: number;
  rivalPlayoffLosses?: number;
};

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-bold uppercase tracking-[0.32em]"
      style={{ color: MUTED }}
    >
      {children}
    </div>
  );
}

function HeatBadge({ label }: { label?: string }) {
  const h = HEAT[label ?? "Cold"] ?? HEAT.Cold;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ color: h.c, border: `1px solid ${h.c}55`, background: `${h.c}14` }}
    >
      <Flame className="h-3 w-3" /> {h.label}
    </span>
  );
}

export function RivalryCenter() {
  const scoresQ = (trpc as any).rivalry.getScores.useQuery(undefined, {
    staleTime: 300_000,
  });
  const listQ = (trpc as any).owners.ownerList.useQuery(undefined, {
    staleTime: 300_000,
  });
  const cachedQ = (trpc as any).espn.cachedSeasons.useQuery(undefined, {
    staleTime: 60_000,
  });
  const refreshScores = (trpc as any).rivalry.refresh.useMutation({
    onSuccess: () => scoresQ.refetch(),
  });

  const allOwners: Array<{ ownerKey: string; ownerName?: string; seasons?: number[]; championships?: number }> =
    listQ.data?.allOwners ?? [];
  const graveNames = new Set(
    ((listQ.data?.graveyard ?? []) as any[]).map((o: any) => String(o.ownerName ?? o.ownerKey).trim().toLowerCase()),
  );
  const activeOwners: Array<{ ownerKey: string; ownerName?: string }> = (
    (listQ.data?.active ?? []) as any[]
  ).filter((o: any) => !graveNames.has(String(o.ownerName ?? o.ownerKey).trim().toLowerCase()));
  const activeKeys = activeOwners.map((o) => o.ownerKey);

  const pickerOptions = useMemo<RivalryPickerOption[]>(
    () => allOwners.map((o) => ({ ownerKey: o.ownerKey, label: String(o.ownerName ?? o.ownerKey) })),
    [allOwners],
  );

  const eligible = useMemo(
    () =>
      buildDefaultRivalryEligibleOwnerKeys(
        allOwners.map((o) => ({
          ownerKey: o.ownerKey,
          seasons: Array.isArray(o.seasons) ? o.seasons : [],
          championships: n(o.championships),
        })),
      ),
    [allOwners],
  );

  const activeSeason = useMemo(() => {
    const c: number[] = cachedQ.data ?? [];
    return c.length ? Math.max(...c) : new Date().getFullYear();
  }, [cachedQ.data]);

  const nameToKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of allOwners) m[norm(o.ownerName ?? o.ownerKey)] = o.ownerKey;
    return m;
  }, [allOwners]);

  const rodKey = useMemo(() => {
    for (const o of allOwners) {
      const nm = norm(o.ownerName);
      if (ROD_NAMES.some((r) => nm.includes(r))) return o.ownerKey;
    }
    return pickerOptions[0]?.ownerKey ?? "";
  }, [allOwners, pickerOptions]);

  const pairs = useMemo<Pair[]>(() => {
    const arr: Pair[] = Array.isArray(scoresQ.data) ? scoresQ.data : [];
    return [...arr]
      .filter((p) => !graveNames.has(String(p.rivalName ?? "").trim().toLowerCase()))
      .sort((a, b) => n(b.rivalryScore) - n(a.rivalryScore));
  }, [scoresQ.data, listQ.data]);

  const keyForRival = (p: Pair) => nameToKey[norm(p.rivalName)] ?? undefined;
  // ── league-wide all-pairs rivalries (every owner's dossier) ──────────────
  type LeaguePair = { key: string; aKey: string; aName: string; bKey: string; bName: string; score: number; meetings: number; playoff: number; close: number; aWins: number; aLosses: number; lastSeason: number | null; heat: string };
  const h2hQ = (trpc as any).rivalry.h2h.useQuery(undefined, { staleTime: 600_000 });
  const leagueLoading = h2hQ.isLoading;
  const firstName = (s: string) => String(s).trim().split(/\s+/)[0] ?? s;
  const heatOf = (s: number) => (s >= 150 ? "Inferno" : s >= 100 ? "Burning" : s >= 60 ? "Heated" : s >= 30 ? "Simmering" : "Cold");
  const { recordMap, leaguePairs, gridOwners, nemeses } = useMemo(() => {
    const data: any = h2hQ.data ?? {};
    const ownersRaw: any[] = Array.isArray(data.owners) ? data.owners : [];
    const pairs: any[] = Array.isArray(data.pairs) ? data.pairs : [];
    const nameToKey = new Map<string, string>();
    for (const o of allOwners) nameToKey.set(String(o.ownerName ?? "").trim().toLowerCase(), o.ownerKey);
    const keyFor = (name: string) => nameToKey.get(String(name).trim().toLowerCase()) ?? String(name);
    const activeNames = ownersRaw.filter((o) => Number(o.seasons) >= 2).map((o) => String(o.name));
    const activeSet = new Set(activeNames);
    const keyOfName = new Map<string, string>();
    const nameOfKey = new Map<string, string>();
    for (const nm of activeNames) { const k = keyFor(nm); keyOfName.set(nm, k); nameOfKey.set(k, nm); }
    const recordMap: Record<string, Record<string, { w: number; l: number; t: number }>> = {};
    const lps: LeaguePair[] = [];
    const maxSeason = pairs.reduce((mx, p) => Math.max(mx, Number(p.lastSeason) || 0), 0) || activeSeason;
    for (const p of pairs) {
      const aN = String(p.a), bN = String(p.b);
      if (!activeSet.has(aN) || !activeSet.has(bN)) continue;
      const aK = keyOfName.get(aN)!, bK = keyOfName.get(bN)!;
      const aWins = n(p.aWins), aLosses = n(p.aLosses), ties = n(p.ties);
      (recordMap[aK] ??= {})[bK] = { w: aWins, l: aLosses, t: ties };
      (recordMap[bK] ??= {})[aK] = { w: aLosses, l: aWins, t: ties };
      const meetings = n(p.meetings), playoff = n(p.playoff), close = n(p.close10);
      const recent = Number(p.lastSeason) >= maxSeason - 2 ? Math.min(3, meetings) : 0;
      const winPct = meetings ? (aWins / meetings) * 100 : 50;
      const balance = Math.max(0, 20 - Math.abs(winPct - 50) / 2.5);
      const score = Math.round(meetings * 3 + playoff * 25 + close * 6 + recent * 4 + balance);
      lps.push({ key: aK + "::" + bK, aKey: aK, aName: aN, bKey: bK, bName: bN, score, meetings, playoff, close, aWins, aLosses, lastSeason: Number(p.lastSeason) || null, heat: heatOf(score) });
    }
    lps.sort((a, b) => b.score - a.score);
    const gridOwners = activeNames.map((nm) => ({ key: keyOfName.get(nm)!, name: nm })).sort((a, b) => a.name.localeCompare(b.name));
    const nemeses: Array<{ key: string; name: string; rivalKey: string; rivalName: string; w: number; l: number; pct: number }> = [];
    for (const o of gridOwners) {
      const row = recordMap[o.key];
      if (!row) continue;
      let worst: { rivalKey: string; w: number; l: number; pct: number } | null = null;
      for (const [rk, rec] of Object.entries(row)) {
        const g = rec.w + rec.l + rec.t;
        if (g < 3) continue;
        const pct = g ? (rec.w / g) * 100 : 100;
        if (!worst || pct < worst.pct || (pct === worst.pct && rec.l > worst.l)) worst = { rivalKey: rk, w: rec.w, l: rec.l, pct };
      }
      if (worst) nemeses.push({ key: o.key, name: o.name, rivalKey: worst.rivalKey, rivalName: nameOfKey.get(worst.rivalKey) ?? worst.rivalKey, w: worst.w, l: worst.l, pct: worst.pct });
    }
    nemeses.sort((a, b) => a.pct - b.pct);
    return { recordMap, leaguePairs: lps, gridOwners, nemeses };
  }, [h2hQ.data, allOwners, activeSeason]);
  const openLeague = (lp: LeaguePair) => setOpen({ focalKey: lp.aKey, focalName: lp.aName, rivalKey: lp.bKey, rivalName: lp.bName });
  const mythology = useMemo(() => {
    type M = { title: string; a: string; b: string; aKey: string; bKey: string; detail: string };
    const ps = leaguePairs;
    if (ps.length === 0) return [] as M[];
    const mk = (lp: any, title: string, detail: string): M => ({ title, a: lp.aName, b: lp.bName, aKey: lp.aKey, bKey: lp.bKey, detail });
    const out: M[] = [];
    const bitter = ps[0];
    if (bitter) out.push(mk(bitter, "Most Bitter Rivalry", `Rivalry score ${bitter.score} \u00b7 ${bitter.meetings} meetings`));
    const longest = [...ps].sort((a, b) => b.meetings - a.meetings)[0];
    if (longest) out.push(mk(longest, "Longest Grudge", `${longest.meetings} all-time meetings`));
    const playoff = [...ps].filter((p) => p.playoff > 0).sort((a, b) => b.playoff - a.playoff)[0];
    if (playoff) out.push(mk(playoff, "Most Playoff Pain", `${playoff.playoff} playoff meetings`));
    const sided = [...ps].filter((p) => p.meetings >= 5).sort((a, b) => Math.abs(b.aWins - b.aLosses) / b.meetings - Math.abs(a.aWins - a.aLosses) / a.meetings)[0];
    if (sided) out.push(mk(sided, "Most One-Sided", `${Math.max(sided.aWins, sided.aLosses)}-${Math.min(sided.aWins, sided.aLosses)} series`));
    const tight = [...ps].filter((p) => p.meetings >= 6).sort((a, b) => Math.abs(a.aWins - a.aLosses) - Math.abs(b.aWins - b.aLosses) || b.meetings - a.meetings)[0];
    if (tight) out.push(mk(tight, "Dead Even", `${tight.aWins}-${tight.aLosses} across ${tight.meetings} games`));
    const close = [...ps].sort((a, b) => b.close - a.close)[0];
    if (close && close.close > 0) out.push(mk(close, "Most Heartbreak", `${close.close} one-score games`));
    const seen = new Set<string>();
    return out.filter((x) => (seen.has(x.title) ? false : (seen.add(x.title), true)));
  }, [leaguePairs]);



  const [open, setOpen] = useState<{ focalKey?: string; focalName?: string; rivalKey?: string; rivalName: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openDossier = (p: Pair) =>
    setOpen({ focalKey: rodKey, focalName: "Rod", rivalKey: keyForRival(p), rivalName: String(p.rivalName ?? "Rival") });

  const loading = scoresQ.isLoading || listQ.isLoading;
  const allEmpty = !leagueLoading && leaguePairs.length === 0 && pairs.length === 0;
  const hero = pairs[0];
  const ranked = pairs.slice(0, 10);

  return (
    <div
      className="-m-4 min-h-full p-5 md:-m-6 md:p-7"
      style={{ background: PAGEBG, color: TEXT }}
    >
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="mx-auto max-w-6xl border-b pb-6" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2" style={{ color: CRIMSON }}>
          <Swords className="h-4 w-4" />
          <span className="text-[11px] font-bold uppercase tracking-[0.4em]">GM War Room</span>
        </div>
        <h1
          className="mt-2 text-5xl font-black uppercase leading-[0.95] tracking-tight md:text-7xl"
          style={{ color: TEXT }}
        >
          Rivalry Center
        </h1>
        <p className="mt-2 text-lg italic" style={{ color: MUTED }}>
          Every feud has a history.
        </p>
      </header>

      <main className="mx-auto max-w-6xl">
        {loading ? (
          <div className="py-24 text-center text-sm" style={{ color: MUTED }}>
            Loading league rivalries…
          </div>
        ) : allEmpty ? (
          <div
            className="my-10 rounded-[12px] border p-10 text-center"
            style={{ borderColor: LINE, background: PAPER }}
          >
            <Swords className="mx-auto mb-3 h-8 w-8" style={{ color: MUTED }} />
            <div className="text-lg font-bold">No rivalry data yet</div>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              Rivalry scores are computed from synced matchups, playoffs and trades. Sync more
              seasons to light up the board.
            </p>
          </div>
        ) : (
          <>
            {/* ── SECTION 1 — Rivalry of the Year ──────────────────── */}
            {hero && (
              <section className="mt-8">
                <Kicker>Rivalry of the Year</Kicker>
                <div
                  className="mt-3 overflow-hidden rounded-[15px] border"
                  style={{
                    borderColor: `${CRIMSON}66`,
                    background: `linear-gradient(135deg, ${PAPER2} 0%, ${INK} 70%)`,
                    boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.03)`,
                  }}
                >
                  <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <HeatBadge label={hero.heatLabel} />
                        {hero.revengeAchieved === false && n(hero.playoffEliminations) > 0 && (
                          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: CRIMSON }}>
                            Revenge pending
                          </span>
                        )}
                      </div>
                      <h2 className="text-4xl font-black leading-tight md:text-5xl">
                        Rod <span style={{ color: MUTED }}>vs</span>{" "}
                        <span style={{ color: CRIMSON }}>{String(hero.rivalName ?? "Rival")}</span>
                      </h2>
                      {hero.loreSentence && (
                        <p className="mt-3 max-w-xl text-[15px] leading-relaxed" style={{ color: "#cfd2d8" }}>
                          {hero.loreSentence}
                        </p>
                      )}
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          onClick={() => openDossier(hero)}
                          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold"
                          style={{ background: CRIMSON, color: "#fff" }}
                        >
                          View Full Rivalry <ChevronRight className="h-4 w-4" />
                        </button>
                        <a
                          href="#receipts"
                          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-bold"
                          style={{ borderColor: LINE, color: TEXT }}
                        >
                          View Receipts
                        </a>
                      </div>
                    </div>
                    <div
                      className="flex shrink-0 flex-col items-center justify-center rounded-[12px] border px-8 py-6"
                      style={{ borderColor: LINE, background: "rgba(0,0,0,0.25)" }}
                    >
                      <div className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
                        Rivalry Score
                      </div>
                      <div className="text-6xl font-black" style={{ color: GOLD }}>
                        {n(hero.rivalryScore)}
                      </div>
                    </div>
                  </div>
                  <HeroStrip p={hero} />
                </div>
              </section>
            )}

            {/* ── SECTION 2 — Power Rankings ───────────────────────── */}
            {/* League-wide all-pairs rankings */}
            <section className="mt-12">
              <div className="flex items-end justify-between border-b pb-2" style={{ borderColor: LINE }}>
                <div>
                  <Kicker>League Rivalry Power Rankings</Kicker>
                  <h3 className="mt-1 text-2xl font-black uppercase tracking-tight">The Ledger</h3>
                </div>
                <span className="text-xs" style={{ color: MUTED }}>
                  Every pairing in league history
                </span>
              </div>
              {leagueLoading ? (
                <div className="py-8 text-center text-sm" style={{ color: MUTED }}>
                  Reading every head-to-head in league history…
                </div>
              ) : leaguePairs.length === 0 ? (
                <p className="py-6 text-sm" style={{ color: MUTED }}>
                  Not enough cross-league matchup history yet.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {leaguePairs.slice(0, 10).map((lp, i) => {
                    const h = HEAT[lp.heat] ?? HEAT.Cold;
                    return (
                      <button
                        key={lp.key}
                        onClick={() => openLeague(lp)}
                        className="group flex w-full items-center gap-4 rounded-[12px] border p-4 text-left"
                        style={{ borderColor: LINE, background: PAPER }}
                      >
                        <div className="w-9 shrink-0 text-center text-2xl font-black" style={{ color: i === 0 ? GOLD : MUTED }}>
                          {i + 1}
                        </div>
                        <div className="h-10 w-1 shrink-0 rounded-full" style={{ background: h.c }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-lg font-bold">
                              {lp.aName} <span style={{ color: MUTED }}>vs</span> {lp.bName}
                            </span>
                            <HeatBadge label={lp.heat} />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: MUTED }}>
                            <span>Meetings <b style={{ color: TEXT }}>{lp.meetings}</b></span>
                            <span>Playoff <b style={{ color: TEXT }}>{lp.playoff}</b></span>
                            <span>One-score games <b style={{ color: TEXT }}>{lp.close}</b></span>
                            {lp.lastSeason && <span>Last <b style={{ color: TEXT }}>{lp.lastSeason}</b></span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-3xl font-black" style={{ color: GOLD }}>{lp.score}</div>
                          <div className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>score</div>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-90" />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-12">
              <div className="flex items-end justify-between border-b pb-2" style={{ borderColor: LINE }}>
                <div>
                  <Kicker>Rod’s Rivalries</Kicker>
                  <h3 className="mt-1 text-2xl font-black uppercase tracking-tight">Your Feuds</h3>
                </div>
                <span className="text-xs" style={{ color: MUTED }}>
                  Tap any rivalry for the full dossier
                </span>
              </div>
              {ranked.length === 0 && (
                <div className="mt-4 rounded-[12px] border p-5 text-sm" style={{ borderColor: LINE, background: PAPER, color: MUTED }}>
                  Your personalized rivalry scores haven’t been generated yet.{" "}
                  <button onClick={() => refreshScores.mutate()} disabled={refreshScores.isPending} className="ml-1 rounded-md px-3 py-1 text-xs font-bold" style={{ background: CRIMSON, color: "#fff" }}>
                    {refreshScores.isPending ? "Generating…" : "Generate my rivalry scores"}
                  </button>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {ranked.map((p, i) => {
                  const h = HEAT[p.heatLabel ?? "Cold"] ?? HEAT.Cold;
                  return (
                    <button
                      key={`${p.rivalId ?? p.rivalName ?? i}`}
                      onClick={() => openDossier(p)}
                      className="group flex w-full items-center gap-4 rounded-[12px] border p-4 text-left transition-colors"
                      style={{ borderColor: LINE, background: PAPER }}
                    >
                      <div
                        className="w-9 shrink-0 text-center text-2xl font-black"
                        style={{ color: i === 0 ? GOLD : MUTED }}
                      >
                        {i + 1}
                      </div>
                      <div
                        className="h-10 w-1 shrink-0 rounded-full"
                        style={{ background: h.c }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-lg font-bold">
                            Rod <span style={{ color: MUTED }}>vs</span> {String(p.rivalName ?? "Rival")}
                          </span>
                          <HeatBadge label={p.heatLabel} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: MUTED }}>
                          <span>
                            Series <b style={{ color: TEXT }}>{n(p.h2hWins)}–{n(p.h2hLosses)}{n(p.h2hTies) ? `–${n(p.h2hTies)}` : ""}</b>
                          </span>
                          <span>
                            Playoff elims <b style={{ color: TEXT }}>{n(p.playoffEliminations)}</b>
                          </span>
                          <span>
                            Heartbreak losses <b style={{ color: TEXT }}>{n(p.closeLossCount)}</b>
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-3xl font-black" style={{ color: GOLD }}>{n(p.rivalryScore)}</div>
                        <div className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>score</div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-90" />
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── SECTION 4 — Historical Receipts ──────────────────── */}
            {/* League Mythology */}
            {mythology.length > 0 && (
              <section className="mt-12">
                <div className="border-b pb-2" style={{ borderColor: LINE }}>
                  <Kicker>League Mythology</Kicker>
                  <h3 className="mt-1 text-2xl font-black uppercase tracking-tight">The Legends</h3>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {mythology.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setOpen({ focalKey: m.aKey, focalName: m.a, rivalKey: m.bKey, rivalName: m.b })}
                      className="rounded-[15px] border p-4 text-left"
                      style={{ borderColor: LINE, background: PAPER }}
                    >
                      <div className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: GOLD }}>{m.title}</div>
                      <div className="mt-1 text-lg font-black leading-tight">
                        {m.a} <span style={{ color: MUTED }}>vs</span> {m.b}
                      </div>
                      <div className="mt-1 text-xs" style={{ color: MUTED }}>{m.detail}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Head-to-head grid (active owners) */}
            {gridOwners.length > 1 && (
              <section className="mt-12">
                <div className="border-b pb-2" style={{ borderColor: LINE }}>
                  <Kicker>Head-to-Head Grid</Kicker>
                  <h3 className="mt-1 text-2xl font-black uppercase tracking-tight">The Matrix</h3>
                </div>
                {leagueLoading ? (
                  <div className="py-8 text-center text-sm" style={{ color: MUTED }}>Building the grid…</div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="border-collapse text-center text-xs">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 px-2 py-2 text-left" style={{ background: INK, color: MUTED }}>Row vs column</th>
                          {gridOwners.map((c) => (
                            <th key={c.key} className="px-2 py-2 font-bold" style={{ color: MUTED }} title={c.name}>{firstName(c.name)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gridOwners.map((rw) => (
                          <tr key={rw.key}>
                            <td className="sticky left-0 z-10 whitespace-nowrap px-2 py-1.5 text-left font-bold" style={{ background: INK, color: TEXT }}>{rw.name}</td>
                            {gridOwners.map((c) => {
                              if (c.key === rw.key)
                                return <td key={c.key} className="px-2 py-1.5" style={{ color: "#3a3d44" }}>—</td>;
                              const rec = recordMap[rw.key]?.[c.key];
                              if (!rec || rec.w + rec.l + rec.t === 0)
                                return <td key={c.key} className="px-2 py-1.5" style={{ color: "#3a3d44" }}>·</td>;
                              const win = rec.w > rec.l;
                              const lose = rec.l > rec.w;
                              return (
                                <td key={c.key} className="px-1 py-1">
                                  <button
                                    onClick={() => setOpen({ focalKey: rw.key, focalName: rw.name, rivalKey: c.key, rivalName: c.name })}
                                    className="rounded px-1.5 py-0.5 font-bold tabular-nums"
                                    style={{ color: win ? "#34d399" : lose ? CRIMSON : MUTED, background: win ? "rgba(52,211,153,0.08)" : lose ? "rgba(226,59,59,0.08)" : "transparent" }}
                                    title={`${rw.name} vs ${c.name}`}
                                  >
                                    {rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ""}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-[11px]" style={{ color: MUTED }}>Each cell is the row owner's all-time record vs the column owner. Tap a cell for the dossier.</p>
              </section>
            )}
            {/* Nemesis board */}
            {nemeses.length > 0 && (
              <section className="mt-12">
                <div className="border-b pb-2" style={{ borderColor: LINE }}>
                  <Kicker>Who Owns Whom</Kicker>
                  <h3 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-tight"><Skull className="h-5 w-5" style={{ color: CRIMSON }} /> Nemesis Board</h3>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {nemeses.map((nm) => (
                    <button key={nm.key} onClick={() => setOpen({ focalKey: nm.key, focalName: nm.name, rivalKey: nm.rivalKey, rivalName: nm.rivalName })} className="flex items-center justify-between rounded-[12px] border p-3 text-left" style={{ borderColor: LINE, background: PAPER }}>
                      <div className="min-w-0">
                        <div className="truncate font-bold">{nm.name}</div>
                        <div className="text-xs" style={{ color: MUTED }}>Nemesis: <span style={{ color: CRIMSON }}>{nm.rivalName}</span> · {nm.name} is {nm.w}-{nm.l} vs them</div>
                      </div>
                      <span className="shrink-0 text-sm font-black tabular-nums" style={{ color: CRIMSON }}>{Math.round(100 - nm.pct)}%</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px]" style={{ color: MUTED }}>Nemesis = the active owner you've lost to most (min 3 meetings). Percent is their win rate against you.</p>
              </section>
            )}

            <section id="receipts" className="mt-12 scroll-mt-6">
              <div className="border-b pb-2" style={{ borderColor: LINE }}>
                <Kicker>The Evidence Locker</Kicker>
                <h3 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
                  <ScrollText className="h-5 w-5" style={{ color: CRIMSON }} /> Historical Receipts
                </h3>
              </div>
              {(() => {
                type R = { season: number | null; evidence: string; impact: string; tone: "bad" | "good" };
                const out: R[] = [];
                for (const p of pairs) {
                  const name = String(p.rivalName ?? "Rival");
                  if (n(p.playoffEliminations) > 0) {
                    out.push({
                      season: p.lastMatchupSeason ?? null,
                      evidence: `${name} eliminated Rod from the playoffs ${n(p.playoffEliminations) > 1 ? `${n(p.playoffEliminations)} times` : "once"}.`,
                      impact: "Season ended by rival",
                      tone: "bad",
                    });
                  }
                  if (p.painfulLossMargin != null) {
                    out.push({
                      season: p.painfulLossSeason ?? null,
                      evidence: `Lost to ${name} by ${Number(p.painfulLossMargin).toFixed(1)} pts${p.painfulLossOpponentScore != null ? ` (${Number(p.painfulLossOpponentScore).toFixed(1)} against)` : ""}.`,
                      impact: "Closest defeat in the series",
                      tone: "bad",
                    });
                  }
                  if (p.revengeAchieved && n(p.playoffEliminations) > 0) {
                    out.push({
                      season: p.lastMatchupSeason ?? null,
                      evidence: `Revenge served — Rod struck back against ${name}.`,
                      impact: "Receipt collected",
                      tone: "good",
                    });
                  }
                }
                out.sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
                if (out.length === 0)
                  return <p className="py-6 text-sm" style={{ color: MUTED }}>No receipts on file yet — the data hasn't surfaced a defining moment.</p>;
                return (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {out.slice(0, 8).map((r, i) => (
                      <div key={i} className="rounded-[12px] border p-4" style={{ borderColor: LINE, background: PAPER }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>
                            {r.season ?? "—"}
                          </span>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: r.tone === "good" ? GOLD : CRIMSON }}
                          >
                            {r.impact}
                          </span>
                        </div>
                        <p className="mt-2 text-[15px] leading-snug">{r.evidence}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>

            {/* ── SECTIONS 6 + 10 — Revenge Watch & Trophies ───────── */}
            <section className="mt-12 grid gap-6 md:grid-cols-2">
              <div>
                <div className="border-b pb-2" style={{ borderColor: LINE }}>
                  <Kicker>Unfinished Business</Kicker>
                  <h3 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
                    <Crosshair className="h-5 w-5" style={{ color: CRIMSON }} /> Revenge Watch
                  </h3>
                </div>
                {(() => {
                  const rev = pairs.filter((p) => n(p.playoffEliminations) > 0 && !p.revengeAchieved);
                  if (rev.length === 0)
                    return <p className="py-6 text-sm" style={{ color: MUTED }}>No outstanding playoff debts. The ledger is clean.</p>;
                  return (
                    <div className="mt-4 space-y-2">
                      {rev.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => openDossier(p)}
                          className="flex w-full items-center justify-between rounded-[12px] border p-3 text-left"
                          style={{ borderColor: LINE, background: PAPER }}
                        >
                          <div>
                            <div className="font-bold">{String(p.rivalName)}</div>
                            <div className="text-xs" style={{ color: MUTED }}>
                              Eliminated Rod {n(p.playoffEliminations)}× · revenge pending
                            </div>
                          </div>
                          <Skull className="h-5 w-5" style={{ color: CRIMSON }} />
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div>
                <div className="border-b pb-2" style={{ borderColor: LINE }}>
                  <Kicker>Rivalry Hardware</Kicker>
                  <h3 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
                    <Trophy className="h-5 w-5" style={{ color: GOLD }} /> Trophies
                  </h3>
                </div>
                {(() => {
                  if (pairs.length === 0) return null;
                  const by = (f: (p: Pair) => number) => [...pairs].sort((a, b) => f(b) - f(a))[0];
                  const nemesis = by((p) => n(p.rivalryScore));
                  const dealer = by((p) => n(p.playoffEliminations));
                  const pain = by((p) => n(p.closeLossCount));
                  const king = by((p) => n(p.h2hWins) - n(p.h2hLosses));
                  const items = [
                    { icon: <Skull className="h-4 w-4" />, t: "The Nemesis", who: nemesis?.rivalName, d: `Highest rivalry score (${n(nemesis?.rivalryScore)})` },
                    { icon: <HeartCrack className="h-4 w-4" />, t: "Heartbreak Dealer", who: dealer?.rivalName, d: `${n(dealer?.playoffEliminations)} playoff eliminations of Rod` },
                    { icon: <Flame className="h-4 w-4" />, t: "House of Pain", who: pain?.rivalName, d: `${n(pain?.closeLossCount)} heartbreak losses` },
                    { icon: <Crown className="h-4 w-4" />, t: "Rod Owns Them", who: king?.rivalName, d: `Best series margin (${n(king?.h2hWins)}–${n(king?.h2hLosses)})` },
                  ].filter((x) => x.who);
                  return (
                    <div className="mt-4 grid gap-2">
                      {items.map((x, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-[12px] border p-3" style={{ borderColor: LINE, background: PAPER }}>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${GOLD}1a`, color: GOLD }}>
                            {x.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>{x.t}</div>
                            <div className="truncate font-bold">{String(x.who)}</div>
                            <div className="text-xs" style={{ color: MUTED }}>{x.d}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </section>
          </>
        )}
      </main>

      {/* ── POPUP — Rivalry Dossier ──────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 md:p-8"
          style={{ background: "rgba(4,5,8,0.82)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(null)}
        >
          <div
            className="relative w-full max-w-5xl rounded-2xl border"
            style={{ borderColor: `${CRIMSON}55`, background: INK, boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b px-5 py-3"
              style={{ borderColor: LINE, background: INK }}
            >
              <div className="flex items-center gap-2" style={{ color: CRIMSON }}>
                <Swords className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.35em]">Rivalry Dossier</span>
                <span className="text-sm font-bold" style={{ color: TEXT }}>· {open.focalName ?? "Rod"} vs {open.rivalName}</span>
              </div>
              <button
                onClick={() => setOpen(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border"
                style={{ borderColor: LINE, color: TEXT }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 md:p-5">
              <RivalryDossierPanel
                key={`${open.focalKey ?? rodKey}:${open.rivalKey ?? "default"}`}
                focalOwnerKey={open.focalKey ?? rodKey}
                initialOpponentKey={open.rivalKey}
                pickerOptions={pickerOptions}
                rivalryEligibleOwnerKeys={eligible}
                activeSeason={activeSeason}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hero stat strip ─────────────────────────────────────────────────────────
function HeroStrip({ p }: { p: Pair }) {
  const series = `${n(p.h2hWins)}–${n(p.h2hLosses)}${n(p.h2hTies) ? `–${n(p.h2hTies)}` : ""}`;
  const playoff =
    p.rivalPlayoffWins != null || p.rivalPlayoffLosses != null
      ? `${n(p.rivalPlayoffWins)}–${n(p.rivalPlayoffLosses)}`
      : `${n(p.playoffEliminations)} elim`;
  const heartbreak = p.painfulLossMargin != null ? `${Number(p.painfulLossMargin).toFixed(1)} pts` : "—";
  const last = p.lastMatchupSeason != null ? String(p.lastMatchupSeason) : "—";
  const cells: Array<[string, string]> = [
    ["Series Record", series],
    ["Playoff Record", playoff],
    ["Closest Loss", heartbreak],
    ["Last Meeting", last],
    ["Recent Losses", String(n(p.recentLosses))],
  ];
  return (
    <div className="grid grid-cols-2 border-t md:grid-cols-5" style={{ borderColor: LINE }}>
      {cells.map(([k, v], i) => (
        <div
          key={i}
          className="border-b border-r px-4 py-4 md:border-b-0"
          style={{ borderColor: LINE }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: MUTED }}>{k}</div>
          <div className="mt-1 text-2xl font-black" style={{ color: TEXT }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
