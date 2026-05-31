import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Loader2, Search, ArrowLeft, Trophy, ArrowRightLeft,
  Lock, Users, BookOpen, X,
} from "lucide-react";

const trpcA = () => (trpc as any);

// ── Position colors ────────────────────────────────────────────────────────────

const POS_PILL: Record<string, string> = {
  QB: "bg-red-900/30 text-red-300 border border-red-700",
  RB: "bg-emerald-900/30 text-emerald-300 border border-emerald-700",
  WR: "bg-blue-900/30 text-blue-300 border border-blue-700",
  TE: "bg-orange-900/30 text-orange-300 border border-orange-700",
  K:  "bg-zinc-800 text-zinc-300 border border-zinc-700",
  "D/ST": "bg-violet-900/30 text-violet-300 border border-violet-700",
};

function PosPill({ pos }: { pos: string }) {
  const cls = POS_PILL[pos] ?? "bg-zinc-800 text-zinc-300 border border-zinc-700";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", cls)}>
      {pos || "—"}
    </span>
  );
}

// ── Ownership dot ──────────────────────────────────────────────────────────────

function TlDot({ type }: { type: "champ" | "keeper" | "draft" | "trade" | "active" }) {
  const styles = {
    champ:  "border-amber-500 bg-amber-900/40",
    keeper: "border-blue-500 bg-blue-900/40",
    draft:  "border-zinc-500 bg-zinc-800",
    trade:  "border-red-500 bg-red-900/30",
    active: "border-emerald-500 bg-emerald-900/30",
  };
  return (
    <div className={cn("absolute left-[-17px] top-[5px] h-[10px] w-[10px] rounded-full border-2", styles[type])} />
  );
}

function tlType(row: { isKeeper: boolean; isChampionSeason: boolean; acquisitionType: string }): "champ" | "keeper" | "trade" | "draft" {
  if (row.isChampionSeason) return "champ";
  if (row.isKeeper || row.acquisitionType?.toLowerCase().includes("keep")) return "keeper";
  if (row.acquisitionType?.toLowerCase().includes("trade")) return "trade";
  return "draft";
}

// ── Tiny badge ─────────────────────────────────────────────────────────────────

function Tag({ children, color = "zinc" }: { children: React.ReactNode; color?: "green" | "blue" | "amber" | "red" | "zinc" }) {
  const c = {
    green: "bg-emerald-900/30 text-emerald-300 border-emerald-700",
    blue:  "bg-blue-900/30 text-blue-300 border-blue-700",
    amber: "bg-amber-900/30 text-amber-300 border-amber-700",
    red:   "bg-red-900/30 text-red-300 border-red-700",
    zinc:  "bg-zinc-800 text-zinc-300 border-zinc-700",
  }[color];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold", c)}>
      {children}
    </span>
  );
}

// ── Search result row ──────────────────────────────────────────────────────────

function SearchRow({ r, onSelect }: { r: any; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/50 border-b border-zinc-800/60 last:border-0"
    >
      <PosPill pos={r.position} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-zinc-100 truncate">{r.playerName}</div>
        <div className="text-xs text-zinc-500">
          {r.seasons} season{r.seasons !== 1 ? "s" : ""} · {r.keeperCount > 0 ? `Kept ${r.keeperCount}×` : "Never kept"} · Last: {r.lastSeason}
        </div>
      </div>
      {r.keeperCount > 0 && <Tag color="blue"><Lock className="h-2.5 w-2.5" /> Keeper</Tag>}
    </button>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, children, sub }: { icon: React.ReactNode; children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-zinc-400">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{children}</span>
      {sub && <span className="ml-auto text-[10px] text-zinc-600">{sub}</span>}
    </div>
  );
}

// ── No data placeholder ────────────────────────────────────────────────────────

function Empty({ msg }: { msg: string }) {
  return <div className="py-4 text-center text-xs text-zinc-600">{msg}</div>;
}

// ── Search view ────────────────────────────────────────────────────────────────

