import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronUp, Flame, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IntelPageShell } from "@/components/layout";
import { DashboardRecentLeagueEvents } from "@/components/dashboard/DashboardRecentLeagueEvents";
import { type MarqueeTeam, type ScoreboardLite } from "@/components/dashboard/DashboardMatchupMarquee";
import { usePremiumAccess } from "@/hooks/usePremiumAccess";
import { useRivalsProCheckout } from "@/hooks/useRivalsProCheckout";
import { trpc } from "@/lib/trpc";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { BRIEFING } from "@/lib/briefingCopy";
import {
  buildGmBriefingEdition,
  headlineCategoryClass,
  personalizationGreeting,
  personalizationMeta,
  type GmBriefingEdition,
} from "@/lib/gmBriefing";
import type { IntelligenceBeat } from "@/lib/welcomeBackCoachBriefing";
import { cn } from "@/lib/utils";

export type GmBriefingPageProps = {
  welcomeName: string;
  leagueName: string;
  weekLabel: string;
  season: number;
  seasonsDesc: number[];
  cachedSeasons: number[];
  onSeasonChange: (season: number) => void;
  isPreseason: boolean;
  isInSeason: boolean;
  week: number;
  beats: IntelligenceBeat[];
  opponentName: string | null;
  rivalName: string | null;
  threatName: string | null;
  threatReason: string | null;
  threatLevel: string | null;
  hofHeadline: string | null;
  displayName: string;
  careerLine: string | null;
  titlesLine: string | null;
  rankLine: string | null;
  winPct: number | null;
  syncReady: boolean;
  seasonCount: number;
  teamA: MarqueeTeam | null;
  teamB: MarqueeTeam | null;
  boardLite: ScoreboardLite | null;
  outlookPct: number | null;
  matchupLoading: boolean;
  eventSeasons: number[];
  headerActions?: React.ReactNode;
};

function BriefingMasthead({
  season,
  seasonsDesc,
  cachedSeasons,
  onSeasonChange,
  headerActions,
}: Pick<GmBriefingPageProps, "season" | "seasonsDesc" | "cachedSeasons" | "onSeasonChange" | "headerActions">) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-4">
      <div>
        <p className="text-label font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {BRIEFING.mastheadTitle}
        </p>
        <p className="mt-1 text-caption text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(season)} onValueChange={(v) => onSeasonChange(Number(v))}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasonsDesc.map((y) => (
              <SelectItem key={y} value={String(y)} disabled={!cachedSeasons.includes(y)}>
                {y}
                {!cachedSeasons.includes(y) ? " (sync)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {headerActions}
      </div>
    </div>
  );
}

function PersonalizationStrip({
  welcomeName,
  greeting,
  meta,
}: {
  welcomeName: string;
  greeting: string;
  meta: string;
}) {
  return (
    <div className="space-y-2 border-b border-border/40 py-4">
      <p className="text-label font-bold uppercase tracking-[0.18em] text-lime-400/80">{greeting}</p>
      <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-black leading-[1.05] tracking-tight text-foreground">
        {welcomeName}
      </h2>
      <p className="text-caption text-muted-foreground">{meta}</p>
    </div>
  );
}

function HeroStory({ hero }: { hero: GmBriefingEdition["hero"] }) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#1a1220] via-[#120d14] to-[#0a080c] px-6 py-10 sm:px-10 sm:py-14 min-h-[min(42vh,520px)] flex flex-col justify-end"
      aria-label="The biggest story in your league"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(132,204,22,0.08),transparent_55%)]" />
      <h1 className="relative max-w-[18ch] text-[clamp(1.75rem,4vw,3rem)] font-black leading-[1.05] tracking-tight text-white">
        {hero.headline}
      </h1>
      <p className="relative mt-4 max-w-[52ch] text-[15px] leading-relaxed text-white/65 sm:text-[17px]">
        {hero.dek}
      </p>
      <Link
        to={hero.href}
        className="relative mt-8 inline-flex w-fit items-center gap-1 text-[15px] font-bold text-lime-400 hover:text-lime-300"
      >
        {BRIEFING.readMore}
      </Link>
    </section>
  );
}

