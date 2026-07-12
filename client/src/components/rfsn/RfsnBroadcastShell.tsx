import { cn } from "@/lib/utils";
import type { RfsnBroadcastSnapshot, RfsnLayoutMode } from "@/lib/rfsnPresentation";
import {
  RFSN_BROADCAST_MAX_WIDTH_PX,
  RFSN_SHELL_CLASS,
  focusDraftOrderWindow,
  padBoardRows,
  resolveContextGraphic,
  shouldShowMomentBanner,
} from "@/lib/rfsnPresentation";
import { buildBoothCommentarySequence } from "@/lib/rfsnBoothPresentation";
import { resolveBroadcastFocus } from "@/lib/rfsnBroadcastProduction";
import { useRfsnBoothController } from "@/hooks/useRfsnBoothController";
import { RfsnHeader } from "./RfsnHeader";
import { RfsnDraftOrder } from "./RfsnDraftOrder";
import { RfsnDraftBoard } from "./RfsnDraftBoard";
import { RfsnMomentBanner } from "./RfsnMomentBanner";
import { RfsnTicker } from "./RfsnTicker";
import { RfsnCommentaryQueue } from "./RfsnCommentaryQueue";
import { RfsnContextRail } from "./RfsnContextRail";
import { RfsnAnalystBooth } from "./RfsnAnalystBooth";

export type RfsnBroadcastShellProps = {
  snapshot: RfsnBroadcastSnapshot;
  layout: RfsnLayoutMode;
  className?: string;
};

export function RfsnBroadcastShell({
  snapshot,
  layout,
  className,
}: RfsnBroadcastShellProps) {
  const booth = useRfsnBoothController(snapshot);
  const sequence = buildBoothCommentarySequence(snapshot);
  const broadcastFocus = resolveBroadcastFocus(booth.activeCommentator, booth.cardStates);
  const momentScore =
    snapshot.momentMeter != null ? Math.round(snapshot.momentMeter * 100) : null;
  const { prominent } = resolveContextGraphic(snapshot);
  const isMobile = layout === "mobile";
  const boardRows = padBoardRows(snapshot.board);
  const orderSlots = focusDraftOrderWindow(snapshot.draftOrder);

  const hasActiveCommentary = booth.activeCommentator !== null;
  const mobileSheetOpen =
    isMobile &&
    (prominent !== "none" ||
      shouldShowMomentBanner(snapshot) ||
      hasActiveCommentary ||
      snapshot.queue.length > 0);

  const mobilePad = (() => {
    if (!isMobile) return undefined;
    if (mobileSheetOpen) return "pb-[38vh]";
    return "pb-[4.5rem]";
  })();

  const boothPanel = (
    <>
      {shouldShowMomentBanner(snapshot) && !isMobile && (
        <RfsnMomentBanner
          significance={snapshot.significance}
          meter={snapshot.momentMeter}
        />
      )}
      <RfsnAnalystBooth
        cardStates={booth.cardStates}
        activeCommentator={booth.activeCommentator}
        activeCard={booth.activeCard}
        sequence={sequence}
        onDismiss={booth.dismissFor}
        layout={isMobile ? "mobile" : "desktop"}
        className={isMobile ? undefined : "min-h-0 flex-1"}
      />
      {!isMobile && snapshot.queue.length > 0 && (
        <RfsnCommentaryQueue queue={snapshot.queue} />
      )}
    </>
  );

  return (
    <div
      className={cn("rfsn-cinematic-stage relative min-h-screen overflow-x-hidden", className)}
      data-rfsn-broadcast
      data-rfsn-focus={broadcastFocus}
    >
      {broadcastFocus === "commentary" && (
        <div className="rfsn-focus-vignette pointer-events-none" aria-hidden />
      )}
      <div
        className="mx-auto flex min-h-screen w-full flex-col"
        style={{ maxWidth: RFSN_BROADCAST_MAX_WIDTH_PX }}
      >
        <div className={cn(RFSN_SHELL_CLASS, "min-h-screen shadow-2xl shadow-black/40")}>
          <RfsnHeader
            round={snapshot.round}
            pickInRound={snapshot.pickInRound}
            overallPick={snapshot.overallPick}
            onClockTeam={snapshot.onClockTeam}
            clockSeconds={snapshot.clockSeconds}
            momentScore={momentScore}
            onlineCount={10}
          />

          <div
            className={cn(
              "grid min-h-0 flex-1 gap-2 px-2 pb-2 pt-2 md:gap-3 md:px-3",
              isMobile ? "grid-cols-1" : "grid-cols-[14%_50%_36%]",
            )}
          >
            {!isMobile && (
              <aside className="min-w-0" data-rfsn-focus-dim>
                <RfsnDraftOrder
                  slots={orderSlots}
                  clockSeconds={snapshot.clockSeconds}
                  overallPick={snapshot.overallPick}
                  className="h-full"
                />
              </aside>
            )}

            <main className={cn("flex min-h-0 min-w-0 flex-col", mobilePad)}>
              <RfsnDraftBoard
                rows={boardRows}
                onClockTeam={snapshot.onClockTeam}
                overallPick={snapshot.overallPick}
                broadcastFocus={broadcastFocus}
                className="min-h-[300px] flex-1 lg:min-h-[380px]"
              />
            </main>

            {!isMobile && (
              <aside className="flex min-w-0 flex-col gap-2" data-rfsn-focus-target>
                {boothPanel}
              </aside>
            )}
          </div>

          {(!isMobile || !mobileSheetOpen) && (
            <div data-rfsn-focus-dim>
              <RfsnContextRail
                snapshot={snapshot}
                variant={isMobile ? "quiet-only" : "studio-row"}
                className="px-2 pb-2 md:px-3"
              />
            </div>
          )}

          {isMobile && (
            <div
              className={cn(
                "fixed inset-x-0 z-40 px-2 pointer-events-none",
                mobileSheetOpen ? "bottom-[4.5rem]" : "bottom-9",
              )}
            >
              <div
                className={cn(
                  "pointer-events-auto mx-auto max-w-lg",
                  mobileSheetOpen &&
                    "mb-2 flex max-h-[34vh] flex-col gap-2 overflow-y-auto rounded-t-xl border border-b-0 border-white/10 bg-[#050508]/97 p-2 pt-3 shadow-2xl backdrop-blur-md",
                )}
              >
                {mobileSheetOpen && (
                  <>
                    <RfsnContextRail snapshot={snapshot} variant="prominent-only" compact />
                    {shouldShowMomentBanner(snapshot) && (
                      <RfsnMomentBanner
                        significance={snapshot.significance}
                        meter={snapshot.momentMeter}
                        compact
                      />
                    )}
                    {snapshot.queue.length > 0 && (
                      <RfsnCommentaryQueue queue={snapshot.queue} compact />
                    )}
                    <RfsnContextRail snapshot={snapshot} variant="quiet-only" />
                  </>
                )}
                <div className={cn(!mobileSheetOpen && "rounded-lg border border-white/10 bg-[#050508]/95 p-2")}>
                  {boothPanel}
                </div>
              </div>
            </div>
          )}

          <div data-rfsn-focus-dim>
            <RfsnTicker
              items={booth.filteredTicker}
              upNextTeam={
                snapshot.draftOrder.find((s) => !s.isComplete && !s.isOnClock)?.teamName
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
