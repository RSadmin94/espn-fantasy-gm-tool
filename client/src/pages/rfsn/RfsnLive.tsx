import { useEffect, useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import { RfsnBroadcastShell } from "@/components/rfsn/RfsnBroadcastShell";
import { RfsnAudioControls } from "@/components/rfsn/RfsnAudioControls";
import { useRfsnAudioPlayback } from "@/hooks/useRfsnAudioPlayback";
import { RfsnAnalystBooth } from "@/components/rfsn/RfsnAnalystBooth";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";
import {
  liveSessionStatusLabel,
  resolveRfsnLiveDisplaySnapshot,
  shouldRenderLiveCommentary,
  type RfsnLivePublicPayload,
} from "@/lib/rfsnLiveState";
import {
  focusDraftOrderWindow,
  padBoardRows,
  resolveLayoutMode,
  RFSN_BROADCAST_MAX_WIDTH_PX,
  RFSN_SHELL_CLASS,
  type RfsnBroadcastSnapshot,
} from "@/lib/rfsnPresentation";
import { initialCardStates } from "@/lib/rfsnBoothPresentation";
import { RfsnDraftBoard } from "@/components/rfsn/RfsnDraftBoard";
import { RfsnDraftOrder } from "@/components/rfsn/RfsnDraftOrder";
import { RfsnHeader } from "@/components/rfsn/RfsnHeader";
import { AlertCircle, Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildRfsnLiveDraftId } from "@/lib/rfsnLiveDraftId";

const LIVE_POLL_MS = 2000;

function RfsnLiveDisabled() {
  return (
    <RfsnMediaShell active="home" subtitle="RFSN Live">
      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-8 text-center max-w-lg mx-auto">
        <Radio className="mx-auto h-10 w-10 text-[#8b97a8] mb-4" />
        <h2 className="text-lg font-bold text-[#f3f8ff]">RFSN Live is not enabled</h2>
        <p className="mt-2 text-sm text-[#8b97a8]">
          Live draft broadcast is disabled in this environment. RFSN Stories and Recaps remain available.
        </p>
        <Link
          to={RFSN_ROUTES.home}
          className="inline-block mt-6 text-xs font-bold uppercase tracking-wider text-[#a3e635] hover:underline"
        >
          Back to RFSN Home
        </Link>
      </div>
    </RfsnMediaShell>
  );
}

function RfsnLiveStandby({
  payload,
  snapshot,
  layout,
}: {
  payload: RfsnLivePublicPayload;
  snapshot: RfsnBroadcastSnapshot;
  layout: ReturnType<typeof resolveLayoutMode>;
}) {
  const isMobile = layout === "mobile";
  const boardRows = padBoardRows(snapshot.board);
  const orderSlots = focusDraftOrderWindow(snapshot.draftOrder);

  return (
    <div
      className="rfsn-cinematic-stage relative min-h-screen overflow-x-hidden"
      data-rfsn-live-standby
    >
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
          />

          <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-[#8b97a8] md:px-3">
            {payload.sessionState === "commentary_pending" && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a3e635]" aria-hidden />
            )}
            {payload.sessionState === "broadcast_unavailable" && (
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" aria-hidden />
            )}
            <span>{liveSessionStatusLabel(payload.sessionState)}</span>
          </div>

          <div
            className={cn(
              "grid min-h-0 flex-1 gap-2 px-2 pb-2 pt-1 md:gap-3 md:px-3",
              isMobile ? "grid-cols-1" : "grid-cols-[14%_50%_36%]",
            )}
          >
            {!isMobile && (
              <aside className="min-w-0">
                <RfsnDraftOrder
                  slots={orderSlots}
                  clockSeconds={snapshot.clockSeconds}
                  overallPick={snapshot.overallPick}
                  className="h-full"
                />
              </aside>
            )}

            <main className="flex min-h-0 min-w-0 flex-col">
              <RfsnDraftBoard
                rows={boardRows}
                onClockTeam={snapshot.onClockTeam}
                overallPick={snapshot.overallPick}
                className="min-h-[300px] flex-1 lg:min-h-[380px]"
              />
            </main>

            {!isMobile && (
              <aside className="flex min-w-0 flex-col gap-2">
                <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4 min-h-0 flex-1">
                  <RfsnAnalystBooth
                    cardStates={initialCardStates()}
                    activeCommentator={null}
                    activeCard={null}
                    sequence={[]}
                    onDismiss={() => {}}
                    layout="desktop"
                  />
                </div>
              </aside>
            )}
          </div>

          {isMobile && (
            <div className="px-2 pb-2">
              <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
                <RfsnAnalystBooth
                  cardStates={initialCardStates()}
                  activeCommentator={null}
                  activeCard={null}
                  sequence={[]}
                  onDismiss={() => {}}
                  layout="mobile"
                />
              </div>
            </div>
          )}

          {payload.draftComplete && (
            <p className="px-3 pb-2 text-sm text-[#dbe4f0]">
              Final board preserved. No further commentary will generate.
            </p>
          )}
          {!payload.draftComplete && payload.sessionState !== "commentary_pending" && (
            <p className="px-3 pb-2 text-xs text-[#8b97a8]">
              The draft board stays fully usable while commentary generates in the background.
            </p>
          )}
          {snapshot.ticker.length > 0 && (
            <div className="px-3 pb-3 text-xs text-[#8b97a8] border-t border-white/[0.06] pt-3">
              {snapshot.ticker.map((t) => (
                <div key={t.id}>{t.text}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RfsnLive() {
  const _trpc = trpc as any;
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const { season } = useLeagueContext();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );

  const accessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled: leagueKeyReady,
    staleTime: 60_000,
  });

  const activeLeagueQ = _trpc.league.getActive.useQuery(undefined, { enabled: leagueKeyReady });
  const leagueId = leagueKeyReady ? String(activeLeagueQ.data?.leagueId ?? "") : "";
  const leagueName = leagueKeyReady ? String(activeLeagueQ.data?.leagueName ?? "") : "";
  const liveDraftId = buildRfsnLiveDraftId(season);

  const snapshotQ = _trpc.rfsnBroadcast.getLiveSnapshot.useQuery(
    leagueKeyReady && leagueId && accessQ.data?.canAccess
      ? withLeagueSalt({ leagueId, draftId: liveDraftId }, leagueContextKey)
      : skipToken,
    {
      refetchInterval: LIVE_POLL_MS,
      refetchIntervalInBackground: true,
    },
  );

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const layout = resolveLayoutMode(viewportWidth);
  const payload = snapshotQ.data as RfsnLivePublicPayload | undefined;
  const displaySnapshot = useMemo(
    () => resolveRfsnLiveDisplaySnapshot(payload, leagueName),
    [payload, leagueName],
  );

  const showLiveNav = Boolean(accessQ.data?.enabled && accessQ.data?.canAccess);

  // Hooks must run unconditionally on every render. Keep useRfsnAudioPlayback
  // ABOVE the early returns below, or React throws error #310 the first time
  // access resolves from loading -> ready (hook count changes between renders).
  const ttsAvailable = Boolean(accessQ.data?.ttsEnabled);
  const audio = useRfsnAudioPlayback(ttsAvailable, payload?.audioStatus ?? null);

  if (!leagueKeyReady || accessQ.isLoading) {
    return (
      <RfsnMediaShell active="home" showLive={showLiveNav} leagueName={leagueName} subtitle="RFSN Live">
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#a3e635]" />
        </div>
      </RfsnMediaShell>
    );
  }

  if (!accessQ.data?.enabled || !accessQ.data?.canAccess) {
    return <RfsnLiveDisabled />;
  }

  const renderCommentary = payload && shouldRenderLiveCommentary(payload);
  const commentarySnapshot = renderCommentary && payload?.snapshot ? payload.snapshot : null;

  return (
    <RfsnMediaShell
      active="live"
      showLive={showLiveNav}
      leagueName={leagueName}
      subtitle="RFSN Live · Draft Broadcast"
    >
      {ttsAvailable && (
        <div className="px-2 md:px-3 mb-2 max-w-[1600px] mx-auto w-full">
          <RfsnAudioControls audio={audio} ttsAvailable={ttsAvailable} />
        </div>
      )}
      {commentarySnapshot ? (
        <RfsnBroadcastShell
          snapshot={commentarySnapshot}
          layout={layout}
          audio={audio}
        />
      ) : (
        <RfsnLiveStandby
          payload={
            payload ?? {
              schemaVersion: 1,
              sessionState: "waiting_for_draft",
              snapshot: null,
              activePickIdentity: null,
              frameStatus: "idle",
              generatedAt: null,
              draftComplete: false,
            }
          }
          snapshot={displaySnapshot}
          layout={layout}
        />
      )}
    </RfsnMediaShell>
  );
}
