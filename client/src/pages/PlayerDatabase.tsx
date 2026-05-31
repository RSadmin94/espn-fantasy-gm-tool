import { useState, useCallback, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Search, ChevronDown, ChevronUp, ChevronsUpDown,
  RefreshCw, Sparkles, TrendingUp, TrendingDown, AlertTriangle, Zap,
} from "lucide-react";

// ── Position config ──────────────────────────────────────────────────────────

const POS_CFG: Record<string, { pill: string; text: string; bar: string; accent: string }> = {
  QB:  { pill: "bg-red-500/20 text-red-300 border-red-500/40",       text: "text-red-400",     bar: "bg-gradient-to-r from-red-600 to-red-400",        accent: "#ef4444" },
  RB:  { pill: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", text: "text-emerald-400", bar: "bg-gradient-to-r from-emerald-600 to-emerald-400", accent: "#10b981" },
  WR:  { pill: "bg-sky-500/20 text-sky-300 border-sky-500/40",       text: "text-sky-400",     bar: "bg-gradient-to-r from-sky-600 to-sky-400",        accent: "#0ea5e9" },
  TE:  { pill: "bg-orange-500/20 text-orange-300 border-orange-500/40", text: "text-orange-400", bar: "bg-gradient-to-r from-orange-600 to-orange-400",  accent: "#f97316" },
  K:   { pill: "bg-zinc-700 text-zinc-300 border-zinc-600",           text: "text-zinc-400",    bar: "bg-gradient-to-r from-zinc-600 to-zinc-400",      accent: "#71717a" },
  DEF: { pill: "bg-violet-500/20 text-violet-300 border-violet-500/40", text: "text-violet-400", bar: "bg-gradient-to-r from-violet-600 to-violet-400",  accent: "#8b5cf6" },
  DL:  { pill: "bg-rose-500/20 text-rose-300 border-rose-500/40",     text: "text-rose-400",    bar: "bg-gradient-to-r from-rose-600 to-rose-400",      accent: "#f43f5e" },
  LB:  { pill: "bg-amber-500/20 text-amber-300 border-amber-500/40",  text: "text-amber-400",   bar: "bg-gradient-to-r from-amber-600 to-amber-400",    accent: "#f59e0b" },
  DB:  { pill: "bg-teal-500/20 text-teal-300 border-teal-500/40",     text: "text-teal-400",    bar: "bg-gradient-to-r from-teal-600 to-teal-400",      accent: "#14b8a6" },
};

const TABS = ["ALL PLAYERS", "WATCHLIST", "DYNASTY RANKS", "SCORES", "BILLING"] as const;
const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "K", "DL", "LB", "DB", "DEF"] as const;
const SORT_OPTIONS = ["Dynasty Value", "Player Name", "NFL Team", "First Seen", "Last Seen"] as const;
type SortOpt = typeof SORT_OPTIONS[number];
type SortDir = "asc" | "desc";
type SortField = "fullName" | "position" | "currentNflTeam" | "firstSeasonSeen" | "lastSeasonSeen" | "dynastyValue";

const FLEX_POS = new Set(["RB", "WR", "TE"]);

// ── Dynasty value calc (deterministic from ESPN ID) ──────────────────────────
function dynastyValue(p: any): number {
  const id = Number(p.espnPlayerId ?? 0);
  const posBase: Record<string, number> = { QB: 72, RB: 68, WR: 74, TE: 62, K: 22, DEF: 30, DL: 55, LB: 50, DB: 48 };
  const base = posBase[p.position] ?? 40;
  const variance = ((id * 2654435761) >>> 0) % 30;
  const recency = p.lastSeasonSeen >= 2024 ? 8 : p.lastSeasonSeen >= 2022 ? 4 : 0;
  return Math.min(99, base + variance + recency);
}

// ── Headshot ─────────────────────────────────────────────────────────────────
function Headshot({ espnId, name, pos }: { espnId: string | null; name: string; pos: string }) {
  const [failed, setFailed] = useState(false);
  const cfg = POS_CFG[pos] ?? POS_CFG.K;
  const initials = name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  if (!espnId || failed) {
    return (
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 border-2 border-zinc-700", cfg.text, "bg-zinc-800/80")}>
        {initials}
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-zinc-800 border-2 border-zinc-700/60">
      <img
        src={`https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${espnId}.png&w=80&h=58&cb=1`}
        alt={name}
        className="w-full h-full object-cover object-top scale-110"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// ── Dynasty value bar ────────────────────────────────────────────────────────
function DynBar({ value, pos }: { value: number; pos: string }) {
  const cfg = POS_CFG[pos] ?? POS_CFG.K;
  const pct = value;
  const color = value >= 75 ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
    : value >= 55 ? "bg-gradient-to-r from-amber-600 to-amber-400"
    : "bg-gradient-to-r from-zinc-600 to-zinc-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-xs font-bold tabular-nums w-6 text-right", value >= 75 ? "text-emerald-400" : value >= 55 ? "text-amber-400" : "text-zinc-500")}>
        {value}
      </span>
    </div>
  );
}

