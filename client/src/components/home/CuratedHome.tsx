import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight, Radio, RefreshCw, Trophy, Users } from "lucide-react";
import { ExecutiveBriefingSection, SectionHeading } from "@/components/dashboard/welcomeBackCoach/WelcomeBackCoachSections";
import { DashboardRecentLeagueEvents } from "@/components/dashboard/DashboardRecentLeagueEvents";
import { LeagueWireNewsFeed } from "@/components/dashboard/LeagueWireNewsFeed";
import { RivalrySummaryCard } from "@/components/RivalrySummaryCard";
import { IntelPageShell } from "@/components/layout";
import { Button } from "@/components/ui/button";

export type CuratedHomeProps = {
  welcomeName: string;
  leagueName: string;
  weekLabel: string;
  season: number;
  briefingParagraph: string;
  briefingActionLabel: string;
  briefingActionHref: string;
  /** Condensed My Team pulse */
  recordLine: string | null;
  rankLine: string | null;
  nextMatchupLine: string | null;
  rosterAlertLine: string | null;
  /** Rival watch — null hides the section */
  rivalName: string | null;
  rivalInsight: string | null;
  /** League movement */
  leagueMovementLine: string | null;
  eventSeasons: number[];
  showRecentEvents: boolean;
  headerActions?: ReactNode;
};

const JUMP_LINKS: { label: string; href: string; hint: string }[] = [
  { label: "My Team", href: "/my-team/roster", hint: "Roster" },
  { label: "Matchup", href: "/my-team/matchup", hint: "This week" },
  { label: "Rivalries", href: "/rivals/rivalries", hint: "Rivals" },
  { label: "RFSN", href: "/rfsn/wire", hint: "Wire" },
  { label: "War Room", href: "/draft/war-room", hint: "Draft" },
  { label: "Standings", href: "/standings", hint: "League" },
];

export function CuratedHome({
  welcomeName,
  leagueName,
  weekLabel,
  season,
  briefingParagraph,
  briefingActionLabel,
  briefingActionHref,
  recordLine,
  rankLine,
  nextMatchupLine,
  rosterAlertLine,
  rivalName,
  rivalInsight,
  leagueMovementLine,
  eventSeasons,
  showRecentEvents,
  headerActions,
}: CuratedHomeProps) {
  const showTeamPulse = Boolean(recordLine || rankLine || nextMatchupLine || rosterAlertLine);
  const showLeagueMovement = Boolean(leagueMovementLine || showRecentEvents);

  return (
    <IntelPageShell
      width="full"
      background="none"
      minHeight="none"
      bleed={false}
      padding="none"
      className="mx-auto max-w-[1100px] space-y-8 bg-background px-4 py-6"
      data-v2-home
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Home</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {welcomeName ? `Welcome back, ${welcomeName}` : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {leagueName}
            {weekLabel ? ` · ${weekLabel}` : ""}
          </p>
        </div>
        {headerActions ?? (
          <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
            <Link to="/sync" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Sync Data
            </Link>
          </Button>
        )}
      </header>

      {/* 1. Primary Intelligence / Next Action */}
      <ExecutiveBriefingSection
        paragraph={briefingParagraph}
        actionLabel={briefingActionLabel}
        actionHref={briefingActionHref}
      />

      {/* 2. My Team Pulse */}
      {showTeamPulse ? (
        <section aria-label="My Team Pulse" className="space-y-3">
          <SectionHeading
            eyebrow="My Team"
            title="Team Pulse"
            action={
              <Link to="/my-team/roster" className="text-xs font-medium text-lime-400/90 hover:text-lime-300">
                Open roster →
              </Link>
            }
          />
          <div className="rounded-2xl border border-border bg-card/95 p-4 sm:p-5">
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {recordLine ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Record</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{recordLine}</p>
                </div>
              ) : null}
              {rankLine ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Standing</p>
                  <p className="mt-1 text-lg font-bold text-foreground">{rankLine}</p>
                </div>
              ) : null}
              {nextMatchupLine ? (
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Next matchup</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{nextMatchupLine}</p>
                </div>
              ) : null}
            </div>
            {rosterAlertLine ? (
              <p className="mt-3 border-t border-border pt-3 text-sm text-amber-200/90">{rosterAlertLine}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/my-team/matchup"
                className="inline-flex items-center gap-1 text-sm font-semibold text-lime-400/90 hover:text-lime-300"
              >
                Matchup
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/rivals/owners"
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                My GM
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* 3. Rival Watch */}
      <section aria-label="Rival Watch" className="space-y-3">
        <SectionHeading
          eyebrow="Rivals"
          title="Rival Watch"
          action={
            <Link to="/rivals/rivalries" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              Open rivalries →
            </Link>
          }
        />
        {rivalInsight ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {rivalName ? <span className="font-semibold text-foreground">{rivalName}. </span> : null}
            {rivalInsight}
          </p>
        ) : rivalName ? (
          <p className="text-sm text-muted-foreground">
            Focus rival: <span className="font-semibold text-foreground">{rivalName}</span>
          </p>
        ) : null}
        <RivalrySummaryCard title="Rivalry snapshot" />
      </section>

      {/* 4. RFSN Lead Story */}
      <section aria-label="RFSN Lead Story" className="space-y-3">
        <SectionHeading
          eyebrow="RFSN"
          title="Lead Story"
          action={
            <Link to="/rfsn/stories" className="inline-flex items-center gap-1 text-xs font-medium text-lime-400/90 hover:text-lime-300">
              <Radio className="h-3 w-3" />
              Open Stories →
            </Link>
          }
        />
        <LeagueWireNewsFeed />
      </section>

      {/* 5. League Movement */}
      {showLeagueMovement ? (
        <section aria-label="League Movement" className="space-y-3">
          <SectionHeading
            eyebrow="League"
            title="League Movement"
            action={
              <Link to="/standings" className="text-xs font-medium text-lime-400/90 hover:text-lime-300">
                Standings →
              </Link>
            }
          />
          <div className="rounded-2xl border border-border bg-card/95 p-4 sm:p-5">
            {leagueMovementLine ? (
              <p className="mb-3 text-sm leading-relaxed text-foreground">{leagueMovementLine}</p>
            ) : null}
            {showRecentEvents ? (
              <DashboardRecentLeagueEvents seasons={eventSeasons} enabled />
            ) : null}
            <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
              <Link
                to="/dynasty-power-rankings"
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                <Trophy className="h-3.5 w-3.5" />
                Power Rankings
              </Link>
              <Link
                to="/acquisition-impact"
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Acquisition Impact
              </Link>
              <Link
                to="/transactions"
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Transactions
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* 6. Jump Back In */}
      <section aria-label="Jump Back In" className="space-y-3">
        <SectionHeading eyebrow="Continue" title="Jump Back In" />
        <div className="flex flex-wrap gap-2">
          {JUMP_LINKS.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-lime-500/30 hover:bg-lime-500/5"
            >
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{item.label}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.hint}</span>
            </Link>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Season {season}</p>
      </section>
    </IntelPageShell>
  );
}
