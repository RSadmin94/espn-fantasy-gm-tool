/**
 * Canonical `/rfsn/stories` — feature stories from the existing newsroom feed.
 * Reuses LeagueWireNewsroom; article reader remains on legacy `/rfsn/news/article/:id`.
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { LeagueWireNewsroom } from "@/components/leagueWire/LeagueWireNewsroom";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";

export function RfsnStories() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get("view") === "archive" ? "archive" : "feed";

  const _trpc = trpc as any;
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );

  const activeLeagueQ = _trpc.league.getActive.useQuery(undefined, { enabled: leagueKeyReady });
  const liveAccessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled: leagueKeyReady,
    staleTime: 60_000,
  });
  const showLiveNav = Boolean(liveAccessQ.data?.enabled && liveAccessQ.data?.canAccess);
  const leagueName = useMemo(
    () => (leagueKeyReady && activeLeagueQ.data?.leagueName ? activeLeagueQ.data.leagueName : ""),
    [activeLeagueQ.data?.leagueName, leagueKeyReady],
  );

  return (
    <RfsnMediaShell active="stories" leagueName={leagueName} showLive={showLiveNav} data-v2-rfsn-stories>
      <div className="mb-4">
        <h2 className="text-lg font-black tracking-tight text-white">Stories</h2>
        <p className="mt-1 text-xs text-[#8b97a8]">
          Feature coverage from the RFSN newsroom — championship marches, roster reports, keeper
          previews, and season archive pieces already generated for your league.
        </p>
      </div>
      <LeagueWireNewsroom
        brand="rfsn"
        hideMasthead
        embedded
        initialView={initialView}
        onArticleOpen={(id) => navigate(RFSN_ROUTES.newsArticle(id))}
        onArticleClose={() => navigate(RFSN_ROUTES.stories, { replace: true })}
      />
    </RfsnMediaShell>
  );
}
