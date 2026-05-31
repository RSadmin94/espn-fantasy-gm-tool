import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Users, RefreshCw } from "lucide-react";

// ── Position config ───────────────────────────────────────────────────────────

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
type Pos = typeof POSITIONS[number];

const POS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  QB:  { bg: "bg-red-950/60",     text: "text-red-300",     border: "border-red-700/60"     },
  RB:  { bg: "bg-emerald-950/60", text: "text-emerald-300", border: "border-emerald-700/60" },
  WR:  { bg: "bg-sky-950/60",     text: "text-sky-300",     border: "border-sky-700/60"     },
  TE:  { bg: "bg-orange-950/60",  text: "text-orange-300",  border: "border-orange-700/60"  },
  K:   { bg: "bg-zinc-800",       text: "text-zinc-300",    border: "border-zinc-600"       },
  DEF: { bg: "bg-violet-950/60",  text: "text-violet-300",  border: "border-violet-700/60"  },
};

function PosPill({ pos }: { pos: string }) {
  const c = POS_COLORS[pos] ?? { bg: "bg-zinc-800", text: "text-zinc-300", border: "border-zinc-600" };
  return (
    <span className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide border",
      c.bg, c.text, c.border
    )}>
      {pos === "DEF" ? "D/ST" : pos}
    </span>
  );
}

// ── NFL team badge ────────────────────────────────────────────────────────────

function TeamBadge({ team }: { team: string | null }) {
  if (!team) return <span className="text-zinc-600 text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-300">
      <span className="w-5 h-5 rounded bg-zinc-700/80 flex items-center justify-center text-[9px] font-bold text-zinc-200">
        {team.slice(0, 2)}
      </span>
      {team}
    </span>
  );
}

// -- Player headshot ---------------------------------------------------------

function PlayerHeadshot({ espnId, name, pos }: { espnId: string | null; name: string; pos: string }) {
  const c = POS_COLORS[pos] ?? { bg: "bg-zinc-800", text: "text-zinc-400", border: "border-zinc-600" };
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  if (!espnId) {
    return (
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border shrink-0", c.bg, c.text, c.border)}>
        {initials}
      </div>
    );
  }
  const src = `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${espnId}.png&w=80&h=58&cb=1`;
  return (
    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0">
      <img
        src={src}
        alt={name}
        className="absolute inset-0 w-full h-full object-cover object-top scale-110"
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          img.style.display = "none";
          const fb = img.parentElement?.querySelector(".fb-initials") as HTMLElement;
          if (fb) fb.style.display = "flex";
        }}
      />
      <div className={cn("fb-initials absolute inset-0 items-center justify-center text-xs font-bold hidden", c.bg, c.text)}>
        {initials}
      </div>
    </div>
  );
}

