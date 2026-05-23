import { useState } from "react";
import { useForm } from "react-hook-form";
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
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";

interface ConnectFormValues {
  swid: string;
  espnS2: string;
  leagueId: string;
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
    syncing: { label: "Syncing", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
    success: { label: "Synced", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    failed: { label: "Failed", className: "bg-red-500/15 text-red-400 border-red-500/20" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}

export function ConnectESPN() {
  const [showForm, setShowForm] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    leagueId: string;
    message: string;
  } | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ConnectFormValues>({
    defaultValues: { swid: "", espnS2: "", leagueId: "" },
  });

  // Queries
  const leaguesQuery = trpc.league.getMyLeagues.useQuery(undefined, {
    refetchInterval: saveResult ? 4000 : false,
  });
  const activeQuery = trpc.league.getActive.useQuery();

  // Mutations
  const utils = trpc.useUtils();
  const saveMutation = trpc.espn.saveCredentials.useMutation({
    onSuccess: (data) => {
      setSaveResult({
        success: data.success,
        leagueId: data.leagueId,
        message: `League ${data.leagueId || "connected"} — initial sync queued.`,
      });
      reset();
      setShowForm(false);
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
    },
    onError: (err) => {
      setSaveResult({ success: false, leagueId: "", message: err.message });
    },
  });

  const removeMutation = trpc.league.removeLeague.useMutation({
    onSuccess: () => {
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
    },
  });

  const onSubmit = (values: ConnectFormValues) => {
    setSaveResult(null);
    saveMutation.mutate({
      swid: values.swid.trim(),
      espnS2: values.espnS2.trim(),
      leagueId: values.leagueId.trim() || undefined,
    });
  };

  const leagues = leaguesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Connect ESPN</h1>
        <p className="mt-1 text-muted-foreground">
          Link your ESPN Fantasy Football league to enable data sync and analysis.
        </p>
      </div>

      {/* How-to card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ExternalLink className="h-4 w-4" />
            How to find your ESPN credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-4">
            <li>Log in to <span className="text-foreground font-medium">espn.com</span></li>
            <li>Open your browser DevTools → Application → Cookies → espn.com</li>
            <li>Copy the value for <code className="rounded bg-muted px-1 text-xs text-foreground">SWID</code> (the long UUID with curly braces)</li>
            <li>Copy the value for <code className="rounded bg-muted px-1 text-xs text-foreground">espn_s2</code> (long encoded string)</li>
            <li>Your League ID is in the URL when viewing your league: <code className="rounded bg-muted px-1 text-xs text-foreground">/leagues/&#123;leagueId&#125;</code></li>
          </ol>
        </CardContent>
      </Card>

      {/* Save result banner */}
      {saveResult && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 text-sm",
            saveResult.success
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/20 bg-red-500/10 text-red-300"
          )}
        >
          {saveResult.success
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{saveResult.message}</span>
        </div>
      )}

      {/* Connected leagues */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Connected Leagues</CardTitle>
              <CardDescription>
                {leagues.length === 0
                  ? "No leagues connected yet."
                  : `${leagues.length} league${leagues.length === 1 ? "" : "s"} connected`}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={showForm ? "outline" : "default"}
              onClick={() => { setShowForm(v => !v); setSaveResult(null); }}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {showForm ? "Cancel" : "Add League"}
            </Button>
          </div>
        </CardHeader>

        {/* Add league form */}
        {showForm && (
          <CardContent className="border-t border-border pt-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="swid">SWID <span className="text-destructive">*</span></Label>
                <Input
                  id="swid"
                  placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                  className={cn(errors.swid && "border-destructive")}
                  {...register("swid", { required: "SWID is required" })}
                />
                {errors.swid && (
                  <p className="text-xs text-destructive">{errors.swid.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="espnS2">espn_s2 <span className="text-destructive">*</span></Label>
                <Input
                  id="espnS2"
                  placeholder="AEB..."
                  className={cn(errors.espnS2 && "border-destructive")}
                  {...register("espnS2", { required: "espn_s2 is required" })}
                />
                {errors.espnS2 && (
                  <p className="text-xs text-destructive">{errors.espnS2.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="leagueId">
                  League ID{" "}
                  <span className="text-xs text-muted-foreground">(optional — uses default if blank)</span>
                </Label>
                <Input
                  id="leagueId"
                  placeholder="e.g. 1589110"
                  {...register("leagueId")}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="gap-2"
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saveMutation.isPending ? "Connecting…" : "Connect League"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setShowForm(false); reset(); setSaveResult(null); }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        )}

        {/* League list */}
        {leagues.length > 0 && (
          <CardContent className={cn("space-y-3", showForm && "border-t border-border pt-4")}>
            {leaguesQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading leagues…
              </div>
            )}
            {leagues.map((league) => {
              const isActive = activeQuery.data?.id === league.id;
              return (
                <div
                  key={league.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3",
                    isActive
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card"
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
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">ID: {league.leagueId}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <StatusBadge status={league.syncStatus} />
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
                    {removeMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      {/* Connection diagnostics */}
      <ConnectionDiagnostics />
    </div>
  );
}

function ConnectionDiagnostics() {
  const [enabled, setEnabled] = useState(false);
  const testQuery = trpc.espn.testFetch.useQuery(undefined, {
    enabled,
    retry: false,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Connection Diagnostics</CardTitle>
            <CardDescription>
              Verify that your saved credentials can reach ESPN's API.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (enabled) {
                void testQuery.refetch();
              } else {
                setEnabled(true);
              }
            }}
            disabled={testQuery.isFetching}
            className="gap-1.5"
          >
            {testQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            {testQuery.isFetching ? "Testing…" : "Test Connection"}
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
                  <div className="rounded border border-border bg-muted/30 px-3 py-2">
                    <span className="font-medium text-foreground">League ID</span>
                    <div className="mt-0.5 font-mono">{d.leagueId}</div>
                  </div>
                  <div className="rounded border border-border bg-muted/30 px-3 py-2">
                    <span className="font-medium text-foreground">Season</span>
                    <div className="mt-0.5 font-mono">{d.season}</div>
                  </div>
                  <div className="rounded border border-border bg-muted/30 px-3 py-2">
                    <span className="font-medium text-foreground">Cred source</span>
                    <div className="mt-0.5 font-mono">{d.credSource}</div>
                  </div>
                  <div className="rounded border border-border bg-muted/30 px-3 py-2">
                    <span className="font-medium text-foreground">SWID prefix</span>
                    <div className="mt-0.5 font-mono">{d.swidPrefix}</div>
                  </div>
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
