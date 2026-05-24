import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Layers,
  Loader2,
  RefreshCw,
  SkipForward,
  XCircle,
} from "lucide-react";

type RefreshResult = {
  status: string;
  error?: string;
  viewHealth?: Record<string, string>;
  qualityWarnings?: string[];
  skipped?: boolean;
};

function SeasonStatusIcon({ status }: { status: string | undefined }) {
  switch (status) {
    case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "partial": return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
    case "failed":  return <XCircle className="h-4 w-4 text-red-400" />;
    case "skipped": return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    default:        return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function SeasonStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    partial: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    failed:  "bg-red-500/15 text-red-400 border-red-500/20",
    skipped: "bg-muted/50 text-muted-foreground border-border",
    pending: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
      map[status] ?? "bg-muted/50 text-muted-foreground border-border"
    )}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface ManifestRow {
  season: number;
  status?: string | null;
  teamCount?: number | null;
  rosterCount?: number | null;
  matchupCount?: number | null;
  draftPickCount?: number | null;
  transactionCount?: number | null;
  updatedAt?: Date | string | null;
}

function ManifestCard({ manifest, refreshResult }: {
  manifest: ManifestRow;
  refreshResult?: RefreshResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeResult = refreshResult ?? null;
  const displayStatus = activeResult?.status ?? manifest.status ?? undefined;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <SeasonStatusIcon status={displayStatus} />
          <span className="font-semibold text-foreground">{manifest.season}</span>
          <SeasonStatusBadge status={displayStatus} />
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:block">
            {manifest.teamCount != null && `${manifest.teamCount} teams`}
            {manifest.transactionCount != null && ` · ${manifest.transactionCount} txns`}
          </span>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              { label: "Teams", value: manifest.teamCount },
              { label: "Rosters", value: manifest.rosterCount },
              { label: "Matchups", value: manifest.matchupCount },
              { label: "Draft picks", value: manifest.draftPickCount },
              { label: "Transactions", value: manifest.transactionCount },
            ].map(({ label, value }) => (
              <div key={label} className="rounded border border-border bg-muted/30 px-2.5 py-2 text-center">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-0.5 text-sm font-semibold text-foreground">
                  {value ?? "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Refresh result details */}
          {activeResult && (
            <div className="space-y-2">
              {activeResult.error && (
                <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {activeResult.error}
                </div>
              )}
              {activeResult.qualityWarnings && activeResult.qualityWarnings.length > 0 && (
                <div className="rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300">
                  <div className="font-medium mb-1">Quality warnings</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs">
                    {activeResult.qualityWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              {activeResult.viewHealth && Object.keys(activeResult.viewHealth).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">View health</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(activeResult.viewHealth).map(([view, status]) => (
                      <span
                        key={view}
                        className={cn(
                          "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs",
                          status === "ok"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : status === "error"
                              ? "border-red-500/20 bg-red-500/10 text-red-400"
                              : "border-border bg-muted/30 text-muted-foreground"
                        )}
                      >
                        {view}: {status}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {manifest.updatedAt && !activeResult && (
            <p className="text-xs text-muted-foreground">
              Last synced:{" "}
              {new Date(manifest.updatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Avoid duplicate auto-sync under React Strict Mode remount (same URL). */
let gmwrAutoSync2026LastKey = "";

const BACKFILL_NORMALIZED_SEASONS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const REPROCESS_MANIFEST_RANGE = BACKFILL_NORMALIZED_SEASONS;

function trpcLikeErrorMessage(err: Error | { message: string } | null | undefined): string {
  if (!err) return "";
  const nested = (err as { data?: { json?: { message?: string } } }).data?.json?.message;
  return typeof nested === "string" && nested.trim() ? nested : err.message;
}

export function SyncData() {
  const [searchParams] = useSearchParams();
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [runResults, setRunResults] = useState<Record<number, RefreshResult>>({});
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

  const allSeasonsQuery = trpc.espn.allSeasons.useQuery();
  const cachedQuery = trpc.espn.cachedSeasons.useQuery();
  const manifestsQuery = trpc.espn.manifests.useQuery();

  const utils = trpc.useUtils();
  const refreshMutation = trpc.espn.refresh.useMutation({
    onSuccess: (data) => {
      setRunResults(data as Record<number, RefreshResult>);
      void utils.espn.manifests.invalidate();
      void utils.espn.cachedSeasons.invalidate();
    },
  });

  const backfillNormalizedMutation = trpc.espn.backfillNormalized.useMutation({
    onSuccess: () => {
      void utils.espn.manifests.invalidate();
      void utils.espn.cachedSeasons.invalidate();
    },
  });

  const reprocessCachedMutation = trpc.espn.reprocessCachedSeasons.useMutation({
    onSuccess: () => {
      void utils.espn.manifests.invalidate();
      void utils.espn.cachedSeasons.invalidate();
    },
  });

  const { mutate: runRefresh } = refreshMutation;

  const autoSync2026 = searchParams.get("autoSync") === "2026";

  useEffect(() => {
    if (!autoSync2026) return;
    const key = `${globalThis.location?.pathname ?? ""}${globalThis.location?.search ?? ""}`;
    if (gmwrAutoSync2026LastKey === key) return;
    gmwrAutoSync2026LastKey = key;
    runRefresh({ season: 2026, forceRefresh: true });
  }, [autoSync2026, runRefresh]);

  const allSeasons: number[] = allSeasonsQuery.data ?? [];
  const cachedSeasons: number[] = cachedQuery.data ?? [];
  const manifests: ManifestRow[] = (manifestsQuery.data as ManifestRow[] | undefined) ?? [];

  // Latest season is default for single-season refresh
  const latestSeason = allSeasons.length > 0 ? allSeasons[allSeasons.length - 1] : null;

  const toggleSeason = (s: number) => {
    setSelectedSeasons(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const handleRefreshLatest = () => {
    if (!latestSeason) return;
    setRunResults({});
    refreshMutation.mutate({ season: latestSeason, forceRefresh });
  };

  const handleRefreshSelected = () => {
    if (selectedSeasons.length === 0) return;
    setRunResults({});
    refreshMutation.mutate({ seasons: selectedSeasons, forceRefresh });
  };

  const handleAutoSync2026Retry = () => {
    refreshMutation.reset();
    runRefresh({ season: 2026, forceRefresh: true });
  };

  const isLoading = refreshMutation.isPending;
  const isBackfillLoading = backfillNormalizedMutation.isPending;
  const isReprocessLoading = reprocessCachedMutation.isPending;

  const seasonsToReprocessCached = useMemo(() => {
    return REPROCESS_MANIFEST_RANGE.filter((s) => {
      const m = manifests.find((x) => x.season === s);
      if (!m) return false;
      const teams = m.teamCount ?? 0;
      const matchups = m.matchupCount ?? 0;
      return teams > 0 && matchups === 0;
    });
  }, [manifests]);
  const autoSync2026RefreshDone =
    autoSync2026 && refreshMutation.isSuccess && cachedSeasons.includes(2026);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Sync Data</h1>
        <p className="mt-1 text-muted-foreground">
          Pull fresh data from ESPN for any season. Closed seasons are skipped unless force-refresh is enabled.
        </p>
      </div>

      {autoSync2026 && refreshMutation.isPending && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
          Syncing 2026 ESPN data...
        </div>
      )}

      {autoSync2026 && refreshMutation.isError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="whitespace-pre-wrap break-words">
                {trpcLikeErrorMessage(refreshMutation.error)}
              </p>
              <Button variant="outline" size="sm" onClick={handleAutoSync2026Retry} disabled={isLoading}>
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {autoSync2026RefreshDone && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
          <Button asChild variant="default" className="gap-2">
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      )}

      {/* Quick sync card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Sync</CardTitle>
          <CardDescription>
            Sync the current season{latestSeason ? ` (${latestSeason})` : ""} in one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="force"
              checked={forceRefresh}
              onCheckedChange={(v) => setForceRefresh(!!v)}
            />
            <Label htmlFor="force" className="cursor-pointer text-sm">
              Force refresh closed seasons (re-fetches even if already cached)
            </Label>
          </div>
          <Button
            onClick={handleRefreshLatest}
            disabled={isLoading || isBackfillLoading || isReprocessLoading || !latestSeason}
            className="gap-2"
          >
            {isLoading && !selectedSeasons.length ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isLoading && !selectedSeasons.length ? "Syncing…" : `Sync ${latestSeason ?? "…"}`}
          </Button>
        </CardContent>
      </Card>

      {/* Re-normalize from cache (no ESPN fetch) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backfill Normalized Data</CardTitle>
          <CardDescription>
            Re-run matchups, transactions, roster entries, and standings from the existing combined cache for
            seasons {BACKFILL_NORMALIZED_SEASONS[0]}–{BACKFILL_NORMALIZED_SEASONS[BACKFILL_NORMALIZED_SEASONS.length - 1]} without re-fetching ESPN.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="secondary"
            className="gap-2"
            disabled={isLoading || isBackfillLoading || isReprocessLoading}
            onClick={() => backfillNormalizedMutation.mutate({ seasons: BACKFILL_NORMALIZED_SEASONS })}
          >
            {isBackfillLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {isBackfillLoading ? "Backfilling…" : "Backfill Normalized Data"}
          </Button>
          {backfillNormalizedMutation.isSuccess && backfillNormalizedMutation.data && (
            <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
              {JSON.stringify(backfillNormalizedMutation.data, null, 2)}
            </pre>
          )}
          {backfillNormalizedMutation.isError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap break-words">
                {trpcLikeErrorMessage(backfillNormalizedMutation.error)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full re-persist from combined cache (no ESPN fetch) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reprocess Cached Data</CardTitle>
          <CardDescription>
            Runs the full normalization pipeline (teams, matchups, transactions, rosters, draft picks, standings)
            from the stored combined JSON for seasons in {REPROCESS_MANIFEST_RANGE[0]}–
            {REPROCESS_MANIFEST_RANGE[REPROCESS_MANIFEST_RANGE.length - 1]} that show teams in the manifest but
            zero matchups — without calling the ESPN API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {seasonsToReprocessCached.length > 0
              ? `Will reprocess: ${seasonsToReprocessCached.sort((a, b) => a - b).join(", ")}`
              : `No seasons in ${REPROCESS_MANIFEST_RANGE[0]}–${REPROCESS_MANIFEST_RANGE[REPROCESS_MANIFEST_RANGE.length - 1]} currently match (teams > 0 and matchups = 0).`}
          </p>
          <Button
            variant="secondary"
            className="gap-2"
            disabled={
              isLoading ||
              isBackfillLoading ||
              isReprocessLoading ||
              seasonsToReprocessCached.length === 0
            }
            onClick={() =>
              reprocessCachedMutation.mutate({ seasons: [...seasonsToReprocessCached].sort((a, b) => a - b) })
            }
          >
            {isReprocessLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            {isReprocessLoading ? "Reprocessing…" : "Reprocess Cached Data"}
          </Button>
          {reprocessCachedMutation.isSuccess && reprocessCachedMutation.data && (
            <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
              {JSON.stringify(reprocessCachedMutation.data, null, 2)}
            </pre>
          )}
          {reprocessCachedMutation.isError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap break-words">
                {trpcLikeErrorMessage(reprocessCachedMutation.error)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Multi-season selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Multi-Season Sync</CardTitle>
              <CardDescription>
                Select specific seasons to refresh.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSeasonPicker(v => !v)}
            >
              {showSeasonPicker ? "Hide" : "Select Seasons"}
            </Button>
          </div>
        </CardHeader>

        {showSeasonPicker && (
          <CardContent className="space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              {allSeasons.map((s) => {
                const isCached = cachedSeasons.includes(s);
                const isSelected = selectedSeasons.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSeason(s)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
                      isSelected
                        ? "border-primary bg-primary/15 text-primary"
                        : isCached
                          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300 hover:border-emerald-500/50"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50"
                    )}
                  >
                    {s}
                    {isCached && !isSelected && (
                      <span className="ml-1 text-xs opacity-70">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedSeasons.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleRefreshSelected}
                  disabled={isLoading || isBackfillLoading || isReprocessLoading}
                  size="sm"
                  className="gap-2"
                >
                  {isLoading && selectedSeasons.length > 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Sync {selectedSeasons.length} season{selectedSeasons.length !== 1 ? "s" : ""}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSeasons([])}
                >
                  Clear
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedSeasons.sort((a, b) => a - b).join(", ")}
                </span>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Refresh error banner (manual sync — auto-sync errors shown above) */}
      {refreshMutation.isError && !autoSync2026 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="whitespace-pre-wrap break-words">
            {trpcLikeErrorMessage(refreshMutation.error)}
          </span>
        </div>
      )}

      {/* Manifests table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Season Cache Status</h2>
          <span className="text-xs text-muted-foreground">
            {cachedSeasons.length} of {allSeasons.length} seasons cached
          </span>
        </div>

        {manifestsQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading manifests…
          </div>
        )}

        {manifests.length === 0 && !manifestsQuery.isLoading && (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No sync history yet. Run a sync to populate data.
          </div>
        )}

        <div className="space-y-2">
          {[...manifests]
            .sort((a, b) => b.season - a.season)
            .map((m) => (
              <ManifestCard
                key={m.season}
                manifest={m}
                refreshResult={runResults[m.season]}
              />
            ))}
        </div>

        {/* Seasons with no manifest but present in allSeasons */}
        {allSeasons
          .filter(s => !manifests.some(m => m.season === s))
          .sort((a, b) => b - a)
          .map(s => (
            <div
              key={s}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
            >
              <Clock className="h-4 w-4" />
              <span className="font-medium text-foreground">{s}</span>
              <span>— never synced</span>
              {runResults[s] && <SeasonStatusBadge status={runResults[s].status} />}
            </div>
          ))}
      </div>
    </div>
  );
}