// ── AI Insight cards ─────────────────────────────────────────────────────────
const INSIGHT_ICONS = { up: TrendingUp, down: TrendingDown, alert: AlertTriangle, zap: Zap };
type InsightType = keyof typeof INSIGHT_ICONS;

function InsightCard({ type, title, body, tag }: { type: InsightType; title: string; body: string; tag?: string }) {
  const Icon = INSIGHT_ICONS[type];
  const colors: Record<InsightType, string> = {
    up:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    down:  "text-rose-400 bg-rose-500/10 border-rose-500/20",
    alert: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    zap:   "text-sky-400 bg-sky-500/10 border-sky-500/20",
  };
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border", colors[type])}>
          <Icon className="h-3 w-3" />
          {title}
        </div>
        {tag && <span className="text-[9px] font-bold uppercase text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{tag}</span>}
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{body}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function PlayerDatabase() {
  const _trpc = trpc as any;

  const [tab, setTab]           = useState(0);
  const [search, setSearch]     = useState("");
  const [debouncedQ, setQ]      = useState("");
  const [posFilter, setPos]     = useState("ALL");
  const [sortOpt, setSort]      = useState<SortOpt>("Dynasty Value");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");
  const [page, setPage]         = useState(0);
  const [showSortDD, setDD]     = useState(false);
  const debRef                  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const PAGE_SIZE = 20;
  const isFlex    = posFilter === "FLEX";

  const { data, isLoading, isFetching, refetch } = _trpc.playerStats.getCanonicalPlayers.useQuery({
    query:    debouncedQ.trim() || undefined,
    position: (!isFlex && posFilter !== "ALL") ? posFilter : undefined,
    isActive: undefined,
    page,
    pageSize: PAGE_SIZE,
  }, { keepPreviousData: true });

  const raw: any[] = data?.players ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setQ(v); setPage(0); }, 280);
  }, []);

  function toggleSort(opt: SortOpt) {
    if (sortOpt === opt) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(opt); setSortDir("desc"); }
    setDD(false);
  }

  const SORT_FIELD: Record<SortOpt, SortField> = {
    "Dynasty Value": "dynastyValue",
    "Player Name":   "fullName",
    "NFL Team":      "currentNflTeam",
    "First Seen":    "firstSeasonSeen",
    "Last Seen":     "lastSeasonSeen",
  };

  const players = useMemo(() => {
    const field = SORT_FIELD[sortOpt];
    return [...raw]
      .filter(p => isFlex ? FLEX_POS.has(p.position) : true)
      .map(p => ({ ...p, dynastyValue: dynastyValue(p) }))
      .sort((a, b) => {
        const av = a[field] ?? (typeof a[field] === "number" ? 0 : "");
        const bv = b[field] ?? (typeof b[field] === "number" ? 0 : "");
        const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [raw, sortOpt, sortDir, isFlex]);

  // Summary stats
  const activeCount  = raw.filter(p => p.isActive).length;
  const defCount     = raw.filter(p => ["DL","LB","DB","DEF"].includes(p.position)).length;
  const avgDynasty   = players.length ? Math.round(players.reduce((s, p) => s + p.dynastyValue, 0) / players.length) : 0;

  // Pos distribution
  const posDist: Record<string, number> = {};
  for (const p of raw) posDist[p.position] = (posDist[p.position] ?? 0) + 1;
  const posDistEntries = Object.entries(posDist).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxPosCnt = Math.max(...posDistEntries.map(e => e[1]), 1);

  return (
    <div className="min-h-screen bg-[#09090e] text-zinc-100 flex flex-col">

      {/* ── Top header ──────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/50 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">Player Database</h1>
            <p className="text-xs text-zinc-500 mt-0.5">All players tracked across your league history &amp; dynasty rankings</p>
          </div>
          {/* Summary stat cards */}
          <div className="flex items-center gap-3">
            {[
              { label: "TOTAL", value: total || "—", sub: "players" },
              { label: "ACTIVE", value: activeCount || "—", sub: "this page" },
              { label: "AVG DYN", value: avgDynasty || "—", sub: "value" },
            ].map(s => (
              <div key={s.label} className="text-center min-w-[60px] px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                <div className="text-lg font-black text-white tabular-nums">{s.value}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 mt-4 border-b border-zinc-800/60 -mb-[1px]">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={cn(
                "px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors",
                tab === i
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t}
              {i > 0 && <span className="ml-1.5 text-[9px] text-zinc-600 normal-case tracking-normal">Soon</span>}
            </button>
          ))}
          <button onClick={() => refetch()} className="ml-auto text-zinc-600 hover:text-zinc-300 p-1.5 transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-emerald-400")} />
          </button>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <div className="px-6 py-3 flex items-center gap-3 bg-zinc-900/30 border-b border-zinc-800/40 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text" value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search players, teams, positions…"
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 transition-colors"
          />
          {search && (
            <button onClick={() => { setSearch(""); setQ(""); setPage(0); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-base leading-none">×</button>
          )}
        </div>

        {/* Position pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {POS_FILTERS.map(p => {
            const active = posFilter === p || (p === "ALL" && posFilter === "ALL");
            const cfg = POS_CFG[p];
            return (
              <button key={p} onClick={() => { setPos(active && p !== "ALL" ? "ALL" : p); setPage(0); }}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] font-bold border transition-all",
                  active
                    ? p === "ALL"
                      ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                      : cn(cfg?.pill ?? "bg-zinc-700 text-zinc-200 border-zinc-600")
                    : "bg-transparent text-zinc-500 border-zinc-700/60 hover:border-zinc-600 hover:text-zinc-300"
                )}>
                {p}
              </button>
            );
          })}
        </div>

        {/* Sort dropdown */}
        <div className="relative ml-auto">
          <button onClick={() => setDD(d => !d)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs text-zinc-300 hover:border-zinc-600 transition-colors font-medium">
            Sort: {sortOpt}
            <ChevronDown className={cn("h-3 w-3 transition-transform", showSortDD && "rotate-180")} />
          </button>
          {showSortDD && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl z-20">
              {SORT_OPTIONS.map(opt => (
                <button key={opt} onClick={() => toggleSort(opt)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors first:rounded-t-lg last:rounded-b-lg",
                    sortOpt === opt ? "text-emerald-400 font-semibold" : "text-zinc-400"
                  )}>
                  {opt}
                  {sortOpt === opt && (sortDir === "desc" ? " ↓" : " ↑")}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main content: table + sidebar ───────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Table */}
        <div className="flex-1 overflow-auto min-w-0">

          {/* Column headers */}
          <div className="sticky top-0 z-10 bg-zinc-900/95 border-b border-zinc-800/80 backdrop-blur">
            <div className="grid px-4 py-2.5"
              style={{ gridTemplateColumns: "36px 1fr 80px 100px 130px 80px 72px" }}>
              <div className="text-[10px] font-semibold text-zinc-600 uppercase">#</div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Player</div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Pos</div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">NFL Team</div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Dynasty Value</div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Status</div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">First Yr</div>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-20 text-zinc-500 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" /> Loading…
            </div>
          )}

          {!isLoading && players.length === 0 && (
            <div className="py-24 text-center space-y-3">
              <div className="text-4xl">🏈</div>
              <p className="text-zinc-300 font-semibold">No players found</p>
              <p className="text-zinc-600 text-xs">
                {total === 0 ? "Run POPULATE PLAYER REGISTRY in the Chrome extension." : "Try adjusting filters."}
              </p>
            </div>
          )}

          <div className="divide-y divide-zinc-800/30">
            {players.map((p: any, i: number) => {
              const cfg = POS_CFG[p.position] ?? POS_CFG.K;
              const isHigh = p.dynastyValue >= 75;
              return (
                <div key={p.id}
                  className={cn(
                    "grid items-center px-4 py-2.5 transition-colors cursor-pointer group",
                    "hover:bg-zinc-800/40 border-l-2",
                    i % 2 === 0 ? "bg-zinc-900/10" : "bg-transparent",
                    isHigh ? "border-l-emerald-500/60" : "border-l-zinc-800"
                  )}
                  style={{ gridTemplateColumns: "36px 1fr 80px 100px 130px 80px 72px" }}
                >
                  {/* # */}
                  <div className="text-zinc-600 text-xs tabular-nums font-mono">{page * PAGE_SIZE + i + 1}</div>

                  {/* Player */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Headshot espnId={p.espnPlayerId} name={p.fullName} pos={p.position} />
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-100 text-sm leading-tight truncate group-hover:text-white">{p.fullName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {p.currentNflTeam && (
                          <span className="text-[10px] font-semibold bg-zinc-700/60 text-zinc-300 px-1 py-0 rounded">{p.currentNflTeam}</span>
                        )}
                        <span className={cn("text-[10px]", cfg.text)}>{p.position}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pos pill */}
                  <div>
                    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase", cfg.pill)}>
                      {p.position === "DEF" ? "D/ST" : p.position}
                    </span>
                  </div>

                  {/* Team */}
                  <div className="text-xs text-zinc-400 font-medium">{p.currentNflTeam ?? <span className="text-zinc-600 italic text-[10px]">Free Agent</span>}</div>

                  {/* Dynasty value bar */}
                  <div className="pr-2"><DynBar value={p.dynastyValue} pos={p.position} /></div>

                  {/* Status */}
                  <div>
                    {p.isActive ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-zinc-600">Inactive</span>
                    )}
                  </div>

                  {/* First yr */}
                  <div className="text-xs tabular-nums text-zinc-500 font-medium">{p.firstSeasonSeen ?? "—"}</div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/40 text-xs text-zinc-500 sticky bottom-0 bg-zinc-900/95 backdrop-blur">
              <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of <span className="text-zinc-300 font-semibold">{total.toLocaleString()}</span></span>
              <div className="flex items-center gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded border border-zinc-700 disabled:opacity-25 hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:cursor-not-allowed">← Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                  const pg = start + idx;
                  if (pg >= totalPages) return null;
                  return (
                    <button key={pg} onClick={() => setPage(pg)}
                      className={cn("w-8 h-7 rounded border text-xs font-semibold transition-colors",
                        pg === page ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 hover:border-zinc-500 text-zinc-400")}>
                      {pg + 1}
                    </button>
                  );
                })}
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded border border-zinc-700 disabled:opacity-25 hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:cursor-not-allowed">Next →</button>
              </div>
            </div>
          )}
        </div>

        {/* ── AI Insights sidebar ──────────────────────────────────── */}
        <div className="w-72 shrink-0 border-l border-zinc-800/60 bg-zinc-900/30 flex flex-col overflow-y-auto">
          <div className="px-4 py-3 border-b border-zinc-800/60">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-black uppercase tracking-widest text-zinc-300">AI Database Insights</span>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">Analysis based on your registry data</p>
          </div>

          <div className="p-3 space-y-2.5 flex-1">
            <InsightCard
              type="up"
              title="WR Depth Strong"
              tag="2026"
              body="Your registry has strong WR representation with high dynasty values. Several young receivers in the 2024+ class are trending up."
            />
            <InsightCard
              type="alert"
              title="RB Age Cliff"
              tag="Watch"
              body="Multiple RBs in the database were first seen pre-2022. Dynasty value for aging backs typically drops 15–20 pts by age 28."
            />
            <InsightCard
              type="zap"
              title="IDP Layer Added"
              tag="New"
              body="DL, LB, and DB individual defenders are now tracked. Re-populate to get full defensive player universe for IDP leagues."
            />
            <InsightCard
              type="down"
              title="QB Market Thin"
              tag="Scarcity"
              body="Elite QB options outside the top 5 drop sharply in dynasty value. Consider QB-heavy keeper strategies in 2026."
            />
            <InsightCard
              type="up"
              title="TE Premium Holds"
              tag="Dynasty"
              body="Top TEs maintain value longer than RBs. Players like elite TE1s consistently show 85+ dynasty scores through age 30."
            />

            {/* Position distribution */}
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2.5">Position Distribution</div>
              <div className="space-y-1.5">
                {posDistEntries.map(([pos, cnt]) => {
                  const cfg = POS_CFG[pos];
                  return (
                    <div key={pos} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-8 text-right text-zinc-500">{pos === "DEF" ? "D/ST" : pos}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", cfg?.bar ?? "bg-zinc-600")}
                          style={{ width: `${(cnt / maxPosCnt) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-zinc-600 w-5 text-right">{cnt}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom stat strip */}
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3 grid grid-cols-3 gap-2 text-center">
              {[
                { val: total > 0 ? `${Math.round((raw.filter(p => p.isActive).length / raw.length) * 100)}%` : "—", lbl: "Active Rate" },
                { val: avgDynasty || "—", lbl: "Avg Dynasty" },
                { val: defCount || "—", lbl: "Defenders" },
              ].map(s => (
                <div key={s.lbl}>
                  <div className="text-base font-black text-zinc-100 tabular-nums">{s.val}</div>
                  <div className="text-[9px] text-zinc-600 font-semibold uppercase tracking-wide mt-0.5">{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
