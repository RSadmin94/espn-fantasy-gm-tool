import { Link } from "react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CinematicPageHeader, IntelPageShell } from "@/components/layout";
import { DashboardMatchupMarquee, type MarqueeTeam, type ScoreboardLite } from "@/components/dashboard/DashboardMatchupMarquee";
import { DashboardRecentLeagueEvents } from "@/components/dashboard/DashboardRecentLeagueEvents";
import { DashboardTimelineStrip, type TimelineChamp } from "@/components/dashboard/DashboardTimelineStrip";
import { LeagueWireNewsFeed } from "@/components/dashboard/LeagueWireNewsFeed";
import { MiniTable } from "@/components/dashboard/DashboardPrimitives";
import { FlagshipDiscoveryGrid } from "@/components/onboarding";
import { FreeExperienceJourney } from "@/components/dashboard/welcomeBackCoach/FreeExperienceSections";
import { V1 } from "@/lib/v1Copy";
import type { IntelligenceBeat } from "@/lib/welcomeBackCoachBriefing";
import {
  CoachCardShell,
  ExecutiveBriefingSection,
  IntelligenceTrioCard,
  SectionHeading,
} from "@/components/dashboard/welcomeBackCoach/WelcomeBackCoachSections";
import { cn } from "@/lib/utils";

type StandingRow = {
  teamId: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  displayRank: number;
};

export type WelcomeBackCoachHomeProps = {
  welcomeName: string;
  leagueName: string;
  subtitle: string;
  stateLine: string;
  season: number;
  seasonsDesc: number[];
  cachedSeasons: number[];
  onSeasonChange: (season: number) => void;
  isPreseason: boolean;
  isInSeason: boolean;
  weekLabel: string;
  briefingParagraph: string;
  briefingActionLabel: string;
  briefingActionHref: string;
  trio: IntelligenceBeat[];
  teamA: MarqueeTeam | null;
  teamB: MarqueeTeam | null;
  boardLite: ScoreboardLite | null;
  outlookPct: number | null;
  matchupLoading: boolean;
  opponentName: string | null;
  rivalryHeat: string | null;
  ranked: StandingRow[];
  myTeamId: number | null;
  formatRecord: (t: Pick<StandingRow, "wins" | "losses" | "ties">) => string;
  eventSeasons: number[];
  timelineChamps: TimelineChamp[];
  timelineLoading: boolean;
  thisWeekInHistory: string | null;
  freeProfileDisplayName: string;
  freeProfileCareerLine: string | null;
  freeProfileTitlesLine: string | null;
  freeProfileRivalName: string | null;
  freeProfileThreatLine: string | null;
  headerActions?: React.ReactNode;
};

function formatRecordDefault(t: Pick<StandingRow, "wins" | "losses" | "ties">): string {
  const ti = t.ties ?? 0;
  return ti > 0 ? `${t.wins}-${t.losses}-${ti}` : `${t.wins}-${t.losses}`;
}

