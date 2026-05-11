// FILE: client/src/pages/MLForecast.tsx
/**
 * ML Forecasting UI
 *
 * Displays:
 *  - Model health / accuracy panel (MAE, RMSE, training rows, top features)
 *  - Player lookup with projection confidence bands (floor / median / ceiling)
 *  - Feature importance horizontal bar chart
 *
 * The ML service is a Python FastAPI microservice started by the Node server.
 * If it is unavailable, the UI shows a graceful "service offline" state.
 */
import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Brain, BarChart3, TrendingUp, AlertTriangle, CheckCircle2,
  Loader2, Search, Zap, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MLPrediction = {
  playerName: string;
  predictedPoints: number;
  floor: number;
  ceiling: number;
  confidenceBand: number;
  dataQuality: "rich" | "sparse" | "cold_start";
  featuresUsed: number;
  modelMae: number;
  available: true;
};

type MLPredictionUnavailable = {
  playerName: string;
  available: false;
  reason: string;
};

type MLPredictionResult = MLPrediction | MLPredictionUnavailable;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUALITY_COLORS: Record<string, string> = {
  rich: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  sparse: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  cold_start: "bg-red-500/20 text-red-400 border-red-500/30",
};

const QUALITY_LABELS: Record<string, string> = {
  rich: "Rich Data",
  sparse: "Sparse Data",
  cold_start: "Cold Start",
};

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "D/ST"];

