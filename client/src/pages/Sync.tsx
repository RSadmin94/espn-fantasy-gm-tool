import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Loader2, XCircle } from "lucide-react";

type SyncStatus = "idle" | "syncing" | "complete";

const HISTORICAL_SEASONS = Array.from({ length: 2026 - 2009 + 1 }, (_, index) => 2009 + index);

type SyncResult = {
  season: number;
  status: "success" | "failed";
  transactionCount?: number;
  teamCount?: number;
  error?: string;
};

export default function Sync() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [results, setResults] = useState<SyncResult[]>([]);
  const [startedAt, setStartedAt] = useState<Date | null>(null);

  const syncMutation = trpc.espn.syncAllSeasons.useMutation({
    onMutate: () => {
      setStatus("syncing");
      setStartedAt(new Date());
      setResults([]);
    },
    onSuccess: data => {
      setResults(data.results as SyncResult[]);
      setStatus("complete");
    },
    onError: () => {
      setStatus("complete");
    },
  });

  const completedCount = results.filter(result => result.status === "success").length;
  const failedCount = results.filter(result => result.status === "failed").length;
  const displayedCompleteCount = status === "syncing" ? 0 : completedCount;
  const progressPct = status === "syncing"
    ? 12
    : Math.round(((completedCount + failedCount) / HISTORICAL_SEASONS.length) * 100);

  const resultMap = useMemo(() => new Map(results.map(result => [result.season, result])), [results]);

  return (
    <AppLayout title="Historical ESPN Sync" subtitle="Fetch every ESPN season directly with your connected ESPN account">
      <Card className="bg-slate-900/60 border-slate-700/50 mb-6">
        <CardHeader>
          <CardTitle className="text-slate-100">Sync All Historical Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-300">
                Sync seasons 2009 through 2026 into the ESPN season cache using your stored ESPN credentials.
              </p>
              {startedAt && (
                <p className="text-xs text-slate-500 mt-1">Started {startedAt.toLocaleTimeString()}</p>
              )}
            </div>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="shrink-0"
            >
              {syncMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing...</>
              ) : (
                "Sync All Historical Data"
              )}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {status === "syncing"
                  ? `Fetching historical seasons... ${displayedCompleteCount}/${HISTORICAL_SEASONS.length} seasons`
                  : `${completedCount}/${HISTORICAL_SEASONS.length} seasons loaded`}
              </span>
              <span>{progressPct}%</span>
            </div>
            <Progress value={progressPct} />
          </div>

          {syncMutation.error && (
            <div className="rounded-lg border border-red-800/40 bg-red-950/30 p-3 text-sm text-red-300">
              {syncMutation.error.message}
            </div>
          )}

          {status === "complete" && !syncMutation.error && (
            <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/30 p-3 text-sm text-emerald-300">
              All data synced -- {completedCount} seasons loaded{failedCount > 0 ? `, ${failedCount} failed` : ""}.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {HISTORICAL_SEASONS.map(season => {
          const result = resultMap.get(season);
          const isPending = status === "syncing" && !result;
          return (
            <Card key={season} className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="flex items-start gap-3 p-4">
                {result?.status === "success" ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5" />
                ) : result?.status === "failed" ? (
                  <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
                ) : isPending ? (
                  <Loader2 className="w-5 h-5 text-blue-400 mt-0.5 animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-slate-600 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-slate-100">{season}</div>
                  {result?.status === "success" ? (
                    <div className="text-xs text-slate-400">
                      {result.teamCount ?? 0} teams • {result.transactionCount ?? 0} transactions
                    </div>
                  ) : result?.status === "failed" ? (
                    <div className="text-xs text-red-300 truncate" title={result.error}>{result.error}</div>
                  ) : isPending ? (
                    <div className="text-xs text-blue-300">Waiting in sync queue...</div>
                  ) : (
                    <div className="text-xs text-slate-500">Not synced this run</div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}
