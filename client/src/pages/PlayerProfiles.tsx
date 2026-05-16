import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DraftEntry {
  season: number;
  round: number;
  pick: number;
  overallPick: number;
  teamId: number;
  teamName: string;
  ownerName: string;
  isKeeper: boolean;
}

interface PlayerProfile {
  playerId: number;
  playerName: string;
  position: string;
  draftHistory: DraftEntry[];
  keeperSeasons: number[];
  teamsBySeason: Record<number, { teamId: number; teamName: string; ownerName: string }>;
  firstSeen: number;
  lastSeen: number;
  totalDrafts: number;
  totalKeeperYears: number;
  avgDraftRound: number | null;
  minRound: number | null;
  maxRound: number | null;
  roundTrend: number;
  uniqueTeams: string[];
  uniqueOwners: string[];
  seasonsActive: number;
  transactionCount: number;
  prominenceScore: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const POSITION_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-green-500/20 text-green-300 border-green-500/30",
  WR: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  TE: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  K: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  "D/ST": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "?": "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function positionColor(pos: string) {
  return POSITION_COLORS[pos] || POSITION_COLORS["?"];
}

function trendLabel(trend: number) {
  if (trend <= -3) return { label: "Rising Star", color: "text-emerald-400", icon: "↑↑" };
  if (trend <= -1) return { label: "Rising", color: "text-green-400", icon: "↑" };
  if (trend === 0) return { label: "Stable", color: "text-slate-400", icon: "→" };
  if (trend <= 2) return { label: "Declining", color: "text-yellow-400", icon: "↓" };
  return { label: "Fading", color: "text-red-400", icon: "↓↓" };
}

