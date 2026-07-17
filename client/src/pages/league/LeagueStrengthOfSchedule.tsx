/**
 * Strength of Schedule — no existing dedicated SOS authority/page.
 * Honest empty state; do not invent schedule-strength calculations.
 */
import { Calendar } from "lucide-react";
import { Link } from "react-router";
import { CinematicPageHeader, IntelPageShell, IntelPanel } from "@/components/layout";

export function LeagueStrengthOfSchedule() {
  return (
    <IntelPageShell
      bleed
      minHeight="full"
      background="cinematic-token"
      padding="default"
      data-v2-league-sos
    >
      <CinematicPageHeader
        eyebrowMono="League · Standings"
        icon={Calendar}
        title="Strength of Schedule"
        subtitle="Schedule strength is not yet exposed as a dedicated league authority."
        className="mb-5"
      />
      <IntelPanel variant="card" className="px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No existing Strength of Schedule surface is available to mount. Current standings and
          power rankings remain the factual destinations for this season.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link to="/league/standings" className="text-xs font-bold text-lime-400 hover:text-lime-300">
            Open Standings →
          </Link>
          <Link
            to="/league/standings/power-rankings"
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Power Rankings →
          </Link>
        </div>
      </IntelPanel>
    </IntelPageShell>
  );
}
