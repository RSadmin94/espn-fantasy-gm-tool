/**
 * Canonical `/rfsn/breaking` — surfaces existing importance signals only:
 * live broadcast `breakingNews` (when accessible) and the newsroom featured article
 * (`selectFeaturedArticle`). No new significance formula.
 */
import { useMemo } from "react";
import { Link } from "react-router";
import { skipToken } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Loader2, Radio, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import {
  RFSN_ROUTES,
  articleExcerpt,
  articleTypeLabel,
  selectFeaturedArticle,
  type NewsroomArticle,
} from "@/lib/rfsnEditorial";

export function RfsnBreaking() {
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
  const canLive = Boolean(liveAccessQ.data?.enabled && liveAccessQ.data?.canAccess);
  const leagueId = activeLeagueQ.data?.leagueId ? String(activeLeagueQ.data.leagueId) : null;
  const leagueName =
    leagueKeyReady && activeLeagueQ.data?.leagueName ? activeLeagueQ.data.leagueName : "";

  const liveQ = _trpc.rfsnBroadcast.getLiveSnapshot.useQuery(
    canLive && leagueId
      ? withLeagueSalt({ leagueId, draftId: liveAccessQ.data?.draftId }, leagueContextKey)
      : skipToken,
    { enabled: canLive && Boolean(leagueId), refetchInterval: canLive ? 5000 : false },
  );

  const feedQ = _trpc.leagueNewsroom.getNewsroomFeed.useQuery(
    withLeagueSalt({ limit: 20 }, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const articles: NewsroomArticle[] = leagueKeyReady ? (feedQ.data ?? []) : [];
  const featured = selectFeaturedArticle(articles);
  const liveBreaking = liveQ.data?.breakingNews as
    | { headline?: string; body?: string }
    | null
    | undefined;

  const loading = !leagueKeyReady || feedQ.isLoading || (canLive && liveQ.isLoading);
  const hasContent = Boolean(liveBreaking?.headline || featured);

  return (
    <RfsnMediaShell active="breaking" leagueName={leagueName} showLive={showLiveNav} data-v2-rfsn-breaking>
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
          <Zap className="h-5 w-5 text-amber-400" /> Breaking News
        </h2>
        <p className="mt-1 text-xs text-[#8b97a8]">
          High-priority items already flagged by the live broadcast desk or selected as the newsroom
          featured story — no new ranking formula.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-lime-400" /> Checking the desk…
        </div>
      ) : !hasContent ? (
        <div className="rounded-[15px] border border-white/[0.07] bg-white/[0.02] px-5 py-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-ink-tertiary" />
          <p className="text-sm font-semibold text-zinc-300">Nothing breaking right now</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-[#8b97a8]">
            Live breaking graphics appear during an active RFSN draft broadcast. Featured newsroom
            stories appear here when coverage is available.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link to={RFSN_ROUTES.stories} className="text-xs font-bold text-lime-400 hover:text-lime-300">
              Open Stories →
            </Link>
            {showLiveNav ? (
              <Link to={RFSN_ROUTES.live} className="text-xs font-bold text-lime-400 hover:text-lime-300">
                Open Live →
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {liveBreaking?.headline ? (
            <section className="rounded-[15px] border border-red-500/30 bg-red-500/[0.06] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-red-500/20 px-5 py-2">
                <Radio className="h-3.5 w-3.5 text-red-400" />
                <span className="text-2xs font-semibold uppercase tracking-[0.25em] text-red-300">
                  Live desk
                </span>
              </div>
              <div className="space-y-2 p-5">
                <h3 className="text-xl font-black text-white">{liveBreaking.headline}</h3>
                {liveBreaking.body ? (
                  <p className="text-sm leading-relaxed text-zinc-300">{liveBreaking.body}</p>
                ) : null}
                <Link
                  to={RFSN_ROUTES.live}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
                >
                  Watch live coverage <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </section>
          ) : null}

          {featured ? (
            <section className="rounded-[15px] border border-white/[0.07] bg-[linear-gradient(180deg,#1f1624,#18111c)] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-2">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-2xs font-semibold uppercase tracking-[0.25em] text-[#8b97a8]">
                  Featured story
                </span>
              </div>
              <div className="space-y-3 p-5">
                <p className="text-2xs font-semibold uppercase tracking-widest text-amber-400">
                  {articleTypeLabel(featured.articleType)} · {featured.season}
                </p>
                <h3 className="text-xl font-black text-white">{featured.headline}</h3>
                {featured.subheadline ? (
                  <p className="text-sm italic text-zinc-400">{featured.subheadline}</p>
                ) : null}
                <p className="text-sm leading-relaxed text-zinc-400">{articleExcerpt(featured.body)}</p>
                <Link
                  to={RFSN_ROUTES.newsArticle(featured.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
                >
                  Read full story <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </RfsnMediaShell>
  );
}
