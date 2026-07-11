import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type SofiaEmptyVariant = "setup_incomplete" | "no_active_league" | "no_commentary" | "no_season";

const COPY: Record<
  SofiaEmptyVariant,
  { title: string; body: string; ctaLabel: string; ctaHref: string }
> = {
  setup_incomplete: {
    title: "Finish league setup",
    body: "Finish setting up your league to unlock Sofia's draft commentary.",
    ctaLabel: "Manage Connected Leagues",
    ctaHref: "/connected-leagues",
  },
  no_active_league: {
    title: "Connect a league",
    body: "Connect and activate a league to hear Sofia's take on your mock draft picks.",
    ctaLabel: "Manage Connected Leagues",
    ctaHref: "/connected-leagues",
  },
  no_commentary: {
    title: "No commentary yet",
    body: "No draft commentary is available yet. Run a draft simulation to generate Sofia commentary.",
    ctaLabel: "Open Draft War Room",
    ctaHref: "/draft-war-room",
  },
  no_season: {
    title: "No commentary for this season",
    body: "There is no draft commentary for the selected season. Run a mock draft in Draft War Room first.",
    ctaLabel: "Open Draft War Room",
    ctaHref: "/draft-war-room",
  },
};

export const SOFIA_EMPTY_COPY = COPY;

type SofiaEmptyStateProps = {
  variant: SofiaEmptyVariant;
};

export function SofiaEmptyState({ variant }: SofiaEmptyStateProps) {
  const copy = COPY[variant];
  return (
    <Card>
      <CardContent className="space-y-4 py-8 text-center">
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{copy.body}</p>
        <Button asChild>
          <Link to={copy.ctaHref}>{copy.ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
