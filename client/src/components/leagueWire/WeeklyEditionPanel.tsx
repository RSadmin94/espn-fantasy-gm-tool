import { useEffect, useMemo, useRef } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { Radio, Sparkles, Trophy, Swords, Loader2 } from "lucide-react";

type EditionStory = {
  eventId: string;
  eventType: string;
  presentationLabel: string;
  dek: string;
  subject: string;
  opponent: string | null;
  headlineScore?: { drama: number; consequence: number; historical: number; dominance: number; rarity: number; total: number };
  composedFrom: string[];
  generateSofia: boolean;
};

type Superlatives = {
  highScore: { name: string; owner: string; score: number } | null;
  lowScore: { name: string; owner: string; score: number } | null;
  closestGame: { home: string; away: string; margin: number; homeScore: number; awayScore: number } | null;
  biggestBlowout: { winner: string; loser: string; margin: number } | null;
  weekMvp: { player: string; points: number; position: string; owner: string; share: number | null } | null;
  biggestLineupRegret: { owner: string; player: string; net: number; impact: string } | null;
  leagueAverage: number;
};

type OwnerTake = {
  teamId: number;
  ownerName: string;
  eventType: string;
  presentationLabel: string;
  dek: string;
  generateSofia: boolean;
  eventId: string;
};

type MatchupRow = {
  homeTeamId: number;
  awayTeamId: number;
  homeOwner: string;
  awayOwner: string;
  homeScore: number;
  awayScore: number;
  margin: number;
  winnerTeamId: number | null;
};

function narrativeFor(eventId: string | undefined, rows: Array<{ eventId: string; headline: string | null; bodyText: string | null }>) {
  if (!eventId) return null;
  return rows.find((n) => n.eventId === eventId) ?? null;
}

function SuperlativeChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 min-w-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-[11px] font-semibold text-zinc-100 truncate mt-0.5">{value}</div>
    </div>
  );
}

