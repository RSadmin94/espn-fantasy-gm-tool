import { Link } from "react-router";
import { Plug } from "lucide-react";
import type { LeagueProviderKind } from "@/lib/leagueProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SyncDataNonEspnNoticeProps = {
  provider: Exclude<LeagueProviderKind, "espn">;
};

/**
 * Non-ESPN Sync Data surface — no ESPN Connector, no espn.* queries, no GMWR messages.
 */
export function SyncDataNonEspnNotice({ provider }: SyncDataNonEspnNoticeProps) {
  if (provider === "sleeper") {
    return (
      <div className="mx-auto max-w-3xl space-y-6" data-sync-provider="sleeper">
        <div>
          <h1 className="text-3xl font-bold text-foreground">League Synchronization Center</h1>
          <p className="mt-1 text-muted-foreground">
            This league is connected through Sleeper.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              Sleeper API
            </CardTitle>
            <CardDescription>
              ESPN sync tools do not apply to Sleeper leagues. Reconnect or re-import from the Sleeper
              connect flow if you need to refresh this league.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/connect/sleeper">Open Sleeper connect</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (provider === "sleeper_workbook") {
    return (
      <div className="mx-auto max-w-3xl space-y-6" data-sync-provider="sleeper_workbook">
        <div>
          <h1 className="text-3xl font-bold text-foreground">League Synchronization Center</h1>
          <p className="mt-1 text-muted-foreground">
            This league was imported from a Sleeper workbook.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              Sleeper workbook import
            </CardTitle>
            <CardDescription>
              ESPN sync tools do not apply to workbook imports. Upload a new workbook export to refresh
              this league&apos;s history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/import/sleeper-workbook">Open workbook import</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (provider === "yahoo") {
    return (
      <div className="mx-auto max-w-3xl space-y-6" data-sync-provider="yahoo">
        <div>
          <h1 className="text-3xl font-bold text-foreground">League Synchronization Center</h1>
          <p className="mt-1 text-muted-foreground">
            This league is connected through Yahoo Fantasy.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              Yahoo Fantasy
            </CardTitle>
            <CardDescription>
              ESPN sync tools do not apply to Yahoo leagues. Re-authorize and re-import from the Yahoo
              connect flow if you need to refresh this league. Continuous Yahoo sync is not available
              yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/connect/yahoo">Open Yahoo connect</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-sync-provider="unknown">
      <div>
        <h1 className="text-3xl font-bold text-foreground">League Synchronization Center</h1>
        <p className="mt-1 text-muted-foreground">
          Sync Data is not available for this league source.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Unsupported sync source</CardTitle>
          <CardDescription>
            This active league is not recognized as ESPN. Use Connected Leagues to confirm the source, or
            connect via ESPN, Sleeper, or workbook import.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/connected-leagues">Connected Leagues</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/connect">Connect ESPN</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
