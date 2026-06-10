import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { displayOwnerName } from "@/lib/ownerName";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
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
  Users,
  RefreshCw,
  X,
  ChevronRight,
} from "lucide-react";

// ── theme (matches Command Dashboard: dark slate panels, teal accent) ────────
const INK = "#140e17";
const PAGEBG: React.CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),linear-gradient(180deg,#0e0a10,#080609)",
  color: "#f3f8ff",
};
const PAPER = "linear-gradient(180deg,#1b131f,#140e17)";
const PAPER2 = "#1b131f";
const LINE = "rgba(255,255,255,0.07)";
const TEXT = "#f3f8ff";
const MUTED = "#8b97a8";
const GOLD = "#f5c518";
const ACCENT = "#a3e635";
const GREEN = "#a3e635";
const RED = "#ef4444";
const ORANGE = "#f7902f";
const BLUE = "#8b5cf6";
const CRIMSON = "#e23b3b";
const PANEL: React.CSSProperties = { background: PAPER, border: `1px solid ${LINE}`, borderRadius: 15 };
const SUB: React.CSSProperties = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 };

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
  /** Canonical owner-keys from rivalry.getScores — used to open the dossier reliably. */
  focalKey?: string;
  rivalKey?: string;
};

function Pill({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span
      className="px-4 py-2.5 rounded-[10px] text-[13px] font-extrabold inline-flex items-center"
      style={
        gold
          ? { color: GOLD, border: "1px solid rgba(245,198,90,.46)", background: "rgba(245,198,90,.10)" }
          : { border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT }
      }
    >
      {children}
    </span>
  );
}

function SectionHead({
  icon: Icon,
  title,
  caption,
  right,
  iconColor = ACCENT,
}: {
  icon: any;
  title: string;
  caption?: string;
  right?: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[20px] font-extrabold tracking-tight flex items-center gap-2">
          <Icon className="h-5 w-5" style={{ color: iconColor }} /> {title}
        </h3>
        {caption && <p className="mt-1 text-xs" style={{ color: MUTED }}>{caption}</p>}
      </div>
      {right}
    </div>
  );
}

