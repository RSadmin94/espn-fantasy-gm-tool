// FILE: client/src/pages/PlayerComparison.tsx
// "Who Should I Draft?" — Compare 2–3 players side-by-side with ECR, ADP, PFR stats
// and opponent likelihood notes based on their draft tendencies.
import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, X, TrendingUp, TrendingDown, Minus, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR: "bg-green-500/20 text-green-300 border-green-500/30",
  TE: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  K: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  DST: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const QUICK_COMPARISONS = [
  { label: "CeeDee vs Ja'Marr", names: ["CeeDee Lamb", "Ja'Marr Chase"] },
  { label: "Bijan vs Henry", names: ["Bijan Robinson", "Derrick Henry"] },
  { label: "Kelce vs LaPorta", names: ["Travis Kelce", "Sam LaPorta"] },
  { label: "Mahomes vs Burrow", names: ["Patrick Mahomes", "Joe Burrow"] },
  { label: "Omarion vs TreVeyon", names: ["Omarion Hampton", "TreVeyon Henderson"] },
];

function StatRow({ label, values, highlight }: { label: string; values: (string | number | null)[]; highlight?: number }) {
  return (
    <div className="grid gap-2 py-2 border-b border-slate-700/50 last:border-0" style={{ gridTemplateColumns: `10rem repeat(${values.length}, 1fr)` }}>
      <span className="text-xs text-muted-foreground self-center">{label}</span>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            "text-sm font-medium text-center",
            highlight === i ? "text-emerald-400" : "text-foreground"
          )}
        >
          {v ?? "—"}
        </span>
      ))}
    </div>
  );
}

