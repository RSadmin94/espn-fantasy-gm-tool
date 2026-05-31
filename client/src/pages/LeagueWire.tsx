import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Radio, BookOpen, Trophy, Loader2, RefreshCw,
  Sparkles, Archive, FileText, Calendar, ChevronRight,
  AlertCircle, Newspaper, Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Article {
  id: number; season: number; articleType: string; slug: string;
  category: string; headline: string; subheadline?: string; body: string;
  byline?: string; isPredicted: boolean; createdAt: string;
}

const ARTICLE_TYPE_CFG: Record<string, { icon: any; color: string; label: string; bg: string }> = {
  championship_march: { icon: Trophy,     color: "text-amber-400",   label: "Championship March", bg: "bg-amber-500/10 border-amber-500/30" },
  keeper_preview:     { icon: Zap,        color: "text-emerald-400", label: "Keeper Preview",     bg: "bg-emerald-500/10 border-emerald-500/30" },
  roster_construction:{ icon: Sparkles,   color: "text-sky-400",     label: "Roster Report",      bg: "bg-sky-500/10 border-sky-500/30" },
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
          return <p key={i} className="text-zinc-500 italic text-xs">{line.slice(1, -1)}</p>;
        }
        if (line.startsWith("**Evidence:")) {
          return <p key={i} className="text-[10px] text-zinc-600 border-t border-zinc-800 pt-2 mt-3">{line.replace(/\*\*/g,"")}</p>;
        }
        return <p key={i} className="text-sm leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

// ── Article card ───────────────────────────────────────────────────────────────

