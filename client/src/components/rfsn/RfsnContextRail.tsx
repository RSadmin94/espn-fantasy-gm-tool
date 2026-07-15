import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { RfsnBroadcastSnapshot } from "@/lib/rfsnPresentation";
import {
  CONTEXT_GRAPHIC_ANIM_CLASS,
  contextGraphicDelay,
} from "@/lib/rfsnBroadcastProduction";
import { RfsnBreakingNews } from "./RfsnBreakingNews";
import { RfsnPositionRunAlert } from "./RfsnPositionRunAlert";
import { RfsnLeagueStoryline } from "./RfsnLeagueStoryline";
import { RfsnChampionshipOdds } from "./RfsnChampionshipOdds";

export type RfsnContextRailVariant = "inline" | "studio-row" | "prominent-only" | "quiet-only";

export type RfsnContextRailProps = {
  snapshot: RfsnBroadcastSnapshot;
  variant?: RfsnContextRailVariant;
  compact?: boolean;
  className?: string;
};

function ContextGraphicWrap({
  delay,
  className,
  children,
}: {
  delay: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(CONTEXT_GRAPHIC_ANIM_CLASS, className)} style={{ animationDelay: delay }}>
      {children}
    </div>
  );
}
function ProminentGraphic({
  snapshot,
  compact = false,
  size = "medium",
}: {
  snapshot: RfsnBroadcastSnapshot;
  compact?: boolean;
  size?: "large" | "medium";
}) {
  if (snapshot.breakingNews) {
    return (
      <ContextGraphicWrap delay={contextGraphicDelay(0)} className="h-full">
        <RfsnBreakingNews
          headline={snapshot.breakingNews.headline}
          body={snapshot.breakingNews.body}
          compact={compact}
          size={size === "large" ? "large" : "medium"}
          className="h-full"
        />
      </ContextGraphicWrap>
    );
  }
  if (snapshot.positionRun) {
    return (
      <ContextGraphicWrap delay={contextGraphicDelay(0)} className="h-full">
        <RfsnPositionRunAlert
          count={snapshot.positionRun.count}
          position={snapshot.positionRun.position}
          className="h-full"
        />
      </ContextGraphicWrap>
    );
  }
  if (snapshot.leagueStoryline) {
    return (
      <ContextGraphicWrap delay={contextGraphicDelay(0)} className="h-full">
        <RfsnLeagueStoryline
          title={snapshot.leagueStoryline.title}
          body={snapshot.leagueStoryline.body}
          className="h-full"
        />
      </ContextGraphicWrap>
    );
  }
  return null;
}

function StudioContextRow({
  snapshot,
  compact = false,
}: {
  snapshot: RfsnBroadcastSnapshot;
  compact?: boolean;
}) {
  const hasBreaking = Boolean(snapshot.breakingNews);
  const hasRun = Boolean(snapshot.positionRun);
  const hasStory = Boolean(snapshot.leagueStoryline);
  const hasOdds = snapshot.championshipOdds.length > 0;
  const graphicCount = [hasBreaking, hasRun, hasStory].filter(Boolean).length;

  if (graphicCount === 0 && hasOdds) {
    return (
      <ContextGraphicWrap delay={contextGraphicDelay(0)} className="w-full">
        <RfsnChampionshipOdds
          teams={snapshot.championshipOdds}
          variant="studio-quiet"
          className="w-full"
        />
      </ContextGraphicWrap>
    );
  }

  let graphicIndex = 0;
  const nextDelay = () => contextGraphicDelay(graphicIndex++);

  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-1" : "grid-cols-12",
      )}
      aria-label="Broadcast context"
    >
      {hasBreaking && snapshot.breakingNews && (
        <div className={cn(!compact && "col-span-5")}>
          <ContextGraphicWrap delay={nextDelay()} className="h-full min-h-[5.5rem]">
            <RfsnBreakingNews
              headline={snapshot.breakingNews.headline}
              body={snapshot.breakingNews.body}
              compact={compact}
              size="large"
              className="h-full"
            />
          </ContextGraphicWrap>
        </div>
      )}
      {hasRun && snapshot.positionRun && (
        <div className={cn(!compact && (hasBreaking ? "col-span-3" : "col-span-4"))}>
          <ContextGraphicWrap delay={nextDelay()} className="h-full min-h-[5.5rem]">
            <RfsnPositionRunAlert
              count={snapshot.positionRun.count}
              position={snapshot.positionRun.position}
              className="h-full"
            />
          </ContextGraphicWrap>
        </div>
      )}
      {hasStory && snapshot.leagueStoryline && (
        <div className={cn(!compact && "col-span-3")}>
          <ContextGraphicWrap delay={nextDelay()} className="h-full min-h-[5.5rem]">
            <RfsnLeagueStoryline
              title={snapshot.leagueStoryline.title}
              body={snapshot.leagueStoryline.body}
              className="h-full"
            />
          </ContextGraphicWrap>
        </div>
      )}
      {hasOdds && (
        <div
          className={cn(
            !compact &&
              (graphicCount === 0
                ? "col-span-12"
                : graphicCount === 1 && !hasBreaking
                  ? "col-span-8"
                  : "col-span-4"),
          )}
        >
          <ContextGraphicWrap delay={nextDelay()} className="h-full min-h-[5.5rem]">
            <RfsnChampionshipOdds
              teams={snapshot.championshipOdds}
              variant="studio-quiet"
              className="h-full"
            />
          </ContextGraphicWrap>
        </div>
      )}
    </div>
  );
}

export function RfsnContextRail({
  snapshot,
  variant = "inline",
  compact = false,
  className,
}: RfsnContextRailProps) {
  if (variant === "studio-row") {
    return (
      <div className={cn(className)}>
        <StudioContextRow snapshot={snapshot} compact={compact} />
      </div>
    );
  }

  const showProminent =
    variant !== "quiet-only" &&
    (snapshot.breakingNews || snapshot.positionRun || snapshot.leagueStoryline);
  const showQuiet = variant !== "prominent-only" && snapshot.championshipOdds.length > 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)} aria-label="Broadcast context">
      {showProminent && (
        <ProminentGraphic
          snapshot={snapshot}
          compact={compact}
          size={snapshot.breakingNews ? "large" : "medium"}
        />
      )}
      {showQuiet && (
        <RfsnChampionshipOdds teams={snapshot.championshipOdds} variant="quiet" />
      )}
    </div>
  );
}