function prominenceBadge(score: number) {
  if (score >= 20) return { label: "League Legend", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" };
  if (score >= 12) return { label: "Franchise Player", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
  if (score >= 7) return { label: "League Staple", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
  if (score >= 4) return { label: "Recurring Pick", color: "bg-slate-500/20 text-slate-300 border-slate-500/30" };
  return { label: "One-Season Wonder", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
}

// ── Round Timeline Component ──────────────────────────────────────────────────
function RoundTimeline({ history }: { history: DraftEntry[] }) {
  const seasons = [2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  return (
    <div className="flex items-end gap-1 h-10">
      {seasons.map((season) => {
        const entry = history.find((h) => h.season === season);
        if (!entry) {
          return (
            <div key={season} className="flex flex-col items-center gap-0.5 w-7">
              <div className="w-6 h-1 rounded-sm bg-slate-800" />
              <span className="text-[9px] text-slate-600">{String(season).slice(2)}</span>
            </div>
          );
        }
        const height = Math.max(8, 32 - (entry.round - 1) * 2);
        return (
          <div key={season} className="flex flex-col items-center gap-0.5 w-7" title={`${season}: Round ${entry.round} (${entry.teamName})${entry.isKeeper ? " 🔒 KEPT" : ""}`}>
            <div
              className={`w-6 rounded-sm transition-all ${entry.isKeeper ? "bg-amber-500" : "bg-blue-500"}`}
              style={{ height: `${height}px` }}
            />
            <span className="text-[9px] text-slate-500">{String(season).slice(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Player Card Component ─────────────────────────────────────────────────────
function PlayerCard({ player }: { player: PlayerProfile }) {
  const [expanded, setExpanded] = useState(false);
  const trend = trendLabel(player.roundTrend);
  const badge = prominenceBadge(player.prominenceScore);
  const latestEntry = player.draftHistory[player.draftHistory.length - 1];

  return (
    <div
      className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/70 transition-all cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${positionColor(player.position)}`}>
            {player.position}
          </span>
          <span className="font-semibold text-white truncate">{player.playerName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${badge.color}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <div className="text-lg font-bold text-white">{player.totalDrafts}</div>
          <div className="text-[10px] text-slate-400">Drafts</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-400">{player.totalKeeperYears}</div>
          <div className="text-[10px] text-slate-400">Kept</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-blue-400">R{player.avgDraftRound ?? "—"}</div>
          <div className="text-[10px] text-slate-400">Avg Rd</div>
        </div>
        <div className="text-center">
          <div className={`text-lg font-bold ${trend.color}`}>{trend.icon}</div>
          <div className="text-[10px] text-slate-400">{trend.label}</div>
        </div>
      </div>

      {/* Round Timeline */}
      <div className="mb-3">
        <div className="text-[10px] text-slate-500 mb-1">Draft Round by Season (gold = kept)</div>
        <RoundTimeline history={player.draftHistory} />
      </div>

      {/* Latest Owner */}
      {latestEntry && (
        <div className="text-xs text-slate-400">
          <span className="text-slate-500">Last seen:</span>{" "}
          <span className="text-slate-300">{latestEntry.season} — {latestEntry.teamName}</span>
          {latestEntry.ownerName && <span className="text-slate-500"> ({latestEntry.ownerName})</span>}
        </div>
      )}

      {/* Expanded Detail */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Full Draft History</div>
          <div className="space-y-1">
            {player.draftHistory.map((entry, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-8">{entry.season}</span>
                  <span className={`font-medium ${entry.isKeeper ? "text-amber-400" : "text-slate-300"}`}>
                    Round {entry.round}, Pick {entry.pick}
                  </span>
                  {entry.isKeeper && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      🔒 KEPT
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-slate-400">{entry.teamName}</span>
                  {entry.ownerName && <span className="text-slate-600 ml-1">({entry.ownerName})</span>}
                </div>
              </div>
            ))}
          </div>

          {player.keeperSeasons.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/30">
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Keeper Seasons</div>
              <div className="flex flex-wrap gap-1">
                {player.keeperSeasons.map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {player.uniqueTeams.length > 1 && (
            <div className="mt-3 pt-3 border-t border-slate-700/30">
              <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Teams That Owned This Player</div>
              <div className="flex flex-wrap gap-1">
                {player.uniqueTeams.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded text-xs bg-slate-700/50 text-slate-300 border border-slate-600/30">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PlayerProfiles() {
  const { data, isLoading, error } = trpc.playerProfiles.useQuery();

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("prominence");
  const [keeperFilter, setKeeperFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState("all");

  const profiles: PlayerProfile[] = (data?.profiles as PlayerProfile[]) || [];

  const filtered = useMemo(() => {
    let result = [...profiles];

    // Tab filter
    if (activeTab === "keepers") result = result.filter((p) => p.totalKeeperYears > 0);
    else if (activeTab === "staples") result = result.filter((p) => p.totalDrafts >= 3);
    else if (activeTab === "legends") result = result.filter((p) => p.prominenceScore >= 12);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.playerName.toLowerCase().includes(q));
    }

    // Position filter
    if (posFilter !== "ALL") result = result.filter((p) => p.position === posFilter);

    // Keeper filter
    if (keeperFilter === "KEPT") result = result.filter((p) => p.totalKeeperYears > 0);
    else if (keeperFilter === "NEVER") result = result.filter((p) => p.totalKeeperYears === 0);

    // Sort
    if (sortBy === "prominence") result.sort((a, b) => b.prominenceScore - a.prominenceScore);
    else if (sortBy === "drafts") result.sort((a, b) => b.totalDrafts - a.totalDrafts);
    else if (sortBy === "keepers") result.sort((a, b) => b.totalKeeperYears - a.totalKeeperYears);
    else if (sortBy === "name") result.sort((a, b) => a.playerName.localeCompare(b.playerName));
    else if (sortBy === "round") result.sort((a, b) => (a.avgDraftRound ?? 99) - (b.avgDraftRound ?? 99));

    return result;
  }, [profiles, search, posFilter, sortBy, keeperFilter, activeTab]);

  const stats = useMemo(() => ({
    total: profiles.length,
    kept: profiles.filter((p) => p.totalKeeperYears > 0).length,
    staples: profiles.filter((p) => p.totalDrafts >= 3).length,
    legends: profiles.filter((p) => p.prominenceScore >= 12).length,
  }), [profiles]);

  return (
    <AppLayout title="Player Profiles" subtitle="ATLANTAS FINEST FF — 2009–2026 Historical Database">
      <div className="space-y-6">

        {/* Header Stats */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Players", value: stats.total, color: "text-white", sub: "Unique players drafted" },
              { label: "Ever Kept", value: stats.kept, color: "text-amber-400", sub: "Kept at least once" },
              { label: "League Staples", value: stats.staples, color: "text-blue-400", sub: "Drafted 3+ seasons" },
              { label: "Franchise Players", value: stats.legends, color: "text-purple-400", sub: "Prominence score 12+" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-sm font-medium text-slate-300 mt-1">{s.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              placeholder="Search player name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 h-9 text-sm"
            />
            <Select value={posFilter} onValueChange={setPosFilter}>
              <SelectTrigger className="w-28 bg-slate-900/50 border-slate-600 text-white h-9 text-sm">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {["ALL", "QB", "RB", "WR", "TE", "K", "D/ST"].map((p) => (
                  <SelectItem key={p} value={p} className="text-slate-200 focus:bg-slate-700">{p === "ALL" ? "All Positions" : p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={keeperFilter} onValueChange={setKeeperFilter}>
              <SelectTrigger className="w-36 bg-slate-900/50 border-slate-600 text-white h-9 text-sm">
                <SelectValue placeholder="Keeper Status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="ALL" className="text-slate-200 focus:bg-slate-700">All Players</SelectItem>
                <SelectItem value="KEPT" className="text-slate-200 focus:bg-slate-700">Ever Kept</SelectItem>
                <SelectItem value="NEVER" className="text-slate-200 focus:bg-slate-700">Never Kept</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40 bg-slate-900/50 border-slate-600 text-white h-9 text-sm">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="prominence" className="text-slate-200 focus:bg-slate-700">Prominence Score</SelectItem>
                <SelectItem value="drafts" className="text-slate-200 focus:bg-slate-700">Times Drafted</SelectItem>
                <SelectItem value="keepers" className="text-slate-200 focus:bg-slate-700">Keeper Years</SelectItem>
                <SelectItem value="round" className="text-slate-200 focus:bg-slate-700">Avg Draft Round</SelectItem>
                <SelectItem value="name" className="text-slate-200 focus:bg-slate-700">Player Name</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-slate-400">
              Showing <span className="text-white font-medium">{filtered.length}</span> players
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/60 border border-slate-700/50">
            <TabsTrigger value="all" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
              All Players
            </TabsTrigger>
            <TabsTrigger value="legends" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-400">
              Franchise Players
            </TabsTrigger>
            <TabsTrigger value="keepers" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-slate-400">
              Keeper History
            </TabsTrigger>
            <TabsTrigger value="staples" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
              League Staples
            </TabsTrigger>
          </TabsList>

          {["all", "legends", "keepers", "staples"].map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4">
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
                </div>
              ) : error ? (
                <div className="text-center py-16 text-red-400">
                  <div className="text-4xl mb-3">⚠️</div>
                  <div className="font-semibold">Failed to load player profiles</div>
                  <div className="text-sm text-slate-500 mt-1">{error.message}</div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <div className="text-4xl mb-3">🔍</div>
                  <div className="font-semibold text-slate-400">No players match your filters</div>
                  <div className="text-sm mt-1">Try adjusting your search or filter criteria</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtered.slice(0, 150).map((player) => (
                    <PlayerCard key={player.playerId} player={player} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Legend */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">How to Read This Page</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
            <div>
              <div className="font-medium text-slate-300 mb-1">Round Timeline (bar chart)</div>
              <div>Each bar represents a season (2009–2026). Taller bars = earlier round = higher value. Gold bars = player was kept that season. Hover for details.</div>
            </div>
            <div>
              <div className="font-medium text-slate-300 mb-1">Prominence Score</div>
              <div>Calculated as: (Keeper Years × 3) + Total Drafts + Seasons Active. Reflects how important a player has been to the league over time.</div>
            </div>
            <div>
              <div className="font-medium text-slate-300 mb-1">Round Trend</div>
              <div>Compares first-season draft round to most recent. Rising = drafted earlier over time (value increasing). Fading = drafted later or dropped.</div>
            </div>
            <div>
              <div className="font-medium text-slate-300 mb-1">Keeper Data</div>
              <div>Keeper flags are available for 2022–2025 only. Seasons 2018–2021 show draft picks but keeper status was not tracked in the ESPN API for those years.</div>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
