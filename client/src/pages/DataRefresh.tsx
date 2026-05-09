import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, CheckCircle2, XCircle, Clock, Database } from "lucide-react";
import { toast } from "sonner";


const ALL_SEASONS = [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];

export default function DataRefresh() {
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([2025]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshLog, setRefreshLog] = useState<{ season: number; status: "success" | "error"; message: string }[]>([]);
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
  const selectRecent = () => setSelectedSeasons([2023, 2024, 2025, 2026]);

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
        await refreshMutation.mutateAsync({ seasons: [season] });
        setRefreshLog((prev) => [...prev, { season, status: "success", message: "Data loaded successfully" }]);
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
  const lastRefreshEntry = manifestArr.sort((a, b) => new Date(b.lastRefreshedAt).getTime() - new Date(a.lastRefreshedAt).getTime())[0];
  const lastRefresh = lastRefreshEntry ? String(lastRefreshEntry.lastRefreshedAt) : null;

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
              <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-80" />
              <div>
                <p className="text-xs text-muted-foreground">League</p>
                <p className="text-sm font-semibold text-foreground">ATLANTAS FINEST FF</p>
                <p className="text-xs text-muted-foreground">ID: 457622</p>
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
              <Button variant="outline" size="sm" onClick={selectRecent}>Recent (2023–2026)</Button>
              <Button variant="outline" size="sm" onClick={selectNone}>Clear</Button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {ALL_SEASONS.map((s) => {
                const isCached = cachedSeasons.includes(s);
                const isSelected = selectedSeasons.includes(s);
                return (
                  <div
                    key={s}
                    onClick={() => toggleSeason(s)}
                    className={`relative flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/15"
                        : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSeason(s)}
                      className="absolute top-1.5 right-1.5 w-3 h-3"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-sm font-semibold text-foreground">{s}</span>
                    {isCached ? (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 mt-1 border-emerald-500/40 text-emerald-400">Cached</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 mt-1 border-muted text-muted-foreground">Not loaded</Badge>
                    )}
                  </div>
                );
              })}
            </div>

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
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-foreground w-12">{entry.season}</span>
                    <span className={`text-sm ${entry.status === "success" ? "text-emerald-400" : "text-red-400"}`}>
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
                  <Badge key={s} variant="outline" className="border-emerald-500/40 text-emerald-400 text-xs">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                    {s}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
