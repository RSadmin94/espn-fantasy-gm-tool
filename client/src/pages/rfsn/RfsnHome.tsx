import { useMemo } from "react";
import { Link } from "react-router";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import {
  RFSN_ROUTES,
  articleExcerpt,
  articleTypeLabel,
  selectArchiveRailArticles,
  selectFeaturedArticle,
  type NewsroomArticle,
} from "@/lib/rfsnEditorial";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  Calendar,
  ChevronRight,
  Loader2,
  Newspaper,
  Radio,
  Sparkles,
} from "lucide-react";

type WireReport = {
  matchupId: number;
  winner?: { name: string; score: number } | null;
  loser?: { name: string; score: number } | null;
  shortRecap?: string;
};

export function RfsnHome() {
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
  const leagueName =
    leagueKeyReady && activeLeagueQ.data?.leagueName ? activeLeagueQ.data.leagueName : "";

  const feedQ = _trpc.leagueNewsroom.getNewsroomFeed.useQuery(
    withLeagueSalt({ limit: 20 }, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const articles: NewsroomArticle[] = leagueKeyReady ? (feedQ.data ?? []) : [];
  const featured = selectFeaturedArticle(articles);
  const latestStories = articles.filter((a) => a.id !== featured?.id).slice(0, 4);
  const archiveStories = selectArchiveRailArticles(articles, featured?.id ?? null, 3);

  const seasonsQ = _trpc.leagueNewsroom.getArchiveSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const archiveSeasons = leagueKeyReady ? ((seasonsQ.data ?? []) as number[]) : [];

  const availableWeeksQ = _trpc.leagueWire.getAvailableWeeks.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const latestWeek = useMemo(
    () => (leagueKeyReady ? (availableWeeksQ.data?.[0] ?? null) : null),
    [availableWeeksQ.data, leagueKeyReady],
  );

  const wireQ = _trpc.leagueWire.getPostgameReports.useQuery(
    leagueKeyReady && latestWeek != null
      ? withLeagueSalt({ season: latestWeek.season, week: latestWeek.week }, leagueContextKey)
      : skipToken,
  );
  const wireReports: WireReport[] =
    leagueKeyReady && latestWeek != null ? (wireQ.data ?? []) : [];

  const loading = !leagueKeyReady || feedQ.isLoading;

  return (
    <RfsnMediaShell active="home" leagueName={leagueName} showLive={showLiveNav} data-v2-rfsn-home>
      <div className="space-y-6">
        {/* Featured */}
        <section className="rounded-[15px] border border-white/[0.07] bg-[linear-gradient(180deg,#1f1624,#18111c)] overflow-hidden">
          <div className="rfsn-ticker-rule px-5 py-2 border-b border-white/[0.06] flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-lime-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#8b97a8]">Featured Story</span>
          </div>
          <div className="p-5 md:p-6">
            {loading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-ink-secondary">
                <Loader2 className="h-4 w-4 animate-spin text-lime-400" />
                Loading RFSN coverage…
              </div>
            ) : featured ? (
              <div className="max-w-3xl space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  {articleTypeLabel(featured.articleType)} · {featured.season}
                </p>
                <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">{featured.headline}</h2>
                {featured.subheadline && (
                  <p className="text-sm text-zinc-400 italic">{featured.subheadline}</p>
                )}
                <p className="text-sm text-zinc-400 leading-relaxed">{articleExcerpt(featured.body)}</p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <span className="text-[10px] text-ink-tertiary">
                    {new Date(featured.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  <Link
                    to={RFSN_ROUTES.newsArticle(featured.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
                  >
                    Read full story <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="py-8 space-y-3 max-w-xl">
                <div className="flex items-start gap-2 text-zinc-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-ink-tertiary" />
                  <p className="text-sm">
                    No generated stories yet — RFSN News stays useful year-round with weekly wire reports and your league archive.
                  </p>
                </div>
                <Link
                  to={RFSN_ROUTES.stories}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
                >
                  Open Stories <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Latest */}
          <section className="rounded-[15px] border border-white/[0.07] bg-white/[0.02] p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-[#a3e635]" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#8b97a8]">Latest from RFSN</h3>
              </div>
              <Link to={RFSN_ROUTES.stories} className="text-[10px] font-bold text-ink-secondary hover:text-zinc-300">
                All stories →
              </Link>
            </div>
            {loading ? (
              <p className="text-sm text-ink-secondary">Loading headlines…</p>
            ) : latestStories.length > 0 ? (
              <ul className="space-y-1">
                {latestStories.map((story) => (
                  <li key={story.id}>
                    <Link
                      to={RFSN_ROUTES.newsArticle(story.id)}
                      className="group flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-white/[0.03] border border-transparent hover:border-white/[0.08]"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-secondary">
                          {articleTypeLabel(story.articleType)}
                        </p>
                        <p className="text-sm font-semibold text-zinc-100 group-hover:text-white line-clamp-2 mt-0.5">
                          {story.headline}
                        </p>
                        <p className="text-[10px] text-ink-tertiary mt-1">
                          {story.season} · {new Date(story.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary group-hover:text-lime-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-secondary">Headlines appear here as stories are generated.</p>
            )}
          </section>

          <div className="space-y-4">
            {/* This Week */}
            <section className="rounded-[15px] border border-white/[0.07] bg-[linear-gradient(180deg,#1f1624,#18111c)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-lime-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#f3f8ff]">This Week</h3>
              </div>
              {latestWeek ? (
                <>
                  <p className="text-sm text-zinc-300">
                    Season {latestWeek.season} · Week {latestWeek.week}
                  </p>
                  {wireReports.filter((r) => r.winner).length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {wireReports.filter((r) => r.winner).slice(0, 3).map((r) => (
                        <li key={r.matchupId} className="text-[11px] text-zinc-400 border-l-2 border-lime-500/40 pl-2">
                          <span className="text-zinc-200 font-semibold">{r.winner!.name}</span>
                          {" "}def.{" "}
                          <span>{r.loser?.name}</span>
                          <span className="text-lime-400 font-bold ml-1 tabular-nums">
                            {r.winner!.score.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-ink-secondary mt-2">Weekly reports load after synced matchups.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-secondary">
                  Offseason — weekly matchup reports return when the season kicks off.
                </p>
              )}
              <Link
                to={RFSN_ROUTES.recaps}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
              >
                Open Recaps <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to={RFSN_ROUTES.stories}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-ink-secondary hover:text-zinc-300"
              >
                League stories <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </section>

            {/* From the Archive */}
            <section className="rounded-[15px] border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Archive className="h-4 w-4 text-zinc-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#8b97a8]">From the Archive</h3>
              </div>
              {archiveStories.length > 0 ? (
                <ul className="space-y-2">
                  {archiveStories.map((story) => (
                    <li key={story.id}>
                      <Link
                        to={RFSN_ROUTES.newsArticle(story.id)}
                        className="text-sm text-zinc-300 hover:text-white line-clamp-2"
                      >
                        <span className="text-[10px] text-ink-tertiary mr-2">{story.season}</span>
                        {story.headline}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : archiveSeasons.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {archiveSeasons.slice(0, 6).map((s) => (
                    <Link
                      key={s}
                      to={`${RFSN_ROUTES.stories}?view=archive`}
                      className="px-2 py-1 rounded text-xs font-bold border border-zinc-800 text-ink-secondary hover:border-amber-500/40 hover:text-amber-400"
                    >
                      {s}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-secondary">Season archives appear as stories are generated.</p>
              )}
            </section>

            {/* Live coverage — link when access exists; no fake broadcast */}
            <section className="rounded-[15px] border border-red-500/15 bg-red-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="h-4 w-4 text-red-500/80" />
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300">Live Coverage</h3>
              </div>
              {showLiveNav ? (
                <>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Draft booth coverage is available on RFSN Live. War Room controls stay in Draft.
                  </p>
                  <Link
                    to={RFSN_ROUTES.live}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
                  >
                    Open Live <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              ) : (
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Stories and Recaps are available now. Live booth access appears when draft broadcast
                  is enabled for this league.
                </p>
              )}
              <Link
                to={RFSN_ROUTES.analysts}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-ink-secondary hover:text-zinc-300"
              >
                Meet the analysts <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </RfsnMediaShell>
  );
}