function ArticleCard({ article, onOpen }: { article: Article; onOpen: (a: Article) => void }) {
  const cfg = ARTICLE_TYPE_CFG[article.articleType] ?? ARTICLE_TYPE_CFG.season_archive;
  const Icon = cfg.icon;
  const preview = article.body.replace(/\*\*/g, "").replace(/\*/g, "").split("\n").filter(l => l.trim() && !l.startsWith("Evidence")).slice(2, 4).join(" ").slice(0, 180);

  return (
    <button
      onClick={() => onOpen(article)}
      className="text-left rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 hover:border-zinc-600/60 hover:bg-zinc-800/40 transition-all group w-full"
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg border shrink-0 mt-0.5", cfg.bg)}>
          <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-[9px] font-black uppercase tracking-widest", cfg.color)}>{cfg.label}</span>
            <span className="text-zinc-700 text-[9px]">· {article.season}</span>
            {article.isPredicted && (
              <span className="text-[8px] font-bold uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 rounded">PREDICTED</span>
            )}
          </div>
          <h3 className="font-bold text-zinc-100 text-sm leading-snug group-hover:text-white line-clamp-2">{article.headline}</h3>
          {preview && <p className="text-zinc-500 text-[11px] mt-1.5 leading-relaxed line-clamp-2">{preview}…</p>}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-zinc-600">{article.byline ?? "League Wire Staff"}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-[10px] text-zinc-700">{new Date(article.createdAt).toLocaleDateString()}</span>
            <ChevronRight className="h-3 w-3 text-zinc-700 ml-auto group-hover:text-zinc-400 transition-colors" />
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Article reader ─────────────────────────────────────────────────────────────

function ArticleReader({ article, onClose }: { article: Article; onClose: () => void }) {
  const cfg = ARTICLE_TYPE_CFG[article.articleType] ?? ARTICLE_TYPE_CFG.season_archive;
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onClose} className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-6">
          ← Back to Newsroom
        </button>

        {/* Article header */}
        <div className="border-b-2 border-zinc-800 pb-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn("p-1.5 rounded-lg border", cfg.bg)}>
              <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
            </div>
            <span className={cn("text-[10px] font-black uppercase tracking-widest", cfg.color)}>{cfg.label}</span>
            <span className="text-zinc-600 text-[10px]">· {LEAGUE_NAME} · Season {article.season}</span>
            {article.isPredicted && (
              <span className="text-[9px] font-bold uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 rounded ml-auto">PREDICTED — NOT OFFICIAL</span>
            )}
          </div>
          <h1 className="text-2xl font-black text-white leading-tight mb-2">{article.headline}</h1>
          {article.subheadline && <p className="text-zinc-400 text-sm italic">{article.subheadline}</p>}
          <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-600">
            <span>{article.byline ?? "League Wire Staff"}</span>
            <span>·</span>
            <span>{new Date(article.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </div>

        {/* Article body */}
        <ArticleBody body={article.body} />

        {/* AI disclaimer */}
        <div className="mt-8 p-3 rounded-lg border border-zinc-800/40 bg-zinc-900/20 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-zinc-600 shrink-0 mt-0.5" />
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Generated by League Wire AI from verified database records. All scores, records, and standings are sourced directly from the {LEAGUE_NAME} database. No statistics were fabricated.
            {article.isPredicted && " Keeper predictions are estimated from historical data and are NOT official decisions."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Generate button ────────────────────────────────────────────────────────────

function GenerateControls({ onRefresh }: { onRefresh: () => void }) {
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
      const r = await genAll.mutateAsync();
      const done = r.results?.filter((x: any) => x.status === "generated").length ?? 0;
      const cached = r.results?.filter((x: any) => x.status === "cached").length ?? 0;
      setStatus(`✓ Generated ${done} new articles (${cached} already cached)`);
      onRefresh();
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally { setLoading(false); }
  }

  async function handleRoster() {
    setLoading(true);
    setStatus("Generating 2026 roster construction report…");
    try {
      const r = await genRoster.mutateAsync({ season: 2026 });
      setStatus(`✓ ${r.headline}`);
      onRefresh();
    } catch (e: any) { setStatus(`Error: ${e.message}`); }
    finally { setLoading(false); }
  }

  async function handleKeeper() {
    setLoading(true);
    setStatus("Generating keeper preview article…");
    try {
      const r = await genKeeper.mutateAsync({ draftYear: new Date().getFullYear() });
      setStatus(`✓ ${r.headline}`);
      onRefresh();
    } catch (e: any) { setStatus(`Error: ${e.message}`); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-bold text-zinc-200">Generate Articles</span>
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-bold hover:bg-sky-500/20 transition-colors disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          2026 Roster Report
        </button>
        <button
          onClick={handleKeeper}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          <Zap className="h-3 w-3" />
          Keeper Preview
        </button>
      </div>
      {(loading || status) && (
        <div className="flex items-center gap-2 text-xs">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />}
          <span className={loading ? "text-zinc-400" : "text-emerald-400"}>{status}</span>
        </div>
      )}
    </div>
  );
}

// ── League name constant ───────────────────────────────────────────────────────

const LEAGUE_NAME = "ATLANTAS FINEST FF";

// ── Main page ─────────────────────────────────────────────────────────────────

export function LeagueWire() {
  const _trpc = trpc as any;
  const [view, setView]               = useState<"feed" | "archive">("feed");
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [openArticle, setOpenArticle] = useState<Article | null>(null);
  const [refreshKey, setRefreshKey]   = useState(0);

  const { data: seasons = [] } = _trpc.leagueNewsroom.getArchiveSeasons.useQuery();
  const { data: feedArticles = [], isLoading: feedLoading, refetch: refetchFeed } =
    _trpc.leagueNewsroom.getNewsroomFeed.useQuery({ limit: 30 }, { queryKey: ["feed", refreshKey] });
  const { data: seasonArticles = [], isLoading: seasonLoading } =
    _trpc.leagueNewsroom.getSeasonArticles.useQuery(
      { season: selectedSeason! },
      { enabled: selectedSeason !== null }
    );

  // Also pull legacy wire reports
  const { data: availableWeeks = [] } = _trpc.leagueWire.getAvailableWeeks.useQuery();
  const latestWireWeek = useMemo(() => availableWeeks[0] ?? null, [availableWeeks]);
  const { data: wireReports = [] } = _trpc.leagueWire.getPostgameReports.useQuery(
    { season: latestWireWeek?.season, week: latestWireWeek?.week },
    { enabled: latestWireWeek !== null }
  );

  const displayArticles = view === "archive" && selectedSeason ? seasonArticles : feedArticles;
  const isLoading = view === "archive" && selectedSeason ? seasonLoading : feedLoading;

  return (
    <div className="min-h-screen bg-[#08080d] text-zinc-100">

      {/* Open article overlay */}
      {openArticle && <ArticleReader article={openArticle} onClose={() => setOpenArticle(null)} />}

      {/* Masthead */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/50">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-1">
            <Newspaper className="h-6 w-6 text-zinc-300" />
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white leading-none">League Wire</h1>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mt-0.5">{LEAGUE_NAME} · Official Newsroom</p>
            </div>
          </div>

          {/* Nav tabs */}
          <div className="flex items-center gap-0 mt-4 border-b border-zinc-800/60 -mb-[1px]">
            <button onClick={() => { setView("feed"); setSelectedSeason(null); }}
              className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors",
                view === "feed" ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
              <Radio className="h-3 w-3 inline mr-1.5" />Latest News
            </button>
            <button onClick={() => setView("archive")}
              className={cn("px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors",
                view === "archive" ? "border-amber-400 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
              <BookOpen className="h-3 w-3 inline mr-1.5" />Historical Archive
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Archive season selector */}
        {view === "archive" && (
          <div>
            <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-semibold">Select Season</p>
            <div className="flex flex-wrap gap-2">
              {(seasons as number[]).map(s => (
                <button key={s} onClick={() => setSelectedSeason(s)}
                  className={cn("px-3 py-1.5 rounded-lg text-sm font-bold border transition-all",
                    selectedSeason === s
                      ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                      : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                  )}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Generate controls */}
        <GenerateControls onRefresh={() => setRefreshKey(k => k + 1)} />

        {/* Live Wire reports (latest scores) - only in feed view */}
        {view === "feed" && (wireReports as any[]).length > 0 && (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/40">
              <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
              <span className="text-xs font-black text-zinc-200 uppercase tracking-wider">Live Wire</span>
              <span className="text-[10px] text-zinc-600">Season {latestWireWeek?.season} · Week {latestWireWeek?.week}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px bg-zinc-800/30">
              {(wireReports as any[]).filter(r => r.winner).map((r: any) => (
                <div key={r.matchupId} className="p-3 bg-zinc-900/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-zinc-100 truncate max-w-[140px]">{r.winner.name}</div>
                      <div className="text-[10px] text-zinc-600 truncate max-w-[140px]">{r.loser?.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-emerald-400 tabular-nums">{r.winner.score.toFixed(2)}</div>
                      <div className="text-xs text-zinc-600 tabular-nums">{r.loser?.score.toFixed(2)}</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1.5 line-clamp-1">{r.shortRecap?.split(".")[0]}.</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Articles */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-zinc-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            Loading articles…
          </div>
        ) : (displayArticles as Article[]).length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <FileText className="h-8 w-8 text-zinc-700 mx-auto" />
            <p className="text-zinc-400 font-semibold">
              {view === "archive" && selectedSeason ? `No articles for ${selectedSeason} yet` : "No articles yet"}
            </p>
            <p className="text-zinc-600 text-sm">
              Use the Generate Articles buttons above to create the first League Wire stories.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">
                {view === "archive" && selectedSeason ? `${selectedSeason} Season Archive` : "Latest Stories"}
              </h2>
              <div className="flex-1 h-px bg-zinc-800/60" />
              <span className="text-[10px] text-zinc-600">{(displayArticles as Article[]).length} articles</span>
            </div>

            {/* Championship march gets featured treatment */}
            {(() => {
              const champArticle = (displayArticles as Article[]).find(a => a.articleType === "championship_march");
              const otherArticles = (displayArticles as Article[]).filter(a => a.articleType !== "championship_march" || a.id !== champArticle?.id);

              return (
                <div className="space-y-6">
                  {champArticle && (
                    <button
                      onClick={() => setOpenArticle(champArticle)}
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
                      <div className="flex items-center gap-2 mt-3 text-[10px] text-zinc-600">
                        <span>{champArticle.byline}</span>
                        <span>·</span>
                        <span>{new Date(champArticle.createdAt).toLocaleDateString()}</span>
                        <ChevronRight className="h-3 w-3 ml-auto text-zinc-700 group-hover:text-amber-400 transition-colors" />
                      </div>
                    </button>
                  )}

                  {otherArticles.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {otherArticles.map(a => <ArticleCard key={a.id} article={a} onOpen={setOpenArticle} />)}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Archive index — seasons with articles */}
        {view === "feed" && (seasons as number[]).length > 0 && (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Archive className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Historical Archive</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(seasons as number[]).map(s => (
                <button key={s} onClick={() => { setView("archive"); setSelectedSeason(s); }}
                  className="px-2.5 py-1 rounded text-xs font-bold border border-zinc-800 text-zinc-600 hover:border-amber-500/40 hover:text-amber-400 transition-colors">
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