function ConfidenceBand({ prediction }: { prediction: MLPrediction }) {
  const range = prediction.ceiling - prediction.floor;
  const floorPct = range > 0 ? ((prediction.floor - prediction.floor) / range) * 100 : 0;
  const medianPct = range > 0 ? ((prediction.predictedPoints - prediction.floor) / range) * 100 : 50;

  return (
    <div className="space-y-3">
      {/* Numeric values */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="text-2xl font-bold text-red-400">{prediction.floor.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Floor</div>
        </div>
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="text-2xl font-bold text-blue-400">{prediction.predictedPoints.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Projection</div>
        </div>
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-2xl font-bold text-emerald-400">{prediction.ceiling.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Ceiling</div>
        </div>
      </div>

      {/* Visual band */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{prediction.floor.toFixed(1)}</span>
          <span className="text-blue-400 font-semibold">{prediction.predictedPoints.toFixed(1)} pts projected</span>
          <span>{prediction.ceiling.toFixed(1)}</span>
        </div>
        <div className="relative h-4 rounded-full bg-muted overflow-hidden">
          {/* Full range bar */}
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/40 via-blue-500/40 to-emerald-500/40 rounded-full" />
          {/* Confidence band indicator */}
          <div
            className="absolute top-0 bottom-0 w-1.5 bg-white rounded-full shadow-lg"
            style={{ left: `${Math.max(2, Math.min(98, medianPct))}%`, transform: "translateX(-50%)" }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="text-red-400">Floor</span>
          <span>Confidence band: ±{prediction.confidenceBand.toFixed(1)} pts</span>
          <span className="text-emerald-400">Ceiling</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <Badge className={`text-xs border ${QUALITY_COLORS[prediction.dataQuality] || QUALITY_COLORS.sparse}`}>
          {QUALITY_LABELS[prediction.dataQuality] || prediction.dataQuality}
        </Badge>
        <span className="text-xs text-muted-foreground">{prediction.featuresUsed} features used</span>
        <span className="text-xs text-muted-foreground">Model MAE: ±{prediction.modelMae.toFixed(2)} pts</span>
      </div>
    </div>
  );
}

function FeatureImportanceChart({ features }: { features: [string, number][] }) {
  const maxVal = Math.max(...features.map(([, v]) => v));
  const FEATURE_LABELS: Record<string, string> = {
    avg_points_l4: "Avg Pts (L4 wks)",
    avg_points_l8: "Avg Pts (L8 wks)",
    avg_points_season: "Avg Pts (Season)",
    avg_snaps_l4: "Avg Snaps (L4)",
    avg_targets_l4: "Avg Targets (L4)",
    avg_rush_att_l4: "Avg Rush Att (L4)",
    trend_slope: "Trend Slope",
    implied_team_total: "Implied Team Total",
    game_total: "Game Total",
    spread: "Spread",
    is_home: "Home Game",
    vegas_adjustment: "Vegas Adj.",
    beat_net_impact: "Beat Reporter Impact",
    beat_confidence: "Beat Confidence",
    beat_signal_count: "Beat Signal Count",
    injury_risk_score: "Injury Risk",
    days_since_last_game: "Days Since Last Game",
    week_num: "Week Number",
    season: "Season",
    position_QB: "Position: QB",
    position_RB: "Position: RB",
    position_WR: "Position: WR",
    position_TE: "Position: TE",
    position_K: "Position: K",
    "position_D/ST": "Position: D/ST",
  };

  return (
    <div className="space-y-2">
      {features.slice(0, 12).map(([feat, importance]) => {
        const pct = maxVal > 0 ? (importance / maxVal) * 100 : 0;
        const label = FEATURE_LABELS[feat] || feat.replace(/_/g, " ");
        return (
          <div key={feat} className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground w-40 truncate shrink-0">{label}</div>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-foreground font-medium w-12 text-right shrink-0">
              {(importance * 100).toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MLForecast() {
  const [playerName, setPlayerName] = useState("");
  const [position, setPosition] = useState("WR");
  const [historicalInput, setHistoricalInput] = useState("14.2, 22.1, 18.5, 9.8");
  const [prediction, setPrediction] = useState<MLPredictionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: healthData, isLoading: healthLoading } = trpc.ml.health.useQuery(undefined, {
    staleTime: 30_000,
    retry: 1,
  });

  const predictMutation = trpc.ml.predict.useQuery(
    {
      playerName: playerName || "Player",
      position,
      historicalPoints: historicalInput
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n)),
    },
    {
      enabled: false, // manual trigger only
    }
  );

  const handlePredict = async () => {
    if (!playerName.trim()) return;
    setLoading(true);
    setPrediction(null);
    try {
      const result = await predictMutation.refetch();
      if (result.data) setPrediction(result.data as MLPredictionResult);
    } finally {
      setLoading(false);
    }
  };

  const isAvailable = healthData?.available ?? false;
  const metadata = healthData?.metadata;

  return (
    <AppLayout title="ML Forecasting" subtitle="LightGBM projection engine — confidence bands, feature importance, model accuracy">
      <div className="p-6 space-y-6 max-w-5xl">

        {/* ── Model Status Card ─────────────────────────────────────────── */}
        <Card className={`border ${isAvailable ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-400" />
              ML Engine Status
              {healthLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : isAvailable ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-400" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
            ) : isAvailable && metadata ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <div className="text-xl font-bold text-emerald-400">±{metadata.mae.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">MAE (pts)</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <div className="text-xl font-bold text-blue-400">±{metadata.rmse.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">RMSE (pts)</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <div className="text-xl font-bold text-foreground">{metadata.nTrainingRows.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Training Rows</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 text-center">
                    <Badge className={`text-xs border ${metadata.dataSource === "real" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"}`}>
                      {metadata.dataSource === "real" ? "Real Data" : "Synthetic Data"}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">Data Source</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Trained: {new Date(metadata.trainedAt).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400 font-medium">ML service offline</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    The Python LightGBM microservice is not running. Predictions are unavailable.
                    The service starts automatically with the Node server — check server logs for details.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Player Projection Input ────────────────────────────────── */}
          <div className="space-y-4">
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4 text-blue-400" />
                  Player Projection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Player Name</label>
                  <Input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handlePredict(); }}
                    placeholder="e.g. Tyreek Hill"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Position</label>
                  <Select value={position} onValueChange={setPosition}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Recent Fantasy Points (comma-separated, oldest→newest)</label>
                  <Input
                    value={historicalInput}
                    onChange={(e) => setHistoricalInput(e.target.value)}
                    placeholder="e.g. 14.2, 22.1, 18.5, 9.8"
                    className="bg-background border-border font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Enter up to 8 weeks of recent scores for best accuracy</p>
                </div>
                <Button
                  onClick={handlePredict}
                  disabled={loading || !playerName.trim() || !isAvailable}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {loading ? (
                    <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Running Model…</span>
                  ) : (
                    <span className="flex items-center gap-2"><Zap className="h-4 w-4" />Get ML Projection</span>
                  )}
                </Button>
                {!isAvailable && (
                  <p className="text-xs text-red-400 text-center">ML service must be online to generate projections</p>
                )}
              </CardContent>
            </Card>

            {/* Quick examples */}
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
                  <Info className="h-3.5 w-3.5" />
                  Quick Examples
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { name: "Tyreek Hill", pos: "WR", pts: "22.1, 14.5, 18.3, 26.7, 11.2, 19.8" },
                  { name: "Lamar Jackson", pos: "QB", pts: "28.4, 35.1, 22.6, 41.2, 18.9, 33.5" },
                  { name: "Saquon Barkley", pos: "RB", pts: "18.2, 24.6, 12.1, 31.4, 9.8, 22.3" },
                  { name: "Travis Kelce", pos: "TE", pts: "14.8, 22.1, 8.4, 18.6, 11.2, 16.9" },
                ].map((ex) => (
                  <button
                    key={ex.name}
                    onClick={() => { setPlayerName(ex.name); setPosition(ex.pos); setHistoricalInput(ex.pts); }}
                    className="w-full text-left flex items-center gap-2 p-2 rounded-lg border border-border hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
                  >
                    <Badge variant="outline" className="text-xs shrink-0">{ex.pos}</Badge>
                    <span className="text-xs text-foreground">{ex.name}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ── Prediction Result ──────────────────────────────────────── */}
          <div className="space-y-4">
            {loading ? (
              <Card className="border-border bg-card/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Running ML Model…</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
                </CardContent>
              </Card>
            ) : prediction ? (
              prediction.available ? (
                <Card className="border-blue-500/30 bg-blue-500/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-400" />
                      {prediction.playerName} — ML Projection
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ConfidenceBand prediction={prediction} />
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-red-500/30 bg-red-500/5">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-400">Prediction unavailable</p>
                        <p className="text-xs text-muted-foreground mt-1">{prediction.reason}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            ) : (
              <Card className="border-dashed border-border bg-card/30">
                <CardContent className="py-12 text-center">
                  <Brain className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm mb-1">Enter player details and click Get ML Projection</p>
                  <p className="text-xs text-muted-foreground">
                    The LightGBM model uses historical points, Vegas lines, beat reporter signals, and injury risk to generate a projection with floor/ceiling confidence bands.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ── Feature Importance Chart ───────────────────────────────────── */}
        {isAvailable && metadata && metadata.topFeatures.length > 0 && (
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-400" />
                Feature Importance — Top 12 Predictors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                These are the features the LightGBM model relies on most when generating projections.
                Higher importance = stronger influence on the predicted output.
              </p>
              <FeatureImportanceChart features={metadata.topFeatures} />
            </CardContent>
          </Card>
        )}

        {/* ── Model Accuracy Panel ──────────────────────────────────────── */}
        {isAvailable && metadata && (
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Model Accuracy Reference
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Mean Absolute Error</div>
                  <div className="text-3xl font-bold text-emerald-400">±{metadata.mae.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    On average, the model's projections are within ±{metadata.mae.toFixed(1)} fantasy points of the actual score.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Root Mean Squared Error</div>
                  <div className="text-3xl font-bold text-blue-400">±{metadata.rmse.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">
                    RMSE penalizes large misses more heavily. A lower RMSE means fewer big projection errors.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Training Data</div>
                  <div className="text-3xl font-bold text-foreground">{metadata.nTrainingRows.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    Player-week rows used to train the model.
                    {metadata.dataSource === "synthetic" && " (Synthetic — model improves as real data is collected.)"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </AppLayout>
  );
}
