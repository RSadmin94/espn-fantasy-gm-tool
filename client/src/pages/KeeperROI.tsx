import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, Trophy, AlertTriangle, BarChart3, Users, Star } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

const ROI_COLORS: Record<string, string> = {
  ELITE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  GREAT: "bg-green-500/20 text-green-400 border-green-500/30",
  GOOD:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  FAIR:  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  POOR:  "bg-red-500/20 text-red-400 border-red-500/30",
};

const POS_COLORS: Record<string, string> = {
  QB: "bg-purple-500/20 text-purple-300",
  RB: "bg-red-500/20 text-red-300",
  WR: "bg-blue-500/20 text-blue-300",
  TE: "bg-orange-500/20 text-orange-300",
  K:  "bg-gray-500/20 text-gray-300",
};

function RoiBadge({ label }: { label: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${ROI_COLORS[label] ?? "bg-gray-500/20 text-gray-400"}`}>
      {label}
    </span>
  );
}

function PosBadge({ pos }: { pos: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${POS_COLORS[pos] ?? "bg-gray-500/20 text-gray-300"}`}>
      {pos}
    </span>
  );
}

export default function KeeperROI() {
  const { user } = useAuth();
  const { data, isLoading } = trpc.keeperROI.useQuery();
  const [filterSeason, setFilterSeason] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterPos, setFilterPos] = useState<string>("all");
  const [search, setSearch] = useState("");

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white/5 rounded animate-pulse" />)}
        </div>
        <div className="h-64 bg-white/5 rounded animate-pulse" />
      </div>
    );
  }

  if (!data) return <div className="p-6 text-gray-400">No keeper data available.</div>;

  const { allKeepers, teamSummaries, leagueStats, bestValueKeepers, worstValueKeepers, seasons } = data;

  // Filters
  const filtered = allKeepers.filter(k => {
    if (filterSeason !== "all" && k.season !== parseInt(filterSeason)) return false;
    if (filterTeam !== "all" && k.teamName !== filterTeam) return false;
    if (filterPos !== "all" && k.position !== filterPos) return false;
    if (search && !k.playerName.toLowerCase().includes(search.toLowerCase()) && !k.teamName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const uniqueTeams = Array.from(new Set(allKeepers.map(k => k.teamName))).sort();
  const uniquePositions = Array.from(new Set(allKeepers.map(k => k.position))).sort();

  // Current user's keepers — match by name parts from Manus login
  const myNameParts = (user?.name ?? "").toLowerCase().split(" ").filter(Boolean);
  const isMyTeam = (teamName: string) =>
    myNameParts.length > 0 && myNameParts.some(p => teamName.toLowerCase().includes(p));
  const rodKeepers = allKeepers.filter(k => isMyTeam(k.teamName));

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-green-400" />
          Keeper ROI Tracker
        </h1>
        <p className="text-gray-400 mt-1 text-sm">
          Historical keeper value analysis (2022–2025) — round paid vs. market value, league-wide patterns, and your personal keeper track record.
        </p>
      </div>

      {/* League Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-white">{leagueStats.totalKeepers}</div>
            <div className="text-xs text-gray-400 mt-1">Total Keepers</div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-500/10 border-yellow-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{leagueStats.eliteCount}</div>
            <div className="text-xs text-yellow-400/70 mt-1">ELITE (Rd 1)</div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{leagueStats.greatCount}</div>
            <div className="text-xs text-green-400/70 mt-1">GREAT (Rd 2–3)</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{leagueStats.goodCount}</div>
            <div className="text-xs text-blue-400/70 mt-1">GOOD (Rd 4–6)</div>
          </CardContent>
        </Card>
        <Card className="bg-orange-500/10 border-orange-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{leagueStats.fairPoorCount}</div>
            <div className="text-xs text-orange-400/70 mt-1">FAIR/POOR (Rd 7+)</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all-keepers">
        <TabsList className="flex flex-wrap gap-1 h-auto bg-white/5 p-1">
          <TabsTrigger value="all-keepers" className="text-xs">All Keepers</TabsTrigger>
          <TabsTrigger value="my-keepers" className="text-xs">My Keepers</TabsTrigger>
          <TabsTrigger value="best-worst" className="text-xs">Best &amp; Worst</TabsTrigger>
          <TabsTrigger value="team-grades" className="text-xs">Team Grades</TabsTrigger>
        </TabsList>

        {/* ALL KEEPERS TAB */}
        <TabsContent value="all-keepers" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search player or team..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-48 bg-white/5 border-white/10 text-white text-sm h-8"
            />
            <Select value={filterSeason} onValueChange={setFilterSeason}>
              <SelectTrigger className="w-28 bg-white/5 border-white/10 text-white text-sm h-8">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {seasons.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white text-sm h-8">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {uniqueTeams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPos} onValueChange={setFilterPos}>
              <SelectTrigger className="w-24 bg-white/5 border-white/10 text-white text-sm h-8">
                <SelectValue placeholder="Pos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pos</SelectItem>
                {uniquePositions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-gray-400 self-center">{filtered.length} keepers</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left p-3 text-gray-400 font-medium">Season</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Player</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Pos</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Team</th>
                  <th className="text-center p-3 text-gray-400 font-medium">Kept Rd</th>
                  <th className="text-center p-3 text-gray-400 font-medium">Cost Rd</th>
                  <th className="text-center p-3 text-gray-400 font-medium">Surplus</th>
                  <th className="text-center p-3 text-gray-400 font-medium">Yr #</th>
                  <th className="text-center p-3 text-gray-400 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((k, i) => (
                  <tr key={i} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${isMyTeam(k.teamName) ? "bg-blue-500/5" : ""}`}>
                    <td className="p-3 text-gray-300">{k.season}</td>
                    <td className="p-3 font-medium text-white">
                      {k.playerName.startsWith("Player#") ? (
                        <span className="text-gray-500 italic text-xs">{k.playerName}</span>
                      ) : k.playerName}
                      {isMyTeam(k.teamName) && <span className="ml-1 text-blue-400 text-xs">★</span>}
                    </td>
                    <td className="p-3"><PosBadge pos={k.position} /></td>
                    <td className="p-3 text-gray-300 text-xs">{k.teamName}</td>
                    <td className="p-3 text-center">
                      <span className="text-white font-bold">Rd {k.keptRound}</span>
                    </td>
                    <td className="p-3 text-center text-gray-400">Rd {k.costRound}</td>
                    <td className="p-3 text-center">
                      <span className={k.roundSurplus > 0 ? "text-green-400 font-bold" : "text-gray-400"}>
                        {k.roundSurplus > 0 ? `+${k.roundSurplus}` : "0"}
                      </span>
                    </td>
                    <td className="p-3 text-center text-gray-400 text-xs">
                      {k.consecutiveYear === 1 ? "1st" : "2nd"}
                    </td>
                    <td className="p-3 text-center"><RoiBadge label={k.roiLabel} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-gray-500">No keepers match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">★ = Your team. Kept Rd = round used in draft. Cost Rd = round you paid (Kept − 1). Surplus = rounds saved vs. cost.</p>
        </TabsContent>

        {/* MY KEEPERS TAB */}
        <TabsContent value="my-keepers" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-white">{rodKeepers.length}</div>
                <div className="text-xs text-gray-400 mt-1">Total Keepers</div>
              </CardContent>
            </Card>
            <Card className="bg-green-500/10 border-green-500/20">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-400">
                  {rodKeepers.filter(k => k.roiLabel === "ELITE" || k.roiLabel === "GREAT").length}
                </div>
                <div className="text-xs text-green-400/70 mt-1">Elite/Great Keepers</div>
              </CardContent>
            </Card>
            <Card className="bg-blue-500/10 border-blue-500/20">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {rodKeepers.length > 0 ? Math.round(rodKeepers.reduce((s, k) => s + k.keptRound, 0) / rodKeepers.length * 10) / 10 : "—"}
                </div>
                <div className="text-xs text-blue-400/70 mt-1">Avg Kept Round</div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            {rodKeepers.length === 0 ? (
              <p className="text-gray-400 text-sm">No keeper data found for your team in the ESPN cache (2022–2025).</p>
            ) : (
              rodKeepers.map((k, i) => (
                <Card key={i} className="bg-white/5 border-white/10 hover:bg-white/8 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <span className="text-blue-300 font-bold text-sm">{k.season}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">
                              {k.playerName.startsWith("Player#") ? <span className="text-gray-400 italic text-sm">{k.playerName}</span> : k.playerName}
                            </span>
                            <PosBadge pos={k.position} />
                            <RoiBadge label={k.roiLabel} />
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            Kept in Round {k.keptRound} · Cost: Round {k.costRound} · Surplus: {k.roundSurplus > 0 ? `+${k.roundSurplus} round` : "0"} · Year {k.consecutiveYear} of keeping
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-white">Rd {k.keptRound}</div>
                        <div className="text-xs text-gray-400">kept at</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* 2026 Decision Context */}
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-yellow-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                2026 Keeper Decision — TBD
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-yellow-200/80 space-y-2">
              <p>Your 2026 keeper is pending trade decisions. Based on your keeper history:</p>
              <ul className="list-disc list-inside space-y-1 text-xs text-yellow-200/70">
                <li>You have kept an RB every year since 2022 — consistent with your RB-First draft style</li>
                <li>Your best keeper ROI was Saquon Barkley (Rd 2 cost, elite production) in 2023–24</li>
                <li>Keeper deadline: August 18, 2026 — finalize after trade negotiations</li>
                <li>Use the Pick Value Calc to evaluate any trade involving your keeper pick</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BEST & WORST TAB */}
        <TabsContent value="best-worst" className="mt-4 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Best */}
            <div>
              <h3 className="text-sm font-semibold text-green-400 flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4" />
                Best Value Keepers (Rd 1–3)
              </h3>
              <div className="space-y-2">
                {bestValueKeepers.map((k, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white text-sm">
                          {k.playerName.startsWith("Player#") ? <span className="text-gray-400 italic text-xs">{k.playerName}</span> : k.playerName}
                        </span>
                        <PosBadge pos={k.position} />
                      </div>
                      <div className="text-xs text-gray-400">{k.teamName} · {k.season}</div>
                    </div>
                    <div className="text-right">
                      <RoiBadge label={k.roiLabel} />
                      <div className="text-xs text-gray-400 mt-1">Rd {k.keptRound}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Worst */}
            <div>
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4" />
                Questionable Keepers (Rd 8+)
              </h3>
              <div className="space-y-2">
                {worstValueKeepers.length === 0 ? (
                  <p className="text-gray-500 text-sm">No late-round keepers found — the league generally keeps high-value players.</p>
                ) : worstValueKeepers.map((k, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white text-sm">
                          {k.playerName.startsWith("Player#") ? <span className="text-gray-400 italic text-xs">{k.playerName}</span> : k.playerName}
                        </span>
                        <PosBadge pos={k.position} />
                      </div>
                      <div className="text-xs text-gray-400">{k.teamName} · {k.season}</div>
                    </div>
                    <div className="text-right">
                      <RoiBadge label={k.roiLabel} />
                      <div className="text-xs text-gray-400 mt-1">Rd {k.keptRound}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Insights */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" />
                League Keeper Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-white/5 rounded-lg">
                <div className="text-gray-400 text-xs mb-1">Most Common Keeper Position</div>
                <div className="text-white font-semibold">
                  {(() => {
                    const counts: Record<string, number> = {};
                    allKeepers.forEach(k => { counts[k.position] = (counts[k.position] || 0) + 1; });
                    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "RB";
                  })()}
                </div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <div className="text-gray-400 text-xs mb-1">Avg Keeper Round (League)</div>
                <div className="text-white font-semibold">
                  Rd {Math.round(allKeepers.reduce((s, k) => s + k.keptRound, 0) / allKeepers.length * 10) / 10}
                </div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <div className="text-gray-400 text-xs mb-1">% Elite/Great Keepers</div>
                <div className="text-white font-semibold">
                  {Math.round((leagueStats.eliteCount + leagueStats.greatCount) / leagueStats.totalKeepers * 100)}%
                </div>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <div className="text-gray-400 text-xs mb-1">Your Keeper Avg Round</div>
                <div className="text-white font-semibold">
                  Rd {rodKeepers.length > 0 ? Math.round(rodKeepers.reduce((s, k) => s + k.keptRound, 0) / rodKeepers.length * 10) / 10 : "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TEAM GRADES TAB */}
        <TabsContent value="team-grades" className="mt-4 space-y-4">
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left p-3 text-gray-400 font-medium">Team</th>
                  <th className="text-center p-3 text-gray-400 font-medium">Total</th>
                  <th className="text-center p-3 text-gray-400 font-medium">
                    <span className="text-yellow-400">ELITE</span>
                  </th>
                  <th className="text-center p-3 text-gray-400 font-medium">
                    <span className="text-green-400">GREAT</span>
                  </th>
                  <th className="text-center p-3 text-gray-400 font-medium">
                    <span className="text-blue-400">GOOD</span>
                  </th>
                  <th className="text-center p-3 text-gray-400 font-medium">
                    <span className="text-orange-400">FAIR/POOR</span>
                  </th>
                  <th className="text-center p-3 text-gray-400 font-medium">Avg Rd</th>
                  <th className="text-center p-3 text-gray-400 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {teamSummaries.map((t, i) => {
                  const elitePct = Math.round((t.eliteKeepers + t.greatKeepers) / t.totalKeepers * 100);
                  const grade = elitePct >= 60 ? "A" : elitePct >= 40 ? "B" : elitePct >= 25 ? "C" : "D";
                  const gradeColor = grade === "A" ? "text-green-400" : grade === "B" ? "text-blue-400" : grade === "C" ? "text-orange-400" : "text-red-400";
                  return (
                    <tr key={i} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${isMyTeam(t.teamName) ? "bg-blue-500/5" : ""}`}>
                      <td className="p-3 font-medium text-white text-sm">
                        {t.teamName}
                        {isMyTeam(t.teamName) && <span className="ml-1 text-blue-400 text-xs">★ You</span>}
                      </td>
                      <td className="p-3 text-center text-white font-bold">{t.totalKeepers}</td>
                      <td className="p-3 text-center text-yellow-400">{t.eliteKeepers}</td>
                      <td className="p-3 text-center text-green-400">{t.greatKeepers}</td>
                      <td className="p-3 text-center text-blue-400">{t.goodKeepers}</td>
                      <td className="p-3 text-center text-orange-400">{t.fairPoorKeepers}</td>
                      <td className="p-3 text-center text-gray-300">Rd {t.avgKeptRound}</td>
                      <td className="p-3 text-center">
                        <span className={`text-lg font-bold ${gradeColor}`}>{grade}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">Grade based on % of Elite+Great keepers. A ≥60%, B ≥40%, C ≥25%, D &lt;25%.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
