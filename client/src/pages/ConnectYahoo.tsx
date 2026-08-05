import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertCircle, CheckCircle2, Loader2, Plug } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConnectedLeagueLimitBanner, useConnectedLeagueLimits } from "@/components/connect";
import {
  failureFromOAuthQueryParam,
  oauthSuccessFromQueryParam,
  sanitizeCustomerError,
  selectableYahooLeagues,
  selectedLeaguesInOrder,
  shouldLoadYahooLeagues,
  toggleLeagueSelection,
  YAHOO_CONNECT_MESSAGES,
  type YahooConnectFailure,
  type YahooDiscoverableLeague,
} from "@/lib/yahooConnectStates";

export type YahooImportedTeam = {
  teamId: number;
  ownerName: string;
  teamName: string;
};

const DEFAULT_SEASON = new Date().getFullYear();

export function ConnectYahoo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const utils = trpc.useUtils();
  const { atLimit } = useConnectedLeagueLimits();

  const oauthSuccess = oauthSuccessFromQueryParam(searchParams.get("yahoo_auth"));
  const oauthFailure = failureFromOAuthQueryParam(searchParams.get("yahoo_error"));

  const [failure, setFailure] = useState<YahooConnectFailure | null>(oauthFailure);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [importSteps, setImportSteps] = useState<string[]>([]);
  const [importedLeagueId, setImportedLeagueId] = useState<string | null>(null);
  const [importedTeams, setImportedTeams] = useState<YahooImportedTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const configuredQ = trpc.providers.isYahooConfigured.useQuery();
  const pendingQ = trpc.providers.getYahooPendingAuth.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const authUrlQ = trpc.providers.getYahooAuthUrl.useQuery(
    { origin: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000" },
    { enabled: configuredQ.data?.configured === true },
  );

  const discoveryEnabled = shouldLoadYahooLeagues({
    oauthSuccess,
    hasPendingAuth: Boolean(pendingQ.data?.hasPendingAuth),
  });

  const leaguesQ = trpc.providers.getYahooLeagues.useQuery(
    { season: DEFAULT_SEASON },
    {
      enabled: discoveryEnabled && pendingQ.isSuccess,
      retry: false,
    },
  );

  const myLeaguesQ = trpc.providers.getMyLeagues.useQuery();

  const selectTeamMutation = trpc.providers.selectYahooTeam.useMutation({
    onSuccess: async () => {
      setSaveMessage("Your Yahoo team is saved. Opening Connected Leagues…");
      await Promise.all([
        utils.providers.getMyLeagues.invalidate(),
        utils.league.getConnectedLeagueManagement.invalidate(),
        utils.league.getActive.invalidate(),
        utils.league.getConnectionLimits.invalidate(),
      ]);
    },
    onError: (err) => {
      setFailure({
        code: "team_select_failed",
        message: sanitizeCustomerError(err.message, YAHOO_CONNECT_MESSAGES.team_select_failed),
      });
    },
  });

  const leagues: YahooDiscoverableLeague[] = useMemo(
    () => selectableYahooLeagues(leaguesQ.data?.leagues),
    [leaguesQ.data?.leagues],
  );

  const selectedLeagues = useMemo(
    () => selectedLeaguesInOrder(leagues, selectedIds),
    [leagues, selectedIds],
  );

  // Clear OAuth query params after reading so refresh doesn't re-flash banners.
  useEffect(() => {
    if (!searchParams.get("yahoo_auth") && !searchParams.get("yahoo_error")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("yahoo_auth");
    next.delete("yahoo_error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (oauthFailure) setFailure(oauthFailure);
  }, [oauthFailure]);

  useEffect(() => {
    if (configuredQ.data && configuredQ.data.configured === false) {
      setFailure({
        code: "not_configured",
        message: YAHOO_CONNECT_MESSAGES.not_configured,
      });
    }
  }, [configuredQ.data]);

  useEffect(() => {
    if (!leaguesQ.data) return;
    if (leaguesQ.data.error === "no_leagues") {
      setFailure({
        code: "no_leagues",
        message: leaguesQ.data.message ?? YAHOO_CONNECT_MESSAGES.no_leagues,
      });
      return;
    }
    if (leaguesQ.data.error === "no_pending_auth") {
      setFailure({
        code: "no_pending_auth",
        message: leaguesQ.data.message ?? YAHOO_CONNECT_MESSAGES.no_pending_auth,
      });
      return;
    }
    if (leaguesQ.data.error === "discovery_failed") {
      setFailure({
        code: "discovery_failed",
        message: leaguesQ.data.message ?? YAHOO_CONNECT_MESSAGES.discovery_failed,
      });
    }
  }, [leaguesQ.data]);

  async function startOAuth() {
    setFailure(null);
    setSaveMessage(null);
    const url = authUrlQ.data?.url;
    if (!url) {
      setFailure({
        code: "not_configured",
        message: authUrlQ.data?.reason
          ? YAHOO_CONNECT_MESSAGES.not_configured
          : YAHOO_CONNECT_MESSAGES.not_configured,
      });
      return;
    }
    window.location.assign(url);
  }

  async function importSelected() {
    if (selectedLeagues.length === 0 || atLimit) return;
    setImporting(true);
    setFailure(null);
    setSaveMessage(null);
    setImportSteps([]);
    setImportedTeams([]);
    setImportedLeagueId(null);

    const stepsAcc: string[] = [];
    let lastTeams: YahooImportedTeam[] = [];
    let lastLeagueId: string | null = null;

    try {
      for (const league of selectedLeagues) {
        stepsAcc.push(`Importing ${league.name}…`);
        setImportSteps([...stepsAcc]);
        const seasonNum = Number(league.season) || DEFAULT_SEASON;
        const result = await utils.client.providers.importYahooLeague.mutate({
          leagueId: league.leagueId,
          leagueName: league.name,
          season: seasonNum,
        });
        if (!result.success) {
          throw new Error(YAHOO_CONNECT_MESSAGES.import_failed);
        }
        stepsAcc.push(...result.steps);
        setImportSteps([...stepsAcc]);
        lastLeagueId = result.league.leagueId;
        lastTeams = result.teams.map((t) => ({
          teamId: t.teamId,
          ownerName: t.ownerName,
          teamName: t.teamName,
        }));
      }

      await Promise.all([
        utils.providers.getMyLeagues.invalidate(),
        utils.league.getConnectedLeagueManagement.invalidate(),
        utils.league.getActive.invalidate(),
        utils.league.getConnectionLimits.invalidate(),
      ]);

      // Read-back: confirm at least the last imported Yahoo league is listed.
      const listed = await utils.providers.getMyLeagues.fetch();
      const found = listed?.some(
        (row) =>
          row.provider === "yahoo" &&
          lastLeagueId != null &&
          row.leagueId === lastLeagueId,
      );
      if (!found) {
        setFailure({
          code: "readback_failed",
          message: YAHOO_CONNECT_MESSAGES.readback_failed,
        });
      } else {
        setSaveMessage(
          selectedLeagues.length > 1
            ? `${selectedLeagues.length} Yahoo leagues imported. Select your team for the last league to finish setup.`
            : "Yahoo league imported. Select your team to finish setup.",
        );
      }

      setImportedLeagueId(lastLeagueId);
      setImportedTeams(lastTeams);
      setSelectedIds(new Set());
    } catch (err) {
      const message = sanitizeCustomerError(
        err instanceof Error ? err.message : null,
        YAHOO_CONNECT_MESSAGES.import_failed,
      );
      setFailure({ code: "import_failed", message });
    } finally {
      setImporting(false);
    }
  }

  function saveTeam() {
    if (!importedLeagueId || selectedTeamId == null) return;
    const team = importedTeams.find((t) => t.teamId === selectedTeamId);
    selectTeamMutation.mutate({
      leagueId: importedLeagueId,
      teamId: selectedTeamId,
      ownerName: team?.ownerName,
    });
  }

  const yahooConfigured = configuredQ.data?.configured === true;
  const yahooConfigKnown = configuredQ.data != null;
  const showDiscovery =
    yahooConfigured && discoveryEnabled && !failure?.code?.startsWith("oauth");

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-connect-provider="yahoo">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Connect Yahoo Fantasy</h1>
        <p className="mt-1 text-muted-foreground">
          Authorize Yahoo, pick one or more leagues, then import into Fantasy Football Rivals.
        </p>
      </div>

      <ConnectedLeagueLimitBanner />

      {failure && (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
          data-yahoo-failure={failure.code}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{failure.message}</span>
        </div>
      )}

      {saveMessage && (
        <div
          className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground"
          data-yahoo-success
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{saveMessage}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="h-5 w-5 text-primary" />
            Yahoo authorization
          </CardTitle>
          <CardDescription>
            Sign in with Yahoo to discover the Fantasy football leagues on your account. We never show
            access tokens in this app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!yahooConfigKnown || configuredQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking Yahoo availability…
            </div>
          ) : !yahooConfigured ? (
            <p className="text-sm text-muted-foreground" data-yahoo-auth="not_configured">
              Yahoo OAuth is not configured on this environment yet. Set{" "}
              <code className="text-xs">YAHOO_CLIENT_ID</code> and{" "}
              <code className="text-xs">YAHOO_CLIENT_SECRET</code>, and register the callback URL{" "}
              <code className="text-xs">/api/yahoo/oauth/callback</code> on your Yahoo developer app.
            </p>
          ) : pendingQ.data?.hasPendingAuth || oauthSuccess ? (
            <p className="text-sm text-muted-foreground" data-yahoo-auth="ready">
              Yahoo is authorized. Select leagues below to import.
            </p>
          ) : (
            <Button
              onClick={() => void startOAuth()}
              disabled={authUrlQ.isLoading || !authUrlQ.data?.url}
            >
              {authUrlQ.isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing Yahoo…
                </>
              ) : (
                "Connect Yahoo"
              )}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Already connected a league?{" "}
            <Link className="underline" to="/connected-leagues">
              Open Connected Leagues
            </Link>
          </p>
        </CardContent>
      </Card>

      {showDiscovery && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Yahoo leagues</CardTitle>
            <CardDescription>
              Select one or more leagues to import. Each import uses the shared league pipeline —
              same normalized data as ESPN and Sleeper.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {leaguesQ.isLoading || pendingQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Yahoo leagues…
              </div>
            ) : leagues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No selectable Yahoo leagues were returned for {DEFAULT_SEASON}.
              </p>
            ) : (
              <ul className="space-y-2" data-yahoo-league-list>
                {leagues.map((league) => {
                  const checked = selectedIds.has(league.leagueId);
                  return (
                    <li key={league.leagueKey || league.leagueId}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted/40">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() =>
                            setSelectedIds((prev) => toggleLeagueSelection(prev, league.leagueId))
                          }
                        />
                        <span>
                          <span className="block font-medium text-foreground">{league.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            Season {league.season} · {league.teamCount} teams · ID {league.leagueId}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <Button
              onClick={() => void importSelected()}
              disabled={
                importing || atLimit || selectedLeagues.length === 0 || leaguesQ.isLoading
              }
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : selectedLeagues.length > 1 ? (
                `Import ${selectedLeagues.length} leagues`
              ) : (
                "Import selected league"
              )}
            </Button>

            {importSteps.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                {importSteps.map((step, i) => (
                  <li key={`${i}-${step.slice(0, 24)}`}>{step}</li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      {importedTeams.length > 0 && importedLeagueId && (
        <Card data-yahoo-team-select>
          <CardHeader>
            <CardTitle className="text-lg">Select your team</CardTitle>
            <CardDescription>
              Choose the franchise you manage in this Yahoo league so Rivalries and Owner views focus
              on you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {importedTeams.map((team) => (
                <li key={team.teamId}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted/40">
                    <input
                      type="radio"
                      name="yahoo-team"
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
            <Button
              onClick={saveTeam}
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
            {myLeaguesQ.data?.some(
              (r) => r.provider === "yahoo" && r.leagueId === importedLeagueId,
            ) && (
              <Button asChild variant="secondary">
                <Link to="/connected-leagues">Go to Connected Leagues</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
