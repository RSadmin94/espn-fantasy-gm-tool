// MyProfileTabContent.tsx
// Full My Profile tab with Draft Tendencies, GM Activity, and Self-Assessment panels
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User, BarChart2, Star, Target, Info, CheckCircle2,
  ArrowUp, ArrowDown, Minus, Zap, TrendingUp, Activity,
  Shield, AlertTriangle, Brain, RefreshCw, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { Streamdown } from "streamdown";

const POSITION_COLORS: Record<string, string> = {
  QB:   "bg-purple-500/20 text-purple-300 border-purple-500/30",
  RB:   "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  TE:   "bg-orange-500/20 text-orange-300 border-orange-500/30",
  K:    "bg-gray-500/20 text-gray-300 border-gray-500/30",
  FLEX: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const VALUE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  elite: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", label: "Elite Value" },
  good:  { color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30",       label: "Good Value"  },
  fair:  { color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30",   label: "Fair Value"  },
  poor:  { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30",         label: "Poor Value"  },
};

const POS_BAR_COLORS: Record<string, string> = {
  RB: "#3b82f6", WR: "#10b981", QB: "#a855f7", TE: "#f97316", K: "#6b7280", FLEX: "#64748b",
};

const SW_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  strength:  { icon: <Shield className="w-3.5 h-3.5" />,        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Strength"  },
  weakness:  { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-red-400 bg-red-500/10 border-red-500/20",             label: "Weakness"  },
  blindspot: { icon: <Brain className="w-3.5 h-3.5" />,         color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",   label: "Blind Spot"},
};

export function MyProfileTab() {
  const { data, isLoading, error } = trpc.espn.keeperEligibility2026.useQuery();
  const selfReview = trpc.ownerSelfReview.useQuery(undefined, { enabled: false });
  const [reviewRequested, setReviewRequested] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
      </div>
    );
  }

  if (error || !data?.ownerProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <User className="w-10 h-10 opacity-30" />
        <p className="text-sm">Profile data unavailable</p>
      </div>
    );
  }

  const profile = data.ownerProfile as any;
  const { careerStats, careerSeasons, keeperHistory, keeper2026 } = profile;
  const dt = profile.draftTendencies as any;
  const gm = profile.gmActivityProfile as any;

  const trendIcon = careerStats.trend === "improving"
    ? <ArrowUp className="w-3 h-3 text-emerald-400" />
    : careerStats.trend === "declining"
    ? <ArrowDown className="w-3 h-3 text-red-400" />
    : <Minus className="w-3 h-3 text-yellow-400" />;
  const trendColor = careerStats.trend === "improving" ? "text-emerald-400"
    : careerStats.trend === "declining" ? "text-red-400" : "text-yellow-400";

  const handleSelfReview = () => {
    setReviewRequested(true);
    selfReview.refetch();
  };

  return (
    <div className="space-y-5">

      {/* ── Profile Header ─────────────────────────────────────────────── */}
      <Card className="border-primary/40 bg-primary/5 ring-1 ring-primary/20">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{profile.ownerName}</h2>
                <Badge className="text-[9px] px-1.5 bg-primary/20 text-primary border-primary/30">YOUR TEAM</Badge>
                <Badge variant="outline" className={`text-[9px] px-1.5 flex items-center gap-1 ${trendColor}`}>
                  {trendIcon}
                  {careerStats.trend.charAt(0).toUpperCase() + careerStats.trend.slice(1)}
                </Badge>
                {dt && (
                  <Badge variant="outline" className="text-[9px] px-1.5 bg-blue-500/10 text-blue-300 border-blue-500/30">
                    {dt.draftStyleBadge}
                  </Badge>
                )}
                {gm && (
                  <Badge variant="outline" className="text-[9px] px-1.5 bg-purple-500/10 text-purple-300 border-purple-500/30">
                    {gm.gmArchetype}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">{profile.teamName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {careerStats.totalSeasons} seasons · {careerStats.totalWins}W–{careerStats.totalLosses}L · {careerStats.winPct}% win rate · {careerStats.playoffSeasons} playoff appearances
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Career Stats Grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Career W–L",          value: `${careerStats.totalWins}–${careerStats.totalLosses}`, sub: `${careerStats.winPct}% win rate`,    color: "text-foreground"  },
          { label: "Total PF",             value: careerStats.totalPF.toLocaleString(),                  sub: `Avg ${careerStats.avgPF.toFixed(0)}/season`, color: "text-blue-400"    },
          { label: "Playoff Appearances",  value: `${careerStats.playoffSeasons}/${careerStats.totalSeasons}`, sub: "seasons made playoffs",         color: "text-emerald-400" },
          { label: "Recent Win %",         value: `${careerStats.recentWinPct}%`,                        sub: "last 3 seasons",                     color: trendColor         },
        ].map((stat, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="py-3 px-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</div>
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Draft Tendencies ───────────────────────────────────────────── */}
      {dt && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <BarChart2 className="w-4 h-4 text-blue-400" />
              Draft Tendencies — {dt.totalPicks} Picks (All Seasons)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Style description */}
            <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-200/80">{dt.draftStyleDesc}</div>
            </div>

            {/* Positional breakdown bar chart */}
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Picks by Position (all rounds)</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={dt.positionalBreakdown} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="position" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }}
                    formatter={(v: number, name: string, props: any) => [`${v} picks (${props.payload.pct}%) — avg Rd ${props.payload.avgRound}`, "Picks"]}
                  />
                  <Bar dataKey="picks" radius={[3, 3, 0, 0]}>
                    {dt.positionalBreakdown.map((entry: any) => (
                      <Cell key={entry.position} fill={POS_BAR_COLORS[entry.position] ?? "#64748b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Early rounds split */}
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Early Rounds (1–3) Positional Split</div>
              <div className="flex flex-wrap gap-2">
                {dt.earlyRoundSplit.map((e: any) => (
                  <div key={e.position} className="flex items-center gap-1.5 bg-slate-800/60 border border-border/50 rounded-md px-2 py-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: POS_BAR_COLORS[e.position] ?? "#64748b" }} />
                    <span className="text-xs font-semibold text-foreground">{e.position}</span>
                    <span className="text-[10px] text-muted-foreground">{e.count} picks ({e.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Round 1 history */}
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Round 1 Pick History (all-time)</div>
              <div className="flex flex-wrap gap-2">
                {dt.round1Breakdown.map((r: any) => (
                  <Badge key={r.position} variant="outline" className={`text-xs ${POSITION_COLORS[r.position] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>
                    {r.position} × {r.count}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Notable picks */}
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Notable Draft Moments</div>
              <div className="space-y-1.5">
                {dt.notablePicks.map((p: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground font-mono w-8 flex-shrink-0">{p.season}</span>
                    <span className="text-foreground font-medium flex-shrink-0">{p.pick}</span>
                    <span className="text-muted-foreground">— {p.note}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Keeper pattern */}
            <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <Star className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-yellow-200/80"><span className="font-semibold text-yellow-300">Keeper Pattern:</span> {dt.keeperPattern}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── GM Activity Profile ────────────────────────────────────────── */}
      {gm && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Activity className="w-4 h-4 text-purple-400" />
              GM Activity Profile — {gm.gmArchetype}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Archetype description */}
            <div className="flex items-start gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
              <Zap className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-purple-200/80">{gm.gmArchetypeDesc}</div>
            </div>

            {/* Activity averages */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Avg Adds/Season",   value: gm.averages.acquisitions, color: "text-blue-400"    },
                { label: "Avg Drops/Season",  value: gm.averages.drops,        color: "text-red-400"     },
                { label: "Avg Trades/Season", value: gm.averages.trades,       color: "text-emerald-400" },
              ].map((s, i) => (
                <div key={i} className="bg-slate-800/60 border border-border/50 rounded-lg p-2 text-center">
                  <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Season-by-season activity chart */}
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Season Activity (Adds & Trades)</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={gm.seasonActivity} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="season" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="acquisitions" name="Adds"   fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="trades"       name="Trades" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Key insights */}
            <div className="space-y-1.5">
              {gm.insights.map((ins: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground font-medium flex-shrink-0 min-w-[110px]">{ins.label}:</span>
                  <span className="text-foreground/80">{ins.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Self-Assessment (Strengths / Weaknesses / Blind Spots) ────── */}
      {gm && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <TrendingUp className="w-4 h-4 text-yellow-400" />
              Self-Assessment — Strengths, Weaknesses & Blind Spots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {gm.strengthsWeaknesses.map((sw: any, i: number) => {
              const cfg = SW_CONFIG[sw.type] ?? SW_CONFIG.weakness;
              return (
                <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs ${cfg.color}`}>
                  <div className="mt-0.5 flex-shrink-0">{cfg.icon}</div>
                  <div>
                    <span className="font-semibold uppercase text-[9px] tracking-wide mr-1.5 opacity-70">{cfg.label}</span>
                    {sw.text}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── AI Self-Review ─────────────────────────────────────────────── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Brain className="w-4 h-4 text-primary" />
            AI Self-Review — 2026 Focus Areas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!reviewRequested ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Generate a personalized AI scouting report based on your 8-season career data, draft tendencies, and GM activity patterns.
              </p>
              <Button onClick={handleSelfReview} size="sm" className="gap-2">
                <Brain className="w-4 h-4" />
                Generate My Self-Review
              </Button>
            </div>
          ) : selfReview.isLoading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Analyzing your career data...</span>
            </div>
          ) : selfReview.error ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-red-400">Failed to generate review. Try again.</p>
              <Button onClick={handleSelfReview} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
            </div>
          ) : selfReview.data ? (
            <div className="space-y-4">
              {/* Narrative */}
              <div className="bg-slate-800/40 rounded-lg p-3 border border-border/50">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Career Narrative</div>
                <div className="text-sm text-foreground/90 leading-relaxed">{(selfReview.data as any).narrative}</div>
              </div>

              {/* 2026 Focus Areas */}
              {(selfReview.data as any).focusAreas2026 && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">2026 Focus Areas</div>
                  <div className="space-y-2">
                    {((selfReview.data as any).focusAreas2026 as string[]).map((area: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-2.5 text-xs text-foreground/80">
                        <Target className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                        {area}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Draft recommendations */}
              {(selfReview.data as any).draftRecommendations && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Draft Recommendations</div>
                  <div className="text-sm text-foreground/80 leading-relaxed bg-slate-800/40 rounded-lg p-3 border border-border/50">
                    {(selfReview.data as any).draftRecommendations}
                  </div>
                </div>
              )}

              {/* Honest verdict */}
              {(selfReview.data as any).honestVerdict && (
                <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wide mb-1">Honest Verdict</div>
                    <div className="text-xs text-yellow-200/80">{(selfReview.data as any).honestVerdict}</div>
                  </div>
                </div>
              )}

              <Button onClick={handleSelfReview} variant="outline" size="sm" className="gap-2 w-full">
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate Review
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Season-by-Season Record ────────────────────────────────────── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <BarChart2 className="w-4 h-4 text-primary" />
            Season-by-Season Record (2009–2026)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Season","Record","PF","PA","Seed","Result"].map(h => (
                    <th key={h} className="text-left py-2 px-2 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {careerSeasons.map((s: any) => {
                  const isBest  = s.season === careerStats.bestSeason.season;
                  const isWorst = s.season === careerStats.worstSeason.season;
                  const madePlayoffs = s.seed <= 7;
                  return (
                    <tr key={s.season} className={`border-b border-border/50 transition-colors ${
                      isBest ? "bg-emerald-500/5" : isWorst ? "bg-red-500/5" : "hover:bg-accent/20"
                    }`}>
                      <td className="py-2 px-2 font-semibold text-foreground">
                        {s.season}
                        {isBest  && <Badge className="ml-1.5 text-[8px] px-1 py-0 bg-emerald-600 text-white border-0">BEST</Badge>}
                        {isWorst && <Badge className="ml-1.5 text-[8px] px-1 py-0 bg-red-700 text-white border-0">WORST</Badge>}
                      </td>
                      <td className="py-2 px-2">
                        <span className={s.wins > s.losses ? "text-emerald-400 font-semibold" : s.wins < s.losses ? "text-red-400 font-semibold" : "text-yellow-400 font-semibold"}>
                          {s.wins}–{s.losses}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-foreground">{s.pf.toFixed(1)}</td>
                      <td className="py-2 px-2 text-muted-foreground">{s.pa.toFixed(1)}</td>
                      <td className="py-2 px-2 text-muted-foreground">#{s.seed}</td>
                      <td className="py-2 px-2">
                        {madePlayoffs
                          ? <Badge variant="outline" className="text-[9px] px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Playoffs</Badge>
                          : <Badge variant="outline" className="text-[9px] px-1.5 bg-slate-500/10 text-slate-400 border-slate-500/30">Missed</Badge>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Keeper History ─────────────────────────────────────────────── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Star className="w-4 h-4 text-yellow-400" />
            Keeper History (2022–2025)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {keeperHistory.map((k: any, i: number) => {
              const posClass = POSITION_COLORS[k.position?.toUpperCase()] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                  k.eligible2026 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-slate-800/40 border-border/50"
                }`}>
                  <div className="text-sm font-bold text-muted-foreground w-10 flex-shrink-0">{k.season}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{k.playerName}</span>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${posClass}`}>{k.position}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Kept in Round {k.round}</div>
                  </div>
                  {k.eligible2026
                    ? <Badge variant="outline" className="text-[9px] px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex-shrink-0">Eligible 2026</Badge>
                    : <Badge variant="outline" className="text-[9px] px-1.5 bg-slate-500/10 text-slate-400 border-slate-500/30 flex-shrink-0">Past</Badge>
                  }
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── 2026 Keeper Decision ───────────────────────────────────────── */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
            <Target className="w-4 h-4" />
            2026 Keeper Decision
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {keeper2026.eligible.length > 0 ? (
            keeper2026.eligible.map((p: any, i: number) => {
              const valCfg = VALUE_CONFIG[p.valueTier] ?? VALUE_CONFIG.fair;
              const posClass = POSITION_COLORS[p.position?.toUpperCase()] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{p.playerName}</span>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${posClass}`}>{p.position}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Keep in Round {p.roundCost2026} for 2026</div>
                  </div>
                  <Badge variant="outline" className={`text-[9px] px-1.5 flex-shrink-0 ${valCfg.bg} ${valCfg.color}`}>
                    {valCfg.label}
                  </Badge>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-muted-foreground italic">No eligible keepers for 2026</div>
          )}
          <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mt-2">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-200/80">{keeper2026.recommendation}</div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
