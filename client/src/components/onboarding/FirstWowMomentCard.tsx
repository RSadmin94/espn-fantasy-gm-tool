import { Link } from "react-router";
import { Flame, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ONBOARDING_COPY } from "@/lib/commercialCopy";

/** Post-setup nudge toward the highest-emotion intelligence surfaces. */
export function FirstWowMomentCard({ className }: { className?: string }) {
  return (
    <Card className={`border-lime-500/25 bg-lime-500/5 ${className ?? ""}`}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">
            {ONBOARDING_COPY.wowEyebrow}
          </p>
          <h2 className="text-lg font-bold text-foreground">{ONBOARDING_COPY.wowTitle}</h2>
          <p className="max-w-xl text-sm text-muted-foreground">{ONBOARDING_COPY.wowBody}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Button asChild className="gap-2">
            <Link to="/rivals/rivalries">
              <Flame className="h-4 w-4" />
              {ONBOARDING_COPY.wowPrimaryCta}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/championship-diagnosis">
              <Trophy className="h-4 w-4" />
              {ONBOARDING_COPY.wowSecondaryCta}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