export function WelcomeBackCoachHome(props: WelcomeBackCoachHomeProps) {
  const {
    welcomeName,
    leagueName,
    subtitle,
    stateLine,
    season,
    seasonsDesc,
    cachedSeasons,
    onSeasonChange,
    isPreseason,
    isInSeason,
    weekLabel,
    briefingParagraph,
    briefingActionLabel,
    briefingActionHref,
    trio,
    teamA,
    teamB,
    boardLite,
    outlookPct,
    matchupLoading,
    opponentName,
    rivalryHeat,
    ranked,
    myTeamId,
    formatRecord = formatRecordDefault,
    eventSeasons,
    timelineChamps,
    timelineLoading,
    thisWeekInHistory,
    freeProfileDisplayName,
    freeProfileCareerLine,
    freeProfileTitlesLine,
    freeProfileRivalName,
    freeProfileThreatLine,
  } = props;

  const snapshotRows = ranked.slice(0, 5);
  const myRow = myTeamId != null ? ranked.find((t) => t.teamId === myTeamId) : undefined;
  const showPinned =
    myRow && !snapshotRows.some((t) => t.teamId === myRow.teamId) ? myRow : null;

  return (
    <IntelPageShell
      width="full"
      background="none"
      minHeight="none"
      bleed={false}
      padding="none"
      className="mx-auto max-w-[1400px] space-y-8 bg-background px-4 pb-16 pt-6 sm:px-6"
    >
      {/* §1 Greeting + state-of-the-week */}
      <header className="space-y-4 border-b border-border pb-6">
        <CinematicPageHeader
          className="mb-0 [&_h1]:truncate"
          eyebrow={V1.home.eyebrow}
          title={welcomeName}
          subtitle={
            <>
              <span className="font-medium text-foreground">{leagueName}</span>
              {subtitle ? <span className="text-muted-foreground"> · {subtitle}</span> : null}
            </>
          }
          actions={
            <>
              <div className="w-full min-w-[160px] sm:w-48">
                <Select value={String(season)} onValueChange={(v) => onSeasonChange(Number(v))}>
                  <SelectTrigger className="border-border bg-card">
                    <SelectValue placeholder="Season" />
                  </SelectTrigger>
                  <SelectContent>
                    {seasonsDesc.map((s) => (
                      <SelectItem key={s} value={String(s)} disabled={!cachedSeasons.includes(s)}>
                        Season {s}
                        {!cachedSeasons.includes(s) ? " (not cached)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="shrink-0 border-red-500/25 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15"
              >
                <Link to="/sync" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  {V1.features.syncData}
                </Link>
              </Button>
            </>
          }
        />
        <p className="text-sm font-medium text-muted-foreground">
          <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-foreground/70">
            {V1.home.stateOfTheWeek}
          </span>
          <span className="mx-2 text-border">·</span>
          {stateLine}
        </p>
      </header>

      {/* §2 Executive Briefing */}
      <ExecutiveBriefingSection
        paragraph={briefingParagraph}
        actionLabel={briefingActionLabel}
        actionHref={briefingActionHref}
      />

      {isPreseason ? (
        <p className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-100/90">
          {V1.home.preseasonKickoffLine}
        </p>
      ) : null}

      <FreeExperienceJourney
        displayName={freeProfileDisplayName}
        careerLine={freeProfileCareerLine}
        titlesLine={freeProfileTitlesLine}
        rivalName={freeProfileRivalName}
        threatLine={freeProfileThreatLine}
        season={season}
        cachedSeasons={cachedSeasons}
        isPreseason={isPreseason}
      />

      {/* §3 This Week — in-season only */}
      {isInSeason && opponentName ? (
        <section aria-label={V1.home.thisWeek} className="space-y-4">
          <SectionHeading
            eyebrow={V1.home.thisWeek}
            title={V1.home.thisWeekVs.replace("{opponent}", opponentName)}
            action={
              <Link to="/matchups" className="text-xs font-medium text-red-400/90 hover:text-red-300">
                {V1.features.matchups} →
              </Link>
            }
          />
          <DashboardMatchupMarquee
            isLoading={matchupLoading}
            weekLabel={weekLabel}
            teamA={teamA}
            teamB={teamB}
            board={boardLite}
            winProbPct={outlookPct}
            winProbCaption="Uses weeklyAssessment.leaguePulse team outlook when available."
          />
          {rivalryHeat ? (
            <p className="text-sm text-muted-foreground">
              {V1.home.rivalryAngle}: <span className="font-medium text-foreground">{rivalryHeat}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* §4 Intelligence Trio */}
      {trio.length > 0 ? (
        <section aria-label={V1.home.intelligenceTrio} className="space-y-4">
          <SectionHeading eyebrow={V1.home.intelligenceTrio} title={V1.home.intelligenceTrioLead} />
          <div className="grid gap-4 md:grid-cols-3">
            {trio.map((beat) => (
              <IntelligenceTrioCard key={beat.id} beat={beat} />
            ))}
          </div>
        </section>
      ) : null}

      {/* §5 League Pulse — contextual (skip empty shell in preseason) */}
      {isInSeason ? (
        <section aria-label={V1.home.leaguePulse} className="space-y-4">
          <SectionHeading
            eyebrow={V1.home.leaguePulse}
            title={`${V1.home.recentEvents} + ${V1.features.rfsn}`}
            action={
              <Link to="/rfsn" className="text-xs font-medium text-violet-400 hover:text-violet-300">
                {V1.features.rfsn} →
              </Link>
            }
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <CoachCardShell className="flex min-h-[220px] flex-col">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">{V1.home.recentEvents}</h3>
              </div>
              <DashboardRecentLeagueEvents seasons={eventSeasons} enabled={eventSeasons.length > 0} />
            </CoachCardShell>
            <LeagueWireNewsFeed />
          </div>
        </section>
      ) : null}

      {/* §6 Standings Snapshot — in-season only */}
      {isInSeason && ranked.length > 0 ? (
        <section aria-label={V1.home.standingsSnapshot} className="space-y-4">
          <SectionHeading
            eyebrow={V1.home.standingsSnapshot}
            title={V1.features.standings}
            action={
              <Link to="/league/standings" className="text-xs font-medium text-violet-400 hover:text-violet-300">
                {V1.features.standings} →
              </Link>
            }
          />
          <CoachCardShell className="max-w-xl">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">{V1.home.standingsSnapshotHint}</p>
            </div>
            <div className="px-3 py-3">
              <MiniTable
                dense
                columns={["Rank", "Owner", "Record", "PF"]}
                rows={[
                  ...snapshotRows.map((t) => {
                    const mine = myTeamId != null && t.teamId === myTeamId;
                    return [
                      <span key="r" className="tabular-nums text-muted-foreground">
                        {t.displayRank}
                      </span>,
                      <div key="o" className={cn("min-w-0 font-medium", mine && "text-lime-400")}>
                        <div className="truncate">{t.ownerName || t.teamName}</div>
                      </div>,
                      formatRecord(t),
                      <span key="pf" className="tabular-nums text-foreground">
                        {t.pointsFor.toFixed(1)}
                      </span>,
                    ];
                  }),
                  ...(showPinned
                    ? [
                        [
                          <span key="r" className="tabular-nums text-lime-400">
                            {showPinned.displayRank}
                          </span>,
                          <div key="o" className="min-w-0 font-medium text-lime-400">
                            <div className="truncate">{showPinned.ownerName || showPinned.teamName}</div>
                            <div className="text-label text-muted-foreground">You</div>
                          </div>,
                          formatRecord(showPinned),
                          <span key="pf" className="tabular-nums text-foreground">
                            {showPinned.pointsFor.toFixed(1)}
                          </span>,
                        ],
                      ]
                    : []),
                ]}
              />
            </div>
          </CoachCardShell>
        </section>
      ) : null}

      {/* §7 The Long Memory — always */}
      <section aria-label={V1.home.longMemory} className="space-y-4">
        <SectionHeading
          eyebrow={V1.home.longMemory}
          title={V1.home.championsTimeline}
          action={
            <Link to="/history" className="text-xs font-medium text-amber-400/90 hover:text-amber-300">
              {V1.features.leagueHistory} →
            </Link>
          }
        />
        {thisWeekInHistory ? (
          <p className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{V1.home.thisWeekInHistory}: </span>
            {thisWeekInHistory}
          </p>
        ) : null}
        <DashboardTimelineStrip
          isLoading={timelineLoading}
          rows={timelineChamps}
          currentSeason={season}
          hideHeader
        />
      </section>

      {/* §8 Explore grid — always */}
      <section aria-label={V1.home.exploreGrid}>
        <FlagshipDiscoveryGrid />
      </section>

      <div className="border-t border-border pt-4 pb-2 text-center text-label tracking-wide text-muted-foreground/60">
        Build: {__APP_GIT_HASH__ && __APP_GIT_HASH__ !== "unknown" ? __APP_GIT_HASH__.slice(0, 7) : "Unknown"}
      </div>
    </IntelPageShell>
  );
}
