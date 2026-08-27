import { Link } from "react-router";
import { ChevronRight, FileSpreadsheet, Plug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONNECTED_LEAGUE_COPY } from "@/lib/commercialCopy";

const PROVIDERS = [
  {
    id: "espn",
    title: "ESPN",
    description: "Chrome extension or league ID — imports full ESPN history.",
    href: "/connect/espn",
    icon: Plug,
  },
  {
    id: "sleeper",
    title: "Sleeper API",
    description: "Live Sleeper league ID — pulls current season and linked history.",
    href: "/connect/sleeper",
    icon: Plug,
  },
  {
    id: "workbook",
    title: "Sleeper Workbook",
    description: "Upload the official Sleeper Data Import workbook (.xlsx).",
    href: "/import/sleeper-workbook",
    icon: FileSpreadsheet,
  },
  {
    id: "yahoo",
    title: "Yahoo Fantasy",
    description: "Authorize Yahoo OAuth — discover and import your Yahoo leagues.",
    href: "/connect/yahoo",
    icon: Plug,
  },
] as const;

export function ProviderConnectCards({ atLimit }: { atLimit?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Choose a provider</CardTitle>
        <CardDescription>
          {CONNECTED_LEAGUE_COPY.providerIntro}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PROVIDERS.map((p) => {
          const Icon = p.icon;
          const body = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{p.title}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.description}</p>
            </>
          );
          if (atLimit) {
            return (
              <div
                key={p.id}
                className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 opacity-60"
                aria-disabled
              >
                {body}
              </div>
            );
          }
          return (
            <Link
              key={p.id}
              to={p.href}
              className="rounded-lg border border-border bg-card px-4 py-3 transition hover:border-primary/40 hover:bg-primary/5"
            >
              <Icon className="mb-2 h-4 w-4 text-primary" />
              {body}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
