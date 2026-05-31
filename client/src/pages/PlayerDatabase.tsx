import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Search, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// ── Position config ───────────────────────────────────────────────────────────

const POS_CONFIG: Record<string, { label: string; accent: string; pill: string; text: string; glow: string }> = {
  QB:  { label: "QB",   accent: "border-l-red-500",     pill: "bg-red-500/20 text-red-300 border-red-500/40",     text: "text-red-400",     glow: "shadow-red-500/20"    },
  RB:  { label: "RB",   accent: "border-l-emerald-500", pill: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", text: "text-emerald-400", glow: "shadow-emerald-500/20" },
  WR:  { label: "WR",   accent: "border-l-sky-500",     pill: "bg-sky-500/20 text-sky-300 border-sky-500/40",     text: "text-sky-400",     glow: "shadow-sky-500/20"    },
  TE:  { label: "TE",   accent: "border-l-orange-500",  pill: "bg-orange-500/20 text-orange-300 border-orange-500/40", text: "text-orange-400",  glow: "shadow-orange-500/20" },
  K:   { label: "K",    accent: "border-l-zinc-500",    pill: "bg-zinc-700 text-zinc-300 border-zinc-600",         text: "text-zinc-400",    glow: ""                     },
  DEF: { label: "D/ST", accent: "border-l-violet-500",  pill: "bg-violet-500/20 text-violet-300 border-violet-500/40", text: "text-violet-400",  glow: "shadow-violet-500/20" },
  DL:  { label: "DL",   accent: "border-l-rose-500",    pill: "bg-rose-500/20 text-rose-300 border-rose-500/40",   text: "text-rose-400",    glow: "shadow-rose-500/20"   },
  LB:  { label: "LB",   accent: "border-l-amber-500",   pill: "bg-amber-500/20 text-amber-300 border-amber-500/40", text: "text-amber-400",   glow: "shadow-amber-500/20"  },
  DB:  { label: "DB",   accent: "border-l-teal-500",    pill: "bg-teal-500/20 text-teal-300 border-teal-500/40",   text: "text-teal-400",    glow: "shadow-teal-500/20"   },
};

const FILTER_TABS = [
  { id: "",     label: "ALL" },
  { id: "QB",   label: "QB" },
  { id: "RB",   label: "RB" },
  { id: "WR",   label: "WR" },
  { id: "TE",   label: "TE" },
  { id: "FLEX", label: "FLEX" },
  { id: "K",    label: "K" },
  { id: "DL",   label: "DL" },
  { id: "LB",   label: "LB" },
  { id: "DB",   label: "DB" },
  { id: "DEF",  label: "D/ST" },
];

const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);

// ── Headshot ──────────────────────────────────────────────────────────────────