function Panel({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} style={PANEL} className={`overflow-hidden ${className}`}>
      <div className="p-[18px] md:p-5">{children}</div>
    </section>
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
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const scoresQ = (trpc as any).rivalry.getScores.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 300_000, enabled: leagueKeyReady },
  );
  const listQ = (trpc as any).owners.ownerList.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 300_000, enabled: leagueKeyReady },
  );
  const cachedQ = (trpc as any).espn.cachedSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const profileQ = (trpc as any).me.activeProfile.useQuery(undefined, { staleTime: 600_000, retry: false });
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
    () => allOwners.map((o) => ({ ownerKey: o.ownerKey, label: displayOwnerName(o.ownerKey, o.ownerName) })),
    [allOwners],
  );

  const activeSeason = useMemo(() => {
    const c: number[] = cachedQ.data ?? [];
    return c.length ? Math.max(...c) : new Date().getFullYear();
  }, [cachedQ.data]);

  const eligible = useMemo(
    () =>
      buildDefaultRivalryEligibleOwnerKeys(
        allOwners.map((o) => ({
          ownerKey: o.ownerKey,
          seasons: Array.isArray(o.seasons) ? o.seasons : [],
          championships: n(o.championships),
        })),
        activeSeason,
      ),
    [allOwners, activeSeason],
  );

  const nameToKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of allOwners) m[norm(o.ownerName ?? o.ownerKey)] = o.ownerKey;
    return m;
  }, [allOwners]);

  const rodKey = useMemo(() => {
    // Prefer the signed-in user's selected owner from their active profile.
    const sel: string | null = profileQ.data?.isSetupComplete ? profileQ.data.selectedOwnerKey : null;
    if (sel && allOwners.some((o) => o.ownerKey === sel)) return sel;
    // Fallback (unchanged): focal-name match, else first picker option.
    for (const o of allOwners) {
      const nm = norm(o.ownerName);
      if (ROD_NAMES.some((r) => nm.includes(r))) return o.ownerKey;
    }
    return pickerOptions[0]?.ownerKey ?? "";
  }, [allOwners, pickerOptions, profileQ.data]);

  const rodName = useMemo(() => {
    const o = allOwners.find((x) => x.ownerKey === rodKey);
    const nm = String(o?.ownerName ?? "").trim();
    return nm ? (nm.split(/\s+/)[0] ?? nm) : "You";
  }, [allOwners, rodKey]);

  const pairs = useMemo<Pair[]>(() => {
    const arr: Pair[] = Array.isArray(scoresQ.data) ? scoresQ.data : [];
    return [...arr]
      .filter((p) => !graveNames.has(String(p.rivalName ?? "").trim().toLowerCase()))
      .sort((a, b) => n(b.rivalryScore) - n(a.rivalryScore));
  }, [scoresQ.data, listQ.data]);

  const keyForRival = (p: Pair) => nameToKey[norm(p.rivalName)] ?? undefined;
  // ── league-wide all-pairs rivalries (every owner's dossier) ──────────────
  type LeaguePair = { key: string; aKey: string; aName: string; bKey: string; bName: string; score: number; meetings: number; playoff: number; close: number; aWins: number; aLosses: number; lastSeason: number | null; heat: string };
  const h2hQ = (trpc as any).rivalry.h2h.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 600_000, enabled: leagueKeyReady },
  );
  const leagueLoading = !leagueKeyReady || h2hQ.isLoading;
  const firstName = (s: string) => String(s).trim().split(/\s+/)[0] ?? s;
  const heatOf = (s: number) => (s >= 150 ? "Inferno" : s >= 100 ? "Burning" : s >= 60 ? "Heated" : s >= 30 ? "Simmering" : "Cold");
  const { recordMap, leaguePairs, gridOwners, nemeses } = useMemo(() => {
    const data: any = h2hQ.data ?? {};
    const ownersRaw: any[] = Array.isArray(data.owners) ? data.owners : [];
    const pairs: any[] = Array.isArray(data.pairs) ? data.pairs : [];
    const nameToKey = new Map<string, string>();
    for (const o of allOwners) nameToKey.set(String(o.ownerName ?? "").trim().toLowerCase(), o.ownerKey);
    // Prefer the canonical ownerKey the server attached to each h2h owner row; fall back to name match.
    const serverKeyByName = new Map<string, string>();
    for (const o of ownersRaw) {
      const nm = String(o?.name ?? "").trim().toLowerCase();
      if (nm && o?.ownerKey) serverKeyByName.set(nm, String(o.ownerKey));
    }
    const keyFor = (name: string) =>
      serverKeyByName.get(String(name).trim().toLowerCase()) ??
      nameToKey.get(String(name).trim().toLowerCase()) ??
      String(name);
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
      if (worst) nemeses.push({ key: o.key, name: o.name, rivalKey: worst.rivalKey, rivalName: displayOwnerName(worst.rivalKey, nameOfKey.get(worst.rivalKey)), w: worst.w, l: worst.l, pct: worst.pct });
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
    if (bitter) out.push(mk(bitter, "Most Bitter Rivalry", `Rivalry score ${bitter.score} · ${bitter.meetings} meetings`));
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
    setOpen(null);
  }, [leagueContextKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openDossier = (p: Pair) =>
    setOpen({
      focalKey: p.focalKey ?? rodKey,
      focalName: rodName,
      rivalKey: p.rivalKey ?? keyForRival(p),
      rivalName: String(p.rivalName ?? "Rival"),
    });

  const loading = !leagueKeyReady || scoresQ.isLoading || listQ.isLoading;
  const allEmpty = !leagueLoading && leaguePairs.length === 0 && pairs.length === 0;
  const hero = pairs[0];
  const ranked = pairs.slice(0, 10);

  return (
    <div style={PAGEBG} className="-m-4 md:-m-6 p-5 md:p-7 min-h-full">
      {/* ── Header (dashboard style) ─────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-none">Rivalry Center</h2>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>
            Head-to-head records, heat, playoff scars, and the receipts behind every feud.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Pill gold>{activeSeason} Season</Pill>
          <Pill>{(gridOwners.length || allOwners.length) ? `${gridOwners.length || allOwners.length} Owners` : "League"}</Pill>
          <button
            onClick={() => refreshScores.mutate()}
            disabled={refreshScores.isPending}
            className="px-3 py-2.5 rounded-[10px] text-[13px] font-extrabold inline-flex items-center gap-2"
            style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: MUTED }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> {refreshScores.isPending ? "Generating…" : "Refresh"}
          </button>
        </div>
      </div>

      <main className="space-y-3">
        {loading ? (
          <Panel>
            <div className="py-16 text-center text-sm" style={{ color: MUTED }}>Loading league rivalries…</div>
          </Panel>
        ) : allEmpty ? (
          <Panel>
            <div className="py-12 text-center">
              <Swords className="mx-auto mb-3 h-8 w-8" style={{ color: MUTED }} />
              <div className="text-lg font-extrabold">No rivalry data yet</div>
              <p className="mt-1 text-sm" style={{ color: MUTED }}>
                Rivalry scores are computed from synced matchups, playoffs and trades. Sync more seasons to light up the board.
              </p>
            </div>
          </Panel>
        ) : (
          <>
            {/* ── Rivalry of the Year (featured) ─────────────────── */}
            {hero && (
              <Panel>
                <SectionHead
                  icon={Flame}
                  title="Rivalry of the Year"
                  caption="Your hottest active feud right now."
                  right={<HeatBadge label={hero.heatLabel} />}
                />
                <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-center">
                  <div className="flex-1">
                    <h3 className="text-3xl md:text-4xl font-black leading-tight">
                      {rodName} <span style={{ color: MUTED }}>vs</span>{" "}
                      <span style={{ color: ACCENT }}>{String(hero.rivalName ?? "Rival")}</span>
                    </h3>
                    {hero.revengeAchieved === false && n(hero.playoffEliminations) > 0 && (
                      <span className="mt-2 inline-block text-[11px] font-bold uppercase tracking-wider" style={{ color: RED }}>
                        Revenge pending
                      </span>
                    )}
                    {hero.loreSentence && (
                      <p className="mt-3 max-w-xl text-[15px] leading-relaxed" style={{ color: "#cfd2d8" }}>
                        {hero.loreSentence}
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        onClick={() => openDossier(hero)}
                        className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-extrabold"
                        style={{ background: ACCENT, color: "#1e1623" }}
                      >
                        View Full Rivalry <ChevronRight className="h-4 w-4" />
                      </button>
                      <a
                        href="#receipts"
                        className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-extrabold"
                        style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,.04)", color: TEXT }}
                      >
                        View Receipts
                      </a>
                    </div>
                  </div>
                  <div style={SUB} className="flex shrink-0 flex-col items-center justify-center px-8 py-6">
                    <div className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>Rivalry Score</div>
                    <div className="text-6xl font-black" style={{ color: GOLD }}>{n(hero.rivalryScore)}</div>
                  </div>
                </div>
                <div className="mt-4"><HeroStrip p={hero} /></div>
              </Panel>
            )}

            {/* ── The Ledger (league-wide power rankings) ────────── */}
            <div className="grid gap-3 lg:grid-cols-2 items-start">
            <Panel>
              <SectionHead icon={Flame} title="The Ledger" caption="League rivalry power rankings — every pairing in league history." />
              {leagueLoading ? (
                <div className="py-8 text-center text-sm" style={{ color: MUTED }}>Reading every head-to-head in league history…</div>
              ) : leaguePairs.length === 0 ? (
                <p className="py-6 text-sm" style={{ color: MUTED }}>Not enough cross-league matchup history yet.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {leaguePairs.slice(0, 10).map((lp, i) => {
                    const h = HEAT[lp.heat] ?? HEAT.Cold;
                    return (
                      <button
                        key={lp.key}
                        onClick={() => openLeague(lp)}
                        style={SUB}
                        className="group flex w-full items-center gap-4 p-4 text-left transition-colors hover:brightness-125"
                      >
                        <div className="w-9 shrink-0 text-center text-2xl font-black" style={{ color: i === 0 ? GOLD : MUTED }}>{i + 1}</div>
                        <div className="h-10 w-1 shrink-0 rounded-full" style={{ background: h.c }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-lg font-bold">{lp.aName} <span style={{ color: MUTED }}>vs</span> {lp.bName}</span>
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
            </Panel>

            {/* ── Your Feuds (Rod's personalized rivalries) ──────── */}
            <Panel>
              <SectionHead icon={Swords} title="Your Feuds" caption="Tap any rivalry for the full dossier." />
              {ranked.length === 0 && (
                <div style={SUB} className="mt-4 p-5 text-sm">
                  <span style={{ color: MUTED }}>Your personalized rivalry scores haven&rsquo;t been generated yet. </span>
                  <button
                    onClick={() => refreshScores.mutate()}
                    disabled={refreshScores.isPending}
                    className="ml-1 rounded-md px-3 py-1 text-xs font-extrabold"
                    style={{ background: ACCENT, color: "#1e1623" }}
                  >
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
                      style={SUB}
                      className="group flex w-full items-center gap-4 p-4 text-left transition-colors hover:brightness-125"
                    >
                      <div className="w-9 shrink-0 text-center text-2xl font-black" style={{ color: i === 0 ? GOLD : MUTED }}>{i + 1}</div>
                      <div className="h-10 w-1 shrink-0 rounded-full" style={{ background: h.c }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-lg font-bold">{rodName} <span style={{ color: MUTED }}>vs</span> {String(p.rivalName ?? "Rival")}</span>
                          <HeatBadge label={p.heatLabel} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: MUTED }}>
                          <span>Series <b style={{ color: TEXT }}>{n(p.h2hWins)}–{n(p.h2hLosses)}{n(p.h2hTies) ? `–${n(p.h2hTies)}` : ""}</b></span>
                          <span>Playoff elims <b style={{ color: TEXT }}>{n(p.playoffEliminations)}</b></span>
                          <span>Heartbreak losses <b style={{ color: TEXT }}>{n(p.closeLossCount)}</b></span>
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
            </Panel>

            {/* ── The Legends (league mythology) ─────────────────── */}
            </div>

            {mythology.length > 0 && (
              <Panel>
                <SectionHead icon={Crown} title="The Legends" caption="League mythology, pulled from every recorded meeting." iconColor={GOLD} />
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {mythology.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => setOpen({ focalKey: m.aKey, focalName: m.a, rivalKey: m.bKey, rivalName: m.b })}
                      style={SUB}
                      className="p-4 text-left transition-colors hover:brightness-125"
                    >
                      <div className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: GOLD }}>{m.title}</div>
                      <div className="mt-1 text-lg font-black leading-tight">{m.a} <span style={{ color: MUTED }}>vs</span> {m.b}</div>
                      <div className="mt-1 text-xs" style={{ color: MUTED }}>{m.detail}</div>
                    </button>
                  ))}
                </div>
              </Panel>
            )}

            {/* ── The Matrix (head-to-head grid) ─────────────────── */}
            {gridOwners.length > 1 && (
              <Panel>
                <SectionHead icon={Users} title="The Matrix" caption="Each cell is the row owner's all-time record vs the column owner. Tap a cell for the dossier." />
                {leagueLoading ? (
                  <div className="py-8 text-center text-sm" style={{ color: MUTED }}>Building the grid…</div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="border-collapse text-center text-xs">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 px-2 py-2 text-left" style={{ background: PAPER2, color: MUTED }}>Row vs column</th>
                          {gridOwners.map((c) => (
                            <th key={c.key} className="px-2 py-2 font-bold" style={{ color: MUTED }} title={c.name}>{firstName(c.name)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gridOwners.map((rw) => (
                          <tr key={rw.key}>
                            <td className="sticky left-0 z-10 whitespace-nowrap px-2 py-1.5 text-left font-bold" style={{ background: PAPER2, color: TEXT }}>{rw.name}</td>
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
                                    style={{ color: win ? GREEN : lose ? RED : MUTED, background: win ? "rgba(163,230,53,0.10)" : lose ? "rgba(239,68,68,0.10)" : "transparent" }}
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
              </Panel>
            )}

            {/* ── Nemesis Board ──────────────────────────────────── */}
            {nemeses.length > 0 && (
              <Panel>
                <SectionHead icon={Skull} title="Nemesis Board" caption="The active owner each manager has lost to most (min 3 meetings). Percent is the rival's win rate." iconColor={RED} />
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {nemeses.map((nm) => (
                    <button
                      key={nm.key}
                      onClick={() => setOpen({ focalKey: nm.key, focalName: nm.name, rivalKey: nm.rivalKey, rivalName: nm.rivalName })}
                      style={SUB}
                      className="flex items-center justify-between p-3 text-left transition-colors hover:brightness-125"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-bold">{nm.name}</div>
                        <div className="text-xs" style={{ color: MUTED }}>Nemesis: <span style={{ color: RED }}>{nm.rivalName}</span> · {nm.name} is {nm.w}-{nm.l} vs them</div>
                      </div>
                      <span className="shrink-0 text-sm font-black tabular-nums" style={{ color: RED }}>{Math.round(100 - nm.pct)}%</span>
                    </button>
                  ))}
                </div>
              </Panel>
            )}

            {/* ── Historical Receipts ────────────────────────────── */}
            <Panel id="receipts">
              <SectionHead icon={ScrollText} title="Historical Receipts" caption="Evidence from synced matchups, playoffs and trades." />
              {(() => {
                type R = { season: number | null; evidence: string; impact: string; tone: "bad" | "good" };
                const out: R[] = [];
                for (const p of pairs) {
                  const name = String(p.rivalName ?? "Rival");
                  if (n(p.playoffEliminations) > 0) {
                    out.push({
                      season: p.lastMatchupSeason ?? null,
                      evidence: `${name} eliminated ${rodName} from the playoffs ${n(p.playoffEliminations) > 1 ? `${n(p.playoffEliminations)} times` : "once"}.`,
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
                      evidence: `Revenge served — ${rodName} struck back against ${name}.`,
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
                      <div key={i} style={SUB} className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>{r.season ?? "—"}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: r.tone === "good" ? GOLD : RED }}>{r.impact}</span>
                        </div>
                        <p className="mt-2 text-[15px] leading-snug">{r.evidence}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Panel>

            {/* ── Revenge Watch + Trophies ───────────────────────── */}
            <div className="grid gap-3 md:grid-cols-2">
              <Panel>
                <SectionHead icon={Crosshair} title="Revenge Watch" caption="Unfinished business — outstanding playoff debts." iconColor={RED} />
                {(() => {
                  const rev = pairs.filter((p) => n(p.playoffEliminations) > 0 && !p.revengeAchieved);
                  if (rev.length === 0)
                    return <p className="py-6 text-sm" style={{ color: MUTED }}>No outstanding playoff debts. The ledger is clean.</p>;
                  return (
                    <div className="mt-4 space-y-2">
                      {rev.map((p, i) => (
                        <button key={i} onClick={() => openDossier(p)} style={SUB} className="flex w-full items-center justify-between p-3 text-left transition-colors hover:brightness-125">
                          <div>
                            <div className="font-bold">{String(p.rivalName)}</div>
                            <div className="text-xs" style={{ color: MUTED }}>Eliminated {rodName} {n(p.playoffEliminations)}× · revenge pending</div>
                          </div>
                          <Skull className="h-5 w-5" style={{ color: RED }} />
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </Panel>

              <Panel>
                <SectionHead icon={Trophy} title="Trophies" caption="Rivalry hardware across your feuds." iconColor={GOLD} />
                {(() => {
                  if (pairs.length === 0) return <p className="py-6 text-sm" style={{ color: MUTED }}>No trophies yet.</p>;
                  const by = (f: (p: Pair) => number) => [...pairs].sort((a, b) => f(b) - f(a))[0];
                  const nemesis = by((p) => n(p.rivalryScore));
                  const dealer = by((p) => n(p.playoffEliminations));
                  const pain = by((p) => n(p.closeLossCount));
                  const king = by((p) => n(p.h2hWins) - n(p.h2hLosses));
                  const items = [
                    { icon: <Skull className="h-4 w-4" />, t: "The Nemesis", who: nemesis?.rivalName, d: `Highest rivalry score (${n(nemesis?.rivalryScore)})` },
                    { icon: <HeartCrack className="h-4 w-4" />, t: "Heartbreak Dealer", who: dealer?.rivalName, d: `${n(dealer?.playoffEliminations)} playoff eliminations of ${rodName}` },
                    { icon: <Flame className="h-4 w-4" />, t: "House of Pain", who: pain?.rivalName, d: `${n(pain?.closeLossCount)} heartbreak losses` },
                    { icon: <Crown className="h-4 w-4" />, t: `${rodName} Owns Them`, who: king?.rivalName, d: `Best series margin (${n(king?.h2hWins)}–${n(king?.h2hLosses)})` },
                  ].filter((x) => x.who);
                  return (
                    <div className="mt-4 grid gap-2">
                      {items.map((x, i) => (
                        <div key={i} style={SUB} className="flex items-center gap-3 p-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${GOLD}1a`, color: GOLD }}>{x.icon}</span>
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
              </Panel>
            </div>
          </>
        )}
      </main>

      {/* ── Dossier popup ──────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 md:p-8"
          style={{ background: "rgba(4,5,8,0.82)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(null)}
        >
          <div
            className="relative w-full max-w-5xl rounded-2xl border"
            style={{ borderColor: `${ACCENT}55`, background: INK, boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b px-5 py-3" style={{ borderColor: LINE, background: INK }}>
              <div className="flex items-center gap-2" style={{ color: ACCENT }}>
                <Swords className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.35em]">Rivalry Dossier</span>
                <span className="text-sm font-bold" style={{ color: TEXT }}>· {open.focalName ?? rodName} vs {open.rivalName}</span>
              </div>
              <button onClick={() => setOpen(null)} className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: LINE, color: TEXT }} aria-label="Close">
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
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      {cells.map(([k, v], i) => (
        <div key={i} style={SUB} className="px-3 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: MUTED }}>{k}</div>
          <div className="mt-1 text-xl font-black" style={{ color: TEXT }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
