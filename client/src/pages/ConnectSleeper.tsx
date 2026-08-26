import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
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
import { ConnectedLeagueLimitBanner, useConnectedLeagueLimits } from "@/components/connect";

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

export type ImportedTeam = {
  teamId: number;
  ownerId: string | null;
  ownerKey: string | null;
  ownerName: string;
  teamName: string;
  resolutionStatus?: string;
  suggestedOwnerKey?: string | null;
  suggestedOwnerName?: string | null;
  suggestionReason?: string | null;
  selectable?: boolean;
};

export type OwnerResolutionRow = {
  season: number;
  teamId: number;
  teamName: string;
  status: string;
  ownerKey: string | null;
  ownerName: string | null;
  suggestedOwnerKey: string | null;
  suggestedOwnerName: string | null;
  suggestionReason: string | null;
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

export function ownerResolutionStatusLabel(status: string): string {
  switch (status) {
    case "verified":
      return "Verified by Sleeper";
    case "manual":
      return "Manually assigned";
    case "suggested":
      return "Suggested — needs confirmation";
    case "unresolved":
      return "Unresolved";
    default:
      return status;
  }
}

export function ConnectSleeper() {
  const navigate = useNavigate();
  const [leagueId, setLeagueId] = useState("");
  const [previewLeagueId, setPreviewLeagueId] = useState<string | null>(null);
  const [importedTeams, setImportedTeams] = useState<ImportedTeam[]>([]);
  const [ownerSummary, setOwnerSummary] = useState<{
    verified: number;
    suggested: number;
    unresolved: number;
    manual: number;
  } | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [correctingTeamId, setCorrectingTeamId] = useState<number | null>(null);
  const [correctingSeason, setCorrectingSeason] = useState<number | null>(null);
  const [chosenOwnerKey, setChosenOwnerKey] = useState("");
  const [historicalOwnerName, setHistoricalOwnerName] = useState("");

  const utils = trpc.useUtils();
  const { atLimit } = useConnectedLeagueLimits();
  const myLeaguesQuery = trpc.providers.getMyLeagues.useQuery();

  const trimmedLeagueId = leagueId.trim();
  const inputError = leagueIdInputError(leagueId);

  const previewQuery = trpc.providers.validateSleeperLeague.useQuery(
    { leagueId: previewLeagueId ?? "" },
    { enabled: previewLeagueId != null },
  );

  const resolutionsQuery = trpc.providers.listSleeperOwnerResolutions.useQuery(
    { leagueId: trimmedLeagueId },
    { enabled: trimmedLeagueId.length > 0 && importedTeams.length > 0 },
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

  const attentionRows = useMemo(() => {
    const rows = resolutionsQuery.data?.resolutions ?? [];
    return rows.filter(
      (r) => r.status === "suggested" || r.status === "unresolved" || r.status === "manual",
    );
  }, [resolutionsQuery.data?.resolutions]);

  const knownOwners = resolutionsQuery.data?.knownOwners ?? [];

  useEffect(() => {
    if (savedConnection) {
      setSelectedTeamId(savedConnection.teamId);
    }
  }, [savedConnection]);

  const importMutation = trpc.providers.importSleeperLeague.useMutation({
    onSuccess: (data) => {
      setActionError(null);
      setImportedTeams(data.teams);
      setOwnerSummary(data.ownerResolutionSummary);
      void utils.providers.getMyLeagues.invalidate();
      void utils.providers.listSleeperOwnerResolutions.invalidate({ leagueId: trimmedLeagueId });
    },
    onError: (err) => setActionError(err.message),
  });

  const selectMutation = trpc.providers.selectSleeperTeam.useMutation({
    onSuccess: () => {
      setActionError(null);
      setSaveMessage("Team selection saved.");
      void utils.providers.getMyLeagues.invalidate();
      void utils.me.activeProfile.invalidate();
      void utils.league.getConnectionLimits.invalidate();
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => setActionError(err.message),
  });

  const confirmMutation = trpc.providers.confirmSleeperOwnerSuggestion.useMutation({
    onSuccess: () => {
      setActionError(null);
      setSaveMessage("Owner suggestion confirmed.");
      void utils.providers.listSleeperOwnerResolutions.invalidate({ leagueId: trimmedLeagueId });
      void importMutation.mutate({ leagueId: trimmedLeagueId });
    },
    onError: (err) => setActionError(err.message),
  });

  const setOverrideMutation = trpc.providers.setSleeperOwnerOverride.useMutation({
    onSuccess: () => {
      setActionError(null);
      setSaveMessage("Owner assignment saved.");
      setCorrectingTeamId(null);
      setCorrectingSeason(null);
      setChosenOwnerKey("");
      setHistoricalOwnerName("");
      void utils.providers.listSleeperOwnerResolutions.invalidate({ leagueId: trimmedLeagueId });
      void importMutation.mutate({ leagueId: trimmedLeagueId });
    },
    onError: (err) => setActionError(err.message),
  });

  const removeOverrideMutation = trpc.providers.removeSleeperOwnerOverride.useMutation({
    onSuccess: () => {
      setActionError(null);
      setSaveMessage("Manual override removed.");
      void utils.providers.listSleeperOwnerResolutions.invalidate({ leagueId: trimmedLeagueId });
      void importMutation.mutate({ leagueId: trimmedLeagueId });
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
    if (!team?.selectable || !team.ownerKey) {
      setActionError("Select a team with a verified or confirmed owner before saving.");
      return;
    }
    selectMutation.mutate({
      leagueId: trimmedLeagueId,
      teamId: team.teamId,
      ownerKey: team.ownerKey,
      ownerId: team.ownerId ?? undefined,
      ownerName: team.ownerName,
    });
  }

  function startCorrection(row: OwnerResolutionRow) {
    setCorrectingTeamId(row.teamId);
    setCorrectingSeason(row.season);
    setChosenOwnerKey(row.ownerKey ?? row.suggestedOwnerKey ?? "");
    setHistoricalOwnerName(row.ownerName ?? row.suggestedOwnerName ?? "");
  }

  function submitCorrection() {
    if (correctingTeamId == null || correctingSeason == null) return;
    const known = knownOwners.find((o) => o.ownerKey === chosenOwnerKey);
    const ownerName = known?.ownerName || historicalOwnerName.trim();
    if (!ownerName) {
      setActionError("Enter an owner name.");
      return;
    }
    setOverrideMutation.mutate({
      leagueId: trimmedLeagueId,
      season: correctingSeason,
      teamId: correctingTeamId,
      ownerKey: chosenOwnerKey || undefined,
      ownerName,
    });
  }

  const showTeamPicker = importedTeams.length > 0;
  const canImport = previewDetails != null && !importMutation.isPending && !atLimit;
  const selectableTeams = importedTeams.filter((t) => t.selectable !== false);

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Connect Sleeper</h1>
        <p className="text-sm text-muted-foreground">
          Enter the league number from your Sleeper league. We'll find it and connect it — no browser add-on required.
        </p>
      </div>

      <ConnectedLeagueLimitBanner />

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

      {ownerSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Owner resolution</CardTitle>
            <CardDescription>Summary across all imported seasons.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              Verified: {ownerSummary.verified} · Suggested: {ownerSummary.suggested} · Unresolved:{" "}
              {ownerSummary.unresolved} · Manual: {ownerSummary.manual}
            </p>
          </CardContent>
        </Card>
      )}

      {attentionRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Owners needing attention</CardTitle>
            <CardDescription>
              Confirm suggestions or assign owners for historical teams.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {attentionRows.map((row) => (
              <div key={`${row.season}-${row.teamId}`} className="rounded border border-border p-3 text-sm">
                <p className="font-medium">
                  {row.season} — {row.teamName}
                </p>
                <p className="text-muted-foreground">Roster ID: {row.teamId}</p>
                <p>
                  Owner:{" "}
                  {row.status === "unresolved"
                    ? "Unresolved"
                    : row.ownerName ?? row.suggestedOwnerName ?? "—"}
                </p>
                <p className="text-muted-foreground">{ownerResolutionStatusLabel(row.status)}</p>
                {row.status === "suggested" && row.suggestedOwnerName && (
                  <p className="mt-1 text-muted-foreground">
                    Suggested: {row.suggestedOwnerName}
                    {row.suggestionReason ? ` — ${row.suggestionReason}` : ""}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.status === "suggested" && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={confirmMutation.isPending}
                      onClick={() =>
                        confirmMutation.mutate({
                          leagueId: trimmedLeagueId,
                          season: row.season,
                          teamId: row.teamId,
                        })
                      }
                    >
                      Confirm
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startCorrection(row)}
                  >
                    {row.status === "suggested" ? "Choose different owner" : "Correct"}
                  </Button>
                  {row.status === "manual" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={removeOverrideMutation.isPending}
                      onClick={() =>
                        removeOverrideMutation.mutate({
                          leagueId: trimmedLeagueId,
                          season: row.season,
                          teamId: row.teamId,
                        })
                      }
                    >
                      Remove override
                    </Button>
                  )}
                </div>
                {correctingTeamId === row.teamId && correctingSeason === row.season && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <Label htmlFor={`owner-select-${row.teamId}`}>Known owner</Label>
                    <select
                      id={`owner-select-${row.teamId}`}
                      className="w-full rounded border border-border bg-background px-2 py-1"
                      value={chosenOwnerKey}
                      onChange={(e) => setChosenOwnerKey(e.target.value)}
                    >
                      <option value="">— Historical / new name —</option>
                      {knownOwners.map((o) => (
                        <option key={o.ownerKey} value={o.ownerKey}>
                          {o.ownerName}
                        </option>
                      ))}
                    </select>
                    {!chosenOwnerKey && (
                      <>
                        <Label htmlFor={`historical-name-${row.teamId}`}>Historical owner name</Label>
                        <Input
                          id={`historical-name-${row.teamId}`}
                          value={historicalOwnerName}
                          onChange={(e) => setHistoricalOwnerName(e.target.value)}
                          placeholder="Name for a former league member"
                        />
                      </>
                    )}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={submitCorrection}>
                        Save assignment
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCorrectingTeamId(null);
                          setCorrectingSeason(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
            <CardDescription>
              Only teams with verified or confirmed owners can be selected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectableTeams.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No selectable teams yet. Resolve owners above, then re-import.
              </p>
            )}
            {selectableTeams.map((team) => (
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
                  {team.resolutionStatus && (
                    <p className="text-muted-foreground">
                      {ownerResolutionStatusLabel(team.resolutionStatus)}
                    </p>
                  )}
                </div>
              </label>
            ))}
            <Button
              type="button"
              onClick={handleSaveTeam}
              disabled={selectedTeamId == null || selectMutation.isPending || selectableTeams.length === 0}
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