function Headshot({ espnId, name, pos }: { espnId: string | null; name: string; pos: string }) {
  const cfg = POS_CONFIG[pos] ?? POS_CONFIG.K;
  const initials = name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const [failed, setFailed] = useState(false);

  if (!espnId || failed) {
    return (
      <div className={cn(
        "w-11 h-11 rounded-full flex items-center justify-center text-[11px] font-bold border-2 shrink-0 select-none",
        "bg-zinc-800/80 border-zinc-700", cfg.text
      )}>
        {initials}
      </div>
    );
  }

  return (
    <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-zinc-800 border-2 border-zinc-700/60 ring-1 ring-white/5">
      <img
        src={`https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${espnId}.png&w=88&h=64&cb=1`}
        alt={name}
        className="w-full h-full object-cover object-top scale-110"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// ── Position pill ─────────────────────────────────────────────────────────────

function PosPill({ pos }: { pos: string }) {
  const cfg = POS_CONFIG[pos] ?? POS_CONFIG.K;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border uppercase", cfg.pill)}>
      {cfg.label}
    </span>
  );
}

// ── Team badge ────────────────────────────────────────────────────────────────

function TeamBadge({ team }: { team: string | null }) {
  if (!team) return <span className="text-zinc-600 text-xs italic">FA</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-6 h-6 rounded bg-zinc-700/60 border border-zinc-600/50 flex items-center justify-center text-[9px] font-bold text-zinc-300 shrink-0">
        {team.slice(0,2)}
      </span>
      <span className="text-xs font-semibold text-zinc-300">{team}</span>
    </div>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

type SortField = "fullName" | "position" | "currentNflTeam" | "firstSeasonSeen" | "lastSeasonSeen";
type SortDir   = "asc" | "desc";

function SortBtn({ field, label, sort, dir, onSort }: {
  field: SortField; label: string; sort: SortField; dir: SortDir; onSort: (f: SortField) => void;
}) {
  const active = sort === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 uppercase text-[10px] tracking-wider font-semibold transition-colors select-none",
        active ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
      )}
    >
      {label}
      {active
        ? dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        : <ChevronsUpDown className="h-3 w-3 opacity-40" />
      }
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlayerDatabase() {
  const _trpc = (trpc as any);

  const [search, setSearch]       = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [posFilter, setPosFilter] = useState<string>("");
  const [page, setPage]           = useState(0);
  const [sort, setSort]           = useState<SortField>("fullName");
  const [dir, setDir]             = useState<SortDir>("asc");
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const PAGE_SIZE = 25;
  const isFlex = posFilter === "FLEX";

  const { data, isLoading, isFetching, refetch } = _trpc.playerStats.getCanonicalPlayers.useQuery({
    query:    debouncedQ.trim() || undefined,
    position: (!isFlex && posFilter) ? posFilter : undefined,
    isActive: undefined,
    page,
    pageSize: PAGE_SIZE,
  }, { keepPreviousData: true });

  const raw: any[] = data?.players ?? [];

  // Client-side FLEX filter and sort
  const players = [...raw]
    .filter(p => isFlex ? FLEX_POSITIONS.has(p.position) : true)
    .sort((a, b) => {
      const av = a[sort] ?? "";
      const bv = b[sort] ?? "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });

  const total     = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedQ(v); setPage(0); }, 280);
  }, []);

  function toggleSort(f: SortField) {
    if (sort === f) setDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(f); setDir("asc"); }
  }

  function setFilter(id: string) {
    setPosFilter(id === posFilter ? "" : id);
    setPage(0);
  }

  // Pos counts for breakdown bar
  const posCounts: Record<string, number> = {};
  for (const p of raw) posCounts[p.position] = (posCounts[p.position] ?? 0) + 1;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">

      {/* ── Gradient header ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-zinc-800/80">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/40 via-zinc-900/60 to-zinc-950 pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-96 h-32 bg-emerald-500/5 blur-3xl rounded-full pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
                <h1 className="text-2xl font-black tracking-tight text-white">
                  Player Registry
                </h1>
              </div>
              <div className="flex items-center gap-3 ml-3">
                <span className="text-sm text-zinc-400 font-medium">
                  ATLANTAS FINEST FF · 2026
                </span>
                {total > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                    {total.toLocaleString()} players
                  </span>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search players…"
                className="w-full pl-9 pr-8 py-2.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/10 transition-colors"
              />
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedQ(""); setPage(0); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 text-lg leading-none">
                  ×
                </button>
              )}
            </div>
          </div>

          {/* ── Position filter tabs ──────────────────────────────────── */}
          <div className="mt-5 flex items-center gap-1 flex-wrap">
            {FILTER_TABS.map(tab => {
              const cfg = POS_CONFIG[tab.id];
              const active = posFilter === tab.id || (tab.id === "" && posFilter === "");
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-bold tracking-wide transition-all border",
                    active
                      ? tab.id === ""
                        ? "bg-zinc-100 text-zinc-900 border-zinc-100 shadow-sm"
                        : cn("border", cfg?.pill ?? "bg-zinc-700 text-zinc-200 border-zinc-600")
                      : "bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-600 hover:text-zinc-300"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
            <button
              onClick={() => refetch()}
              className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5"
            >
              <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">

        {/* ── Table ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-zinc-800/80 overflow-hidden shadow-xl shadow-black/40">

          {/* Table header */}
          <div className="grid bg-zinc-900/80 border-b border-zinc-800 px-4 py-3"
            style={{ gridTemplateColumns: "36px 1fr 90px 110px 90px 90px 80px 80px" }}>
            <div className="text-zinc-600 text-[10px] font-semibold">#</div>
            <SortBtn field="fullName"       label="Player"     sort={sort} dir={dir} onSort={toggleSort} />
            <SortBtn field="position"       label="Pos"        sort={sort} dir={dir} onSort={toggleSort} />
            <SortBtn field="currentNflTeam" label="NFL Team"   sort={sort} dir={dir} onSort={toggleSort} />
            <SortBtn field="firstSeasonSeen" label="1st Seen"  sort={sort} dir={dir} onSort={toggleSort} />
            <SortBtn field="lastSeasonSeen"  label="Last Seen" sort={sort} dir={dir} onSort={toggleSort} />
            <div className="text-[10px] tracking-wider font-semibold text-zinc-500 uppercase">Status</div>
            <div className="text-[10px] tracking-wider font-semibold text-zinc-600 uppercase text-right">ESPN ID</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-zinc-800/40">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-16 text-zinc-500 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-500" />
                Loading players…
              </div>
            )}

            {!isLoading && players.length === 0 && (
              <div className="py-20 text-center space-y-3">
                <div className="text-4xl">🏈</div>
                <p className="text-zinc-300 font-semibold">No players found</p>
                <p className="text-zinc-600 text-sm max-w-xs mx-auto">
                  {total === 0
                    ? "Open the Chrome extension and click POPULATE PLAYER REGISTRY."
                    : "Try a different search or position filter."}
                </p>
              </div>
            )}

            {players.map((p: any, i: number) => {
              const cfg = POS_CONFIG[p.position] ?? POS_CONFIG.K;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "grid items-center px-4 py-2.5 transition-colors group",
                    "hover:bg-zinc-800/50 border-l-2",
                    cfg.accent,
                    i % 2 === 0 ? "bg-zinc-900/10" : "bg-transparent"
                  )}
                  style={{ gridTemplateColumns: "36px 1fr 90px 110px 90px 90px 80px 80px" }}
                >
                  {/* Row # */}
                  <div className="text-zinc-600 text-xs tabular-nums font-mono">
                    {page * PAGE_SIZE + i + 1}
                  </div>

                  {/* Player */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Headshot espnId={p.espnPlayerId} name={p.fullName} pos={p.position} />
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-100 text-sm leading-tight truncate group-hover:text-white">
                        {p.fullName}
                      </div>
                      <div className={cn("text-[10px] font-semibold mt-0.5", cfg.text)}>
                        {cfg.label}
                      </div>
                    </div>
                  </div>

                  {/* Pos pill */}
                  <div><PosPill pos={p.position} /></div>

                  {/* Team */}
                  <div><TeamBadge team={p.currentNflTeam} /></div>

                  {/* First seen */}
                  <div className="text-xs tabular-nums text-zinc-400 font-medium">
                    {p.firstSeasonSeen ?? "—"}
                  </div>

                  {/* Last seen */}
                  <div className="text-xs tabular-nums text-zinc-400 font-medium">
                    {p.lastSeasonSeen ?? "—"}
                  </div>

                  {/* Status */}
                  <div>
                    {p.isActive ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-zinc-600">Inactive</span>
                    )}
                  </div>

                  {/* ESPN ID */}
                  <div className="text-right text-[10px] text-zinc-600 font-mono tabular-nums">
                    {p.espnPlayerId ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Pagination ──────────────────────────────────────────── */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 bg-zinc-900/60 border-t border-zinc-800/60 text-xs text-zinc-500">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of <span className="text-zinc-300 font-semibold">{total.toLocaleString()}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded border border-zinc-700 disabled:opacity-25 hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:cursor-not-allowed text-xs"
                >← Prev</button>

                {Array.from({ length: Math.min(7, totalPages) }, (_, idx) => {
                  const start = Math.max(0, Math.min(page - 3, totalPages - 7));
                  const pg = start + idx;
                  if (pg >= totalPages) return null;
                  return (
                    <button key={pg} onClick={() => setPage(pg)}
                      className={cn(
                        "w-8 h-7 rounded border text-xs font-semibold transition-colors",
                        pg === page
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200"
                      )}
                    >{pg + 1}</button>
                  );
                })}

                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded border border-zinc-700 disabled:opacity-25 hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:cursor-not-allowed text-xs"
                >Next →</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Position breakdown cards ───────────────────────────────── */}
        {total > 0 && (
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
            {Object.entries(POS_CONFIG).map(([pos, cfg]) => {
              const count = raw.filter((p: any) => p.position === pos).length;
              if (count === 0) return null;
              const active = posFilter === pos;
              return (
                <button
                  key={pos}
                  onClick={() => setFilter(pos)}
                  className={cn(
                    "rounded-lg border p-2.5 text-center transition-all hover:scale-105",
                    active
                      ? cn("border-current shadow-lg", cfg.pill)
                      : "bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700"
                  )}
                >
                  <div className={cn("text-xl font-black tabular-nums", active ? cfg.text : "text-zinc-200")}>
                    {count}
                  </div>
                  <div className={cn("text-[9px] font-bold tracking-widest mt-0.5 uppercase", active ? cfg.text : "text-zinc-600")}>
                    {cfg.label}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