function SearchView({ onSelect }: { onSelect: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const qDebounced = query.trim().length >= 2 ? query.trim() : null;

  const searchQ = trpcA().playerIntelligence.search.useQuery(
    { query: qDebounced! },
    { enabled: !!qDebounced, staleTime: 30_000 },
  );

  const results: any[] = searchQ.data ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-50">Player Intelligence</h1>
        <p className="mt-1 text-sm text-zinc-400">
          What's the story of this player in <em>this</em> league?
        </p>
      </div>

      {/* Search box */}
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by player name…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-9 pr-9 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
          autoFocus
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results */}
      {qDebounced && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 overflow-hidden">
          {searchQ.isLoading && (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!searchQ.isLoading && results.length === 0 && (
            <div className="px-4 py-4 text-sm text-zinc-500">
              No players found for "{qDebounced}" in this league's draft history.
            </div>
          )}
          {results.map((r: any) => (
            <SearchRow key={r.playerName} r={r} onSelect={() => onSelect(r.playerName)} />
          ))}
        </div>
      )}

      {/* League icons / quick access */}
      {!qDebounced && (
        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Start typing to search players in this league's draft history
          </p>
          <p className="text-xs text-zinc-600">
            Sources: gmDraftPicks · gmSeasonRosters · gmTransactions · leagueMedals
          </p>
        </div>
      )}
    </div>
  );
}

// ── Profile view ───────────────────────────────────────────────────────────────

