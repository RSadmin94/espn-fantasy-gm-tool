import { cn } from "@/lib/utils";
import type { RfsnBroadcastSnapshot } from "@/lib/rfsnPresentation";
import { resolveContextGraphic } from "@/lib/rfsnPresentation";
import { RfsnBreakingNews } from "./RfsnBreakingNews";
import { RfsnPositionRunAlert } from "./RfsnPositionRunAlert";
import { RfsnLeagueStoryline } from "./RfsnLeagueStoryline";
import { RfsnChampionshipOdds } from "./RfsnChampionshipOdds";

export type RfsnContextRailVariant = "inline" | "prominent-only" | "quiet-only";

export type RfsnContextRailProps = {
  snapshot: RfsnBroadcastSnapshot;
  variant?: RfsnContextRailVariant;
  compact?: boolean;
  className?: string;
};

function ProminentGraphic({
  snapshot,
  compact = false,
}: {
  snapshot: RfsnBroadcastSnapshot;
  compact?: boolean;
}) {
  const { prominent } = resolveContextGraphic(snapshot);

  if (prominent === "breaking_news" && snapshot.breakingNews) {
    return (
      <RfsnBreakingNews
        headline={snapshot.breakingNews.headline}
        body={snapshot.breakingNews.body}
        compact={compact}
        className="animate-in fade-in zoom-in-95 duration-300"
      />
    );
  }
  if (prominent === "position_run" && snapshot.positionRun) {
    return (
      <RfsnPositionRunAlert
        count={snapshot.positionRun.count}
        position={snapshot.positionRun.position}
        className="animate-in fade-in slide-in-from-bottom-2 duration-300"
      />
    );
  }
  if (prominent === "league_storyline" && snapshot.leagueStoryline) {
    return (
      <RfsnLeagueStoryline
        title={snapshot.leagueStoryline.title}
        body={snapshot.leagueStoryline.body}
        className="animate-in fade-in slide-in-from-bottom-2 duration-300"
      />
    );
  }
  return null;
}

export function RfsnContextRail({
  snapshot,
  variant = "inline",
  compact = false,
  className,
}: RfsnContextRailProps) {
  const { prominent, showQuietOdds } = resolveContextGraphic(snapshot);
  const showProminent = variant !== "quiet-only" && prominent !== "none";
  const showQuiet = variant !== "prominent-only" && showQuietOdds;

  return (
    <div className={cn("flex flex-col gap-1.5", className)} aria-label="Broadcast context">
      {showProminent && <ProminentGraphic snapshot={snapshot} compact={compact} />}
      {showQuiet && <RfsnChampionshipOdds teams={snapshot.championshipOdds} variant="quiet" />}
    </div>
  );
}
