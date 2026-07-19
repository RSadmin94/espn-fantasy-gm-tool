/**
 * RFSN Live — Live Draft operational control center (real league drafts).
 * Mounts the Live Draft engine with ESPN League as the pick source.
 * Mock drafts (RFSN Local / FantasyPros) live on `/draft/mock`.
 * Broadcast booth remains one section of the workspace.
 */
import { Link } from "react-router";
import { Loader2, Radio } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";
import { DraftWarRoom } from "@/pages/DraftWarRoom";

function RfsnLiveDisabled() {
  return (
    <RfsnMediaShell active="home" subtitle="Live Draft">
      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-8 text-center max-w-lg mx-auto">
        <Radio className="mx-auto h-10 w-10 text-[#8b97a8] mb-4" />
        <h2 className="text-lg font-bold text-[#f3f8ff]">Live Draft is not enabled</h2>
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
  const leagueName = leagueKeyReady ? String(activeLeagueQ.data?.leagueName ?? "") : "";
  const showLiveNav = Boolean(accessQ.data?.enabled && accessQ.data?.canAccess);

  if (!leagueKeyReady || accessQ.isLoading) {
    return (
      <RfsnMediaShell active="home" showLive={showLiveNav} leagueName={leagueName} subtitle="Live Draft">
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#a3e635]" />
        </div>
      </RfsnMediaShell>
    );
  }

  if (!accessQ.data?.enabled || !accessQ.data?.canAccess) {
    return <RfsnLiveDisabled />;
  }

  return (
    <RfsnMediaShell
      active="live"
      showLive={showLiveNav}
      leagueName={leagueName}
      subtitle="Live Draft · Control Center"
      data-rfsn-live-page=""
    >
      <DraftWarRoom preferLiveDraft liveOpsOnly />
    </RfsnMediaShell>
  );
}
