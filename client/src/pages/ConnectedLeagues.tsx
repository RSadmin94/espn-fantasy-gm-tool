import { useState } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  Clock,
  Loader2,
  Pencil,
  Plug,
  RefreshCw,
  Trash2,
  Trophy,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CONNECTED_LEAGUE_COPY } from "@/lib/commercialCopy";
import { ConnectedLeagueLimitBanner } from "@/components/connect/ConnectedLeagueLimitBanner";
import { ProviderConnectCards } from "@/components/connect/ProviderConnectCards";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function providerLabel(provider: string): string {
  if (provider === "espn") return "ESPN";
  if (provider === "sleeper") return "Sleeper API";
  if (provider === "sleeper_workbook") return "Sleeper Workbook";
  return provider;
}

function seasonRange(start: number | null, end: number | null, count: number): string {
  if (start == null || end == null) return "—";
  if (count <= 1) return String(start);
  return `${start}–${end} (${count} seasons)`;
}

export function ConnectedLeagues() {
  const utils = trpc.useUtils();
  const mgmtQ = trpc.league.getConnectedLeagueManagement.useQuery();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const disconnectMutation = trpc.league.disconnectConnectedLeague.useMutation({
    onSuccess: () => {
      setConfirmKey(null);
      void utils.league.getConnectedLeagueManagement.invalidate();
      void utils.league.getConnectionLimits.invalidate();
      void utils.league.getMyLeagues.invalidate();
      void utils.league.getActive.invalidate();
    },
  });

  const renameMutation = trpc.league.renameConnectedLeagueNickname.useMutation({
    onSuccess: () => {
      setEditingKey(null);
      void utils.league.getConnectedLeagueManagement.invalidate();
      void utils.league.getMyLeagues.invalidate();
    },
  });

  const clearNameMutation = trpc.league.clearConnectedLeagueDisplayName.useMutation({
    onSuccess: () => {
      setEditingKey(null);
      void utils.league.getConnectedLeagueManagement.invalidate();
      void utils.league.getMyLeagues.invalidate();
    },
  });

  const usage = mgmtQ.data?.usage;
  const leagues = mgmtQ.data?.leagues ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <PageHeader
        title="Connected Leagues"
        subtitle={CONNECTED_LEAGUE_COPY.pageDescription}
      />

      <ConnectedLeagueLimitBanner />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" />
            League slots
          </CardTitle>
          <CardDescription>
            {usage
              ? `${usage.used} of ${usage.max} connected leagues · unlimited historical seasons per league`
              : "Loading account limits…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usage && (
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  usage.atLimit ? "bg-amber-500" : "bg-lime-500",
                )}
                style={{ width: `${Math.min(100, (usage.used / usage.max) * 100)}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {mgmtQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading connected leagues…
        </div>
      )}

      {!mgmtQ.isLoading && leagues.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <Plug className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No leagues connected yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect ESPN, Sleeper, or upload a Sleeper workbook to import your league history.
              </p>
            </div>
            <Button asChild>
              <Link to="/connect">Connect a league</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {leagues.map((league) => {
        const isEditing = editingKey === league.key;
        const isConfirming = confirmKey === league.key;
        return (
          <Card key={league.key} className={league.isActive ? "border-primary/30" : undefined}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          renameMutation.mutate({
                            provider: league.provider,
                            leagueId: league.leagueId,
                            displayName: draftName,
                          });
                        }}
                      >
                        <Input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          className="h-8 max-w-[240px]"
                          autoFocus
                        />
                        <Button type="submit" size="sm" disabled={renameMutation.isPending || !draftName.trim()}>
                          Save
                        </Button>
                        {league.customDisplayName && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={clearNameMutation.isPending}
                            onClick={() =>
                              clearNameMutation.mutate({
                                provider: league.provider,
                                leagueId: league.leagueId,
                              })
                            }
                          >
                            Reset name
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingKey(null)}>
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <>
                        <span className="font-semibold text-foreground">{league.displayName}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingKey(league.key);
                            setDraftName(league.customDisplayName ?? league.canonicalName);
                          }}
                          aria-label="Rename league"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {league.isActive && (
                      <Badge variant="outline" className="border-primary/30 text-primary">
                        Active
                      </Badge>
                    )}
                    {!league.isSetupComplete && (
                      <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                        Team not selected
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {providerLabel(league.provider)} · ID {league.leagueId}
                  </p>
                  {league.customDisplayName && !isEditing && (
                    <p className="text-xs text-muted-foreground">
                      Imported name: {league.canonicalName}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Seasons: {seasonRange(league.seasonStart, league.seasonEnd, league.seasonCount)}
                  </p>
                  {league.lastSyncedAt && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Last sync {new Date(league.lastSyncedAt).toLocaleString()}
                      {league.syncStatus ? ` · ${league.syncStatus}` : ""}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {league.provider === "espn" && (
                    <Button asChild size="sm" variant="outline" className="gap-1.5">
                      <Link to="/sync">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sync
                      </Link>
                    </Button>
                  )}
                  {!league.isSetupComplete && (
                    <Button asChild size="sm" variant="secondary">
                      <Link
                        to={
                          league.provider === "sleeper"
                            ? "/connect/sleeper"
                            : `/select-team/espn/${league.leagueId}`
                        }
                      >
                        Select my team
                      </Link>
                    </Button>
                  )}
                  {isConfirming ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={disconnectMutation.isPending}
                        onClick={() =>
                          disconnectMutation.mutate({
                            provider: league.provider,
                            leagueId: league.leagueId,
                          })
                        }
                      >
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmKey(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => setConfirmKey(league.key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <ProviderConnectCards atLimit={usage?.atLimit} />

      {!usage?.atLimit && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {CONNECTED_LEAGUE_COPY.seasonNote}
        </p>
      )}
    </div>
  );
}