export default function PlayerComparison() {
  const [names, setNames] = useState<string[]>(["", ""]);
  const [activeSearch, setActiveSearch] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);

  const { data: searchResults } = trpc.draftBoard.searchPlayers.useQuery(
    { query: searchQuery, limit: 8 },
    { enabled: searchQuery.length >= 2 }
  );

  const { data: compareData, isLoading } = trpc.draftBoard.comparePlayers.useQuery(
    { names: submitted },
    { enabled: submitted.length >= 2 && submitted.every((n) => n.trim().length > 0) }
  );

  const { data: draftTendencies } = trpc.leagueDraftTendencies.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });

  const handleSelectPlayer = useCallback((name: string, idx: number) => {
    setNames((prev) => {
      const next = [...prev];
      next[idx] = name;
      return next;
    });
    setActiveSearch(null);
    setSearchQuery("");
  }, []);

  const handleCompare = useCallback(() => {
    const valid = names.filter((n) => n.trim().length > 0);
    if (valid.length >= 2) setSubmitted(valid);
  }, [names]);

  const handleQuick = useCallback((quickNames: string[]) => {
    setNames([...quickNames, ...(quickNames.length < 3 ? [""] : [])]);
    setSubmitted(quickNames);
  }, []);

  // Determine the recommended player (lowest ECR rank = best)
  const recommendation = useMemo(() => {
    if (!compareData?.players) return null;
    const found = compareData.players.filter((r) => r.player !== null);
    if (found.length < 2) return null;
    const best = found.reduce((a, b) =>
      (a.player!.ecrRank < b.player!.ecrRank) ? a : b
    );
    return best.player!.name;
  }, [compareData]);

  // For each player, find which opponents are likely to draft them
  const opponentLikelihood = useMemo(() => {
    if (!draftTendencies || !compareData?.players) return {};
    const owners = (draftTendencies as { owners?: unknown[] }).owners ?? (Array.isArray(draftTendencies) ? draftTendencies : []);
    const result: Record<string, string[]> = {};
    for (const entry of compareData.players) {
      if (!entry.player) continue;
      const pos = entry.player.position;
      // Find managers who heavily target this position in rounds 1-3
      const likelyOpponents = (owners as { ownerName: string; byRound: Record<string, Record<string, number>> }[])
        .filter((owner) => {
          const rd1 = owner.byRound?.["1"] ?? {};
          const rd2 = owner.byRound?.["2"] ?? {};
          const rd3 = owner.byRound?.["3"] ?? {};
          const total = Object.values(rd1).reduce((a: number, b: number) => a + b, 0) +
                        Object.values(rd2).reduce((a: number, b: number) => a + b, 0) +
                        Object.values(rd3).reduce((a: number, b: number) => a + b, 0);
          const posCount = (rd1[pos] ?? 0) + (rd2[pos] ?? 0) + (rd3[pos] ?? 0);
          return total > 0 && posCount / total > 0.35;
        })
        .map((o) => o.ownerName.split(" ")[0]);
      result[entry.player.name] = likelyOpponents;
    }
    return result;
  }, [draftTendencies, compareData]);

  const playerCount = names.filter((n) => n.trim()).length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Who Should I Draft?</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Compare 2–3 players side-by-side using expert consensus, ADP, and 2025 stats. See which opponents are likely to take the others.
        </p>
      </div>

      {/* Quick comparisons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Quick:</span>
        {QUICK_COMPARISONS.map((q) => (
          <Button
            key={q.label}
            variant="outline"
            size="sm"
            onClick={() => handleQuick(q.names)}
            className="h-7 text-xs bg-transparent border-slate-700 text-slate-400 hover:text-foreground"
          >
            {q.label}
          </Button>
        ))}
      </div>

      {/* Player inputs */}
      <Card className="border-slate-700/50 bg-slate-800/30">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder={idx === 2 ? "3rd player (optional)" : `Player ${idx + 1}`}
                      value={activeSearch === idx ? searchQuery : names[idx]}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setActiveSearch(idx);
                        if (!names[idx] || e.target.value !== names[idx]) {
                          setNames((prev) => { const n = [...prev]; n[idx] = ""; return n; });
                        }
                      }}
                      onFocus={() => { setActiveSearch(idx); setSearchQuery(names[idx] || ""); }}
                      className="pl-9 bg-slate-800/50 border-slate-700"
                    />
                  </div>
                  {names[idx] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => { setNames((prev) => { const n = [...prev]; n[idx] = ""; return n; }); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {/* Autocomplete dropdown */}
                {activeSearch === idx && searchQuery.length >= 2 && searchResults && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                    {searchResults.map((p) => (
                      <button
                        key={p.fpId}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700 text-left transition-colors"
                        onMouseDown={(e) => { e.preventDefault(); handleSelectPlayer(p.name, idx); }}
                      >
                        <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 shrink-0", POS_COLORS[p.position] ?? "")}>
                          {p.position}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">ECR #{p.ecrRank}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button
            onClick={handleCompare}
            disabled={playerCount < 2 || isLoading}
            className="gap-2"
          >
            <Zap className="w-4 h-4" />
            {isLoading ? "Comparing…" : "Compare Players"}
          </Button>
        </CardContent>
      </Card>

      {/* Comparison results */}
      {compareData && compareData.players.length >= 2 && (
        <div className="space-y-4">
          {/* Recommendation banner */}
          {recommendation && (
            <Card className="border-emerald-500/30 bg-emerald-500/10">
              <CardContent className="p-4 flex items-center gap-3">
                <Zap className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-emerald-300 font-semibold">Expert Consensus Pick: {recommendation}</p>
                  <p className="text-emerald-400/70 text-xs mt-0.5">
                    Lowest ECR rank among compared players — experts agree this is the best value.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Side-by-side comparison table */}
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Side-by-Side Comparison</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {/* Column headers */}
              <div className="grid gap-2 pb-3 border-b border-slate-700" style={{ gridTemplateColumns: `10rem repeat(${compareData.players.length}, 1fr)` }}>
                <span />
                {compareData.players.map((r, i) => (
                  <div key={i} className="text-center">
                    {r.player ? (
                      <>
                        <p className="font-semibold text-foreground text-sm">{r.player.name}</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5", POS_COLORS[r.player.position] ?? "")}>
                            {r.player.position}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{r.player.team}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm italic">"{r.name}" not found</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Stats rows */}
              {(() => {
                const found = compareData.players.map((r) => r.player);
                const bestEcr = Math.min(...found.filter(Boolean).map((p) => p!.ecrRank));
                const bestAdp = Math.min(...found.filter(Boolean).filter((p) => p!.adp !== null).map((p) => p!.adp!));
                return (
                  <>
                    <StatRow
                      label="ECR Rank"
                      values={found.map((p) => p ? `#${p.ecrRank}` : null)}
                      highlight={found.findIndex((p) => p?.ecrRank === bestEcr)}
                    />
                    <StatRow
                      label="Pos Rank"
                      values={found.map((p) => p?.posRank ?? null)}
                    />
                    <StatRow
                      label="Tier"
                      values={found.map((p) => p ? `Tier ${p.tier}` : null)}
                    />
                    <StatRow
                      label="ADP"
                      values={found.map((p) => p?.adp !== null ? p?.adp?.toFixed(1) ?? null : "No ADP")}
                      highlight={found.findIndex((p) => p?.adp !== null && p?.adp === bestAdp)}
                    />
                    <StatRow
                      label="ECR vs ADP Gap"
                      values={found.map((p) => {
                        if (!p || p.ecrAdpGap === null) return "—";
                        return p.ecrAdpGap > 0 ? `+${p.ecrAdpGap} (value)` : p.ecrAdpGap < 0 ? `${p.ecrAdpGap} (reach)` : "Even";
                      })}
                      highlight={found.findIndex((p) => p?.ecrAdpGap !== null && p?.ecrAdpGap === Math.max(...found.filter(Boolean).map((x) => x?.ecrAdpGap ?? -999)))}
                    />
                    <StatRow
                      label="ECR Range"
                      values={found.map((p) => p ? `${p.ecrMin}–${p.ecrMax}` : null)}
                    />
                    <StatRow
                      label="Bye Week"
                      values={found.map((p) => p?.byeWeek ?? "—")}
                    />
                    <StatRow
                      label="Ownership %"
                      values={found.map((p) => p?.ownedPct ? `${p.ownedPct.toFixed(0)}%` : "—")}
                    />
                    {found.some((p) => p?.pfr2025) && (
                      <>
                        <StatRow
                          label="2025 PPR Pts"
                          values={found.map((p) => p?.pfr2025 ? p.pfr2025.pprPoints.toFixed(1) : "N/A")}
                          highlight={found.findIndex((p) => p?.pfr2025?.pprPoints === Math.max(...found.filter((x) => x?.pfr2025).map((x) => x!.pfr2025!.pprPoints)))}
                        />
                        <StatRow
                          label="2025 TDs"
                          values={found.map((p) => p?.pfr2025 ? p.pfr2025.totalTDs : "N/A")}
                          highlight={found.findIndex((p) => p?.pfr2025?.totalTDs === Math.max(...found.filter((x) => x?.pfr2025).map((x) => x!.pfr2025!.totalTDs)))}
                        />
                        <StatRow
                          label="2025 VBD"
                          values={found.map((p) => p?.pfr2025 ? p.pfr2025.vbd : "N/A")}
                          highlight={found.findIndex((p) => p?.pfr2025?.vbd === Math.max(...found.filter((x) => x?.pfr2025).map((x) => x!.pfr2025!.vbd)))}
                        />
                        <StatRow
                          label="2025 Pos Rank"
                          values={found.map((p) => p?.pfr2025 ? `#${p.pfr2025.posRank}` : "N/A")}
                          highlight={found.findIndex((p) => p?.pfr2025?.posRank === Math.min(...found.filter((x) => x?.pfr2025).map((x) => x!.pfr2025!.posRank)))}
                        />
                      </>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Opponent likelihood */}
          {Object.keys(opponentLikelihood).length > 0 && (
            <Card className="border-slate-700/50 bg-slate-800/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  Opponent Draft Likelihood
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Based on each manager's historical positional tendencies in rounds 1–3, these opponents are most likely to target each player.
                </p>
                {compareData.players.map((r) => {
                  if (!r.player) return null;
                  const opponents = opponentLikelihood[r.player.name] ?? [];
                  return (
                    <div key={r.player.name} className="flex items-start gap-3">
                      <span className="text-sm font-medium text-foreground w-40 shrink-0">{r.player.name}</span>
                      {opponents.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {opponents.map((name) => (
                            <Badge key={name} variant="outline" className="text-xs text-amber-300 border-amber-500/30 bg-amber-500/10">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No strong tendency overlap</span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
