import { useEffect, useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import { RfsnBroadcastShell } from "@/components/rfsn/RfsnBroadcastShell";
import { RfsnAnalystBooth } from "@/components/rfsn/RfsnAnalystBooth";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";
import {
  createRfsnLiveStandbySnapshot,
  liveSessionStatusLabel,
  shouldRenderLiveCommentary,
  type RfsnLivePublicPayload,
} from "@/lib/rfsnLiveState";
import { resolveLayoutMode } from "@/lib/rfsnPresentation";
import { initialCardStates } from "@/lib/rfsnBoothPresentation";
import { AlertCircle, Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const LIVE_POLL_MS = 2000;
const INTERNAL_DRAFT_ID = "rfsn-live-internal";

function RfsnLiveDisabled() {
  return (
    <RfsnMediaShell active="home" subtitle="RFSN Live">
      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-8 text-center max-w-lg mx-auto">
        <Radio className="mx-auto h-10 w-10 text-[#8b97a8] mb-4" />
        <h2 className="text-lg font-bold text-[#f3f8ff]">RFSN Live is not enabled</h2>
        <p className="mt-2 text-sm text-[#8b97a8]">
          Live draft broadcast is disabled in this environment. RFSN Home and News remain available.
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
  leagueName,
}: {
  payload: RfsnLivePublicPayload;
  leagueName?: string;
}) {
  const snapshot = payload.snapshot ?? createRfsnLiveStandbySnapshot({
    onClockTeam: leagueName ? `${leagueName} draft` : "Draft board",
  });
  const layout = resolveLayoutMode(typeof window !== "undefined" ? window.innerWidth : 1280);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8b97a8]">
        {payload.sessionState === "commentary_pending" && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a3e635]" aria-hidden />
        )}
        {payload.sessionState === "broadcast_unavailable" && (
          <AlertCircle className="h-3.5 w-3.5 text-amber-400" aria-hidden />
        )}
        <span>{liveSessionStatusLabel(payload.sessionState)}</span>
      </div>
      <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
        <RfsnAnalystBooth
          cardStates={initialCardStates()}
          activeCommentator={null}
          activeCard={null}
          sequence={[]}
          onDismiss={() => {}}
          layout={layout === "mobile" ? "mobile" : "desktop"}
        />
      </div>
      {payload.draftComplete && (
        <p className="text-sm text-[#dbe4f0]">Final board preserved. No further commentary will generate.</p>
      )}
      {!payload.draftComplete && payload.sessionState !== "commentary_pending" && (
        <p className="text-xs text-[#8b97a8]">
          The draft board stays fully usable while commentary generates in the background.
        </p>
      )}
      {snapshot.ticker.length > 0 && (
        <div className="text-xs text-[#8b97a8] border-t border-white/[0.06] pt-3">
          {snapshot.ticker.map((t) => (
            <div key={t.id}>{t.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RfsnLive() {
  const _trpc = trpc as any;
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
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

  const snapshotQ = _trpc.rfsnBroadcast.getLiveSnapshot.useQuery(
    leagueKeyReady && leagueId && accessQ.data?.canAccess
      ? withLeagueSalt({ leagueId, draftId: INTERNAL_DRAFT_ID }, leagueContextKey)
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

  const showLiveNav = Boolean(accessQ.data?.enabled && accessQ.data?.canAccess);

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
  const snapshot = renderCommentary && payload?.snapshot
    ? payload.snapshot
    : null;

  return (
    <RfsnMediaShell
      active="live"
      showLive={showLiveNav}
      leagueName={leagueName}
      subtitle="RFSN Live · Draft Broadcast"
    >
      {snapshot ? (
        <RfsnBroadcastShell snapshot={snapshot} layout={layout} />
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
          leagueName={leagueName}
        />
      )}
    </RfsnMediaShell>
  );
}
