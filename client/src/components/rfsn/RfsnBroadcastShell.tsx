import { cn } from "@/lib/utils";
import type { RfsnBroadcastSnapshot, RfsnLayoutMode } from "@/lib/rfsnPresentation";
import { RFSN_SHELL_CLASS } from "@/lib/rfsnPresentation";
import { RfsnHeader } from "./RfsnHeader";
import { RfsnDraftOrder } from "./RfsnDraftOrder";
import { RfsnDraftBoard } from "./RfsnDraftBoard";
import { RfsnMomentBanner } from "./RfsnMomentBanner";
import { RfsnPrimaryCommentary } from "./RfsnPrimaryCommentary";
import { RfsnSecondaryReaction } from "./RfsnSecondaryReaction";
import { RfsnTicker } from "./RfsnTicker";
import { RfsnCommentaryQueue } from "./RfsnCommentaryQueue";
import { RfsnContextRail } from "./RfsnContextRail";
import {
  resolveContextGraphic,
  resolveOnAirCommentary,
  shouldShowMomentBanner,
} from "@/lib/rfsnPresentation";
import type { RfsnBroadcastPhase } from "@/lib/rfsnPresentation";

export type RfsnBroadcastShellProps = {
  snapshot: RfsnBroadcastSnapshot;
  layout: RfsnLayoutMode;
  phase?: RfsnBroadcastPhase;
  onDismissPrimary?: () => void;
  onDismissSecondary?: () => void;
  className?: string;
};

export function RfsnBroadcastShell({
  snapshot,
  layout,
  phase = "primary_in",
  onDismissPrimary,
  onDismissSecondary,
  className,
}: RfsnBroadcastShellProps) {
  const { primary, secondary } = resolveOnAirCommentary(snapshot);
  const { prominent } = resolveContextGraphic(snapshot);
  const isMobile = layout === "mobile";
  const showPrimary =
    primary &&
    (phase === "primary_in" || phase === "secondary_in" || phase === "exiting");
  const showSecondary =
    secondary &&
    (phase === "secondary_in" || phase === "exiting");

  const mobileSheetOpen =
    isMobile &&
    (prominent !== "none" ||
      shouldShowMomentBanner(snapshot) ||
      showPrimary ||
      showSecondary ||
      snapshot.queue.length > 0);

  const mobilePad =
    mobileSheetOpen &&
    (prominent === "breaking_news" && showSecondary
      ? "pb-[52vh]"
      : showPrimary
        ? "pb-[44vh]"
        : "pb-[32vh]");

  return (
    <div className={cn(RFSN_SHELL_CLASS, "flex flex-col", className)}>
      <RfsnHeader
        round={snapshot.round}
        pickInRound={snapshot.pickInRound}
        overallPick={snapshot.overallPick}
        onClockTeam={snapshot.onClockTeam}
        onlineCount={10}
      />

      <div
        className={cn(
          "flex flex-1 gap-3 p-3 md:p-4",
          isMobile ? "flex-col" : "flex-row min-h-0",
        )}
      >
        {!isMobile && (
          <aside className="w-44 shrink-0 hidden md:block">
            <RfsnDraftOrder
              slots={snapshot.draftOrder}
              clockSeconds={snapshot.clockSeconds}
              overallPick={snapshot.overallPick}
            />
          </aside>
        )}

        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-3",
            mobilePad,
          )}
        >
          <RfsnDraftBoard
            rows={snapshot.board}
            onClockTeam={snapshot.onClockTeam}
            overallPick={snapshot.overallPick}
            className="flex-1 min-h-[280px]"
          />

          <RfsnContextRail
            snapshot={snapshot}
            variant={isMobile ? "quiet-only" : "inline"}
          />
        </main>

        {!isMobile && (
          <aside className="w-72 shrink-0 hidden lg:flex flex-col gap-2">
            {shouldShowMomentBanner(snapshot) && (
              <RfsnMomentBanner
                significance={snapshot.significance}
                meter={snapshot.momentMeter}
              />
            )}
            {showPrimary && (
              <RfsnPrimaryCommentary card={primary} onDismiss={onDismissPrimary} />
            )}
            {showSecondary && (
              <RfsnSecondaryReaction card={secondary} onDismiss={onDismissSecondary} />
            )}
            {snapshot.queue.length > 0 && (
              <RfsnCommentaryQueue queue={snapshot.queue} />
            )}
          </aside>
        )}
      </div>

      {isMobile && mobileSheetOpen && (
        <div className="fixed inset-x-0 bottom-10 z-40 px-3 pointer-events-none">
          <div className="pointer-events-auto mx-auto flex max-w-lg flex-col gap-2 max-h-[42vh] overflow-y-auto">
            <RfsnContextRail snapshot={snapshot} variant="prominent-only" />
            {shouldShowMomentBanner(snapshot) && (
              <RfsnMomentBanner
                significance={snapshot.significance}
                meter={snapshot.momentMeter}
                compact
              />
            )}
            {showPrimary && (
              <RfsnPrimaryCommentary card={primary} onDismiss={onDismissPrimary} compact />
            )}
            {showSecondary && (
              <RfsnSecondaryReaction card={secondary} onDismiss={onDismissSecondary} compact />
            )}
            {snapshot.queue.length > 0 && (
              <RfsnCommentaryQueue queue={snapshot.queue} compact />
            )}
          </div>
        </div>
      )}

      <RfsnTicker
        items={snapshot.ticker}
        upNextTeam={
          snapshot.draftOrder.find((s) => !s.isComplete && !s.isOnClock)?.teamName
        }
      />
    </div>
  );
}
