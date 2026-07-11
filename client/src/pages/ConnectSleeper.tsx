import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export type SleeperPreviewDetails = {
  leagueName: string;
  season: string;
  teamCount: number;
  provider: "Sleeper";
};

export type SleeperSavedSelection = {
  leagueId: string;
  teamId: number;
  ownerKey: string;
  ownerName: string;
  teamName: string | null;
};

export function leagueIdInputError(leagueId: string): string | null {
  const trimmed = leagueId.trim();
  if (!trimmed) return "Enter a Sleeper league ID";
  if (!/^\d+$/.test(trimmed)) return "League ID must be numeric";
  return null;
}

export function previewDetailsFromValidation(
  data: { valid: boolean; leagueName?: string; season?: string; teamCount?: number; error?: string } | undefined,
): SleeperPreviewDetails | null {
  if (!data?.valid || !data.leagueName || !data.season || data.teamCount == null) return null;
  return {
    leagueName: data.leagueName,
    season: data.season,
    teamCount: data.teamCount,
    provider: "Sleeper",
  };
}

export function previewErrorFromValidation(
  data: { valid: boolean; error?: string } | undefined,
  fetchError: string | null,
): string | null {
  if (fetchError) return fetchError;
  if (data && !data.valid) return data.error ?? "League not found";
  return null;
}

export function savedSelectionFromConnection(
  conn:
    | {
        leagueId: string | null;
        selectedTeamId: number | null;
        selectedOwnerKey: string | null;
        selectedOwnerName: string | null;
        selectedFranchiseName: string | null;
        provider: string;
      }
    | undefined,
): SleeperSavedSelection | null {
  if (
    !conn ||
    conn.provider !== "sleeper" ||
    !conn.leagueId ||
    conn.selectedTeamId == null ||
    !conn.selectedOwnerKey
  ) {
    return null;
  }
  return {
    leagueId: conn.leagueId,
    teamId: conn.selectedTeamId,
    ownerKey: conn.selectedOwnerKey,
    ownerName: conn.selectedOwnerName ?? "",
    teamName: conn.selectedFranchiseName,
  };
}

