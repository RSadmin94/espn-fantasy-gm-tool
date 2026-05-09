import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, CheckCircle2, XCircle, Clock, Database, Lock, SkipForward } from "lucide-react";
import { toast } from "sonner";

const ALL_SEASONS = [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];
const CURRENT_SEASON = 2025;
const CLOSED_SEASONS = ALL_SEASONS.filter(s => s < CURRENT_SEASON); // 2009–2024 are final

export default function DataRefresh() {
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([2025]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [refreshLog, setRefreshLog] = useState<{ season: number; status: "success" | "error" | "skipped"; message: string }[]>([]);
  const { data: manifest } = trpc.espn.manifests.useQuery();
  const refreshMutation = trpc.espn.refresh.useMutation();
  const utils = trpc.useUtils();

  const toggleSeason = (s: number) => {
    setSelectedSeasons((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const selectAll = () => setSelectedSeasons([...ALL_SEASONS]);
  const selectNone = () => setSelectedSeasons([]);
  const selectOpenOnly = () => setSelectedSeasons([2025, 2026]);
  const selectUncached = () => {
    const uncached = ALL_SEASONS.filter(s => !cachedSeasons.includes(s));
    setSelectedSeasons(uncached.length > 0 ? uncached : [2025]);
  };

  const handleRefresh = async () => {
    if (selectedSeasons.length === 0) {
      toast.error("Select at least one season to refresh");
      return;
    }
    setIsRefreshing(true);
    setRefreshLog([]);
    const sorted = [...selectedSeasons].sort((a, b) => a - b);
    for (const season of sorted) {
      try {
        const result = await refreshMutation.mutateAsync({ seasons: [season], forceRefresh });
        const seasonResult = (result as Record<number, { status: string; skipped?: boolean }>)[season];
        if (seasonResult?.skipped) {
          setRefreshLog((prev) => [...prev, { season, status: "skipped", message: "Closed season — already cached, skipped" }]);
        } else {
          setRefreshLog((prev) => [...prev, { season, status: "success", message: "Data loaded successfully" }]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setRefreshLog((prev) => [...prev, { season, status: "error", message: msg }]);
      }
    }
    setIsRefreshing(false);
    utils.espn.manifests.invalidate();
    toast.success("Data refresh complete");
  };

  const manifestArr = (manifest as unknown as { season: number; lastRefreshedAt: Date; status: string }[]) || [];
  const cachedSeasons: number[] = manifestArr.filter((m) => m.status === "success").map((m) => m.season);
  const lastRefreshEntry = [...manifestArr].sort((a, b) => new Date(b.lastRefreshedAt).getTime() - new Date(a.lastRefreshedAt).getTime())[0];
  const lastRefresh = lastRefreshEntry ? String(lastRefreshEntry.lastRefreshedAt) : null;

  // Count how many selected seasons would be skipped (closed + cached) without forceRefresh
  const wouldSkip = selectedSeasons.filter(s => CLOSED_SEASONS.includes(s) && cachedSeasons.includes(s));
  const wouldFetch = selectedSeasons.filter(s => !CLOSED_SEASONS.includes(s) || !cachedSeasons.includes(s) || forceRefresh);

  return (
    <AppLayout title="Data Refresh" subtitle="Pull live ESPN league data for any season">
      <div className="p-8 space-y-6">
        {/* Status overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="card-glow bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Database className="w-8 h-8 text-primary opacity-80" />
              <div>
                <p className="text-xs text-muted-foreground">Cached Seasons</p>
                <p className="text-2xl font-bold text-foreground">{cachedSeasons.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="card-glow bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="w-8 h-8 text-primary opacity-80" />
              <div>
                <p className="text-xs text-muted-foreground">Last Refresh</p>
                <p className="text-sm font-semibold text-foreground">
                  {lastRefresh ? new Date(lastRefresh).toLocaleString() : "Never"}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="card-glow bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Lock className="w-8 h-8 text-amber-400 opacity-80" />
              <div>
                <p className="text-xs text-muted-foreground">Closed Seasons</p>
                <p className="text-2xl font-bold text-foreground">{CLOSED_SEASONS.length}</p>
                <p className="text-xs text-muted-foreground">2009–{CURRENT_SEASON - 1} (final)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Season selector */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              Select Seasons to Refresh
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAll}>All Seasons</Button>
              <Button variant="outline" size="sm" onClick={selectOpenOnly}>Open Only (2025–2026)</Button>
              <Button variant="outline" size="sm" onClick={selectUncached}>Uncached Only</Button>
              <Button variant="outline" size="sm" onClick={selectNone}>Clear</Button>
            </div>

            {/* Closed-season info banner */}
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/80">
                Seasons 2009–{CURRENT_SEASON - 1} are <strong>closed</strong> — their data will not change. Already-cached closed seasons are automatically skipped to save time. Use the Force Re-fetch toggle below to override.
              </p>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {ALL_SEASONS.map((s) => {
                const isCached = cachedSeasons.includes(s);
                const isClosed = CLOSED_SEASONS.includes(s);
                const isSelected = selectedSeasons.includes(s);
                const wouldBeSkipped = isClosed && isCached && !forceRefresh;
                return (
                  <div
                    key={s}
                    onClick={() => toggleSeason(s)}
                    className={`relative flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/15"
                        : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
                    } ${wouldBeSkipped && isSelected ? "opacity-50" : ""}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSeason(s)}
                      className="absolute top-1.5 right-1.5 w-3 h-3"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-sm font-semibold text-foreground">{s}</span>
                    {isClosed && isCached ? (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 mt-1 border-amber-500/40 text-amber-400 gap-0.5">
                        <Lock className="w-1.5 h-1.5" />Closed
                      </Badge>
                    ) : isCached ? (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 mt-1 border-emerald-500/40 text-emerald-400">Cached</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 mt-1 border-muted text-muted-foreground">Not loaded</Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Force refresh toggle */}
            <div className="flex items-center gap-3 pt-1 pb-1">
              <Switch
                id="force-refresh"
                checked={forceRefresh}
                onCheckedChange={setForceRefresh}
              />
              <Label htmlFor="force-refresh" className="text-sm text-muted-foreground cursor-pointer">
                Force re-fetch closed seasons (overrides skip logic)
              </Label>
            </div>

            {/* Summary of what will happen */}
            {selectedSeasons.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {wouldFetch.length > 0 && (
                  <p className="text-emerald-400">
                    <RefreshCw className="w-3 h-3 inline mr-1" />
                    {wouldFetch.length} season{wouldFetch.length !== 1 ? "s" : ""} will be fetched from ESPN
                  </p>
                )}
                {!forceRefresh && wouldSkip.length > 0 && (
                  <p className="text-amber-400">
                    <SkipForward className="w-3 h-3 inline mr-1" />
                    {wouldSkip.length} closed season{wouldSkip.length !== 1 ? "s" : ""} already cached — will be skipped
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleRefresh}
                disabled={isRefreshing || selectedSeasons.length === 0}
                className="espn-gradient text-white border-0"
              >
                {isRefreshing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Refreshing {refreshLog.length + 1} of {selectedSeasons.length}...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh {selectedSeasons.length} Season{selectedSeasons.length !== 1 ? "s" : ""}
                    {!forceRefresh && wouldSkip.length > 0 ? ` (${wouldFetch.length} active)` : ""}
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                {selectedSeasons.length} season{selectedSeasons.length !== 1 ? "s" : ""} selected
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Refresh log */}
        {refreshLog.length > 0 && (
          <Card className="card-glow bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Refresh Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {refreshLog.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 px-6 py-3">
                    {entry.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : entry.status === "skipped" ? (
                      <SkipForward className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-foreground w-12">{entry.season}</span>
                    <span className={`text-sm ${
                      entry.status === "success" ? "text-emerald-400" :
                      entry.status === "skipped" ? "text-amber-400" :
                      "text-red-400"
                    }`}>
                      {entry.message}
                    </span>
                  </div>
                ))}
                {isRefreshing && (
                  <div className="flex items-center gap-3 px-6 py-3">
                    <RefreshCw className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      Loading {selectedSeasons.filter((s) => !refreshLog.find((r) => r.season === s))[0]}...
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cached seasons list */}
        {cachedSeasons.length > 0 && (
          <Card className="card-glow bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Cached Season Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {cachedSeasons.sort().map((s) => (
                  <Badge key={s} variant="outline" className={`text-xs ${
                    CLOSED_SEASONS.includes(s)
                      ? "border-amber-500/40 text-amber-400"
                      : "border-emerald-500/40 text-emerald-400"
                  }`}>
                    {CLOSED_SEASONS.includes(s) ? <Lock className="w-2.5 h-2.5 mr-1" /> : <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
                    {s}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                <Lock className="w-3 h-3 inline mr-1 text-amber-400" />Amber = closed season (final data)
                <CheckCircle2 className="w-3 h-3 inline ml-3 mr-1 text-emerald-400" />Green = open/current season
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
