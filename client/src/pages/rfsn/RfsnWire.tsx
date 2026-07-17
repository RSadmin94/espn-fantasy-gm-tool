/**
 * Canonical `/rfsn/wire` — League Wire / newsroom chronological coverage.
 * Mounts the existing RFSN newsroom (same implementation as `/rfsn/news`).
 */
import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { LeagueWireNewsroom } from "@/components/leagueWire/LeagueWireNewsroom";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";

export function RfsnWire() {
  const { articleId: articleIdParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get("view") === "archive" ? "archive" : "feed";
  const initialArticleId = useMemo(() => {
    if (!articleIdParam) return null;
    const id = Number.parseInt(articleIdParam, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [articleIdParam]);

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
    <RfsnMediaShell active="wire" leagueName={leagueName} showLive={showLiveNav} data-v2-rfsn-wire>
      <LeagueWireNewsroom
        brand="rfsn"
        hideMasthead
        embedded
        initialView={initialView}
        initialArticleId={initialArticleId}
        onArticleOpen={(id) => navigate(RFSN_ROUTES.wireArticle(id))}
        onArticleClose={() => navigate(RFSN_ROUTES.wire, { replace: true })}
      />
    </RfsnMediaShell>
  );
}
