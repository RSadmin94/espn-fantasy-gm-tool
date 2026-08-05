import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { ConnectedLeagueLimitBanner, useConnectedLeagueLimits } from "@/components/connect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";

type WorkbookTeam = {
  teamId: number;
  ownerId: string | null;
  ownerKey: string | null;
  ownerName: string;
  teamName: string;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

export function ImportSleeperWorkbook() {
  const utils = trpc.useUtils();
  const { atLimit } = useConnectedLeagueLimits();
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [importedLeagueId, setImportedLeagueId] = useState<string | null>(null);
  const [importedTeams, setImportedTeams] = useState<WorkbookTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const previewMutation = trpc.providers.previewSleeperWorkbook.useMutation({
    onError: (err) => setActionError(err.message),
  });

  const importMutation = trpc.providers.importSleeperWorkbook.useMutation({
    onSuccess: async (data) => {
      setActionError(null);
      setSaveMessage(
        data.success
          ? "Workbook imported. Select your team to finish setup."
          : "Workbook import finished with errors.",
      );
      setImportedLeagueId(data.league.leagueId);
      setImportedTeams(data.teams ?? []);
      setSelectedTeamId(null);
      await Promise.all([
        utils.providers.getMyLeagues.invalidate(),
        utils.league.getConnectedLeagueManagement.invalidate(),
        utils.league.getActive.invalidate(),
        utils.league.getConnectionLimits.invalidate(),
      ]);
    },
    onError: (err) => setActionError(err.message),
  });

  const selectTeamMutation = trpc.providers.selectSleeperWorkbookTeam.useMutation({
    onSuccess: async () => {
      setSaveMessage("Your team is saved. Opening Connected Leagues…");
      await Promise.all([
        utils.providers.getMyLeagues.invalidate(),
        utils.league.getConnectedLeagueManagement.invalidate(),
        utils.league.getActive.invalidate(),
        utils.league.getConnectionLimits.invalidate(),
      ]);
    },
    onError: (err) => setActionError(err.message),
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setActionError(null);
    setSaveMessage(null);
    setImportedLeagueId(null);
    setImportedTeams([]);
    setSelectedTeamId(null);
    previewMutation.reset();
    importMutation.reset();

    const file = event.target.files?.[0];
    if (!file) {
      setFileName(null);
      setFileBase64(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setActionError("Upload a .xlsx Sleeper Data Import workbook.");
      return;
    }
    const encoded = await readFileAsBase64(file);
    setFileName(file.name);
    setFileBase64(encoded);
  }

  function handleValidate() {
    if (!fileBase64) {
      setActionError("Choose a workbook file first.");
      return;
    }
    setActionError(null);
    setSaveMessage(null);
    previewMutation.mutate({ fileBase64 });
  }

  function handleImport() {
    if (!fileBase64) {
      setActionError("Choose a workbook file first.");
      return;
    }
    if (!previewMutation.data?.valid) {
      setActionError("Validate the workbook before importing.");
      return;
    }
    setActionError(null);
    setSaveMessage(null);
    importMutation.mutate({ fileBase64 });
  }

  function handleSaveTeam() {
    if (!importedLeagueId || selectedTeamId == null) return;
    const team = importedTeams.find((t) => t.teamId === selectedTeamId);
    selectTeamMutation.mutate({
      leagueId: importedLeagueId,
      teamId: selectedTeamId,
      ownerName: team?.ownerName,
    });
  }

  const preview = previewMutation.data;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6" data-connect-provider="sleeper_workbook">
      <div>
        <h1 className="text-2xl font-semibold">Import Sleeper Workbook</h1>
        <p className="text-sm text-muted-foreground">
          Upload a Sleeper Data Import v8.xlsx export to normalize and import league history.
        </p>
      </div>

      <ConnectedLeagueLimitBanner />

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>Official Sleeper Data Import v8.xlsx only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sleeper-workbook-file">Workbook file</Label>
            <input
              id="sleeper-workbook-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void handleFileChange(e)}
              className="block w-full text-sm"
            />
            {fileName && <p className="text-sm text-muted-foreground">Selected: {fileName}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleValidate} disabled={!fileBase64 || previewMutation.isPending}>
              {previewMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating…
                </>
              ) : (
                "Validate"
              )}
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={!preview?.valid || importMutation.isPending || atLimit}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!preview.valid && (
              <p className="flex items-center gap-2 text-red-400">
                <AlertCircle className="h-4 w-4" />
                Workbook validation failed
              </p>
            )}
            {preview.valid && (
              <p className="flex items-center gap-2 text-lime-400">
                <CheckCircle2 className="h-4 w-4" />
                Workbook valid (v{preview.version})
              </p>
            )}
            <p>
              <span className="text-muted-foreground">League:</span> {preview.leagueName || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Season:</span> {preview.season || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Teams:</span> {preview.teamCount}
            </p>
            <p>
              <span className="text-muted-foreground">Owners:</span> {preview.ownerCount}
            </p>
            <p>
              <span className="text-muted-foreground">Draft picks:</span> {preview.draftPickCount}
            </p>
            <p>
              <span className="text-muted-foreground">Matchups:</span> {preview.matchupCount}
            </p>
            <p>
              <span className="text-muted-foreground">Transactions:</span> {preview.transactionCount}
            </p>
            {preview.warnings.length > 0 && (
              <div className="pt-2">
                <p className="font-medium">Warnings</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {preview.warnings.slice(0, 8).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.errors.length > 0 && (
              <div className="pt-2">
                <p className="font-medium text-red-300">Errors</p>
                <ul className="list-disc pl-5 text-red-300">
                  {preview.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {importedTeams.length > 0 && importedLeagueId && (
        <Card data-workbook-team-select>
          <CardHeader>
            <CardTitle>Select your team</CardTitle>
            <CardDescription>
              Choose the franchise you manage so Rivalries and Owner views focus on you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {importedTeams.map((team) => (
                <li key={team.teamId}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted/40">
                    <input
                      type="radio"
                      name="workbook-team"
                      checked={selectedTeamId === team.teamId}
                      onChange={() => setSelectedTeamId(team.teamId)}
                    />
                    <span>
                      <span className="font-medium">{team.teamName}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{team.ownerName}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSaveTeam}
                disabled={selectedTeamId == null || selectTeamMutation.isPending}
              >
                {selectTeamMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save my team"
                )}
              </Button>
              <Button asChild variant="secondary">
                <Link to="/connected-leagues">Connected Leagues</Link>
              </Button>
            </div>
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