// -- Sort helpers -------------------------------------------------------------// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortField = "fullName" | "position" | "currentNflTeam" | "firstSeasonSeen" | "lastSeasonSeen";
type SortDir   = "asc" | "desc";

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return <ChevronsUpDown className="h-3 w-3 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3 text-emerald-400" />
    : <ChevronDown className="h-3 w-3 text-emerald-400" />;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PlayerDatabase() {
  const trpcA = () => (trpc as any);

  const [search, setSearch]       = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [posFilter, setPosFilter] = useState<Pos | "">("");
  const [page, setPage]           = useState(0);
  const [sort, setSort]           = useState<SortField>("fullName");
  const [dir, setDir]             = useState<SortDir>("asc");

  // Debounce search
  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout((handleSearch as any)._t);
    (handleSearch as any)._t = setTimeout(() => { setDebouncedQ(v); setPage(0); }, 280);
  }, []);

  const PAGE_SIZE = 25;

  const { data, isLoading, refetch } = trpcA().playerStats.getCanonicalPlayers.useQuery({
    query:    debouncedQ.trim() || undefined,
    position: posFilter || undefined,
    isActive: undefined,
    page,
    pageSize: PAGE_SIZE,
  }, { keepPreviousData: true });

  const raw: any[] = data?.players ?? [];

  // Client-side sort (server returns up to 25 per page)
  const players = [...raw].sort((a, b) => {
    const av = a[sort] ?? "";
    const bv = b[sort] ?? "";
    const cmp = typeof av === "number"
      ? (av as number) - (bv as number)
      : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  });

  const total     = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function toggleSort(f: SortField) {
    if (sort === f) setDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(f); setDir("asc"); }
    setPage(0);
  }

  const posCount: Record<string, number> = {};
  for (const p of raw) posCount[p.position] = (posCount[p.position] ?? 0) + 1;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Users className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Player Registry</h1>
              <p className="text-xs text-zinc-500">
                {total > 0 ? `${total.toLocaleString()} players · ATLANTAS FINEST FF` : "Loading…"}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search players…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setDebouncedQ(""); setPage(0); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >×</button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">

        {/* ── Position filter pills ──────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-zinc-500 mr-1">Position</span>
          <button
            onClick={() => { setPosFilter(""); setPage(0); }}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-semibold border transition-colors",
              posFilter === ""
                ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"
            )}
          >
            All
          </button>
          {POSITIONS.map(p => {
            const c = POS_COLORS[p];
            const active = posFilter === p;
            return (
              <button
                key={p}
                onClick={() => { setPosFilter(active ? "" : p); setPage(0); }}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-semibold border transition-colors",
                  active
                    ? cn(c.bg, c.text, c.border, "opacity-100")
                    : "bg-transparent text-zinc-500 border-zinc-700 hover:border-zinc-600"
                )}
              >
                {p === "DEF" ? "D/ST" : p}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left w-8">#</th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => toggleSort("fullName")} className="flex items-center gap-1 hover:text-zinc-200">
                      Player <SortIcon field="fullName" current={sort} dir={dir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button onClick={() => toggleSort("position")} className="flex items-center gap-1 hover:text-zinc-200 mx-auto">
                      Pos <SortIcon field="position" current={sort} dir={dir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => toggleSort("currentNflTeam")} className="flex items-center gap-1 hover:text-zinc-200">
                      NFL Team <SortIcon field="currentNflTeam" current={sort} dir={dir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button onClick={() => toggleSort("firstSeasonSeen")} className="flex items-center gap-1 hover:text-zinc-200 mx-auto">
                      First Seen <SortIcon field="firstSeasonSeen" current={sort} dir={dir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button onClick={() => toggleSort("lastSeasonSeen")} className="flex items-center gap-1 hover:text-zinc-200 mx-auto">
                      Last Seen <SortIcon field="lastSeasonSeen" current={sort} dir={dir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center text-zinc-600">ESPN ID</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-zinc-500 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Loading players…
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading && players.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="space-y-2">
                        <p className="text-zinc-400 font-medium">No players found</p>
                        <p className="text-zinc-600 text-xs">
                          {total === 0
                            ? "Run POPULATE PLAYER REGISTRY in the Chrome extension first."
                            : "Try a different search or position filter."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
                {players.map((p: any, i: number) => (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40",
                      i % 2 === 0 ? "bg-zinc-900/20" : "bg-transparent"
                    )}
                  >
                    {/* Row number */}
                    <td className="px-4 py-3 text-zinc-600 text-xs tabular-nums">
                      {page * PAGE_SIZE + i + 1}
                    </td>

                    {/* Player name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PlayerHeadshot espnId={p.espnPlayerId} name={p.fullName} pos={p.position} />
                        <div>
                          <div className="font-semibold text-zinc-100 leading-tight">{p.fullName}</div>
                        </div>
                      </div>
                    </td>

                    {/* Position */}
                    <td className="px-4 py-3 text-center">
                      <PosPill pos={p.position} />
                    </td>

                    {/* NFL Team */}
                    <td className="px-4 py-3">
                      <TeamBadge team={p.currentNflTeam} />
                    </td>

                    {/* First seen */}
                    <td className="px-4 py-3 text-center text-xs text-zinc-400 tabular-nums">
                      {p.firstSeasonSeen ?? "—"}
                    </td>

                    {/* Last seen */}
                    <td className="px-4 py-3 text-center text-xs text-zinc-400 tabular-nums">
                      {p.lastSeasonSeen ?? "—"}
                    </td>

                    {/* Active status */}
                    <td className="px-4 py-3 text-center">
                      {p.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-semibold">Inactive</span>
                      )}
                    </td>

                    {/* ESPN ID */}
                    <td className="px-4 py-3 text-center text-[10px] text-zinc-600 tabular-nums font-mono">
                      {p.espnPlayerId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ─────────────────────────────────────────── */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-t border-zinc-800 text-xs text-zinc-500">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded border border-zinc-700 disabled:opacity-30 hover:border-zinc-500 hover:text-zinc-300 transition-colors disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                  const pg = start + i;
                  return (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={cn(
                        "w-8 h-7 rounded border text-xs transition-colors",
                        pg === page
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {pg + 1}
                    </button>
                  );
                })}
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded border border-zinc-700 disabled:opacity-30 hover:border-zinc-500 hover:text-zinc-300 transition-colors disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Position breakdown ─────────────────────────────────── */}
        {total > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {POSITIONS.map(pos => {
              const count = raw.filter(p => p.position === pos).length;
              const c = POS_COLORS[pos];
              return (
                <button
                  key={pos}
                  onClick={() => { setPosFilter(posFilter === pos ? "" : pos); setPage(0); }}
                  className={cn(
                    "rounded-lg border p-3 text-center transition-all",
                    posFilter === pos
                      ? cn(c.bg, c.border, "opacity-100 shadow-lg")
                      : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-600"
                  )}
                >
                  <div className={cn("text-lg font-bold tabular-nums", posFilter === pos ? c.text : "text-zinc-200")}>
                    {count || "—"}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 font-semibold tracking-wide">
                    {pos === "DEF" ? "D/ST" : pos}
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
