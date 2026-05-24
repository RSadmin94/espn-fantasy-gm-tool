import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { buildEspnFantasyFootballConnectUrl } from "@/lib/espnConnectUrl";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  Plug,
  Trash2,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectFormValues {
  swid: string;
  espnS2: string;
  leagueId: string;
}

interface LeagueRow {
  id: number;
  leagueId: string;
  leagueName: string;
  season: number;
  isActive: boolean;
  syncStatus: string | null;
  lastSyncedAt: Date | string | null;
}

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// ── Status badge ──────────────────────────────────────────────────────────────

function SyncBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    syncing: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
      map[status] ?? "bg-muted text-muted-foreground border-border"
    )}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Manual credential form (collapsed fallback) ────────────────────────────────

function ManualForm({ onSuccess }: { onSuccess: (leagueId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ConnectFormValues>({
    defaultValues: { swid: "", espnS2: "", leagueId: "" },
  });

  const utils = trpc.useUtils();
  const saveMutation = trpc.espn.saveCredentials.useMutation({
    onSuccess: (data) => {
      reset();
      setOpen(false);
      setSaveError(null);
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
      onSuccess(data.leagueId);
    },
    onError: (err) => setSaveError(err.message),
  });

  return (
    <Card className="border-border/60">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/20 transition-colors rounded-lg"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-muted-foreground">
          Manual connection fallback
        </span>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="border-t border-border pt-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-4">
            If the Chrome extension isn't available, paste your ESPN cookies manually.
            Find them in browser DevTools → Application → Cookies → espn.com.
          </p>

          {saveError && (
            <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 mb-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {saveError}
            </div>
          )}

          <form onSubmit={handleSubmit(v => {
            setSaveError(null);
            saveMutation.mutate({
              swid: v.swid.trim(),
              espnS2: v.espnS2.trim(),
              leagueId: v.leagueId.trim() || undefined,
            });
          })} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="swid">SWID <span className="text-destructive">*</span></Label>
              <Input
                id="swid"
                placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                className={cn(errors.swid && "border-destructive")}
                {...register("swid", { required: "SWID is required" })}
              />
              {errors.swid && <p className="text-xs text-destructive">{errors.swid.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="espnS2">espn_s2 <span className="text-destructive">*</span></Label>
              <Input
                id="espnS2"
                placeholder="AEB..."
                className={cn(errors.espnS2 && "border-destructive")}
                {...register("espnS2", { required: "espn_s2 is required" })}
              />
              {errors.espnS2 && <p className="text-xs text-destructive">{errors.espnS2.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leagueId">
                League ID{" "}
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="leagueId"
                placeholder="e.g. 1589110"
                {...register("leagueId")}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saveMutation.isPending} size="sm" className="gap-2">
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {saveMutation.isPending ? "Connecting…" : "Connect"}
              </Button>
              <Button type="button" variant="ghost" size="sm"
                onClick={() => { setOpen(false); reset(); setSaveError(null); }}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
}

// ── Diagnostics card (secondary) ─────────────────────────────────────────────

function DiagnosticsCard() {
  const [enabled, setEnabled] = useState(false);
  const testQuery = trpc.espn.testFetch.useQuery(undefined, {
    enabled,
    retry: false,
  });

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Connection Diagnostics
            </CardTitle>
            <CardDescription className="text-xs">
              Verify saved credentials can reach ESPN's API.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => enabled ? void testQuery.refetch() : setEnabled(true)}
            disabled={testQuery.isFetching}
            className="gap-1.5 text-xs"
          >
            {testQuery.isFetching
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Wifi className="h-3.5 w-3.5" />}
            {testQuery.isFetching ? "Testing…" : "Test"}
          </Button>
        </div>
      </CardHeader>

      {testQuery.data && (
        <CardContent>
          {(() => {
            const d = testQuery.data;
            const ok = d.isValidJson && d.httpStatus === 200;
            return (
              <div className="space-y-3">
                <div className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                  ok
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/20 bg-red-500/10 text-red-300"
                )}>
                  {ok
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : <WifiOff className="h-4 w-4 shrink-0" />}
                  {ok
                    ? `Connected — ${d.leagueName || `League ${d.leagueId}`}`
                    : d.error || `HTTP ${d.httpStatus}`}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {[
                    ["League ID", d.leagueId],
                    ["Season", String(d.season)],
                    ["Cred source", d.credSource],
                    ["SWID prefix", d.swidPrefix],
                  ].map(([label, val]) => (
                    <div key={label} className="rounded border border-border bg-muted/30 px-3 py-2">
                      <span className="font-medium text-foreground">{label}</span>
                      <div className="mt-0.5 font-mono">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </CardContent>
      )}

      {testQuery.isError && (
        <CardContent>
          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {testQuery.error.message}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ConnectESPN() {
  const [isWaiting, setIsWaiting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [newLeague, setNewLeague] = useState<LeagueRow | null>(null);

  // IDs that existed before polling started
  const baselineIdsRef = useRef<Set<number>>(new Set());
  const timeoutHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();

  // Always-on leagues query; polling interval only active while waiting
  const leaguesQ = trpc.league.getMyLeagues.useQuery(undefined, {
    refetchInterval: isWaiting ? POLL_INTERVAL_MS : false,
  });
  const activeQ = trpc.league.getActive.useQuery();

  const leagues = (leaguesQ.data as LeagueRow[] | undefined) ?? [];
  const alreadyConnected = leagues.length > 0;

  // Detect new league while polling
  useEffect(() => {
    if (!isWaiting) return;
    const current = leaguesQ.data as LeagueRow[] | undefined;
    if (!current) return;

    const added = current.filter(l => !baselineIdsRef.current.has(l.id));
    if (added.length > 0) {
      const found = added[0];
      setNewLeague(found);
      setIsWaiting(false);
      setTimedOut(false);
      if (timeoutHandleRef.current) clearTimeout(timeoutHandleRef.current);
    }
  }, [leaguesQ.data, isWaiting]);

  // Cleanup timeout on unmount
  useEffect(() => () => {
    if (timeoutHandleRef.current) clearTimeout(timeoutHandleRef.current);
  }, []);

  function openEspnConnectTab() {
    const leagueIdForUrl = activeQ.data?.leagueId?.trim() || undefined;
    const espnUrlOpened = buildEspnFantasyFootballConnectUrl(leagueIdForUrl);
    console.info("[ConnectESPN] ESPN connect open", {
      espnUrlOpened,
      leagueIdDetected: leagueIdForUrl ?? null,
      swidPresent: false,
      espnS2Present: false,
      saveCredentialsHttpStatus: null,
      refreshStarted: null,
    });
    window.open(espnUrlOpened, "_blank", "noopener,noreferrer");
  }

  function handleConnect() {
    // Snapshot current league IDs as baseline
    const current = (leaguesQ.data as LeagueRow[] | undefined) ?? [];
    baselineIdsRef.current = new Set(current.map(l => l.id));

    setIsWaiting(true);
    setTimedOut(false);
    setNewLeague(null);

    // Open ESPN in new tab (league overview when we know an active league id)
    openEspnConnectTab();

    // Start 2-minute timeout
    timeoutHandleRef.current = setTimeout(() => {
      setTimedOut(true);
    }, TIMEOUT_MS);
  }

  function handleCancelWait() {
    setIsWaiting(false);
    setTimedOut(false);
    if (timeoutHandleRef.current) clearTimeout(timeoutHandleRef.current);
  }

  function handleManualSuccess(leagueId: string) {
    setNewLeague(null); // let the leagues list refresh show it
    void utils.league.getMyLeagues.invalidate();
    void utils.league.getActive.invalidate();
    // show synthetic connected state with just the ID
    setNewLeague({ id: 0, leagueId, leagueName: `ESPN League ${leagueId}`, season: 0, isActive: true, syncStatus: "pending", lastSyncedAt: null });
  }

  const removeMutation = trpc.league.removeLeague.useMutation({
    onSuccess: () => {
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
      setNewLeague(null);
    },
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Connect ESPN</h1>
        <p className="mt-1 text-muted-foreground">
          Link your ESPN Fantasy Football league via the GM War Room Chrome extension.
        </p>
      </div>

      {/* ── Primary connection card ── */}
      <Card className={cn(
        "border-2 transition-colors",
        newLeague ? "border-emerald-500/40 bg-emerald-500/5"
          : isWaiting ? "border-primary/30 bg-primary/5"
          : alreadyConnected ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-primary/20 bg-primary/5"
      )}>
        <CardContent className="pt-6 pb-5 space-y-5">

          {/* ── Success: new league just connected ── */}
          {newLeague && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="font-semibold text-emerald-400 text-base">ESPN Connected</div>
                  <div className="text-sm text-muted-foreground">
                    {newLeague.leagueName || `League ${newLeague.leagueId}`}
                    {newLeague.leagueId && (
                      <span className="ml-1 text-xs opacity-70">· ID {newLeague.leagueId}</span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Your league data sync has been queued. Head to{" "}
                <a href="/sync" className="text-primary underline underline-offset-2">Sync Data</a>{" "}
                to track progress or{" "}
                <a href="/dashboard" className="text-primary underline underline-offset-2">Dashboard</a>{" "}
                to get started.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNewLeague(null)}
                className="text-xs"
              >
                Connect another league
              </Button>
            </div>
          )}

          {/* ── Waiting state ── */}
          {!newLeague && isWaiting && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Waiting for ESPN connection…</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Checking every 3 seconds
                  </div>
                </div>
              </div>

              {timedOut && (
                <div className="flex items-start gap-2 rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Still waiting. Make sure the Chrome extension is installed, you're logged
                    into ESPN, and then return to this tab.
                  </span>
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground text-xs uppercase tracking-wide mb-2">
                  What to do in the ESPN tab:
                </p>
                <ol className="list-decimal pl-4 space-y-1 text-xs">
                  <li>Log in to ESPN if prompted</li>
                  <li>Navigate to your fantasy football league</li>
                  <li>The Chrome extension will detect your cookies automatically</li>
                  <li>Return to this tab — it will update within seconds</li>
                </ol>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEspnConnectTab}
                  className="gap-1.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Re-open ESPN
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelWait}
                  className="text-xs text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ── Idle / already-connected state ── */}
          {!newLeague && !isWaiting && (
            <div className="space-y-4">
              {alreadyConnected && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400 font-medium">
                    League already connected
                  </span>
                </div>
              )}

              <div>
                <p className="text-sm text-foreground font-medium mb-1">
                  How it works
                </p>
                <p className="text-sm text-muted-foreground">
                  Click <span className="font-medium text-foreground">Connect ESPN</span>,
                  log into ESPN if prompted, then return to this tab. The Chrome extension
                  detects your cookies and links your league automatically.
                </p>
              </div>

              <Button
                onClick={handleConnect}
                className="w-full gap-2 font-semibold"
                size="lg"
              >
                <Plug className="h-4 w-4" />
                Connect ESPN
                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Requires the{" "}
                <span className="text-foreground font-medium">GM War Room Chrome extension</span>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Connected leagues list ── */}
      {leagues.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Connected Leagues ({leagues.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leaguesQ.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {leagues.map(league => {
              const isActive = activeQ.data?.id === league.id;
              return (
                <div
                  key={league.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3",
                    isActive ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Trophy className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {league.leagueName || `League ${league.leagueId}`}
                        {isActive && (
                          <Badge variant="outline" className="border-primary/30 text-primary text-xs py-0">
                            Active
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>ID: {league.leagueId}</span>
                        <span>·</span>
                        <SyncBadge status={league.syncStatus} />
                      </div>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate({ leagueConnectionId: league.id })}
                    aria-label="Remove league"
                  >
                    {removeMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Manual connection fallback (collapsed) ── */}
      <ManualForm onSuccess={handleManualSuccess} />

      {/* ── Diagnostics (secondary) ── */}
      <DiagnosticsCard />
    </div>
  );
}