function ProfileView({ playerName, onBack }: { playerName: string; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<"timeline" | "draft" | "trades" | "keepers" | "champ" | "owners">("timeline");

  const profileQ = trpcA().playerIntelligence.profile.useQuery(
    { playerName },
    { staleTime: 60_000 },
  );

  if (profileQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading player history…
      </div>
    );
  }

  const d = profileQ.data as any;
  if (!d) return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <p className="text-sm text-zinc-500">No data found for "{playerName}".</p>
    </div>
  );

  const tabs = [
    { id: "timeline", label: "Timeline" },
    { id: "draft",    label: `Draft (${d.draftHistory?.length ?? 0})` },
    { id: "trades",   label: `Trades (${d.tradeHistory?.length ?? 0})` },
    { id: "keepers",  label: `Keepers (${d.keeperHistory?.length ?? 0})` },
    { id: "champ",    label: "Championships" },
    { id: "owners",   label: `Owners (${d.ownerRelations?.length ?? 0})` },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {/* Back */}
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="h-4 w-4" /> Back to search
      </button>

      {/* Player header */}
      <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-lg font-bold text-zinc-200">
            {playerName.split(" ").map(w => w[0]).slice(0, 2).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-zinc-50">{playerName}</h2>
              <PosPill pos={d.position} />
              {d.nflTeam && <span className="text-sm text-zinc-500">{d.nflTeam}</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.champSeasons?.length > 0 && <Tag color="amber"><Trophy className="h-2.5 w-2.5" /> {d.champSeasons.length} championship{d.champSeasons.length > 1 ? "s" : ""}</Tag>}
              {d.keeperCount > 0 && <Tag color="blue"><Lock className="h-2.5 w-2.5" /> Kept {d.keeperCount}×</Tag>}
              {d.tradeHistory?.length > 0 && <Tag color="red"><ArrowRightLeft className="h-2.5 w-2.5" /> {d.tradeHistory.length} trade{d.tradeHistory.length > 1 ? "s" : ""}</Tag>}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center shrink-0">
            {[
              { val: d.totalSeasons ?? 0,         lbl: "Seasons" },
              { val: d.uniqueOwnerCount ?? 0,      lbl: "Owners" },
              { val: d.keeperCount ?? 0,           lbl: "Kept" },
              { val: d.champSeasons?.length ?? 0,  lbl: "Titles" },
            ].map(s => (
              <div key={s.lbl} className="rounded-lg bg-zinc-800/60 px-3 py-2">
                <div className="text-lg font-bold text-zinc-100">{s.val}</div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* League story */}
      {d.story && (
        <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-5">
          <SectionTitle icon={<BookOpen className="h-4 w-4" />}>League story</SectionTitle>
          <p className="text-sm leading-relaxed text-zinc-300 italic">{d.story}</p>
          <p className="mt-2 text-[10px] text-zinc-600">Auto-generated from draft, trade, keeper, and medal data · No AI</p>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-0 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={cn(
              "flex-shrink-0 px-4 py-2.5 text-xs font-medium transition-colors",
              activeTab === t.id
                ? "bg-zinc-800 text-zinc-100 rounded-lg"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5">

        {/* Timeline */}
        {activeTab === "timeline" && (
          <div>
            <SectionTitle icon={<Users className="h-4 w-4" />}>Ownership timeline</SectionTitle>
            {(!d.ownershipTimeline || d.ownershipTimeline.length === 0) ? (
              <Empty msg="No roster data found. Try syncing season rosters." />
            ) : (
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-3 bottom-3 w-px bg-zinc-700" />
                {d.ownershipTimeline.map((row: any, i: number) => {
                  const type = tlType(row);
                  return (
                    <div key={i} className="relative pb-4 last:pb-0">
                      <TlDot type={type} />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-zinc-100">
                            {row.season} · <span className="text-zinc-300">{row.ownerName}</span>
                          </div>
                          <div className="text-xs text-zinc-500">
                            {row.teamName && row.teamName !== row.ownerName ? `${row.teamName} · ` : ""}
                            {row.acquisitionType || "Roster"}
                            {row.nflTeam ? ` · ${row.nflTeam}` : ""}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {row.isChampionSeason && <Tag color="amber"><Trophy className="h-2.5 w-2.5" /> Champ</Tag>}
                          {row.isKeeper && <Tag color="blue"><Lock className="h-2.5 w-2.5" /> Keeper</Tag>}
                          {row.acquisitionType?.toLowerCase().includes("trade") && <Tag color="red">Traded</Tag>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Draft history */}
        {activeTab === "draft" && (
          <div>
            <SectionTitle icon={<span className="text-xs">⬆</span>}>Draft history</SectionTitle>
            {(!d.draftHistory || d.draftHistory.length === 0) ? (
              <Empty msg="No draft history found in gmDraftPicks for this player." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
                  <colgroup><col style={{width:"60px"}}/><col style={{width:"120px"}}/><col style={{width:"70px"}}/><col style={{width:"60px"}}/><col style={{width:"80px"}}/><col /></colgroup>
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-500">
                      <th className="pb-2 text-left">Season</th>
                      <th className="pb-2 text-left">Owner</th>
                      <th className="pb-2 text-center">Round</th>
                      <th className="pb-2 text-center">Pick</th>
                      <th className="pb-2 text-center">Type</th>
                      <th className="pb-2 text-left">Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.draftHistory.map((row: any, i: number) => (
                      <tr key={i} className={cn("border-b border-zinc-800/60 last:border-0", row.isChampionSeason && "bg-amber-900/10")}>
                        <td className="py-2 text-zinc-300 font-medium">{row.season}</td>
                        <td className="py-2 text-zinc-200 truncate">{row.ownerName || "—"}</td>
                        <td className="py-2 text-center text-zinc-300">Rd {row.round}</td>
                        <td className="py-2 text-center text-zinc-500">{row.pick > 0 ? `${row.round}.${String(row.pick).padStart(2,"0")}` : `#${row.overallPick}`}</td>
                        <td className="py-2 text-center">
                          {row.isKeeper ? <Tag color="blue">Keeper</Tag> : <Tag color="zinc">Draft</Tag>}
                        </td>
                        <td className="py-2 text-zinc-600">
                          {row.isChampionSeason ? "Championship season" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Trades */}
        {activeTab === "trades" && (
          <div>
            <SectionTitle icon={<ArrowRightLeft className="h-4 w-4" />}>Trade history</SectionTitle>
            {(!d.tradeHistory || d.tradeHistory.length === 0) ? (
              <Empty msg="No trade history found in gmTransactions for this player." />
            ) : (
              <div className="space-y-2">
                {d.tradeHistory.map((row: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3 text-sm">
                    <span className="text-zinc-500 text-xs font-medium w-12 shrink-0">{row.season}</span>
                    <span className="flex-1 text-zinc-200 truncate">{row.fromOwner}</span>
                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span className="flex-1 text-zinc-200 truncate">{row.toOwner}</span>
                    {row.processedDate && (
                      <span className="text-zinc-600 text-[10px] shrink-0">
                        {new Date(row.processedDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Keepers */}
        {activeTab === "keepers" && (
          <div>
            <SectionTitle icon={<Lock className="h-4 w-4" />}>Keeper history</SectionTitle>
            {(!d.keeperHistory || d.keeperHistory.length === 0) ? (
              <Empty msg="This player was never kept in the league." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
                  <colgroup><col style={{width:"70px"}}/><col/><col style={{width:"80px"}}/></colgroup>
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-500">
                      <th className="pb-2 text-left">Season</th>
                      <th className="pb-2 text-left">Owner</th>
                      <th className="pb-2 text-center">Round kept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.keeperHistory.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-zinc-800/60 last:border-0">
                        <td className="py-2 text-zinc-300 font-medium">{row.season}</td>
                        <td className="py-2 text-zinc-200">{row.ownerName || "—"}</td>
                        <td className="py-2 text-center">
                          <span className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                            row.round <= 3 ? "border-emerald-700 bg-emerald-900/30 text-emerald-300" :
                            row.round <= 6 ? "border-amber-700 bg-amber-900/30 text-amber-300" :
                            "border-zinc-700 bg-zinc-800 text-zinc-300"
                          )}>
                            Rd {row.round}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Championships */}
        {activeTab === "champ" && (
          <div>
            <SectionTitle icon={<Trophy className="h-4 w-4" />}>Championship impact</SectionTitle>
            {(!d.champSeasons || d.champSeasons.length === 0) ? (
              <Empty msg="This player has never been on a championship roster in this league." />
            ) : (
              <div className="space-y-2">
                {d.champSeasons.map((season: number) => {
                  const owner = d.ownershipTimeline?.find((t: any) => t.season === season && t.isChampionSeason);
                  return (
                    <div key={season} className="flex items-center gap-3 rounded-lg border border-amber-800/40 bg-amber-900/15 px-4 py-3">
                      <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-amber-200">{season} Championship</div>
                        {owner && <div className="text-xs text-amber-400/70">{owner.ownerName}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Owner relationships */}
        {activeTab === "owners" && (
          <div>
            <SectionTitle icon={<Users className="h-4 w-4" />}>Owner relationships</SectionTitle>
            {(!d.ownerRelations || d.ownerRelations.length === 0) ? (
              <Empty msg="No owner data found." />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {d.ownerRelations.map((r: any) => (
                  <div key={r.ownerName} className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-200">
                        {r.ownerName.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{r.ownerName}</div>
                        <div className="text-xs text-zinc-500">
                          {r.seasons.join(", ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {r.draftCount > 0 && <Tag color="zinc">Drafted {r.draftCount}×</Tag>}
                      {r.keeperCount > 0 && <Tag color="blue"><Lock className="h-2.5 w-2.5" /> Kept {r.keeperCount}×</Tag>}
                      {r.tradeCount > 0 && <Tag color="red"><ArrowRightLeft className="h-2.5 w-2.5" /> {r.tradeCount} trade{r.tradeCount > 1 ? "s" : ""}</Tag>}
                      {r.champSeasons?.length > 0 && <Tag color="amber"><Trophy className="h-2.5 w-2.5" /> {r.champSeasons.join(", ")}</Tag>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function PlayerIntelligence() {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const handleSelect = useCallback((name: string) => {
    setSelectedPlayer(name);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedPlayer(null);
  }, []);

  return (
    <div className="min-h-screen bg-[#07090e]">
      {selectedPlayer
        ? <ProfileView playerName={selectedPlayer} onBack={handleBack} />
        : <SearchView onSelect={handleSelect} />
      }
    </div>
  );
}
