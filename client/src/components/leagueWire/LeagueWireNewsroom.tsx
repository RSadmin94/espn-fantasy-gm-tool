import { useState, useMemo, useEffect, useCallback } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { normalizeRfsnByline } from "@/lib/rfsnEditorial";
import { cn } from "@/lib/utils";
import {
  Radio, BookOpen, Trophy, Loader2,
  Sparkles, Archive, FileText, ChevronRight,
  AlertCircle, Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Article {
  id: number; season: number; articleType: string; slug: string;
  category: string; headline: string; subheadline?: string; body: string;
  byline?: string; isPredicted: boolean; createdAt: string;
}

export type { Article as NewsroomArticle };

function displayByline(byline: string | undefined, brand: NewsroomBrand, fallback: string): string {
  const raw = byline ?? fallback;
  return brand === "rfsn" ? normalizeRfsnByline(raw, fallback) : raw;
}

export type NewsroomBrand = "rfsn" | "league-wire";

const BRAND = {
  rfsn: {
    staffByline: "RFSN Staff",
    backLabel: "← Back to News",
    aiBrand: "RFSN",
    emptyHelp: "Use the Generate Articles buttons above to create the first RFSN stories.",
    mastheadTitle: "RFSN News",
    mastheadSubtitle: (leagueName: string) =>
      `${leagueName ? `${leagueName} · ` : ""}League Newsroom`,
  },
  "league-wire": {
    staffByline: "League Wire Staff",
    backLabel: "← Back to Newsroom",
    aiBrand: "League Wire",
    emptyHelp: "Use the Generate Articles buttons above to create the first League Wire stories.",
    mastheadTitle: "League Wire",
    mastheadSubtitle: (leagueName: string) =>
      `${leagueName ? `${leagueName} · ` : ""}Official Newsroom`,
  },
} as const;

const ARTICLE_TYPE_CFG: Record<string, { icon: any; color: string; label: string; bg: string }> = {
  championship_march: { icon: Trophy,     color: "text-amber-400",   label: "Championship March", bg: "bg-amber-500/10 border-amber-500/30" },
  keeper_preview:     { icon: Zap,        color: "text-lime-400", label: "Keeper Preview",     bg: "bg-lime-500/10 border-lime-500/30" },
  roster_construction:{ icon: Sparkles,   color: "text-violet-400",     label: "Roster Report",      bg: "bg-violet-500/10 border-violet-500/30" },
  season_archive:     { icon: Archive,    color: "text-zinc-400",    label: "Season Archive",     bg: "bg-zinc-800 border-zinc-700" },
};

// ── Markdown-lite renderer ─────────────────────────────────────────────────────

function ArticleBody({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="prose prose-invert prose-sm max-w-none text-zinc-300 space-y-2">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
          return <h3 key={i} className="text-zinc-100 font-black text-base mt-4">{line.slice(2, -2)}</h3>;
        }
        if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
          return <p key={i} className="text-ink-secondary italic text-xs">{line.slice(1, -1)}</p>;
        }
        if (line.startsWith("**Evidence:")) {
          return <p key={i} className="text-[10px] text-ink-tertiary border-t border-zinc-800 pt-2 mt-3">{line.replace(/\*\*/g,"")}</p>;
        }
        return <p key={i} className="text-sm leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

// ── Article card ───────────────────────────────────────────────────────────────

function ArticleCard({
  article,
  onOpen,
  staffByline,
  brand,
}: {
  article: Article;
  onOpen: (a: Article) => void;
  staffByline: string;
  brand: NewsroomBrand;
}) {
  const cfg = ARTICLE_TYPE_CFG[article.articleType] ?? ARTICLE_TYPE_CFG.season_archive;
  const Icon = cfg.icon;
  const preview = article.body.replace(/\*\*/g, "").replace(/\*/g, "").split("\n").filter(l => l.trim() && !l.startsWith("Evidence")).slice(2, 4).join(" ").slice(0, 180);

  return (
    <button
      onClick={() => onOpen(article)}
      className="text-left rounded-[12px] border border-white/[0.07] bg-white/[0.03] p-4 hover:border-white/[0.14] hover:bg-white/[0.05] transition-all group w-full"
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg border shrink-0 mt-0.5", cfg.bg)}>
          <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-[9px] font-black uppercase tracking-widest", cfg.color)}>{cfg.label}</span>
            <span className="text-ink-tertiary text-[9px]">· {article.season}</span>
            {article.isPredicted && (
              <span className="text-[8px] font-bold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 rounded">PREDICTED</span>
            )}
          </div>
          <h3 className="font-bold text-zinc-100 text-sm leading-snug group-hover:text-white line-clamp-2">{article.headline}</h3>
          {preview && <p className="text-ink-secondary text-[11px] mt-1.5 leading-relaxed line-clamp-2">{preview}…</p>}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-ink-tertiary">{displayByline(article.byline, brand, staffByline)}</span>
            <span className="text-ink-tertiary">·</span>
            <span className="text-[10px] text-ink-tertiary">{new Date(article.createdAt).toLocaleDateString()}</span>
            <ChevronRight className="h-3 w-3 text-ink-tertiary ml-auto group-hover:text-zinc-400 transition-colors" />
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Article reader ─────────────────────────────────────────────────────────────

function ArticleReader({
  article,
  onClose,
  leagueName,
  brand,
}: {
  article: Article;
  onClose: () => void;
  leagueName: string;
  brand: NewsroomBrand;
}) {
  const copy = BRAND[brand];
  const cfg = ARTICLE_TYPE_CFG[article.articleType] ?? ARTICLE_TYPE_CFG.season_archive;
  const Icon = cfg.icon;
  const displayLeague = leagueName || copy.aiBrand;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onClose} className="flex items-center gap-2 text-xs text-ink-secondary hover:text-zinc-300 transition-colors mb-6">
          {copy.backLabel}
        </button>

        <div className="border-b-2 border-zinc-800 pb-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn("p-1.5 rounded-lg border", cfg.bg)}>
              <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
            </div>
            <span className={cn("text-[10px] font-black uppercase tracking-widest", cfg.color)}>{cfg.label}</span>
            <span className="text-ink-tertiary text-[10px]">· {displayLeague} · Season {article.season}</span>
            {article.isPredicted && (
              <span className="text-[9px] font-bold uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 rounded ml-auto">PREDICTED — NOT OFFICIAL</span>
            )}
          </div>
          <h1 className="text-2xl font-black text-white leading-tight mb-2">{article.headline}</h1>
          {article.subheadline && <p className="text-zinc-400 text-sm italic">{article.subheadline}</p>}
          <div className="flex items-center gap-3 mt-3 text-[11px] text-ink-tertiary">
            <span>{displayByline(article.byline, brand, copy.staffByline)}</span>
            <span>·</span>
            <span>{new Date(article.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>

        <ArticleBody body={article.body} />

        <div className="mt-8 p-3 rounded-lg border border-zinc-800/40 bg-zinc-900/20 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-ink-tertiary shrink-0 mt-0.5" />
          <p className="text-[10px] text-ink-secondary leading-relaxed">
            Generated by {copy.aiBrand} AI from verified database records. All scores, records, and standings are sourced directly from the {displayLeague} database. No statistics were fabricated.
            {article.isPredicted && " Keeper predictions are estimated from historical data and are NOT official decisions."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Generate button ────────────────────────────────────────────────────────────

function GenerateControls({ onRefresh, onSwitchToFeed, leagueContextKey }: { onRefresh: () => void; onSwitchToFeed: () => void; leagueContextKey: string }) {
  const _trpc = trpc as any;
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const genAll   = _trpc.leagueNewsroom.generateAllChampionshipMarches.useMutation();
  const genRoster = _trpc.leagueNewsroom.generateRosterConstruction.useMutation();
  const genKeeper = _trpc.leagueNewsroom.generateKeeperPreviews.useMutation();

  async function handleGenAll() {
    setLoading(true);
    setStatus("Generating championship march articles for all seasons…");
    try {
      const r = await genAll.mutateAsync({ activeLeagueKey: leagueContextKey });
      const done = r.results?.filter((x: any) => x.status === "generated").length ?? 0;
      const cached = r.results?.filter((x: any) => x.status === "cached").length ?? 0;
      setStatus(`✓ Generated ${done} new articles (${cached} already cached). Switching to feed...`);
      onRefresh();
      setTimeout(() => onSwitchToFeed(), 500);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally { setLoading(false); }
  }

  async function handleRoster() {
    setLoading(true);
    setStatus("Generating 2026 roster construction report…");
    try {
      const r = await genRoster.mutateAsync({ season: 2026, activeLeagueKey: leagueContextKey });
      setStatus(`✓ ${r.headline}`);
      onRefresh();
      setTimeout(() => onSwitchToFeed(), 500);
    } catch (e: any) { setStatus(`Error: ${e.message}`); }
    finally { setLoading(false); }
  }

  async function handleKeeper() {
    setLoading(true);
    setStatus("Generating keeper preview article…");
    try {
      const r = await genKeeper.mutateAsync({ draftYear: new Date().getFullYear(), activeLeagueKey: leagueContextKey });
      setStatus(`✓ ${r.headline}`);
      onRefresh();
    } catch (e: any) { setStatus(`Error: ${e.message}`); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-[15px] border border-white/[0.07] bg-[linear-gradient(180deg,#1f1624,#18111c)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-lime-400" />
        <span className="text-sm font-bold text-[#f3f8ff]">Generate Articles</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleGenAll}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
        >
          <Trophy className="h-3 w-3" />
          All Championship Marches
        </button>
        <button
          onClick={handleRoster}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-bold hover:bg-violet-500/20 transition-colors disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          2026 Roster Report
        </button>
        <button
          onClick={handleKeeper}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-500/10 border border-lime-500/30 text-lime-300 text-xs font-bold hover:bg-lime-500/20 transition-colors disabled:opacity-50"
        >
          <Zap className="h-3 w-3" />
          Keeper Preview
        </button>
      </div>
      {(loading || status) && (
        <div className="flex items-center gap-2 text-xs">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-lime-400" />}
          <span className={loading ? "text-zinc-400" : "text-lime-400"}>{status}</span>
        </div>
      )}
    </div>
  );
}

// ── Main newsroom ──────────────────────────────────────────────────────────────

export type LeagueWireNewsroomProps = {
  brand?: NewsroomBrand;
  hideMasthead?: boolean;
  initialView?: "feed" | "archive";
  embedded?: boolean;
  initialArticleId?: number | null;
  onArticleOpen?: (articleId: number) => void;
  onArticleClose?: () => void;
};

export function LeagueWireNewsroom({
  brand = "league-wire",
  hideMasthead = false,
  initialView = "feed",
  embedded = false,
  initialArticleId = null,
  onArticleOpen,
  onArticleClose,
}: LeagueWireNewsroomProps) {
  const copy = BRAND[brand];
  const _trpc = trpc as any;
  const utils = trpc.useUtils();
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const [view, setView]               = useState<"feed" | "archive">(initialView);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [openArticle, setOpenArticle] = useState<Article | null>(null);

  const activeLeagueQ = _trpc.league.getActive.useQuery(undefined, {
    enabled: leagueKeyReady,
  });
  const leagueName: string =
    leagueKeyReady && activeLeagueQ.data?.leagueName ? activeLeagueQ.data.leagueName : "";

  const seasonsQ = _trpc.leagueNewsroom.getArchiveSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const seasons = leagueKeyReady ? (seasonsQ.data ?? []) : [];

  const feedQ = _trpc.leagueNewsroom.getNewsroomFeed.useQuery(
    withLeagueSalt({ limit: initialArticleId ? 50 : 30 }, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const feedArticles = leagueKeyReady ? (feedQ.data ?? []) : [];
  const feedLoading = feedQ.isLoading;
  const refetchFeed = feedQ.refetch;

  const seasonArticlesQ = _trpc.leagueNewsroom.getSeasonArticles.useQuery(
    withLeagueSalt({ season: selectedSeason! }, leagueContextKey),
    { enabled: leagueKeyReady && selectedSeason !== null },
  );
  const seasonArticles = leagueKeyReady ? (seasonArticlesQ.data ?? []) : [];
  const seasonLoading = seasonArticlesQ.isLoading;

  const availableWeeksQ = _trpc.leagueWire.getAvailableWeeks.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const availableWeeks = leagueKeyReady ? (availableWeeksQ.data ?? []) : [];
  const latestWireWeek = useMemo(() => availableWeeks[0] ?? null, [availableWeeks]);
  const postgameInput =
    leagueKeyReady && latestWireWeek != null
      ? withLeagueSalt(
          { season: latestWireWeek.season, week: latestWireWeek.week },
          leagueContextKey,
        )
      : skipToken;
  const wireReportsQ = _trpc.leagueWire.getPostgameReports.useQuery(postgameInput);
  const wireReports = leagueKeyReady && latestWireWeek != null ? (wireReportsQ.data ?? []) : [];

  useEffect(() => {
    if (!initialArticleId) setOpenArticle(null);
  }, [leagueContextKey, initialArticleId]);

  const handleOpenArticle = useCallback(
    (article: Article) => {
      setOpenArticle(article);
      onArticleOpen?.(article.id);
    },
    [onArticleOpen],
  );

  const handleCloseArticle = useCallback(() => {
    setOpenArticle(null);
    onArticleClose?.();
  }, [onArticleClose]);

  useEffect(() => {
    if (!initialArticleId || !leagueKeyReady || feedLoading) return;
    const inFeed = (feedArticles as Article[]).find((a) => a.id === initialArticleId);
    if (inFeed) {
      setOpenArticle(inFeed);
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const season of seasons as number[]) {
        try {
          const rows = await utils.leagueNewsroom.getSeasonArticles.fetch(
            withLeagueSalt({ season }, leagueContextKey),
          );
          const hit = (rows as Article[]).find((a) => a.id === initialArticleId);
          if (hit && !cancelled) {
            setOpenArticle(hit);
            setView("archive");
            setSelectedSeason(season);
            break;
          }
        } catch {
          // continue season lookup
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    initialArticleId,
    leagueKeyReady,
    feedLoading,
    feedArticles,
    seasons,
    leagueContextKey,
    utils.leagueNewsroom.getSeasonArticles,
  ]);

  useEffect(() => {
    setView(initialView);
    if (initialView === "feed") setSelectedSeason(null);
  }, [initialView]);

  useEffect(() => {
    const list = seasons as number[];
    setSelectedSeason((cur) => {
      if (cur == null) return null;
      return list.includes(cur) ? cur : null;
    });
  }, [leagueContextKey, seasons]);

  const displayArticles =
    !leagueKeyReady
      ? []
      : view === "archive" && selectedSeason
        ? seasonArticles
        : feedArticles;
  const isLoading =
    !leagueKeyReady ||
    (view === "archive" && selectedSeason ? seasonLoading : feedLoading);

  const pageBg = embedded ? undefined : { background: "radial-gradient(60% 80% at 80% -10%, rgba(139,92,246,.10), transparent 42%), #130e16" };

  return (
    <div
      className={cn(
        !embedded && "-m-4 md:-m-6 p-5 md:p-7 min-h-full text-zinc-100",
        embedded && "text-zinc-100",
      )}
      style={pageBg}
    >
      {openArticle && (
        <ArticleReader
          article={openArticle}
          onClose={handleCloseArticle}
          leagueName={leagueName}
          brand={brand}
        />
      )}

      {!hideMasthead && (
        <div className="border-b border-white/[0.06]">
          <div className="px-0 pb-4">
            <div className="flex items-center gap-3 mb-1">
              <div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[#f3f8ff] leading-none">
                  {copy.mastheadTitle}
                </h1>
                <p className="text-[11px] text-[#8b97a8] uppercase tracking-[0.2em] font-bold mt-1">
                  {copy.mastheadSubtitle(leagueName)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-0 mt-4 border-b border-white/[0.06] -mb-[1px]">
              <button onClick={() => { setView("feed"); setSelectedSeason(null); }}
                className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors",
                  view === "feed" ? "border-[#f3f8ff] text-[#f3f8ff]" : "border-transparent text-[#8b97a8] hover:text-[#dbe4f0]")}>
                <Radio className="h-3 w-3 inline mr-1.5" />Latest News
              </button>
              <button onClick={() => setView("archive")}
                className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors",
                  view === "archive" ? "border-[#a3e635] text-[#a3e635]" : "border-transparent text-[#8b97a8] hover:text-[#dbe4f0]")}>
                <BookOpen className="h-3 w-3 inline mr-1.5" />Historical Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {hideMasthead && (
        <div className="flex items-center gap-0 mb-6 border-b border-white/[0.06] -mb-[1px]">
          <button onClick={() => { setView("feed"); setSelectedSeason(null); }}
            className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors",
              view === "feed" ? "border-[#f3f8ff] text-[#f3f8ff]" : "border-transparent text-[#8b97a8] hover:text-[#dbe4f0]")}>
            <Radio className="h-3 w-3 inline mr-1.5" />Latest News
          </button>
          <button onClick={() => setView("archive")}
            className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors",
              view === "archive" ? "border-[#a3e635] text-[#a3e635]" : "border-transparent text-[#8b97a8] hover:text-[#dbe4f0]")}>
            <BookOpen className="h-3 w-3 inline mr-1.5" />Historical Archive
          </button>
        </div>
      )}

      <div className={cn(embedded ? "space-y-6" : "px-0 py-6 space-y-6")}>
        {view === "archive" && (
          <div>
            <p className="text-xs text-[#8b97a8] mb-3 uppercase tracking-[0.2em] font-bold">Select Season</p>
            <div className="flex flex-wrap gap-2">
              {(seasons as number[]).map(s => (
                <button key={s} onClick={() => setSelectedSeason(s)}
                  className={cn("px-3 py-1.5 rounded-lg text-sm font-bold border transition-all",
                    selectedSeason === s
                      ? "border-[#a3e635]/50 bg-[#a3e635]/10 text-[#a3e635]"
                      : "border-white/10 text-[#8b97a8] hover:border-white/25 hover:text-[#dbe4f0]"
                  )}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <GenerateControls onRefresh={() => { void refetchFeed(); }} onSwitchToFeed={() => { setView("feed"); setSelectedSeason(null); }} leagueContextKey={leagueContextKey} />

        {view === "feed" && (wireReports as any[]).length > 0 && (
          <div className="rounded-[15px] border border-white/[0.07] bg-[linear-gradient(180deg,#1f1624,#18111c)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <Radio className="h-3.5 w-3.5 text-[#a3e635] animate-pulse" />
              <span className="text-xs font-black text-[#f3f8ff] uppercase tracking-wider">Live Wire</span>
              <span className="text-[10px] text-ink-tertiary">Season {latestWireWeek?.season} · Week {latestWireWeek?.week}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px bg-white/[0.06]">
              {(wireReports as any[]).filter(r => r.winner).map((r: any) => (
                <div key={r.matchupId} className="p-3 bg-white/[0.02]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-zinc-100 truncate max-w-[140px]">{r.winner.name}</div>
                      <div className="text-[10px] text-ink-secondary truncate max-w-[140px]">{r.loser?.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-lime-400 tabular-nums">{r.winner.score.toFixed(2)}</div>
                      <div className="text-xs text-ink-secondary tabular-nums">{r.loser?.score.toFixed(2)}</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-ink-secondary mt-1.5 line-clamp-1">{r.shortRecap?.split(".")[0]}.</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-ink-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[#a3e635]" />
            Loading articles…
          </div>
        ) : (displayArticles as Article[]).length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <FileText className="h-8 w-8 text-ink-tertiary mx-auto" />
            <p className="text-zinc-400 font-semibold">
              {view === "archive" && selectedSeason ? `No articles for ${selectedSeason} yet` : "No articles yet"}
            </p>
            <p className="text-ink-secondary text-sm">{copy.emptyHelp}</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#8b97a8]">
                {view === "archive" && selectedSeason ? `${selectedSeason} Season Archive` : "Latest Stories"}
              </h2>
              <div className="flex-1 h-px bg-zinc-800/60" />
              <span className="text-[10px] text-ink-tertiary">{(displayArticles as Article[]).length} articles</span>
            </div>

            {(() => {
              const champArticle = (displayArticles as Article[]).find(a => a.articleType === "championship_march");
              const otherArticles = (displayArticles as Article[]).filter(a => a.articleType !== "championship_march" || a.id !== champArticle?.id);

              return (
                <div className="space-y-6">
                  {champArticle && (
                    <button
                      onClick={() => handleOpenArticle(champArticle)}
                      className="w-full text-left rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/5 to-zinc-900/60 p-5 hover:border-amber-500/40 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Trophy className="h-4 w-4 text-amber-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Championship March · {champArticle.season}</span>
                      </div>
                      <h2 className="text-xl font-black text-white leading-snug group-hover:text-amber-100 transition-colors mb-2">
                        {champArticle.headline}
                      </h2>
                      <p className="text-zinc-400 text-sm leading-relaxed line-clamp-3">
                        {champArticle.body.replace(/\*\*/g,"").replace(/\*/g,"").split("\n").filter(l => l.trim()).slice(3,5).join(" ").slice(0, 250)}…
                      </p>
                      <div className="flex items-center gap-2 mt-3 text-[10px] text-ink-tertiary">
                        <span>{displayByline(champArticle.byline, brand, copy.staffByline)}</span>
                        <span>·</span>
                        <span>{new Date(champArticle.createdAt).toLocaleDateString()}</span>
                        <ChevronRight className="h-3 w-3 ml-auto text-ink-tertiary group-hover:text-amber-400 transition-colors" />
                      </div>
                    </button>
                  )}

                  {otherArticles.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {otherArticles.map(a => (
                        <ArticleCard
                          key={a.id}
                          article={a}
                          onOpen={handleOpenArticle}
                          staffByline={copy.staffByline}
                          brand={brand}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {view === "feed" && (seasons as number[]).length > 0 && (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Archive className="h-3.5 w-3.5 text-ink-secondary" />
              <span className="text-xs font-black uppercase tracking-wider text-ink-secondary">Historical Archive</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(seasons as number[]).map(s => (
                <button key={s} onClick={() => { setView("archive"); setSelectedSeason(s); }}
                  className="px-2.5 py-1 rounded text-xs font-bold border border-zinc-800 text-ink-tertiary hover:border-amber-500/40 hover:text-amber-400 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