function QuoteBlock({ quote }: { quote: string }) {
  return (
    <blockquote className="border-l-2 border-lime-500/50 py-1 pl-4 text-[15px] italic leading-relaxed text-foreground/85 sm:text-[17px]">
      {quote}
    </blockquote>
  );
}

function HeadlinesSection({
  headlines,
  hiddenCount,
}: {
  headlines: GmBriefingEdition["headlines"];
  hiddenCount: number;
}) {
  const [open, setOpen] = useState(false);
  const visible = open ? headlines : headlines.slice(0, Math.min(2, headlines.length));

  if (headlines.length === 0) return null;

  return (
    <section aria-label={BRIEFING.leagueHeadlines}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left sm:pointer-events-none"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-label font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {BRIEFING.leagueHeadlines}
        </span>
        <span className="sm:hidden text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      <ul className="mt-3 space-y-2">
        {visible.map((h) => (
          <li key={h.id} className="flex gap-2 text-[14px] leading-snug">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current", headlineCategoryClass(h.category))} />
            {h.href ? (
              <Link to={h.href} className="text-foreground/85 hover:text-foreground">
                {h.text}
              </Link>
            ) : (
              <span className="text-foreground/85">{h.text}</span>
            )}
          </li>
        ))}
      </ul>
      {!open && hiddenCount > 0 ? (
        <button
          type="button"
          className="mt-2 text-[12px] font-medium text-muted-foreground hover:text-foreground sm:hidden"
          onClick={() => setOpen(true)}
        >
          {BRIEFING.moreHeadlines(hiddenCount)}
        </button>
      ) : null}
    </section>
  );
}

function IdentityCard({ identity }: { identity: GmBriefingEdition["identity"] }) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-border/60 bg-card/40 p-5">
      <p className="text-label font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {BRIEFING.identity.reputation}
      </p>
      <p className="mt-2 text-[clamp(1.35rem,3vw,1.85rem)] font-black leading-tight tracking-tight text-foreground">
        {identity.displayName}
      </p>
      <p className="mt-1 text-lg font-bold text-lime-400/95">{identity.reputation}</p>
      <dl className="mt-4 space-y-3 text-caption">
        <div>
          <dt className="text-muted-foreground">{BRIEFING.identity.leagueSays}</dt>
          <dd className="font-medium text-foreground">{identity.leagueSays}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{BRIEFING.identity.knownFor}</dt>
          <dd className="font-medium text-foreground">{identity.knownFor}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{BRIEFING.identity.fearedBecause}</dt>
          <dd className="font-medium text-foreground">{identity.fearedBecause}</dd>
        </div>
      </dl>
      {(identity.careerLine || identity.titlesLine || identity.rankLine) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4 text-label text-muted-foreground">
          {identity.careerLine ? <span>{identity.careerLine}</span> : null}
          {identity.titlesLine ? <span>· {identity.titlesLine}</span> : null}
          {identity.rankLine ? <span>· {identity.rankLine}</span> : null}
        </div>
      )}
      <Link
        to="/owner-profiles"
        className="mt-auto pt-4 text-[13px] font-semibold text-lime-400/90 hover:text-lime-300"
      >
        {BRIEFING.viewFullProfile}
      </Link>
    </section>
  );
}

