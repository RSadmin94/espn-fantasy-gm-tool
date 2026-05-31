import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "@clerk/react-router";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { setTrpcToken } from "@/lib/trpcAuth";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { fetchEspnSeasonBundleBrowserOrExtension } from "@/lib/espnApi";
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
  message?: string;
  viewHealth?: Record<string, string>;
  qualityWarnings?: string[];
  skipped?: boolean;
};

function SeasonStatusIcon({ status }: { status: string | undefined }) {
  switch (status) {
    case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "complete": return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "partial": return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
    case "failed":  return <XCircle className="h-4 w-4 text-red-400" />;
    case "skipped": return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    case "no_cache": return <Database className="h-4 w-4 text-muted-foreground" />;
    case "running": return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
    default:        return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function SeasonStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    complete: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    partial: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    failed:  "bg-red-500/15 text-red-400 border-red-500/20",
    skipped: "bg-muted/50 text-muted-foreground border-border",
    no_cache: "bg-muted/50 text-muted-foreground border-border",
    pending: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    running: "bg-blue-500/15 text-blue-400 border-blue-500/20",
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

/** Cache / normalization health (manifest-driven), not the same as last ESPN refresh status. */
function CacheHealthBadge({ label }: { label: string }) {
  const map: Record<string, string> = {
    Complete: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    "Needs backfill": "bg-amber-500/15 text-amber-200 border-amber-500/25",
    Partial: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    Failed: "bg-red-500/15 text-red-400 border-red-500/20",
    "No cache": "bg-muted/50 text-muted-foreground border-border",
    Running: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        map[label] ?? "bg-muted/50 text-muted-foreground border-border"
      )}
    >
      {label}
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
  standingsCount?: number | null;
  rawSyncStatus?: string | null;
  updatedAt?: Date | string | null;
}

const ESPN_HISTORICAL_COMPLETED_MIN = 2009;
const BROWSER_SYNC_TEST_SEASON = 2010;
const ESPN_HISTORICAL_COMPLETED_MAX = 2025;
/** Seasons for `espn.backfillFromRawCache` (combined JSON in `espn_raw_cache`). */
const RAW_CACHE_BACKFILL_MIN = 2009;
const RAW_CACHE_BACKFILL_MAX = 2026;
/** Live ESPN enrichment (draft recap + weekly matchups + transactions). */
const HISTORICAL_ENRICHMENT_MIN = 2010;
const HISTORICAL_ENRICHMENT_MAX = 2025;
const HISTORICAL_COMPLETED_SEASONS = Array.from(
  { length: ESPN_HISTORICAL_COMPLETED_MAX - ESPN_HISTORICAL_COMPLETED_MIN + 1 },
  (_, i) => ESPN_HISTORICAL_COMPLETED_MIN + i,
);

/** After 2010 passes the gate, optional bulk browser sync for these seasons. */
const BROWSER_SYNC_REMAINING_SEASONS = Array.from({ length: 2025 - 2011 + 1 }, (_, i) => 2011 + i);

/** Avoid duplicate auto-sync under React Strict Mode remount (same URL). */
let gmwrAutoSync2026LastKey = "";

function isHistoricallyFullyNormalizedFromManifestClient(m: ManifestRow): boolean {
  if (m.status !== "success") return false;
  const teams = Number(m.teamCount) || 0;
  if (teams <= 0) return false;
  const keys =
    (Number(m.matchupCount) || 0) +
    (Number(m.draftPickCount) || 0) +
    (Number(m.transactionCount) || 0) +
    (Number(m.standingsCount) || 0);
  return keys > 0;
}

function seasonCacheHealthLabel(m: ManifestRow): string {
  if (m.rawSyncStatus === "running") return "Running";
  if (isHistoricallyFullyNormalizedFromManifestClient(m)) return "Complete";
  if (m.status === "failed") return "Failed";
  if (m.status === "partial") return "Partial";
  if (m.status === "success") return "Needs backfill";
  return "No cache";
}

function ManifestCard({ manifest, refreshResult }: {
  manifest: ManifestRow;
  refreshResult?: RefreshResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeResult = refreshResult ?? null;
  const iconStatus =
    activeResult?.status === "complete"
      ? "complete"
      : activeResult?.status ?? (manifest.rawSyncStatus === "running" ? "running" : manifest.status ?? undefined);
  const badgeStatus =
    activeResult?.status === "complete"
      ? "complete"
      : activeResult?.status ?? manifest.status ?? undefined;
  const cacheHealthLabel = seasonCacheHealthLabel(manifest);

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
        <div className="flex flex-wrap items-center gap-2 gap-y-1">
          <SeasonStatusIcon status={iconStatus} />
          <span className="font-semibold text-foreground">{manifest.season}</span>
          {activeResult ? (
            <SeasonStatusBadge status={badgeStatus} />
          ) : (
            <CacheHealthBadge label={cacheHealthLabel} />
          )}
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
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { label: "Teams", value: manifest.teamCount },
              { label: "Rosters", value: manifest.rosterCount },
              { label: "Matchups", value: manifest.matchupCount },
              { label: "Draft picks", value: manifest.draftPickCount },
              { label: "Transactions", value: manifest.transactionCount },
              { label: "Standings", value: manifest.standingsCount },
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
              {activeResult.message && (
                <p className="text-sm text-muted-foreground">{activeResult.message}</p>
              )}
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

type HistoricalReprocessRow = {
  season: number;
  status: "success" | "partial" | "failed" | "skipped" | "complete";
  teamCount: number;
  matchupCount: number;
  transactionCount: number;
  error?: string;
  message?: string;
};

type HistoricalProgressEntry =
  | { phase: "running" }
  | { phase: "done"; row?: HistoricalReprocessRow; error?: string };

function trpcLikeErrorMessage(err: Error | { message: string } | null | undefined): string {
  if (!err) return "";
  const nested = (err as { data?: { json?: { message?: string } } }).data?.json?.message;
  return typeof nested === "string" && nested.trim() ? nested : err.message;
}

export function SyncData() {
  const [searchParams] = useSearchParams();
  const { getToken } = useAuth();
  const { leagueId, isConnected } = useLeagueContext();
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [runResults, setRunResults] = useState<Record<number, RefreshResult>>({});
  const [historicalProgress, setHistoricalProgress] = useState<Record<number, HistoricalProgressEntry>>({});
  const [historicalRunning, setHistoricalRunning] = useState(false);
  const [forceHistoricalBackfill, setForceHistoricalBackfill] = useState(false);
  const [forceRawCacheBackfill, setForceRawCacheBackfill] = useState(false);
  const [forceHistoricalEnrichment, setForceHistoricalEnrichment] = useState(false);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [browserSessionNote, setBrowserSessionNote] = useState<string | null>(null);
  const [browserSessionErr, setBrowserSessionErr] = useState<string | null>(null);
  const [browserSessionBusy, setBrowserSessionBusy] = useState(false);
  const [browserSessionBulkBusy, setBrowserSessionBulkBusy] = useState(false);
  const [standingsBusy, setStandingsBusy] = useState(false);
  const [standingsNote, setStandingsNote] = useState<string | null>(null);
  const [standingsErr, setStandingsErr] = useState<string | null>(null);
  const [matchupsBusy, setMatchupsBusy] = useState(false);
  const [matchupsNote, setMatchupsNote] = useState<string | null>(null);
  const [matchupsErr, setMatchupsErr] = useState<string | null>(null);
  const [browserSync2010Raw, setBrowserSync2010Raw] = useState<Record<string, unknown> | null>(null);
  const [browserSync2010IngestRaw, setBrowserSync2010IngestRaw] = useState<Record<string, unknown> | null>(null);
  const [gate2010Persisted, setGate2010Persisted] = useState(() => {
    try { return localStorage.getItem("gmwr_2010_synced") === "1"; } catch { return false; }
  });
  const [lastBrowserImportCounts, setLastBrowserImportCounts] = useState<{
    draftPicks: number;
    teams: number;
    matchups: number;
    transactions: number;
  } | null>(null);

  // ── League Medals state ──────────────────────────────────────────────────
  type MedalEntry = { champion: string; runnerUp: string; third: string };
  const ALL_MEDAL_SEASONS = Array.from({ length: 16 }, (_, i) => 2010 + i);
  const [medalEntries, setMedalEntries] = useState<Record<number, MedalEntry>>(() =>
    Object.fromEntries(ALL_MEDAL_SEASONS.map((y) => [y, { champion: "", runnerUp: "", third: "" }]))
  );
  const [medalBusy, setMedalBusy]     = useState<number | null>(null);
  const [medalSaved, setMedalSaved]   = useState<Set<number>>(new Set());
  const [medalErr, setMedalErr]       = useState<Record<number, string>>({});
  const [forceReplace, setForceReplace] = useState(false);
  const [saveAllBusy, setSaveAllBusy] = useState(false);
  const [scrapeLeagueMedalsBusy, setScrapeLeagueMedalsBusy] = useState(false);
  const [scrapeLeagueMedalsNote, setScrapeLeagueMedalsNote] = useState<string | null>(null);
  const [scrapeLeagueMedalsErr, setScrapeLeagueMedalsErr] = useState<string | null>(null);
  const medalsQ    = trpc.espn.leagueMedals.useQuery(undefined, { staleTime: 0 });
  const standingsQ = trpc.espn.leagueHistoryStandings.useQuery(undefined, { staleTime: 60_000 });

  // Pre-fill form from DB on first load — use useEffect to avoid render-phase state mutation
  const [medalPrefilled, setMedalPrefilled] = useState(false);
  useEffect(() => {
    if (medalPrefilled || !medalsQ.data) return;
    setMedalPrefilled(true);
    const updates: Record<number, MedalEntry> = {};
    for (const m of medalsQ.data) {
      updates[m.season] = { champion: m.championOwner, runnerUp: m.runnerUpOwner, third: m.thirdPlaceOwner };
    }
    if (Object.keys(updates).length > 0) setMedalEntries((prev) => ({ ...prev, ...updates }));
  }, [medalsQ.data, medalPrefilled]);

  // Derive per-season top-3 from imported standings (auto-fill source)
  const perSeasonTopThree = useMemo(() => {
    const map = new Map<number, { p1?: string; p2?: string; p3?: string }>();
    for (const owner of standingsQ.data?.owners ?? []) {
      for (const { season, entry } of owner.seasons) {
        const s = entry.finalStanding;
        if (!s || s < 1 || s > 3) continue;
        const row = map.get(season) ?? {};
        if (s === 1 && !row.p1) row.p1 = owner.displayName;
        if (s === 2 && !row.p2) row.p2 = owner.displayName;
        if (s === 3 && !row.p3) row.p3 = owner.displayName;
        map.set(season, row);
      }
    }
    return map;
  }, [standingsQ.data]);

  const allSeasonsQuery = trpc.espn.allSeasons.useQuery();
  const cachedQuery = trpc.espn.cachedSeasons.useQuery();
  const manifestsQuery = trpc.espn.manifests.useQuery();

  const utils = trpc.useUtils();

  const browserSyncStatusQuery = trpc.espn.browserSyncStatus.useQuery(
    {
      leagueId: leagueId || undefined,
      startSeason: ESPN_HISTORICAL_COMPLETED_MIN,
      endSeason: ESPN_HISTORICAL_COMPLETED_MAX,
    },
    { enabled: Boolean(leagueId && isConnected), staleTime: 15_000 },
  );

  // Always query draft_picks count for the hardcoded test league on mount — independent of ESPN connection.
  const draftPicks2010GateQuery = trpc.espn.browserSyncStatus.useQuery(
    { leagueId: "457622", startSeason: 2010, endSeason: 2010 },
    { staleTime: 60_000 },
  );
  const dbDraftPicks2010 =
    draftPicks2010GateQuery.data?.seasons?.find((s) => s.season === 2010)?.draftPicks ?? 0;

  const importFromBrowserMutation = trpc.espn.importFromBrowser.useMutation({
    onSuccess: () => {
      void utils.espn.browserSyncStatus.invalidate();
      void utils.espn.manifests.invalidate();
      void utils.espn.cachedSeasons.invalidate();
    },
  });

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

  const backfillFromRawCacheMutation = trpc.espn.backfillFromRawCache.useMutation({
    onSuccess: () => {
      void utils.espn.manifests.invalidate();
      void utils.espn.cachedSeasons.invalidate();
    },
  });

  const enrichHistoricalSeasonMutation = trpc.espn.enrichHistoricalSeason.useMutation({
    onSuccess: () => {
      void utils.espn.manifests.invalidate();
      void utils.espn.cachedSeasons.invalidate();
    },
  });

  const reprocessCachedMutation = trpc.espn.reprocessCachedSeasons.useMutation();

  const debugDraftIngestMutation = trpc.espn.debugHistoricalDraftIngest.useMutation();
  const ingestParsedDraftPicksMutation = trpc.espn.ingestParsedDraftPicks.useMutation({
    onSuccess: () => {
      void utils.espn.browserSyncStatus.invalidate();
      void utils.espn.manifests.invalidate();
    },
  });
  const ingestParsedStandingsMutation = trpc.espn.ingestParsedStandings.useMutation({
    onSuccess: () => {
      void utils.espn.standingsHistory.invalidate();
    },
  });
  const ingestParsedMatchupsMutation = trpc.espn.ingestParsedMatchups.useMutation({
    onSuccess: () => {
      void utils.espn.allTimeH2H.invalidate();
      void utils.espn.standingsHistory.invalidate();
      void utils.espn.manifests.invalidate();
    },
  });

  const upsertSeasonMedalsMutation    = trpc.espn.upsertSeasonMedals.useMutation();

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
  const { manifests, leagueConnectionMissing } = useMemo(() => {
    const raw = manifestsQuery.data;
    if (!raw) return { manifests: [] as ManifestRow[], leagueConnectionMissing: false };
    if (Array.isArray(raw)) return { manifests: raw as ManifestRow[], leagueConnectionMissing: false };
    const o = raw as { manifests?: ManifestRow[]; leagueConnectionMissing?: boolean };
    return {
      manifests: Array.isArray(o.manifests) ? o.manifests : [],
      leagueConnectionMissing: Boolean(o.leagueConnectionMissing),
    };
  }, [manifestsQuery.data]);

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

  const browser2010 = browserSyncStatusQuery.data?.seasons?.find(
    (s) => s.season === BROWSER_SYNC_TEST_SEASON,
  );
  const lastIngestDbCount =
    typeof browserSync2010IngestRaw?.dbCountAfter === "number"
      ? (browserSync2010IngestRaw.dbCountAfter as number)
      : 0;
  const browserSync2010Ready =
    gate2010Persisted ||
    lastIngestDbCount > 0 ||
    dbDraftPicks2010 > 0 ||
    Boolean(browser2010 && (browser2010.draftPicks > 0 || browser2010.matchups > 0));

  const handleBrowserSync2010 = async () => {
    setBrowserSessionErr(null);
    setBrowserSessionNote(null);
    setBrowserSync2010Raw(null);
    setBrowserSync2010IngestRaw(null);
    setBrowserSessionBusy(true);
    try {
      const clerkToken = await getToken() ?? "";
      const extResult = await new Promise<Record<string, unknown>>((resolve) => {
        const id = `hist-test-${Date.now()}`;
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", onMsg);
          resolve({ ok: false, error: "Extension request timed out" });
        }, 120_000);
        function onMsg(ev: MessageEvent) {
          if (ev.source !== window) return;
          const d = ev.data as Record<string, unknown> | null;
          if (!d || d.type !== "GMWR_HIST_TEST_REPLY" || d.id !== id) return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMsg);
          resolve(d);
        }
        window.addEventListener("message", onMsg);
        window.postMessage({ type: "GMWR_HIST_TEST", id, leagueId: "457622", clerkToken }, "*");
      });
      setBrowserSync2010Raw(extResult);

      if (!extResult.ok) {
        const msg = extResult.error ? String(extResult.error) : "Extension sync failed.";
        setBrowserSessionErr(msg);
        toast.error(msg);
        return;
      }

      const picks = Array.isArray(extResult.picks) ? extResult.picks : [];
      if (picks.length === 0) {
        setBrowserSessionErr("Extension returned no picks.");
        toast.error("Extension returned no picks.");
        return;
      }

      const token = await getToken();
      console.log("[TOKEN]", !!token);
      setTrpcToken(token);
      let ingestResult: Record<string, unknown>;
      try {
        console.log("[gmwr] ingestStart", { leagueId: "457622", season: 2010, pickCount: picks.length });
        ingestResult = await ingestParsedDraftPicksMutation.mutateAsync({
          leagueId: "457622",
          season: 2010,
          picks: picks as {
            overallPick: number;
            roundId: number;
            roundPick: number;
            teamId?: number;
            teamName: string;
            playerName: string;
            position: string;
            nflTeam?: string;
          }[],
        }) as Record<string, unknown>;
        console.log("[gmwr] ingestSuccess", ingestResult);
      } catch (ingestErr) {
        console.error("[gmwr] ingestError", ingestErr);
        throw ingestErr;
      } finally {
        setTrpcToken(null);
      }
      setBrowserSync2010IngestRaw(ingestResult);
      const ingestSuccess = ingestResult.success === true;
      const dbCount = typeof ingestResult.dbCountAfter === "number" ? ingestResult.dbCountAfter : 0;
      if (ingestSuccess && dbCount > 0) {
        try { localStorage.setItem("gmwr_2010_synced", "1"); } catch {}
        setGate2010Persisted(true);
        setBrowserSessionNote(
          `Import completed. received=${String(ingestResult.received ?? "?")} inserted/updated=${String(ingestResult.insertedOrUpdated ?? "?")} dbCountAfter=${dbCount}`,
        );
        toast.success("Season 2010 sync complete.");
        void browserSyncStatusQuery.refetch();
        void draftPicks2010GateQuery.refetch();
      } else {
        const msg = ingestSuccess
          ? `db_count_zero after ingest`
          : `ingest reported success=false (dbCountAfter=${dbCount})`;
        setBrowserSessionErr(msg);
        toast.error(msg);
      }
    } catch (e) {
      const msg = trpcLikeErrorMessage(e as Error);
      setBrowserSessionErr(msg);
      toast.error(msg);
    } finally {
      setBrowserSessionBusy(false);
    }
  };

  const seasonsForBrowserBulk = useMemo(() => [...BROWSER_SYNC_REMAINING_SEASONS], []);

  const handleBrowserSyncOtherSeasons = async () => {
    console.log("[BULK START]");
    setBrowserSessionNote("Bulk sync started...");
    setBrowserSessionBulkBusy(true);
    setBrowserSessionErr(null);
    try {
      const token = await getToken();
      console.log("[BULK TOKEN]", !!token);

      const seasonResults: string[] = [];
      for (const season of BROWSER_SYNC_REMAINING_SEASONS) {
        console.log(`[BULK INGEST ${season}]`);
        setBrowserSessionNote(`Scraping season ${season}…`);

        const extResult = await new Promise<Record<string, unknown>>((resolve) => {
          const id = `hist-bulk-${season}-${Date.now()}`;
          const timeout = window.setTimeout(() => {
            window.removeEventListener("message", onMsg);
            resolve({ ok: false, error: `Extension timed out for season ${season}` });
          }, 120_000);
          function onMsg(ev: MessageEvent) {
            if (ev.source !== window) return;
            const d = ev.data as Record<string, unknown> | null;
            if (!d || d.type !== "GMWR_HIST_TEST_REPLY" || d.id !== id) return;
            window.clearTimeout(timeout);
            window.removeEventListener("message", onMsg);
            resolve(d);
          }
          window.addEventListener("message", onMsg);
          window.postMessage(
            { type: "GMWR_HIST_TEST", id, leagueId: "457622", season, clerkToken: token ?? "" },
            "*",
          );
        });

        if (!extResult.ok) {
          const errMsg = extResult.error ? String(extResult.error) : "scrape_failed";
          seasonResults.push(`${season}: scrape failed — ${errMsg}`);
          continue;
        }

        const picks = Array.isArray(extResult.picks) ? extResult.picks : [];
        if (picks.length === 0) {
          seasonResults.push(`${season}: no picks returned`);
          continue;
        }

        setBrowserSessionNote(`Ingesting season ${season} (${picks.length} picks)…`);
        setTrpcToken(token);
        try {
          const ingestResult = await ingestParsedDraftPicksMutation.mutateAsync({
            leagueId: "457622",
            season,
            picks: picks as {
              overallPick: number;
              roundId: number;
              roundPick: number;
              teamId?: number;
              teamName: string;
              playerName: string;
              position: string;
              nflTeam?: string;
            }[],
          }) as Record<string, unknown>;
          const dbCount = typeof ingestResult.dbCountAfter === "number" ? ingestResult.dbCountAfter : 0;
          seasonResults.push(`${season}: dbCountAfter=${dbCount}`);
          if (dbCount > 0) toast.success(`Season ${season} synced.`);
        } catch (ingestErr) {
          seasonResults.push(`${season}: ingest failed — ${trpcLikeErrorMessage(ingestErr as Error)}`);
        } finally {
          setTrpcToken(null);
        }
      }

      setBrowserSessionNote(seasonResults.join(" | "));
      void browserSyncStatusQuery.refetch();
    } catch (e) {
      const msg = trpcLikeErrorMessage(e as Error);
      setBrowserSessionErr(msg);
      toast.error(msg);
    } finally {
      setBrowserSessionBulkBusy(false);
    }
  };

  const handleBrowserSyncStandings = async (seasons: number[]) => {
    setStandingsErr(null);
    setStandingsNote(null);
    setStandingsBusy(true);
    try {
      const token = await getToken();
      console.log("[STANDINGS TOKEN]", !!token);
      const results: string[] = [];
      for (const season of seasons) {
        console.log(`[STANDINGS INGEST ${season}]`);
        setStandingsNote(`Scraping standings ${season}…`);
        const extResult = await new Promise<Record<string, unknown>>((resolve) => {
          const id = `hist-standings-${season}-${Date.now()}`;
          const timeout = window.setTimeout(() => {
            window.removeEventListener("message", onMsg);
            resolve({ ok: false, error: `Extension timed out for standings ${season}` });
          }, 120_000);
          function onMsg(ev: MessageEvent) {
            if (ev.source !== window) return;
            const d = ev.data as Record<string, unknown> | null;
            if (!d || d.type !== "GMWR_HIST_STANDINGS_REPLY" || d.id !== id) return;
            window.clearTimeout(timeout);
            window.removeEventListener("message", onMsg);
            resolve(d);
          }
          window.addEventListener("message", onMsg);
          window.postMessage({ type: "GMWR_HIST_STANDINGS", id, leagueId: "457622", season }, "*");
        });
        if (!extResult.ok) {
          results.push(`${season}: scrape failed — ${String(extResult.error ?? "unknown")}`);
          continue;
        }
        const rows = Array.isArray(extResult.rows) ? extResult.rows : [];
        if (rows.length === 0) {
          results.push(`${season}: no standings rows`);
          continue;
        }
        setStandingsNote(`Ingesting standings ${season} (${rows.length} teams)…`);
        setTrpcToken(token);
        try {
          const ingestResult = await ingestParsedStandingsMutation.mutateAsync({
            leagueId: "457622",
            season,
            rows: rows as {
              rank: number; teamName: string; ownerName: string;
              wins: number; losses: number; ties: number;
              pointsFor: number; pointsAgainst: number;
            }[],
          }) as Record<string, unknown>;
          const dbCount = typeof ingestResult.dbCountAfter === "number" ? ingestResult.dbCountAfter : 0;
          results.push(`${season}: teams=${dbCount}`);
          if (dbCount > 0) toast.success(`Standings ${season} synced.`);
        } catch (ingestErr) {
          results.push(`${season}: ingest failed — ${trpcLikeErrorMessage(ingestErr as Error)}`);
        } finally {
          setTrpcToken(null);
        }
      }
      setStandingsNote(results.join(" | "));
    } catch (e) {
      const msg = trpcLikeErrorMessage(e as Error);
      setStandingsErr(msg);
      toast.error(msg);
    } finally {
      setStandingsBusy(false);
    }
  };

  const handleBrowserSyncMatchups = async (seasons: number[]) => {
    setMatchupsErr(null);
    setMatchupsNote(null);
    setMatchupsBusy(true);
    try {
      const token = await getToken();
      const results: string[] = [];
      for (const season of seasons) {
        console.log(`[MATCHUPS INGEST ${season}]`);
        setMatchupsNote(`Scraping schedule ${season}…`);
        const extResult = await new Promise<Record<string, unknown>>((resolve) => {
          const id = `hist-matchups-${season}-${Date.now()}`;
          const timeout = window.setTimeout(() => {
            window.removeEventListener("message", onMsg);
            resolve({ ok: false, error: `Extension timed out for matchups ${season}` });
          }, 120_000);
          function onMsg(ev: MessageEvent) {
            if (ev.source !== window) return;
            const d = ev.data as Record<string, unknown> | null;
            if (!d || d.type !== "GMWR_HIST_MATCHUPS_REPLY" || d.id !== id) return;
            window.clearTimeout(timeout);
            window.removeEventListener("message", onMsg);
            resolve(d);
          }
          window.addEventListener("message", onMsg);
          window.postMessage({ type: "GMWR_HIST_MATCHUPS", id, leagueId: "457622", season }, "*");
        });
        if (!extResult.ok) {
          results.push(`${season}: scrape failed — ${String(extResult.error ?? "unknown")}`);
          continue;
        }
        const rows = Array.isArray(extResult.rows) ? extResult.rows : [];
        if (rows.length === 0) {
          results.push(`${season}: no matchup rows`);
          continue;
        }
        setMatchupsNote(`Ingesting matchups ${season} (${rows.length} rows)…`);
        setTrpcToken(token);
        try {
          const ingestResult = await ingestParsedMatchupsMutation.mutateAsync({
            leagueId: "457622",
            season,
            rows: rows as {
              week: number; awayTeam: string; homeTeam: string;
              awayScore: number; homeScore: number; winner: string | null;
            }[],
          }) as Record<string, unknown>;
          const dbCount = typeof ingestResult.dbCountAfter === "number" ? ingestResult.dbCountAfter : 0;
          const inserted = typeof ingestResult.insertedOrUpdated === "number" ? ingestResult.insertedOrUpdated : 0;
          results.push(`${season}: received=${rows.length} inserted=${inserted} dbCountAfter=${dbCount}`);
          if (dbCount > 0) toast.success(`Matchups ${season} synced.`);
        } catch (ingestErr) {
          results.push(`${season}: ingest failed — ${trpcLikeErrorMessage(ingestErr as Error)}`);
        } finally {
          setTrpcToken(null);
        }
      }
      setMatchupsNote(results.join(" | "));
    } catch (e) {
      const msg = trpcLikeErrorMessage(e as Error);
      setMatchupsErr(msg);
      toast.error(msg);
    } finally {
      setMatchupsBusy(false);
    }
  };

  const isLoading = refreshMutation.isPending;
  const isBackfillLoading = backfillNormalizedMutation.isPending;
  const isRawCacheBackfillLoading = backfillFromRawCacheMutation.isPending;
  const isHistoricalEnrichmentLoading = enrichHistoricalSeasonMutation.isPending;
  const isReprocessLoading = reprocessCachedMutation.isPending || historicalRunning;
  const isDraftIngestDebugLoading = debugDraftIngestMutation.isPending;

  const seasonsForNormalizedBackfill = useMemo(() => {
    return HISTORICAL_COMPLETED_SEASONS.filter(s => {
      if (!cachedSeasons.includes(s)) return false;
      if (forceHistoricalBackfill) return true;
      const m = manifests.find(x => x.season === s);
      return !m || !isHistoricallyFullyNormalizedFromManifestClient(m);
    });
  }, [manifests, cachedSeasons, forceHistoricalBackfill]);

  const seasonsToReprocessCached = useMemo(() => {
    return HISTORICAL_COMPLETED_SEASONS.filter(s => {
      const m = manifests.find(x => x.season === s);
      if (!m) return false;
      const teams = m.teamCount ?? 0;
      if (teams <= 0) return false;
      if (forceHistoricalBackfill) return true;
      return !isHistoricallyFullyNormalizedFromManifestClient(m);
    });
  }, [manifests, forceHistoricalBackfill]);

  const sortedReprocessSeasons = useMemo(
    () => [...seasonsToReprocessCached].sort((a, b) => a - b),
    [seasonsToReprocessCached],
  );

  const handleBackfillHistoricalSeasons = async () => {
    if (sortedReprocessSeasons.length === 0) return;
    setHistoricalProgress({});
    setHistoricalRunning(true);
    try {
      for (const s of sortedReprocessSeasons) {
        setHistoricalProgress(prev => ({ ...prev, [s]: { phase: "running" } }));
        try {
          const res = await reprocessCachedMutation.mutateAsync({ seasons: [s], force: forceHistoricalBackfill });
          const row = res.results.find(r => r.season === s) ?? res.results[0];
          setHistoricalProgress(prev => ({
            ...prev,
            [s]: { phase: "done", row: row as HistoricalReprocessRow },
          }));
        } catch (e) {
          setHistoricalProgress(prev => ({
            ...prev,
            [s]: { phase: "done", error: trpcLikeErrorMessage(e as Error) },
          }));
        }
      }
      void utils.espn.manifests.invalidate();
      void utils.espn.cachedSeasons.invalidate();
    } finally {
      setHistoricalRunning(false);
    }
  };
  const autoSync2026RefreshDone =
    autoSync2026 && refreshMutation.isSuccess && cachedSeasons.includes(2026);

  // ── League Medals handlers ────────────────────────────────────────────────
  const handleSaveMedal = async (season: number) => {
    const entry = medalEntries[season];
    if (!entry?.champion.trim()) return;
    setMedalBusy(season);
    setMedalErr((p) => { const n = { ...p }; delete n[season]; return n; });
    try {
      await upsertSeasonMedalsMutation.mutateAsync({
        season,
        championOwner:   entry.champion.trim(),
        runnerUpOwner:   entry.runnerUp.trim(),
        thirdPlaceOwner: entry.third.trim(),
        source: "espn_history_medal",
      });
      setMedalSaved((p) => new Set([...p, season]));
      void medalsQ.refetch();
    } catch (e) {
      setMedalErr((p) => ({ ...p, [season]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setMedalBusy(null);
    }
  };

  const handleAutoFill = () => {
    const dbBySeason = new Map<number, { champion: string; runnerUp: string; third: string }>();
    for (const m of medalsQ.data ?? []) {
      dbBySeason.set(m.season, { champion: m.championOwner, runnerUp: m.runnerUpOwner, third: m.thirdPlaceOwner });
    }
    setMedalEntries((prev) => {
      const next = { ...prev };
      for (const yr of ALL_MEDAL_SEASONS) {
        const detected = perSeasonTopThree.get(yr);
        if (!detected?.p1) continue; // no standings data for this season
        const hasDbValue = dbBySeason.has(yr) && (dbBySeason.get(yr)?.champion ?? "").trim() !== "";
        if (hasDbValue && !forceReplace) continue; // respect saved value
        next[yr] = {
          champion: detected.p1 ?? "",
          runnerUp: detected.p2 ?? "",
          third:    detected.p3 ?? "",
        };
      }
      return next;
    });
    // Clear saved indicators for any season we just overwrote
    setMedalSaved(new Set());
  };

  const handleSaveAll = async () => {
    setSaveAllBusy(true);
    const errs: Record<number, string> = {};
    const saved = new Set<number>();
    for (const yr of ALL_MEDAL_SEASONS) {
      const entry = medalEntries[yr];
      if (!entry?.champion.trim()) continue;
      try {
        await upsertSeasonMedalsMutation.mutateAsync({
          season:          yr,
          championOwner:   entry.champion.trim(),
          runnerUpOwner:   entry.runnerUp.trim(),
          thirdPlaceOwner: entry.third.trim(),
          source: "espn_history_medal",
        });
        saved.add(yr);
      } catch (e) {
        errs[yr] = e instanceof Error ? e.message : String(e);
      }
    }
    setMedalSaved((p) => new Set([...p, ...saved]));
    setMedalErr(errs);
    void medalsQ.refetch();
    setSaveAllBusy(false);
  };

  const handleScrapeLeagueHistoryMedals = async () => {
    setScrapeLeagueMedalsErr(null);
    setScrapeLeagueMedalsNote("Opening ESPN League History page…");
    setScrapeLeagueMedalsBusy(true);
    try {
      const extResult = await new Promise<Record<string, unknown>>((resolve) => {
        const id = `league-history-medals-${Date.now()}`;
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", onMsg);
          resolve({ ok: false, error: "Extension timed out" });
        }, 120_000);
        function onMsg(ev: MessageEvent) {
          if (ev.source !== window) return;
          const d = ev.data as Record<string, unknown> | null;
          if (!d || d.type !== "GMWR_LEAGUE_HISTORY_MEDALS_REPLY" || d.id !== id) return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMsg);
          resolve(d);
        }
        window.addEventListener("message", onMsg);
        window.postMessage({ type: "GMWR_LEAGUE_HISTORY_MEDALS", id, leagueId: "457622" }, "*");
      });

      if (!extResult.ok) {
        setScrapeLeagueMedalsErr(extResult.error ? String(extResult.error) : "Scrape failed");
        return;
      }

      const medals = Array.isArray(extResult.medals) ? extResult.medals : [];
      if (medals.length === 0) {
        setScrapeLeagueMedalsErr("No medal data found. Check that the ESPN League History page loaded and you are signed in.");
        return;
      }

      setScrapeLeagueMedalsNote(`Scraped ${medals.length} seasons. Saving to DB…`);
      let saved = 0;
      const errs: string[] = [];
      for (const row of medals as { season: number; championOwner: string; runnerUpOwner: string; thirdPlaceOwner: string }[]) {
        try {
          await upsertSeasonMedalsMutation.mutateAsync({
            season: row.season,
            championOwner: row.championOwner ?? "",
            runnerUpOwner: row.runnerUpOwner ?? "",
            thirdPlaceOwner: row.thirdPlaceOwner ?? "",
            source: "espn_history_medal",
          });
          saved++;
        } catch (e) {
          errs.push(`${row.season}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      setScrapeLeagueMedalsNote(
        `Saved ${saved}/${medals.length} seasons${errs.length ? `. Errors: ${errs.join("; ")}` : "."}`,
      );
      setMedalPrefilled(false);
      void medalsQ.refetch();
    } catch (e) {
      setScrapeLeagueMedalsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setScrapeLeagueMedalsBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Sync Data</h1>
        <p className="mt-1 text-muted-foreground">
          Pull fresh data from ESPN. Seasons {ESPN_HISTORICAL_COMPLETED_MIN}–{ESPN_HISTORICAL_COMPLETED_MAX} stay static
          once fully normalized unless you force a refresh. Current season {ESPN_HISTORICAL_COMPLETED_MAX + 1} always
          updates normally.
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

      {/* ── 1. Current season sync (API) ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current season sync</CardTitle>
          <CardDescription>
            Refresh the active ESPN season ({latestSeason ?? "…"}) via the server. Use force only when you intentionally
            want to re-pull completed years from ESPN.
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
              Force refresh completed seasons ({ESPN_HISTORICAL_COMPLETED_MIN}–{ESPN_HISTORICAL_COMPLETED_MAX}) — re-fetches ESPN even when already fully normalized
            </Label>
          </div>
          <Button
            onClick={handleRefreshLatest}
            disabled={isLoading || isBackfillLoading || isRawCacheBackfillLoading || isHistoricalEnrichmentLoading || isReprocessLoading || importFromBrowserMutation.isPending || browserSessionBulkBusy || browserSessionBusy || !latestSeason}
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

        <div className="border-t border-border px-6 py-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Other seasons (same API refresh)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick specific years — same backend path as the button above (not browser scrape / not backfill).
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSeasonPicker(v => !v)}
            >
              {showSeasonPicker ? "Hide" : "Select Seasons"}
            </Button>
          </div>
          {showSeasonPicker && (
            <div className="space-y-4 pt-1">
              <div className="flex flex-wrap gap-2">
                {allSeasons.map((s) => {
                  const isCached = cachedSeasons.includes(s);
                  const isSelected = selectedSeasons.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
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
                    type="button"
                    onClick={handleRefreshSelected}
                    disabled={isLoading || isBackfillLoading || isRawCacheBackfillLoading || isHistoricalEnrichmentLoading || isReprocessLoading}
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
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSeasons([])}
                  >
                    Clear
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {selectedSeasons.slice().sort((a, b) => a - b).join(", ")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ── 2. Historical seasons sync (browser + cache pipelines) ─────────── */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Historical seasons sync</h2>
        <p className="text-sm text-muted-foreground">
          Browser session import, re-normalize from stored cache, raw-cache rebuild, and ESPN enrichment — separate
          from the live API refresh above.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Browser session import (historical JSON)</CardTitle>
          <CardDescription>
            Fetches historical JSON using your ESPN login in this browser (or the GM War Room extension if ESPN
            blocks the page). Test mode: sync <strong>{BROWSER_SYNC_TEST_SEASON}</strong> first. After the database
            shows draft picks or matchups for {BROWSER_SYNC_TEST_SEASON}, you can sync seasons{" "}
            {BROWSER_SYNC_REMAINING_SEASONS[0]}–{BROWSER_SYNC_REMAINING_SEASONS[BROWSER_SYNC_REMAINING_SEASONS.length - 1]}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!leagueId && (
            <p className="text-sm text-muted-foreground">Connect an active league to enable browser session sync.</p>
          )}
          {browserSyncStatusQuery.isLoading && leagueId ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading per-season DB counts…
            </p>
          ) : null}
          {browser2010 && (
            <p className="text-xs text-muted-foreground">
              {BROWSER_SYNC_TEST_SEASON} DB: draft picks {browser2010.draftPicks} · matchups {browser2010.matchups}{" "}
              · teams {browser2010.teams} · transactions {browser2010.transactions}
              {browserSync2010Ready ? " — gate satisfied." : ` — sync ${BROWSER_SYNC_TEST_SEASON} to unlock bulk.`}
            </p>
          )}
          {browserSessionNote && (
            <p className="text-sm text-foreground/90 whitespace-pre-wrap">{browserSessionNote}</p>
          )}
          {browserSessionErr && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap break-words">{browserSessionErr}</span>
            </div>
          )}
          {browserSync2010Raw && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Extension response</p>
              <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
                {JSON.stringify(browserSync2010Raw, null, 2)}
              </pre>
            </div>
          )}
          {ingestParsedDraftPicksMutation.isPending && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Ingesting picks…
            </p>
          )}
          {browserSync2010IngestRaw && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Ingest response</p>
              <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
                {JSON.stringify(browserSync2010IngestRaw, null, 2)}
              </pre>
            </div>
          )}
          {lastBrowserImportCounts && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-foreground">
              <div className="font-medium text-muted-foreground mb-1">Server-reported row counts (last import)</div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                <span>Teams: {lastBrowserImportCounts.teams}</span>
                <span>Matchups: {lastBrowserImportCounts.matchups}</span>
                <span>Draft picks: {lastBrowserImportCounts.draftPicks}</span>
                <span>Transactions: {lastBrowserImportCounts.transactions}</span>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              className="gap-2"
              disabled={
                !leagueId ||
                browserSessionBusy ||
                browserSessionBulkBusy ||
                importFromBrowserMutation.isPending ||
                ingestParsedDraftPicksMutation.isPending ||
                isLoading ||
                isBackfillLoading ||
                isRawCacheBackfillLoading ||
                isHistoricalEnrichmentLoading ||
                isReprocessLoading
              }
              onClick={() => void handleBrowserSync2010()}
            >
              {browserSessionBusy || importFromBrowserMutation.isPending || ingestParsedDraftPicksMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {browserSessionBusy || importFromBrowserMutation.isPending || ingestParsedDraftPicksMutation.isPending
                ? "Syncing…"
                : `Sync From ESPN Browser Session (${BROWSER_SYNC_TEST_SEASON})`}
            </Button>
            <Button
              type="button"
              variant="default"
              className={`gap-2 ${browserSessionBulkBusy ? "" : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"}`}
              disabled={browserSessionBulkBusy}
              onClick={() => void handleBrowserSyncOtherSeasons()}
            >
              {browserSessionBulkBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Layers className="h-4 w-4" />
              )}
              {browserSessionBulkBusy
                ? "Syncing other seasons…"
                : `Sync all other seasons (${BROWSER_SYNC_REMAINING_SEASONS[0]}–${BROWSER_SYNC_REMAINING_SEASONS[BROWSER_SYNC_REMAINING_SEASONS.length - 1]})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Matchup backfill (extension scrape) ─────────────────────────── */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Matchup backfill</h2>
        <p className="text-xs text-muted-foreground">Schedule pages → H2H rows (run after standings import when possible).</p>
      </div>
      {/* Historical matchups import (2010–2025) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import Historical Matchups (2010–2025)</CardTitle>
          <CardDescription>
            Scrapes the ESPN schedule page per season and imports weekly matchups into League History H2H.
            Run standings import first so team names resolve correctly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {matchupsNote && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{matchupsNote}</p>
          )}
          {matchupsErr && (
            <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {matchupsErr}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 2025 - 2010 + 1 }, (_, i) => 2010 + i).map((season) => (
              <Button
                key={season}
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={matchupsBusy}
                onClick={() => void handleBrowserSyncMatchups([season])}
              >
                {matchupsBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                {season}
              </Button>
            ))}
            <Button
              type="button"
              variant="default"
              className={`gap-2 ${matchupsBusy ? "" : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"}`}
              disabled={matchupsBusy}
              onClick={() => void handleBrowserSyncMatchups(Array.from({ length: 2025 - 2010 + 1 }, (_, i) => 2010 + i))}
            >
              {matchupsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              {matchupsBusy ? "Importing matchups…" : "Import all 2010–2025"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Standings import (extension scrape) ─────────────────────────── */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Standings import</h2>
        <p className="text-xs text-muted-foreground">Final standings pages → normalized standings / medals helpers.</p>
      </div>
      {/* Historical standings import (2010–2017) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import Historical Standings (2010–2017)</CardTitle>
          <CardDescription>
            Scrapes the ESPN standings page for each season and imports final standings into League History.
            Requires you to be logged in to ESPN in this browser. Extension opens each tab automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {standingsNote && (
            <p className="text-xs text-muted-foreground">{standingsNote}</p>
          )}
          {standingsErr && (
            <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {standingsErr}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {[2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017].map((season) => (
              <Button
                key={season}
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={standingsBusy}
                onClick={() => void handleBrowserSyncStandings([season])}
              >
                {standingsBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                {season}
              </Button>
            ))}
            <Button
              type="button"
              variant="default"
              className={`gap-2 ${standingsBusy ? "" : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"}`}
              disabled={standingsBusy}
              onClick={() => void handleBrowserSyncStandings([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017])}
            >
              {standingsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              {standingsBusy ? "Importing standings…" : "Import all 2010–2017"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Re-normalize from cache (no ESPN fetch) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backfill Normalized Data</CardTitle>
          <CardDescription>
            Re-run matchups, transactions, roster entries, and standings from the existing combined cache for
            completed seasons {ESPN_HISTORICAL_COMPLETED_MIN}–{ESPN_HISTORICAL_COMPLETED_MAX} that still need
            normalization — without re-fetching ESPN. Fully normalized seasons are skipped unless you enable force
            below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="force-hist-backfill"
              checked={forceHistoricalBackfill}
              onCheckedChange={(v) => setForceHistoricalBackfill(!!v)}
            />
            <Label htmlFor="force-hist-backfill" className="cursor-pointer text-sm">
              Force reprocess completed seasons (runs even when already fully normalized)
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {seasonsForNormalizedBackfill.length > 0
              ? `Target seasons: ${seasonsForNormalizedBackfill.sort((a, b) => a - b).join(", ")}`
              : `No cached completed seasons in ${ESPN_HISTORICAL_COMPLETED_MIN}–${ESPN_HISTORICAL_COMPLETED_MAX} need normalization${forceHistoricalBackfill ? "" : " (enable force to include all cached years in range)"}.`}
          </p>
          <Button
            variant="secondary"
            className="gap-2"
            disabled={isLoading || isBackfillLoading || isRawCacheBackfillLoading || isHistoricalEnrichmentLoading || isReprocessLoading || seasonsForNormalizedBackfill.length === 0}
            onClick={() =>
              backfillNormalizedMutation.mutate({
                seasons: [...seasonsForNormalizedBackfill].sort((a, b) => a - b),
                force: forceHistoricalBackfill,
              })
            }
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

      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="text-base">Temporary: 2010 draft ingest debug</CardTitle>
          <CardDescription>
            Calls <code className="text-xs">espn.debugHistoricalDraftIngest</code> for league{" "}
            <span className="font-mono">457622</span> / season <span className="font-mono">2010</span>. Requires
            sign-in and league access. Remove this card when done.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={!isConnected || isDraftIngestDebugLoading}
            onClick={() =>
              debugDraftIngestMutation.mutate({
                leagueId: "457622",
                season: 2010,
              })
            }
          >
            {isDraftIngestDebugLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            Debug 2010 Draft Import
          </Button>
          {(debugDraftIngestMutation.isSuccess && debugDraftIngestMutation.data != null) ||
          debugDraftIngestMutation.isError ? (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
              {debugDraftIngestMutation.isSuccess && debugDraftIngestMutation.data != null
                ? JSON.stringify(debugDraftIngestMutation.data, null, 2)
                : JSON.stringify(
                    { error: trpcLikeErrorMessage(debugDraftIngestMutation.error) },
                    null,
                    2,
                  )}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backfill From Raw Cache</CardTitle>
          <CardDescription>
            Rebuilds normalized tables from <code className="text-xs">espn_raw_cache</code> combined payloads only
            ({RAW_CACHE_BACKFILL_MIN}–{RAW_CACHE_BACKFILL_MAX}). Does not call ESPN or use cookies. Skips categories
            that already have DB rows unless you force. Empty cache slices are never written over populated tables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="force-raw-cache-backfill"
              checked={forceRawCacheBackfill}
              onCheckedChange={(v) => setForceRawCacheBackfill(!!v)}
            />
            <Label htmlFor="force-raw-cache-backfill" className="cursor-pointer text-sm">
              Force overwrite all categories (re-upsert from cache even when DB already has rows)
            </Label>
          </div>
          <Button
            variant="secondary"
            className="gap-2"
            disabled={isLoading || isBackfillLoading || isRawCacheBackfillLoading || isHistoricalEnrichmentLoading || isReprocessLoading}
            onClick={() =>
              backfillFromRawCacheMutation.mutate({
                startSeason: RAW_CACHE_BACKFILL_MIN,
                endSeason: RAW_CACHE_BACKFILL_MAX,
                force: forceRawCacheBackfill,
              })
            }
          >
            {isRawCacheBackfillLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {isRawCacheBackfillLoading ? "Backfilling from raw cache…" : "Backfill From Raw Cache"}
          </Button>
          {backfillFromRawCacheMutation.isSuccess && backfillFromRawCacheMutation.data && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                League <span className="font-mono text-foreground">{backfillFromRawCacheMutation.data.leagueId}</span>
              </p>
              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="border-b border-border">
                      <th className="p-2 font-medium">Season</th>
                      <th className="p-2 font-medium">Status</th>
                      <th className="p-2 font-medium">Tm</th>
                      <th className="p-2 font-medium">Mup</th>
                      <th className="p-2 font-medium">Dr</th>
                      <th className="p-2 font-medium">Txn</th>
                      <th className="p-2 font-medium">Rst</th>
                      <th className="p-2 font-medium">Pl</th>
                      <th className="p-2 font-medium">Std</th>
                      <th className="p-2 font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backfillFromRawCacheMutation.data.results.map((r) => (
                      <tr key={r.season} className="border-b border-border/60 odd:bg-muted/20">
                        <td className="p-2 font-mono">{r.season}</td>
                        <td className="p-2">
                          <SeasonStatusBadge status={r.status} />
                        </td>
                        <td className="p-2">{r.teams}</td>
                        <td className="p-2">{r.matchups}</td>
                        <td className="p-2">{r.draftPicks}</td>
                        <td className="p-2">{r.transactions}</td>
                        <td className="p-2">{r.rosters}</td>
                        <td className="p-2">{r.players}</td>
                        <td className="p-2">{r.standings}</td>
                        <td className="p-2 whitespace-pre-wrap break-words text-muted-foreground">
                          {r.errors?.length ? r.errors.join("; ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {backfillFromRawCacheMutation.isError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap break-words">
                {trpcLikeErrorMessage(backfillFromRawCacheMutation.error)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historical Enrichment</CardTitle>
          <CardDescription>
            Fetches missing data from ESPN only when tables are empty: Draft Recap (<code className="text-xs">mDraftDetail</code>),
            weeks 1–16 (<code className="text-xs">mMatchup</code> + <code className="text-xs">mMatchupScore</code>), and{" "}
            <code className="text-xs">mTransactions2</code>. Seasons {HISTORICAL_ENRICHMENT_MIN}–{HISTORICAL_ENRICHMENT_MAX}.
            Does not refresh <code className="text-xs">combined</code> cache or touch teams/standings. Requires ESPN
            cookies (same as live sync). Example: <span className="text-muted-foreground">2010 draft: 196 · 2010 matchups: 98 · 2010 transactions: 87</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="force-historical-enrichment"
              checked={forceHistoricalEnrichment}
              onCheckedChange={(v) => setForceHistoricalEnrichment(!!v)}
            />
            <Label htmlFor="force-historical-enrichment" className="cursor-pointer text-sm">
              Force refresh (re-fetch from ESPN even when draft/matchups/transactions already have rows)
            </Label>
          </div>
          <Button
            variant="secondary"
            className="gap-2"
            disabled={isLoading || isBackfillLoading || isRawCacheBackfillLoading || isHistoricalEnrichmentLoading || isReprocessLoading}
            onClick={() =>
              enrichHistoricalSeasonMutation.mutate({
                startSeason: HISTORICAL_ENRICHMENT_MIN,
                endSeason: HISTORICAL_ENRICHMENT_MAX,
                force: forceHistoricalEnrichment,
              })
            }
          >
            {isHistoricalEnrichmentLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            {isHistoricalEnrichmentLoading ? "Enriching…" : "Run Historical Enrichment"}
          </Button>
          {enrichHistoricalSeasonMutation.isSuccess && enrichHistoricalSeasonMutation.data && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                League{" "}
                <span className="font-mono text-foreground">{enrichHistoricalSeasonMutation.data.leagueId}</span>
              </p>
              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="border-b border-border">
                      <th className="p-2 font-medium">Season</th>
                      <th className="p-2 font-medium">Draft</th>
                      <th className="p-2 font-medium">Matchups</th>
                      <th className="p-2 font-medium">Transactions</th>
                      <th className="p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichHistoricalSeasonMutation.data.results.map((r) => (
                      <tr key={r.season} className="border-b border-border/60 odd:bg-muted/20">
                        <td className="p-2 font-mono">{r.season}</td>
                        <td className="p-2">
                          {r.draft.skipped ? "—" : `${r.draft.saved}`}
                        </td>
                        <td className="p-2">
                          {r.matchups.skipped ? "—" : `${r.matchups.saved}`}
                        </td>
                        <td className="p-2">
                          {r.transactions.skipped ? "—" : `${r.transactions.saved}`}
                        </td>
                        <td className="p-2">
                          <SeasonStatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {enrichHistoricalSeasonMutation.data.results.some((r) => r.errors.length > 0) && (
                <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                  {enrichHistoricalSeasonMutation.data.results
                    .filter((r) => r.errors.length > 0)
                    .map((r) => `${r.season}: ${r.errors.join("; ")}`)
                    .join("\n")}
                </pre>
              )}
            </div>
          )}
          {enrichHistoricalSeasonMutation.isError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap break-words">
                {trpcLikeErrorMessage(enrichHistoricalSeasonMutation.error)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {sortedReprocessSeasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backfill Historical Seasons</CardTitle>
            <CardDescription>
              Runs the full normalization pipeline (teams, matchups, transactions, rosters, draft picks,
              standings) from stored combined cache for completed seasons {ESPN_HISTORICAL_COMPLETED_MIN}–
              {ESPN_HISTORICAL_COMPLETED_MAX} that still need normalization — without calling ESPN. Enable force above
              to include seasons that are already fully normalized.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Uses the same &quot;Force reprocess&quot; toggle as Backfill Normalized. Seasons:{" "}
              {sortedReprocessSeasons.join(", ")}
            </p>
            <Button
              variant="secondary"
              className="gap-2"
              disabled={isLoading || isBackfillLoading || isRawCacheBackfillLoading || isHistoricalEnrichmentLoading || isReprocessLoading}
              onClick={() => void handleBackfillHistoricalSeasons()}
            >
              {historicalRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Layers className="h-4 w-4" />
              )}
              {historicalRunning ? "Backfilling…" : "Backfill Historical Seasons"}
            </Button>
            <ul className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
              {sortedReprocessSeasons.map(s => {
                const p = historicalProgress[s];
                return (
                  <li key={s} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-[3rem] font-medium text-foreground">{s}</span>
                    {!p && <span className="text-xs text-muted-foreground">—</span>}
                    {p?.phase === "running" && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {p?.phase === "done" && p.error && (
                      <span className="text-xs text-red-300 whitespace-pre-wrap break-words">{p.error}</span>
                    )}
                    {p?.phase === "done" && p.row && (
                      <>
                        <SeasonStatusBadge status={p.row.status} />
                        <span className="text-xs text-muted-foreground">
                          teams {p.row.teamCount} · matchups {p.row.matchupCount} · txns {p.row.transactionCount}
                        </span>
                        {p.row.message ? (
                          <span className="w-full text-xs text-muted-foreground whitespace-pre-wrap break-words">
                            {p.row.message}
                          </span>
                        ) : null}
                        {p.row.error ? (
                          <span className="w-full text-xs text-yellow-300 whitespace-pre-wrap break-words">
                            {p.row.error}
                          </span>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── 5. Player stats pipeline (not enabled) ──────────────────────────── */}
      <Card className="border-dashed border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-base">Player stats pipeline</CardTitle>
          <CardDescription>
            Future work: bulk NFL / fantasy player stat ingest for modeling. <strong>Locked</strong> in this app — no
            action here yet (use other tools for raw player stats).
          </CardDescription>
        </CardHeader>
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

        {manifestsQuery.isSuccess && leagueConnectionMissing && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            League not connected — showing cached seasons
          </div>
        )}

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
              className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
            >
              {runResults[s] ? (
                <SeasonStatusIcon
                  status={
                    runResults[s].status === "complete"
                      ? "complete"
                      : runResults[s].status === "running"
                        ? "running"
                        : runResults[s].status
                  }
                />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              <span className="font-medium text-foreground">{s}</span>
              <span>— No cache</span>
              {runResults[s] && <SeasonStatusBadge status={runResults[s].status} />}
              {runResults[s]?.message && (
                <span className="w-full text-xs text-muted-foreground">{runResults[s].message}</span>
              )}
            </div>
          ))}
      </div>

      {/* ── League History Medals (admin) ──────────────────────────────── */}
      {(() => {
        const dbBySeason = new Map<number, { champion: string; runnerUp: string; third: string }>();
        for (const m of medalsQ.data ?? []) {
          dbBySeason.set(m.season, { champion: m.championOwner, runnerUp: m.runnerUpOwner, third: m.thirdPlaceOwner });
        }
        const getMedalStatus = (yr: number): "saved" | "edited" | "missing" => {
          const entry = medalEntries[yr];
          if (!entry?.champion.trim()) return "missing";
          const db = dbBySeason.get(yr);
          if (!db?.champion) return "edited";
          if (
            entry.champion.trim() === db.champion &&
            entry.runnerUp.trim() === (db.runnerUp ?? "") &&
            entry.third.trim()    === (db.third ?? "")
          ) return "saved";
          return "edited";
        };
        const seasonsFilled = ALL_MEDAL_SEASONS.filter((yr) => medalEntries[yr]?.champion.trim()).length;
        const seasonsWithStandings = ALL_MEDAL_SEASONS.filter((yr) => perSeasonTopThree.has(yr)).length;
        return (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-blue-300">League History Medals</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Source of truth for dynasty titles — from ESPN League History page. {seasonsFilled}/{ALL_MEDAL_SEASONS.length} seasons filled.
              </CardDescription>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={standingsQ.isLoading || seasonsWithStandings === 0}
                  onClick={handleAutoFill}
                >
                  {standingsQ.isLoading
                    ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Loading…</>
                    : `Auto Fill From Imported History (${seasonsWithStandings} seasons)`}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  disabled={scrapeLeagueMedalsBusy}
                  onClick={() => void handleScrapeLeagueHistoryMedals()}
                >
                  {scrapeLeagueMedalsBusy
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Database className="h-3 w-3" />}
                  {scrapeLeagueMedalsBusy ? "Scraping…" : "Scrape ESPN League History Medals"}
                </Button>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <Checkbox
                    checked={forceReplace}
                    onCheckedChange={(v) => setForceReplace(Boolean(v))}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs text-muted-foreground">Force Replace saved values</span>
                </label>
              </div>
              {scrapeLeagueMedalsNote && (
                <p className="text-xs text-muted-foreground pt-1">{scrapeLeagueMedalsNote}</p>
              )}
              {scrapeLeagueMedalsErr && (
                <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 mt-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {scrapeLeagueMedalsErr}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5">
              {/* Header row */}
              <div className="grid grid-cols-[4rem_1fr_1fr_1fr_3rem_5rem] gap-x-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-1 border-b border-border/40">
                <span>Season</span>
                <span>🥇 Champion</span>
                <span>🥈 Runner-Up</span>
                <span>🥉 Third</span>
                <span className="text-center">Status</span>
                <span />
              </div>

              {/* Season rows */}
              {ALL_MEDAL_SEASONS.map((yr) => {
                const entry   = medalEntries[yr] ?? { champion: "", runnerUp: "", third: "" };
                const isBusy  = medalBusy === yr;
                const err     = medalErr[yr];
                const status  = getMedalStatus(yr);
                return (
                  <div key={yr} className="grid grid-cols-[4rem_1fr_1fr_1fr_3rem_5rem] gap-x-2 items-center py-0.5">
                    <span className="font-mono text-xs text-muted-foreground">{yr}</span>
                    {(["champion", "runnerUp", "third"] as const).map((field) => (
                      <input
                        key={field}
                        type="text"
                        value={entry[field]}
                        placeholder={field === "champion" ? "Champion" : field === "runnerUp" ? "Runner-Up" : "3rd Place"}
                        className="h-7 rounded border border-border/60 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        onChange={(e) => {
                          setMedalEntries((p) => ({ ...p, [yr]: { ...entry, [field]: e.target.value } }));
                          setMedalSaved((p) => { const n = new Set(p); n.delete(yr); return n; });
                        }}
                      />
                    ))}
                    {/* Status */}
                    <div className="flex justify-center text-sm" title={status}>
                      {status === "saved"   && <span className="text-emerald-400">✓</span>}
                      {status === "edited"  && <span className="text-amber-400">✎</span>}
                      {status === "missing" && <span className="text-red-400/60">⚠</span>}
                    </div>
                    {/* Per-row Save */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-full px-2 text-xs"
                        disabled={isBusy || saveAllBusy || !entry.champion.trim()}
                        onClick={() => void handleSaveMedal(yr)}
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                      {err && <span className="text-[10px] text-red-400" title={err}>!</span>}
                    </div>
                  </div>
                );
              })}

              {/* Save All */}
              <div className="flex items-center gap-3 pt-3 border-t border-border/40">
                <Button
                  size="sm"
                  className="text-xs"
                  disabled={saveAllBusy || medalBusy !== null || seasonsFilled === 0}
                  onClick={() => void handleSaveAll()}
                >
                  {saveAllBusy && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  Save All ({seasonsFilled} seasons)
                </Button>
                {Object.keys(medalErr).length > 0 && (
                  <span className="text-xs text-red-400">{Object.keys(medalErr).length} error(s)</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

    </div>
  );
}
