import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { buildEspnFantasyFootballConnectUrl } from "@/lib/espnConnectUrl";
import {
  connectEspnViaConnector,
  findConnectedLeague,
  type EspnConnectResult,
} from "@/lib/espnApi";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { V1 } from "@/lib/v1Copy";
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
  ExternalLink,
  Loader2,
  Plug,
  Trash2,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import { EspnConnectorGuide, ConnectedLeagueLimitBanner, ProviderConnectCards, useConnectedLeagueLimits } from "@/components/connect";
import { useConnectTeamStepHighlight } from "@/components/onboarding/SetupGate";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectFormValues {
  swid: string;
  espnS2: string;
  leagueId: string;
}

interface LeagueRow {
  id: number;
  provider: string;
  leagueId: string;
  leagueName: string;
  season: number;
  isActive: boolean;
  syncStatus: string | null;
  lastSyncedAt: Date | string | null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function SyncBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    syncing: "bg-violet-500/15 text-violet-400 border-violet-500/20",
    success: "bg-lime-500/15 text-lime-400 border-lime-500/20",
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

// ── Quick connect: just enter a League ID ────────────────────────────────────

function QuickConnectCard({ onSuccess, disabled }: { onSuccess: (leagueId: string, leagueName: string) => void; disabled?: boolean }) {
  const [leagueId, setLeagueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const connectMutation = (trpc as any).league.connectByLeagueId.useMutation({
    onSuccess: (data: any) => {
      setError(null);
      setLeagueId("");
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
      onSuccess(data.leagueConnectionId?.toString() ?? "", data.leagueName ?? "");
    },
    onError: (err: any) => setError(err.message),
  });

  function submit() {
    const id = leagueId.trim();
    if (!id || isNaN(Number(id))) { setError("Enter a valid numeric League ID"); return; }
    setError(null);
    connectMutation.mutate({ leagueId: id });
  }

  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div>
          <p className="text-base font-semibold text-foreground mb-0.5">Connect by League ID</p>
          <p className="text-sm text-muted-foreground">
            Find your League ID in the ESPN URL:{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded text-foreground">
              fantasy.espn.com/football/league?leagueId=<span className="text-primary font-bold">457622</span>
            </code>
            . For private leagues, install the ESPN Connector before syncing history.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="e.g. 457622"
            value={leagueId}
            onChange={e => setLeagueId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            className="font-mono text-sm"
            inputMode="numeric"
            maxLength={12}
          />
          <Button onClick={submit} disabled={connectMutation.isPending || disabled} className="shrink-0 gap-2">
            {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            {connectMutation.isPending ? "Connecting…" : "Connect"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          No credentials needed. Data sync still requires the Chrome extension.
        </p>
      </CardContent>
    </Card>
  );
}

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
                    ? "border-lime-500/20 bg-lime-500/10 text-lime-300"
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
  const [newLeague, setNewLeague] = useState<LeagueRow | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<EspnConnectResult | null>(null);
  const [readBackMissing, setReadBackMissing] = useState(false);
  const [preflight, setPreflight] = useState<{
    checked: boolean;
    connectorPresent: boolean;
    espnSignedIn: boolean | null;
  }>({ checked: false, connectorPresent: false, espnSignedIn: null });
  const { atLimit } = useConnectedLeagueLimits();
  useConnectTeamStepHighlight();

  const utils = trpc.useUtils();

  const leaguesQ = trpc.league.getMyLeagues.useQuery(undefined);
  const activeQ = trpc.league.getActive.useQuery();

  const leagues = (leaguesQ.data as LeagueRow[] | undefined) ?? [];
  const alreadyConnected = leagues.length > 0;

  /** R7: one line per stage, with the fields that explain why the user is seeing what they see. */
  function logConnectStage(
    phase: "preflight" | "connect",
    r: EspnConnectResult,
    leagueFound: boolean | null,
  ) {
    console.info("[ConnectESPN] connect stage", {
      phase,
      stage: r.stage,
      connectorPresent: r.connectorPresent,
      espnSignedIn: r.espnSignedIn,
      saveHttpStatus: r.saveHttpStatus,
      leagueFound,
      elapsedMs: r.elapsedMs,
    });
  }

  // Preflight: answer "connector present?" and "ESPN signed in?" before the user clicks anything.
  async function runPreflight(): Promise<void> {
    const probe = await connectEspnViaConnector({ probe: true });
    logConnectStage("preflight", probe, null);
    setPreflight({
      checked: true,
      connectorPresent: probe.connectorPresent,
      espnSignedIn:
        probe.stage === "ready" ? true : probe.stage === "espn_signed_out" ? false : null,
    });
  }

  useEffect(() => {
    void runPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEspnConnectTab() {
    const leagueIdForUrl = activeQ.data?.leagueId?.trim() || undefined;
    const espnUrlOpened = buildEspnFantasyFootballConnectUrl(leagueIdForUrl);
    console.info("[ConnectESPN] ESPN connect open", {
      espnUrlOpened,
      leagueIdDetected: leagueIdForUrl ?? null,
      connectorPresent: preflight.connectorPresent,
      espnSignedIn: preflight.espnSignedIn,
      saveCredentialsHttpStatus: result?.saveHttpStatus ?? null,
    });
    window.open(espnUrlOpened, "_blank", "noopener,noreferrer");
  }

  /**
   * Ask the Connector to capture and save the ESPN session. Resolves on the Connector's own reply,
   * then confirms with a single backend read — no waiting for a row to show up on a timer.
   */
  async function runConnect(opts?: { leagueId?: string; leagueName?: string }) {
    setConnecting(true);
    setReadBackMissing(false);
    setNewLeague(null);
    try {
      const r = await connectEspnViaConnector(opts);
      setResult(r);
      setPreflight((p) => ({
        checked: true,
        connectorPresent: r.connectorPresent,
        espnSignedIn: r.espnSignedIn ?? p.espnSignedIn,
      }));

      if (r.stage !== "connected") {
        logConnectStage("connect", r, null);
        return;
      }

      void utils.league.getActive.invalidate();
      const rows = (await utils.league.getMyLeagues.fetch(undefined)) as LeagueRow[] | undefined;
      const saved = findConnectedLeague(rows ?? [], r.leagueId);
      logConnectStage("connect", r, Boolean(saved));
      if (saved) setNewLeague(saved);
      else setReadBackMissing(true);
    } finally {
      setConnecting(false);
    }
  }

  function handleRetryPreflight() {
    setResult(null);
    setReadBackMissing(false);
    void runPreflight();
  }

  function handleManualSuccess(leagueId: string, leagueName?: string) {
    setNewLeague(null);
    setResult(null);
    setReadBackMissing(false);
    void utils.league.getMyLeagues.invalidate();
    void utils.league.getActive.invalidate();
    setNewLeague({ id: 0, provider: "espn", leagueId, leagueName: leagueName ?? `ESPN League ${leagueId}`, season: 0, isActive: true, syncStatus: "pending", lastSyncedAt: null });
  }

  const disconnectMutation = trpc.league.disconnectConnectedLeague.useMutation({
    onSuccess: () => {
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
      void utils.league.getConnectionLimits.invalidate();
      setNewLeague(null);
    },
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  const chooseLeagues = result?.stage === "choose" ? result.leagues : [];
  const connectorMissing = preflight.checked && !preflight.connectorPresent;
  const espnSignedOut = preflight.connectorPresent && preflight.espnSignedIn === false;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Connect your league</h1>
        <p className="mt-1 text-muted-foreground">
          ESPN, Sleeper, or Sleeper workbook — this isn&apos;t another fantasy tool. It knows your league.
        </p>
      </div>

      <ConnectedLeagueLimitBanner />
      <ProviderConnectCards atLimit={atLimit} />

      <div id="team-selection-help" className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">After connecting</p>
        <p className="mt-1">
          Sync your history, then select which team is yours on{" "}
          <a href="/connected-leagues" className="text-primary underline underline-offset-2">
            Connected Leagues
          </a>{" "}
          or open{" "}
          <a href="/sync" className="text-primary underline underline-offset-2">
            Sync Data
          </a>
          .
        </p>
      </div>

      <EspnConnectorGuide
        highlightStep={
          newLeague
            ? 4
            : preflight.connectorPresent && preflight.espnSignedIn === false
              ? 2
              : !preflight.connectorPresent && preflight.checked
                ? 1
                : alreadyConnected
                  ? 3
                  : 1
        }
      />

      {/* Quick connect by League ID */}
      <QuickConnectCard onSuccess={(id, name) => handleManualSuccess(id, name)} disabled={atLimit} />

      {/* ── Primary connection card ── */}
      <Card className={cn(
        "border-2 transition-colors",
        newLeague ? "border-lime-500/40 bg-lime-500/5"
          : connecting ? "border-primary/30 bg-primary/5"
          : alreadyConnected ? "border-lime-500/20 bg-lime-500/5"
          : "border-primary/20 bg-primary/5"
      )}>
        <CardContent className="pt-6 pb-5 space-y-5">

          {/* ── Success: new league just connected ── */}
          {newLeague && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-500/20">
                  <CheckCircle2 className="h-5 w-5 text-lime-400" />
                </div>
                <div>
                  <div className="font-semibold text-lime-400 text-base">ESPN Connected</div>
                  <div className="text-sm text-muted-foreground">
                    {newLeague.leagueName || `League ${newLeague.leagueId}`}
                    {newLeague.leagueId && (
                      <span className="ml-1 text-xs opacity-70">· ID {newLeague.leagueId}</span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                League linked — syncing in the background. The ESPN Connector will return you to the{" "}
                <a href="/dashboard" className="text-primary underline underline-offset-2">{V1.home.nav}</a>{" "}
                when ready. You can also open{" "}
                <a href="/sync" className="text-primary underline underline-offset-2">Sync Data</a>{" "}
                to import full league history anytime.
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

          {/* ── Connecting (bounded, Connector-driven) ── */}
          {!newLeague && connecting && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Connecting your league…</div>
                  <div className="text-sm text-muted-foreground">
                    The ESPN Connector is reading your session and linking your league.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Pick a league (Connector found more than one) ── */}
          {!newLeague && !connecting && chooseLeagues.length > 0 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-foreground font-medium mb-1">
                  Which league is yours?
                </p>
                <p className="text-sm text-muted-foreground">
                  The ESPN Connector found {chooseLeagues.length} leagues on your ESPN account. Pick one to link.
                </p>
              </div>
              <div className="space-y-2">
                {chooseLeagues.map(l => (
                  <Button
                    key={l.id}
                    variant="outline"
                    className="w-full justify-between gap-2 font-medium"
                    disabled={atLimit}
                    onClick={() => void runConnect({ leagueId: l.id, leagueName: l.name })}
                  >
                    <span className="truncate">{l.name || `League ${l.id}`}</span>
                    <span className="text-xs text-muted-foreground shrink-0">ID {l.id}</span>
                  </Button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResult(null)}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          )}

          {/* ── Idle / already-connected / blocked state ── */}
          {!newLeague && !connecting && chooseLeagues.length === 0 && (
            <div className="space-y-4">
              {alreadyConnected && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-lime-400" />
                  <span className="text-sm text-lime-400 font-medium">
                    League already connected
                  </span>
                </div>
              )}

              {connectorMissing ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      The Fantasy Football Rivals ESPN Connector isn&apos;t installed in this browser.
                      Install it (step 1 above), then recheck — it&apos;s the secure bridge for private league data.
                    </span>
                  </div>
                  <Button
                    onClick={handleRetryPreflight}
                    className="w-full gap-2 font-semibold"
                    size="lg"
                  >
                    <Plug className="h-4 w-4" />
                    I installed it — recheck
                  </Button>
                </div>
              ) : espnSignedOut ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      You&apos;re not signed in to ESPN. Open ESPN Fantasy Football, log in with the account that
                      can see your league, then come back and recheck.
                    </span>
                  </div>
                  <Button
                    onClick={openEspnConnectTab}
                    className="w-full gap-2 font-semibold"
                    size="lg"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Sign in at ESPN
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryPreflight}
                    className="w-full text-xs"
                  >
                    I&apos;m signed in — recheck
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {result?.stage === "no_leagues" && (
                    <div className="flex items-start gap-2 rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-3 text-sm text-yellow-300">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        No ESPN fantasy football leagues were found on your account. Open your league at
                        fantasy.espn.com, then try again — or connect by League ID above.
                      </span>
                    </div>
                  )}

                  {result?.stage === "save_failed" && (
                    <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-300">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Saving your ESPN session failed
                        {result.saveHttpStatus ? ` (HTTP ${result.saveHttpStatus})` : ""}
                        {result.error ? `: ${result.error}` : "."}
                      </span>
                    </div>
                  )}

                  {(result?.stage === "timeout" || result?.stage === "error") && (
                    <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-300">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{result.error ?? "The ESPN Connector didn't respond."}</span>
                    </div>
                  )}

                  {readBackMissing && (
                    <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-300">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        The Connector saved your session, but the league didn&apos;t come back from Fantasy Football
                        Rivals. Try again — if it keeps failing, connect by League ID above.
                      </span>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-foreground font-medium mb-1">
                      Step 3 — Connect your league
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Click <span className="font-medium text-foreground">Connect ESPN</span> and the ESPN Connector
                      links your league from the session you&apos;re already signed in to — no League ID, no copying
                      cookies. You stay in Fantasy Football Rivals for everything else.
                    </p>
                  </div>

                  <Button
                    onClick={() => void runConnect()}
                    disabled={atLimit || !preflight.checked}
                    className="w-full gap-2 font-semibold"
                    size="lg"
                  >
                    <Plug className="h-4 w-4" />
                    {result?.stage === "save_failed" ||
                    result?.stage === "timeout" ||
                    result?.stage === "error" ||
                    readBackMissing
                      ? "Retry connect"
                      : "Connect ESPN"}
                  </Button>
                </div>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Requires the{" "}
                <span className="text-foreground font-medium">Fantasy Football Rivals ESPN Connector</span>{" "}
                (Chrome extension) for private league data.
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
                    disabled={disconnectMutation.isPending}
                    onClick={() =>
                      disconnectMutation.mutate({
                        provider: league.provider ?? "espn",
                        leagueId: league.leagueId,
                      })
                    }
                    aria-label="Disconnect league"
                  >
                    {disconnectMutation.isPending
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