function RivalCard({
  rival,
  hasAccess,
  onUnlock,
  pending,
}: {
  rival: NonNullable<GmBriefingEdition["rival"]>;
  hasAccess: boolean;
  onUnlock: () => void;
  pending: boolean;
}) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-5">
      <p className="text-label font-bold uppercase tracking-[0.14em] text-violet-300/80">
        {BRIEFING.rivalOfTheWeek}
      </p>
      <p className="mt-2 text-[clamp(1.35rem,3vw,2rem)] font-black uppercase tracking-tight text-foreground">
        {rival.name}
      </p>
      <p className="mt-3 text-label font-bold uppercase tracking-wide text-muted-foreground">{BRIEFING.whyNow}</p>
      <ul className="mt-2 space-y-1.5 text-caption text-foreground/80">
        {rival.whyNow.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-violet-400">•</span>
            {line}
          </li>
        ))}
      </ul>
      {rival.heatLabel ? (
        <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-300">
          <Flame className="h-3 w-3" /> Heat: {rival.heatLabel}
        </span>
      ) : null}
      {rival.teaser ? <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{rival.teaser}</p> : null}
      <Link
        to={rival.href}
        className="mt-4 text-[13px] font-semibold text-violet-300 hover:text-violet-200"
      >
        {BRIEFING.viewRivalry}
      </Link>
      {!hasAccess ? (
        <div className="mt-4 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Full scouting report — Rivals
          </p>
          <Button type="button" size="sm" className="mt-2 h-8" onClick={onUnlock} disabled={pending}>
            Unlock Rivals
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function WeekAdvantagePanel({
  advantage,
  hasAccess,
  onUnlock,
  pending,
}: {
  advantage: GmBriefingEdition["advantage"];
  hasAccess: boolean;
  onUnlock: () => void;
  pending: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/30 p-5 sm:p-6">
      <h2 className="text-lg font-black tracking-tight text-foreground">{advantage.title}</h2>
      <ul className="mt-4 space-y-2">
        {advantage.bullets.map((b) => (
          <li key={b} className="flex gap-2 text-[14px] text-foreground/85">
            <span className="text-lime-400">▸</span>
            {b}
          </li>
        ))}
        {advantage.lockedBullets.map((b) => (
          <li key={b} className="flex gap-2 text-[14px] text-muted-foreground blur-[3px] select-none">
            <span>▸</span>
            {b}
          </li>
        ))}
      </ul>
      {!hasAccess && advantage.lockedBullets.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-muted-foreground">{BRIEFING.unlockAdvantage}</p>
          <Button type="button" size="sm" variant="outline" onClick={onUnlock} disabled={pending}>
            Unlock Rivals
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ActionCenterStrip({
  opponentName,
  outlookPct,
  isInSeason,
  syncReady,
}: Pick<GmBriefingPageProps, "opponentName" | "outlookPct" | "isInSeason" | "syncReady">) {
  return (
    <section className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        Action Center
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-foreground/80">
        {isInSeason && opponentName ? (
          <span>
            vs <strong>{opponentName}</strong>
            {outlookPct != null ? ` · ${outlookPct}% playoff` : ""}
          </span>
        ) : (
          <span>Matchup updates at kickoff</span>
        )}
        <span className="text-muted-foreground">·</span>
        <span>Trade window open</span>
        <span className="text-muted-foreground">·</span>
        <span>Waiver Wed</span>
        <span className="text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1">
          <RefreshCw className={cn("h-3 w-3", syncReady ? "text-lime-400" : "text-amber-400")} />
          {syncReady ? "Sync OK" : "Sync needed"}
        </span>
      </div>
    </section>
  );
}

function ComingNext({ comingNext, hasAccess, onUnlock, pending }: {
  comingNext: GmBriefingEdition["comingNext"];
  hasAccess: boolean;
  onUnlock: () => void;
  pending: boolean;
}) {
  if (hasAccess) return null;
  return (
    <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-amber-400/90">
        {BRIEFING.comingNext}
      </p>
      <p className="mt-2 text-[14px] text-foreground/85">{comingNext.teaser}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{BRIEFING.availableInRivals}</p>
      <Button type="button" size="sm" className="mt-3 h-8" onClick={onUnlock} disabled={pending}>
        Unlock Rivals
      </Button>
    </section>
  );
}

export function GmBriefingPage(props: GmBriefingPageProps) {
  const { hasAccess, isLoading: accessLoading } = usePremiumAccess();
  const { startCheckout, isPending: checkoutPending } = useRivalsProCheckout();
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const rivalryReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const rivalryQ = trpc.rivalry.getScores.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: rivalryReady,
    staleTime: 120_000,
  });

  const rivalries = (rivalryQ.data as { rivalries?: Array<Record<string, unknown>> } | undefined)?.rivalries ?? [];
  const topRival = rivalries[0] as Record<string, unknown> | undefined;
  const rivalryCount = rivalries.length;

  const topRivalMapped = topRival
    ? {
        rivalName: String(topRival.rivalName ?? ""),
        heatLabel: (topRival.heatLabel as string) ?? null,
        loreSentence: (topRival.loreSentence as string) ?? null,
        h2hWins: topRival.h2hWins as number | undefined,
        h2hLosses: topRival.h2hLosses as number | undefined,
        h2hTies: topRival.h2hTies as number | undefined,
        playoffEliminations: topRival.playoffEliminations as number | undefined,
        winStreak: topRival.winStreak as number | undefined,
      }
    : null;

  const opponentIsRival =
    !!props.opponentName &&
    !!topRivalMapped?.rivalName &&
    topRivalMapped.rivalName.toLowerCase().includes(props.opponentName.toLowerCase().split(" ")[0] ?? "");

  const edition = useMemo(
    () =>
      buildGmBriefingEdition({
        beats: props.beats,
        isPreseason: props.isPreseason,
        welcomeName: props.welcomeName,
        leagueName: props.leagueName,
        week: props.week,
        seasonCount: props.seasonCount,
        rivalryCount,
        syncReady: props.syncReady,
        opponentName: props.opponentName,
        rivalName: props.rivalName,
        threatName: props.threatName,
        threatReason: props.threatReason,
        threatLevel: props.threatLevel,
        hofHeadline: props.hofHeadline,
        displayName: props.displayName,
        careerLine: props.careerLine,
        titlesLine: props.titlesLine,
        rankLine: props.rankLine,
        winPct: props.winPct,
        topRival: topRivalMapped,
        opponentIsRival,
        hasRivalsAccess: hasAccess,
      }),
    [
      props,
      rivalryCount,
      topRivalMapped,
      opponentIsRival,
      hasAccess,
    ],
  );

  const greeting = personalizationGreeting(props.welcomeName);
  const meta = personalizationMeta({
    leagueName: props.leagueName,
    weekLabel: props.weekLabel,
    seasonCount: props.seasonCount,
    rivalryCount,
    syncReady: props.syncReady,
  });

  const onUnlock = () => void startCheckout();

  return (
    <IntelPageShell
      width="standard"
      background="none"
      minHeight="none"
      bleed={false}
      padding="default"
      className="mx-auto max-w-[1200px] space-y-8 pb-12"
    >
      <BriefingMasthead
        season={props.season}
        seasonsDesc={props.seasonsDesc}
        cachedSeasons={props.cachedSeasons}
        onSeasonChange={props.onSeasonChange}
        headerActions={props.headerActions}
      />

      <PersonalizationStrip welcomeName={props.welcomeName} greeting={greeting} meta={meta} />

      <HeroStory hero={edition.hero} />

      <QuoteBlock quote={edition.quote} />

      <HeadlinesSection headlines={edition.headlines} hiddenCount={edition.headlinesHiddenCount} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)]">
        <IdentityCard identity={edition.identity} />
        {edition.rival ? (
          <RivalCard
            rival={edition.rival}
            hasAccess={hasAccess}
            onUnlock={onUnlock}
            pending={checkoutPending || accessLoading}
          />
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-border/60 p-8 text-sm text-muted-foreground">
            Rivalry stories load after sync.
          </div>
        )}
      </div>

      <WeekAdvantagePanel
        advantage={edition.advantage}
        hasAccess={hasAccess}
        onUnlock={onUnlock}
        pending={checkoutPending}
      />

      <section className="space-y-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          League Activity
        </p>
        <DashboardRecentLeagueEvents seasons={props.eventSeasons} />
      </section>

      <ActionCenterStrip
        opponentName={props.opponentName}
        outlookPct={props.outlookPct}
        isInSeason={props.isInSeason}
        syncReady={props.syncReady}
      />

      <ComingNext
        comingNext={edition.comingNext}
        hasAccess={hasAccess}
        onUnlock={onUnlock}
        pending={checkoutPending}
      />
    </IntelPageShell>
  );
}
