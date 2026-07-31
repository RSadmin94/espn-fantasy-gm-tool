import { useState } from "react";
import { useForm } from "react-hook-form";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Escape hatches for support: connect by League ID, paste cookies by hand, probe the saved
 * credentials. None of this belongs in onboarding, so it stays collapsed and out of the way.
 */

interface ConnectFormValues {
  swid: string;
  espnS2: string;
  leagueId: string;
}

function LeagueIdConnect() {
  const [leagueId, setLeagueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const connectMutation = (trpc as any).league.connectByLeagueId.useMutation({
    onSuccess: (data: any) => {
      setError(null);
      setLeagueId("");
      setConnected(data?.leagueName || `League ${data?.leagueConnectionId ?? ""}`);
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
      void utils.league.getConnectionLimits.invalidate();
    },
    onError: (err: any) => setError(err.message),
  });

  function submit() {
    const id = leagueId.trim();
    if (!id || Number.isNaN(Number(id))) {
      setError("Enter a numeric League ID.");
      return;
    }
    setError(null);
    connectMutation.mutate({ leagueId: id });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">Connect by League ID</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Public leagues only. Private league data still needs the Connector.
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {connected && (
        <p className="flex items-center gap-2 text-xs text-lime-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Connected {connected}
        </p>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="League ID"
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="font-mono text-sm"
          inputMode="numeric"
          maxLength={12}
        />
        <Button
          onClick={submit}
          disabled={connectMutation.isPending}
          variant="outline"
          className="shrink-0"
        >
          {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
        </Button>
      </div>
    </div>
  );
}

function ManualCredentials() {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConnectFormValues>({ defaultValues: { swid: "", espnS2: "", leagueId: "" } });

  const utils = trpc.useUtils();
  const saveMutation = trpc.espn.saveCredentials.useMutation({
    onSuccess: () => {
      reset();
      setSaveError(null);
      setSaved(true);
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
    },
    onError: (err) => setSaveError(err.message),
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">Enter credentials manually</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          From your browser's cookies for espn.com.
        </p>
      </div>

      {saveError && (
        <p className="flex items-start gap-2 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {saveError}
        </p>
      )}
      {saved && (
        <p className="flex items-center gap-2 text-xs text-lime-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Saved
        </p>
      )}

      <form
        onSubmit={handleSubmit((v) => {
          setSaved(false);
          setSaveError(null);
          saveMutation.mutate({
            swid: v.swid.trim(),
            espnS2: v.espnS2.trim(),
            leagueId: v.leagueId.trim() || undefined,
          });
        })}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="swid" className="text-xs">
            SWID
          </Label>
          <Input
            id="swid"
            placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
            className={cn("text-sm", errors.swid && "border-destructive")}
            {...register("swid", { required: "SWID is required" })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="espnS2" className="text-xs">
            espn_s2
          </Label>
          <Input
            id="espnS2"
            className={cn("text-sm", errors.espnS2 && "border-destructive")}
            {...register("espnS2", { required: "espn_s2 is required" })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manualLeagueId" className="text-xs">
            League ID <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="manualLeagueId" className="text-sm" {...register("leagueId")} />
        </div>

        <Button type="submit" disabled={saveMutation.isPending} size="sm" variant="outline">
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}

function ConnectionDiagnostics() {
  const [enabled, setEnabled] = useState(false);
  const testQuery = trpc.espn.testFetch.useQuery(undefined, { enabled, retry: false });
  const d = testQuery.data;
  const ok = Boolean(d?.isValidJson && d?.httpStatus === 200);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Test the saved connection</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Checks that the stored session can still reach ESPN.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => (enabled ? void testQuery.refetch() : setEnabled(true))}
          disabled={testQuery.isFetching}
          className="shrink-0 gap-1.5 text-xs"
        >
          {testQuery.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wifi className="h-3.5 w-3.5" />
          )}
          Test
        </Button>
      </div>

      {d && (
        <p
          className={cn(
            "flex items-center gap-2 text-xs",
            ok ? "text-lime-300" : "text-red-300",
          )}
        >
          {ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
          )}
          {ok
            ? `Reached ${d.leagueName || `league ${d.leagueId}`} (${d.credSource})`
            : d.error || `HTTP ${d.httpStatus}`}
        </p>
      )}

      {testQuery.isError && (
        <p className="flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {testQuery.error.message}
        </p>
      )}
    </div>
  );
}

export function AdvancedConnectPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors hover:bg-accent/20"
      >
        <span className="text-xs font-medium text-muted-foreground">Advanced</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-6 border-t border-border/50 px-4 py-5">
          <LeagueIdConnect />
          <div className="border-t border-border/40 pt-6">
            <ManualCredentials />
          </div>
          <div className="border-t border-border/40 pt-6">
            <ConnectionDiagnostics />
          </div>
        </div>
      )}
    </div>
  );
}