export function WeeklyEditionPanel({
  season,
  week,
  variant = "full",
}: {
  season?: number;
  week?: number;
  variant?: "full" | "rail" | "feed" | "newsroom";
}) {
  const _trpc = trpc as any;
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const input =
    leagueKeyReady && season != null && week != null
      ? withLeagueSalt({ season, week }, leagueContextKey)
      : leagueKeyReady
        ? withLeagueSalt({}, leagueContextKey)
        : skipToken;

  const q = _trpc.weeklyStorylines.getEdition.useQuery(input, { staleTime: 30_000 });
  const ensure = _trpc.weeklyStorylines.ensureEdition.useMutation();
  const ensureTake = _trpc.weeklyStorylines.ensureOwnerTake.useMutation();
  const asked = useRef(false);

  const edition = q.data?.edition as
    | {
        week: number;
        season: number;
        headline: EditionStory | null;
        majorStories: EditionStory[];
        superlatives: Superlatives;
        matchups: MatchupRow[];
        ownerTakes: OwnerTake[];
        oneThatGotAway: EditionStory | null;
        rivalryStory: EditionStory | null;
      }
    | undefined;
  const narratives = (q.data?.narratives ?? []) as Array<{ eventId: string; headline: string | null; bodyText: string | null; status: string }>;
  const ownerTake = (q.data?.ownerTake ?? null) as OwnerTake | null;

  useEffect(() => {
    if (!leagueKeyReady || !edition?.headline || asked.current || ensure.isPending) return;
    const existing = narrativeFor(edition.headline.eventId, narratives);
    if (existing?.bodyText) return;
    asked.current = true;
    ensure.mutate(season != null && week != null ? withLeagueSalt({ season, week }, leagueContextKey) : withLeagueSalt({}, leagueContextKey), {
      onSettled: () => {
        void q.refetch();
      },
    });
  }, [leagueKeyReady, edition?.headline?.eventId, narratives, ensure, q, season, week, leagueContextKey]);

  const headlineCopy = useMemo(() => {
    if (!edition?.headline) return null;
    const n = narrativeFor(edition.headline.eventId, narratives);
    return {
      kicker: edition.headline.presentationLabel,
      headline: n?.headline || edition.headline.dek,
      body: n?.bodyText || edition.headline.dek,
      score: edition.headline.headlineScore,
    };
  }, [edition, narratives]);

  if (!leagueKeyReady) return null;
  if (q.isLoading && !edition) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-lime-400" />
        Loading the week…
      </div>
    );
  }
  if (!edition?.headline && !edition?.superlatives) return null;

  const sup = edition.superlatives;
  const mvpShare = sup.weekMvp?.share != null ? `${Math.round(sup.weekMvp.share * 100)}% of the team` : null;

  if (variant === "feed") {
    return (
      <div className="px-3 pb-2">
        {headlineCopy && (
          <div className="rounded-lg border border-lime-500/20 bg-lime-500/[0.06] p-3 mb-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-lime-400">{headlineCopy.kicker}</div>
            <p className="text-sm font-bold text-zinc-100 mt-1 leading-snug">{headlineCopy.headline}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {sup.weekMvp && <SuperlativeChip label="Week MVP" value={`${sup.weekMvp.player} ${sup.weekMvp.points}`} />}
          {sup.highScore && <SuperlativeChip label="High score" value={`${sup.highScore.owner} ${sup.highScore.score}`} />}
        </div>
      </div>
    );
  }

  if (variant === "rail") {
    return (
      <div className="space-y-3">
        {headlineCopy && (
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-lime-400">{headlineCopy.kicker}</div>
            <p className="text-sm font-semibold text-zinc-100 mt-1 leading-snug">{headlineCopy.headline}</p>
            <p className="text-[11px] text-zinc-400 mt-1 line-clamp-3">{headlineCopy.body}</p>
          </div>
        )}
        {sup.weekMvp && (
          <p className="text-[11px] text-zinc-400">
            <span className="text-zinc-500 font-black uppercase tracking-widest text-[9px] mr-2">Week MVP</span>
            {sup.weekMvp.player} {sup.weekMvp.points}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {headlineCopy && (
        <section className="rounded-[15px] border border-lime-500/25 bg-[linear-gradient(180deg,#1f1624,#18111c)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="h-3.5 w-3.5 text-lime-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-lime-400">{headlineCopy.kicker}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white leading-snug">{headlineCopy.headline}</h2>
          <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{headlineCopy.body}</p>
          {headlineCopy.score && (
            <p className="text-[10px] text-zinc-600 mt-3 tabular-nums">
              HEADLINE_SCORE drama {headlineCopy.score.drama} · consequence {headlineCopy.score.consequence} · historical {headlineCopy.score.historical} · dominance {headlineCopy.score.dominance} · rarity {headlineCopy.score.rarity} · total {headlineCopy.score.total}
            </p>
          )}
        </section>
      )}

      {edition.majorStories.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Around the league</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {edition.majorStories.map((s) => {
              const n = narrativeFor(s.eventId, narratives);
              return (
                <div key={s.eventId} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-widest text-violet-300">{s.presentationLabel}</div>
                  <p className="text-sm font-semibold text-zinc-100 mt-1 leading-snug">{n?.headline || s.dek}</p>
                  {n?.bodyText && <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed line-clamp-4">{n.bodyText}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Week {edition.week} superlatives</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sup.highScore && <SuperlativeChip label="High score" value={`${sup.highScore.owner} ${sup.highScore.score}`} />}
          {sup.lowScore && <SuperlativeChip label="Low score" value={`${sup.lowScore.owner} ${sup.lowScore.score}`} />}
          {sup.closestGame && <SuperlativeChip label="Closest game" value={`${sup.closestGame.home} by ${sup.closestGame.margin}`} />}
          {sup.biggestBlowout && <SuperlativeChip label="Biggest blowout" value={`${sup.biggestBlowout.winner} by ${sup.biggestBlowout.margin}`} />}
          {sup.weekMvp && (
            <SuperlativeChip
              label="Week MVP"
              value={`${sup.weekMvp.player} ${sup.weekMvp.position} ${sup.weekMvp.points}${mvpShare ? ` · ${mvpShare}` : ""}`}
            />
          )}
          {sup.biggestLineupRegret && (
            <SuperlativeChip
              label="Biggest lineup regret"
              value={`${sup.biggestLineupRegret.owner} ${sup.biggestLineupRegret.player} +${sup.biggestLineupRegret.net}`}
            />
          )}
          <SuperlativeChip label="League average" value={String(sup.leagueAverage)} />
        </div>
      </section>

      {variant === "full" && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Swords className="h-3.5 w-3.5 text-zinc-400" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Matchups</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/[0.06] rounded-xl overflow-hidden border border-white/[0.07]">
            {edition.matchups.map((m) => {
              const homeWon = m.winnerTeamId === m.homeTeamId;
              return (
                <div key={`${m.homeTeamId}-${m.awayTeamId}`} className="p-3 bg-[#18111c]">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className={cn("text-xs font-bold truncate", homeWon ? "text-zinc-100" : "text-zinc-500")}>{m.homeOwner}</div>
                      <div className={cn("text-xs font-bold truncate", !homeWon ? "text-zinc-100" : "text-zinc-500")}>{m.awayOwner}</div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className={cn("text-sm font-black", homeWon ? "text-lime-400" : "text-zinc-500")}>{m.homeScore.toFixed(2)}</div>
                      <div className={cn("text-sm font-black", !homeWon ? "text-lime-400" : "text-zinc-500")}>{m.awayScore.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {ownerTake && (
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-lime-400">{ownerTake.presentationLabel}</div>
          <p className="text-sm font-semibold text-zinc-100 mt-1">{ownerTake.dek}</p>
          {ownerTake.generateSofia && (
            <button
              type="button"
              className="mt-2 text-[11px] font-bold text-lime-400 hover:text-lime-300"
              onClick={() => {
                ensureTake.mutate(
                  season != null && week != null
                    ? withLeagueSalt({ season, week, teamId: ownerTake.teamId }, leagueContextKey)
                    : withLeagueSalt({ teamId: ownerTake.teamId }, leagueContextKey),
                  { onSettled: () => void q.refetch() },
                );
              }}
            >
              {ensureTake.isPending ? "Opening the booth…" : "Hear the Rivals take"}
            </button>
          )}
          {narrativeFor(ownerTake.eventId, narratives)?.bodyText && (
            <p className="text-[12px] text-zinc-300 mt-2 leading-relaxed">{narrativeFor(ownerTake.eventId, narratives)?.bodyText}</p>
          )}
        </section>
      )}

      {edition.rivalryStory && (
        <section className="rounded-xl border border-white/[0.07] p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{edition.rivalryStory.presentationLabel}</div>
          <p className="text-sm text-zinc-200 mt-1">{edition.rivalryStory.dek}</p>
        </section>
      )}
    </div>
  );
}
