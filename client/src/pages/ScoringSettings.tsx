import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator, TrendingUp, Zap, AlertCircle, CheckCircle2 } from "lucide-react";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Passing: <TrendingUp className="h-4 w-4 text-blue-400" />,
  Rushing: <Zap className="h-4 w-4 text-green-400" />,
  Receiving: <TrendingUp className="h-4 w-4 text-purple-400" />,
  Misc: <AlertCircle className="h-4 w-4 text-yellow-400" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  Passing: "bg-blue-500/10 border-blue-500/20",
  Rushing: "bg-green-500/10 border-green-500/20",
  Receiving: "bg-purple-500/10 border-purple-500/20",
  Misc: "bg-yellow-500/10 border-yellow-500/20",
};

export default function ScoringSettings() {
  const { data, isLoading, error } = trpc.leagueScoring.getSettings.useQuery({});

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Could not load scoring settings. Ensure ESPN data has been refreshed at least once.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group breakdown rows by category
  const grouped: Record<string, typeof data.breakdown> = {};
  for (const row of data.breakdown) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category]!.push(row);
  }

  const pprLabel =
    data.receptionPoints === 1 ? "Full PPR" :
    data.receptionPoints === 0.5 ? "Half PPR" :
    "Standard (no PPR)";

  const pprColor =
    data.receptionPoints === 1 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
    data.receptionPoints === 0.5 ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
    "bg-slate-500/20 text-slate-400 border-slate-500/30";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">League Scoring Settings</h2>
            <p className="text-sm text-muted-foreground">
              Live from ESPN — used by all projection and simulation tools
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={pprColor}>
            {pprLabel}
          </Badge>
          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Live
          </Badge>
        </div>
      </div>

      {/* Summary strip */}
      <Card className="bg-muted/30 border-border/50">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-mono text-muted-foreground leading-relaxed">
            {data.scoringDescription}
          </p>
        </CardContent>
      </Card>

      {/* Key stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Reception", value: `${data.receptionPoints} pt`, sub: "per catch" },
          { label: "Passing TD", value: `${data.passingTDPoints} pts`, sub: "each" },
          { label: "Rushing TD", value: `${data.rushingTDPoints} pts`, sub: "each" },
          { label: "Interception", value: `${data.interceptionPoints} pts`, sub: "each" },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/50 border-border/50">
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">{stat.label}</p>
              <p className="text-xs text-muted-foreground/60">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Yards per point row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Passing Yards", value: `1 pt / ${data.passingYardsPerPoint} yds`, color: "text-blue-400" },
          { label: "Rushing Yards", value: `1 pt / ${data.rushingYardsPerPoint} yds`, color: "text-green-400" },
          { label: "Receiving Yards", value: `1 pt / ${data.receivingYardsPerPoint} yds`, color: "text-purple-400" },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/50 border-border/50">
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-lg font-semibold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Full breakdown by category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(grouped).map(([category, rows]) => (
          <Card key={category} className={`border ${CATEGORY_COLORS[category] ?? "bg-card/50 border-border/50"}`}>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {CATEGORY_ICONS[category]}
                {category}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.stat} className="border-b border-border/30 last:border-0">
                      <td className="py-1.5 text-muted-foreground">{row.stat}</td>
                      <td className="py-1.5 text-right font-mono font-medium text-foreground">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground/60 text-center">
        Scoring settings loaded from ESPN mSettings cache · Used by Monte Carlo, ML Forecasting, Trade Analyzer, and all AI prompts ·{" "}
        Last fetched: {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}