export function ConnectSleeper() {
  const [leagueId, setLeagueId] = useState("");
  const [previewLeagueId, setPreviewLeagueId] = useState<string | null>(null);
  const [importedTeams, setImportedTeams] = useState<
    Array<{
      teamId: number;
      ownerId: string | null;
      ownerKey: string | null;
      ownerName: string;
      teamName: string;
    }>
  >([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const myLeaguesQuery = trpc.providers.getMyLeagues.useQuery();

  const trimmedLeagueId = leagueId.trim();
  const inputError = leagueIdInputError(leagueId);

  const previewQuery = trpc.providers.validateSleeperLeague.useQuery(
    { leagueId: previewLeagueId ?? "" },
    { enabled: previewLeagueId != null },
  );

  const previewDetails = useMemo(
    () => previewDetailsFromValidation(previewQuery.data),
    [previewQuery.data],
  );
  const previewError = useMemo(
    () =>
      previewErrorFromValidation(
        previewQuery.data,
        previewQuery.isError ? previewQuery.error.message : null,
      ),
    [previewQuery.data, previewQuery.error, previewQuery.isError],
  );

  const savedConnection = useMemo(() => {
    if (!trimmedLeagueId) return null;
    const conn = myLeaguesQuery.data?.find(
      (row) => row.provider === "sleeper" && row.leagueId === trimmedLeagueId,
    );
    return savedSelectionFromConnection(conn);
  }, [myLeaguesQuery.data, trimmedLeagueId]);

  useEffect(() => {
    if (savedConnection) {
      setSelectedTeamId(savedConnection.teamId);
    }
  }, [savedConnection]);

  const importMutation = trpc.providers.importSleeperLeague.useMutation({
    onSuccess: (data) => {
      setActionError(null);
      setImportedTeams(data.teams);
      void utils.providers.getMyLeagues.invalidate();
    },
    onError: (err) => setActionError(err.message),
  });

  const selectMutation = trpc.providers.selectSleeperTeam.useMutation({
    onSuccess: () => {
      setActionError(null);
      setSaveMessage("Team selection saved.");
      void utils.providers.getMyLeagues.invalidate();
    },
    onError: (err) => setActionError(err.message),
  });

  function handlePreview() {
    setFormError(null);
    setActionError(null);
    setSaveMessage(null);
    const err = leagueIdInputError(leagueId);
    if (err) {
      setFormError(err);
      setPreviewLeagueId(null);
      return;
    }
    setPreviewLeagueId(trimmedLeagueId);
  }

  function handleImport() {
    setActionError(null);
    setSaveMessage(null);
    const err = leagueIdInputError(leagueId);
    if (err) {
      setFormError(err);
      return;
    }
    if (!previewDetails) {
      setActionError("Preview the league before importing.");
      return;
    }
    importMutation.mutate({ leagueId: trimmedLeagueId });
  }

  function handleSaveTeam() {
    setActionError(null);
    setSaveMessage(null);
    const team = importedTeams.find((t) => t.teamId === selectedTeamId);
    if (!team?.ownerId) {
      setActionError("Select a team before saving.");
      return;
    }
    selectMutation.mutate({
      leagueId: trimmedLeagueId,
      teamId: team.teamId,
      ownerId: team.ownerId,
      ownerName: team.ownerName,
    });
  }

  const showTeamPicker = importedTeams.length > 0;
  const canImport = previewDetails != null && !importMutation.isPending;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Connect Sleeper</h1>
        <p className="text-sm text-muted-foreground">
          Enter your Sleeper league ID to preview, import, and select your team.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>League ID</CardTitle>
          <CardDescription>Find it in your Sleeper league URL or settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sleeper-league-id">Sleeper league ID</Label>
            <Input
              id="sleeper-league-id"
              value={leagueId}
              onChange={(e) => {
                setLeagueId(e.target.value);
                setFormError(null);
                setActionError(null);
                setSaveMessage(null);
              }}
              placeholder="e.g. 123456789012345678"
            />
            {formError && (
              <p className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {formError}
              </p>
            )}
          </div>
          <Button type="button" onClick={handlePreview} disabled={previewQuery.isFetching}>
            {previewQuery.isFetching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Previewing…
              </>
            ) : (
              "Preview"
            )}
          </Button>
        </CardContent>
      </Card>

      {previewError && (
        <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {previewError}
        </div>
      )}

      {previewDetails && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">League:</span> {previewDetails.leagueName}
            </p>
            <p>
              <span className="text-muted-foreground">Season:</span> {previewDetails.season}
            </p>
            <p>
              <span className="text-muted-foreground">Teams:</span> {previewDetails.teamCount}
            </p>
            <p>
              <span className="text-muted-foreground">Provider:</span> {previewDetails.provider}
            </p>
            <Button type="button" onClick={handleImport} disabled={!canImport}>
              {importMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import league"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {savedConnection && !showTeamPicker && (
        <Card>
          <CardHeader>
            <CardTitle>Saved selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="flex items-center gap-2 text-lime-400">
              <CheckCircle2 className="h-4 w-4" />
              {savedConnection.ownerName}
              {savedConnection.teamName ? ` — ${savedConnection.teamName}` : ""}
            </p>
            <p className="text-muted-foreground">Roster ID: {savedConnection.teamId}</p>
            <p className="text-muted-foreground">Owner key: {savedConnection.ownerKey}</p>
          </CardContent>
        </Card>
      )}

      {showTeamPicker && (
        <Card>
          <CardHeader>
            <CardTitle>Select your team</CardTitle>
            <CardDescription>Choose the roster you manage in this league.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {importedTeams.map((team) => (
              <label
                key={team.teamId}
                className="flex cursor-pointer items-start gap-3 rounded border border-border p-3 hover:bg-muted/40"
              >
                <input
                  type="radio"
                  name="sleeper-team"
                  className="mt-1"
                  checked={selectedTeamId === team.teamId}
                  onChange={() => setSelectedTeamId(team.teamId)}
                />
                <div className="text-sm">
                  <p className="font-medium">{team.teamName}</p>
                  <p className="text-muted-foreground">{team.ownerName}</p>
                  <p className="text-muted-foreground">Roster ID: {team.teamId}</p>
                </div>
              </label>
            ))}
            <Button
              type="button"
              onClick={handleSaveTeam}
              disabled={selectedTeamId == null || selectMutation.isPending}
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

      {actionError && (
        <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {saveMessage && (
        <div className="flex items-center gap-2 rounded border border-lime-500/20 bg-lime-500/10 px-3 py-2 text-sm text-lime-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {saveMessage}
        </div>
      )}
    </div>
  );
}
