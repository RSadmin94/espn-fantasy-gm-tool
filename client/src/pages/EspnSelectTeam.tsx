import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function EspnSelectTeam() {
  const { leagueId = "" } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectionQ = trpc.league.getEspnTeamSelection.useQuery(
    { leagueId },
    { enabled: Boolean(leagueId) },
  );

  const selectMutation = trpc.league.selectEspnTeam.useMutation({
    onSuccess: (result) => {
      if (!result.success) {
        setActionError(result.error);
        return;
      }
      void utils.league.getConnectedLeagueManagement.invalidate();
      void utils.league.getMyLeagues.invalidate();
      void utils.me.activeProfile.invalidate();
      void utils.league.getActive.invalidate();
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => setActionError(err.message),
  });

  const data = selectionQ.data;
  const teams = data?.ok === true ? data.teams : [];
  const season = data?.ok === true ? data.season : null;
  const savedTeamId = data?.ok === true ? data.selectedTeamId : null;
  const isSetupComplete = data?.ok === true && data.isSetupComplete;

  const effectiveSelected = selectedTeamId ?? savedTeamId;

  function handleSave() {
    setActionError(null);
    if (effectiveSelected == null) {
      setActionError("Select a team before saving.");
      return;
    }
    selectMutation.mutate({
      leagueId,
      teamId: effectiveSelected,
      season: season ?? undefined,
    });
  }

  if (!leagueId) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <p className="text-sm text-destructive">Missing league ID.</p>
        <Button asChild variant="outline">
          <Link to="/connected-leagues">Back to Connected Leagues</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-10">
      <PageHeader
        title="Select your ESPN team"
        subtitle={`League ${leagueId}${season ? ` · ${season} season` : ""}`}
      />

      {selectionQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading teams…
        </div>
      )}

      {selectionQ.isError && (
        <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Could not load teams. Try again or sync your league first.
        </div>
      )}

      {data?.ok === false && !selectionQ.isLoading && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">
              {data.error === "no_teams_synced"
                ? "No teams found yet. Sync your ESPN league history, then return here to pick your team."
                : data.error === "connection_not_found"
                  ? "ESPN connection not found for this league."
                  : "Unable to load team selection."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link to="/sync">Sync data</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/connected-leagues">Connected Leagues</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isSetupComplete && savedTeamId != null && (
        <Card className="border-lime-500/30">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-lime-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Team already selected. Choose a different team below to update.
          </CardContent>
        </Card>
      )}

      {data?.ok === true && teams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Select your team</CardTitle>
            <CardDescription>Choose the franchise you manage in this league.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {teams.map((team) => (
              <label
                key={team.teamId}
                className="flex cursor-pointer items-start gap-3 rounded border border-border p-3 hover:bg-muted/40"
              >
                <input
                  type="radio"
                  name="espn-team"
                  className="mt-1"
                  checked={effectiveSelected === team.teamId}
                  onChange={() => setSelectedTeamId(team.teamId)}
                />
                <div className="text-sm">
                  <p className="font-medium">{team.teamName}</p>
                  <p className="text-muted-foreground">{team.ownerName}</p>
                  <p className="text-muted-foreground">Team ID: {team.teamId}</p>
                </div>
              </label>
            ))}
            <Button
              type="button"
              onClick={handleSave}
              disabled={effectiveSelected == null || selectMutation.isPending}
            >
              {selectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save selection"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {data?.ok === true && teams.length === 0 && !selectionQ.isLoading && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">
              No teams with owner identity were returned. Sync your league, then try again.
            </p>
            <Button asChild>
              <Link to="/sync">Go to Sync</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {actionError && (
        <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}
    </div>
  );
}
