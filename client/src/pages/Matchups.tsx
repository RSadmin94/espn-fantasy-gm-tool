import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2 } from "lucide-react";

const CURRENT_YEAR = new Date().getFullYear();
const SEASONS_DESC = Array.from({ length: CURRENT_YEAR - 2009 + 1 }, (_, i) => CURRENT_YEAR - i);

type TeamSide = {
  teamId: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  logoUrl: string;
  rank: number | null;
};

type ScoreboardRow = {
  id: number;
  week: number;
  matchupPeriodId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  winnerTeamId: number | null;
  isCompleted: boolean;
  isPlayoff: boolean;
  winnerSide: "home" | "away" | "tie" | "undecided";
  home: TeamSide;
  away: TeamSide;
};

function fmtScore(n: number) {
  return n.toFixed(2);
}

function recLine(t: TeamSide) {
  const base = `${t.wins}-${t.losses}`;
  const rk = t.rank != null ? ` (#${t.rank})` : "";
  return `${base}${rk}`;
}

function TeamColumn({
  side,
  score,
  align,
  isWinner,
}: {
  side: TeamSide;
  score: number;
  align: "left" | "right";
  isWinner: boolean;
}) {
  const logo = side.logoUrl?.trim();
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg p-3 sm:p-4",
        align === "right" && "items-end text-right",
        align === "left" && "items-start text-left",
        isWinner && "bg-primary/10 ring-1 ring-primary/25"
      )}
    >
      <div className={cn("flex items-center gap-3", align === "right" && "flex-row-reverse")}>
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-muted/40",
            isWinner && "border-primary/40"
          )}
        >
          {logo ? (
            <img src={logo} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">
              {(side.teamName || "?").slice(0, 3).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div
            className={cn(
              "truncate text-base font-bold leading-tight text-foreground",
              isWinner && "text-primary"
            )}
          >
            {side.teamName}
          </div>
          {side.ownerName ? (
            <div className="truncate text-sm text-muted-foreground">{side.ownerName}</div>
          ) : null}
          <div className="text-xs text-muted-foreground">{recLine(side)}</div>
        </div>
      </div>
      <div
        className={cn(
          "font-mono text-3xl font-bold tabular-nums sm:text-4xl",
          isWinner ? "text-primary" : "text-foreground"
        )}
      >
        {fmtScore(score)}
      </div>
    </div>
  );
}

export function Matchups() {
  const cachedQ = trpc.espn.cachedSeasons.useQuery();

  const cachedSeasons: number[] = cachedQ.data ?? [];

  const defaultSeason =
    cachedSeasons.length > 0 ? Math.max(...cachedSeasons) : Math.min(CURRENT_YEAR, 2025);

  const [season, setSeason] = useState(defaultSeason);
  const [week, setWeek] = useState(1);

  const boardQ = trpc.espn.matchupsScoreboard.useQuery(
    { season, week },
    { staleTime: 30_000 }
  );

  const maxWeek = boardQ.data?.maxWeek ?? 0;
  const rows = (boardQ.data?.matchups as ScoreboardRow[] | undefined) ?? [];
  const boardSource = boardQ.data?.dataSource as string | undefined;

  useEffect(() => {
    setWeek(1);
  }, [season]);

  useEffect(() => {
    if (maxWeek > 0 && week > maxWeek) setWeek(maxWeek);
  }, [maxWeek, week]);

  const weekOptions = useMemo(() => {
    const n = maxWeek > 0 ? maxWeek : 18;
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [maxWeek]);

  const isNotCached = !cachedSeasons.includes(season);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-1">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Matchups</h1>
        <p className="mt-1 text-muted-foreground">
          Head-to-head scores by week (from synced league data).
        </p>
        {boardSource === "verified_manual" && (
          <p className="mt-2 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
            Source: verified_manual
          </p>
        )}
        {boardSource === "cache" && (
          <p className="mt-2 rounded-md border border-blue-500/35 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300">
            Source: ESPN combined cache (not yet backfilled to DB)
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-[7.5rem]">
          <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEASONS_DESC.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  <span className="flex items-center gap-1.5">
                    {s}
                    {cachedSeasons.includes(s) && (
                      <span className="text-xs text-emerald-400">✓</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[7.5rem]">
          <Select
            value={String(week)}
            onValueChange={(v) => setWeek(Number(v))}
            disabled={boardQ.isLoading || weekOptions.length === 0}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Week" />
            </SelectTrigger>
            <SelectContent>
              {weekOptions.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  Week {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {maxWeek > 0 && (
          <span className="text-sm text-muted-foreground">
            {rows.length} matchup{rows.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {isNotCached && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Season {season} is not cached yet.{" "}
          <a href="/sync" className="underline underline-offset-2">
            Sync data
          </a>{" "}
          to populate matchups.
        </div>
      )}

      {boardQ.isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading matchups…
        </div>
      )}

      {boardQ.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {boardQ.error.message}
        </div>
      )}

      {!boardQ.isLoading && !boardQ.isError && maxWeek === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          <p>No matchup data found for {season} — not in gmMatchups or combined cache.</p>
          <p className="mt-2">
            Use <a href="/sync" className="underline underline-offset-2">Sync Data</a> → "Fetch Historical Matchups" to import from ESPN,
            or run a full season sync to populate the database.
          </p>
        </div>
      )}

      {!boardQ.isLoading && !boardQ.isError && maxWeek > 0 && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          No matchups for {season} week {week}.
        </div>
      )}

      <div className="space-y-4">
        {rows.map((m) => {
          const homeWon = m.winnerSide === "home";
          const awayWon = m.winnerSide === "away";
          const tie = m.winnerSide === "tie";

          return (
            <Card key={m.id} className="overflow-hidden border-border/80">
              <CardContent className="p-0">
                {m.isPlayoff && (
                  <div className="border-b border-border/60 bg-muted/30 px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Playoffs
                  </div>
                )}
                <div className="grid grid-cols-1 items-stretch gap-3 p-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-0">
                  <TeamColumn side={m.home} score={m.homeScore} align="right" isWinner={homeWon} />

                  <div className="flex flex-col items-center justify-center px-2 py-2 sm:min-w-[4rem]">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      vs
                    </span>
                    <div
                      className={cn(
                        "mt-1 hidden font-mono text-xl font-bold tabular-nums sm:block",
                        tie ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {fmtScore(m.homeScore)}
                      <span className="mx-1 text-muted-foreground">—</span>
                      {fmtScore(m.awayScore)}
                    </div>
                  </div>

                  <TeamColumn side={m.away} score={m.awayScore} align="left" isWinner={awayWon} />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border/50 bg-muted/20 px-2 py-2 sm:hidden">
                  <div
                    className={cn(
                      "font-mono text-2xl font-bold tabular-nums",
                      tie ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    <span className={cn(homeWon && "text-primary")}>{fmtScore(m.homeScore)}</span>
                    <span className="mx-2 text-muted-foreground">—</span>
                    <span className={cn(awayWon && "text-primary")}>{fmtScore(m.awayScore)}</span>
                  </div>
                  {!m.isCompleted && (
                    <span className="text-[10px] font-semibold uppercase text-amber-500">Live</span>
                  )}
                </div>

                {m.isCompleted && (
                  <div className="hidden border-t border-border/50 bg-muted/15 px-2 py-1.5 text-center text-[10px] text-muted-foreground sm:block">
                    {tie ? "Tie game" : homeWon ? `${m.home.teamName} wins` : `${m.away.teamName} wins`}
                  </div>
                )}
                {!m.isCompleted && (
                  <div className="hidden border-t border-border/50 bg-amber-500/5 px-2 py-1.5 text-center text-[10px] font-semibold uppercase text-amber-600 sm:block">
                    Matchup in progress
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
