import { useMemo } from "react";
import { Link } from "react-router";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Dna,
  Flame,
  Loader2,
  ShieldAlert,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { V1 } from "@/lib/v1Copy";
import { cn } from "@/lib/utils";
import { RivalrySummaryCard } from "@/components/RivalrySummaryCard";
import { IntelPanel } from "@/components/layout";
import { SectionHeading } from "@/components/dashboard/welcomeBackCoach/WelcomeBackCoachSections";

function storyIcon(storyType: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    REVENGE_GAME: <Swords className="h-4 w-4 text-red-400" />,
    HEARTBREAK_PENDING: <Target className="h-4 w-4 text-orange-400" />,
    COLLAPSE: <TrendingDown className="h-4 w-4 text-red-400" />,
    SILENT_THREAT: <ShieldAlert className="h-4 w-4 text-violet-400" />,
    DESPERATION_WINDOW: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    PLAYOFF_BUBBLE: <Activity className="h-4 w-4 text-cyan-400" />,
    MOMENTUM_SHIFT: <TrendingUp className="h-4 w-4 text-lime-400" />,
    FEAR_RISING: <Flame className="h-4 w-4 text-orange-400" />,
  };
  return icons[storyType] ?? <Sparkles className="h-4 w-4 text-muted-foreground" />;
}

export type FreeGmProfileTeaserProps = {
  displayName: string;
  careerLine: string | null;
  titlesLine: string | null;
  rivalName: string | null;
  threatLine: string | null;
};

export function FreeGmProfileTeaser({
  displayName,
  careerLine,
  titlesLine,
  rivalName,
  threatLine,
}: FreeGmProfileTeaserProps) {
  const hasContent = careerLine || titlesLine || rivalName || threatLine;
  if (!hasContent) return null;

  return (
    <section aria-label={V1.home.freeJourney.myGmProfile} className="space-y-4">
      <SectionHeading
        eyebrow={V1.navGroups.knowYourself}
        title={V1.home.freeJourney.myGmProfile}
        action={
          <Link to="/my-team/profile" className="text-xs font-medium text-lime-400/90 hover:text-lime-300">
            {V1.features.myGmProfile} →
          </Link>
        }
      />
      <IntelPanel variant="card" className="p-5 sm:p-6">
        <p className="text-xl font-bold text-foreground">{displayName}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {careerLine ? (
            <div className="rounded-xl border border-emerald-500/20 bg-muted/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-400/90">Career</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{careerLine}</p>
            </div>
          ) : null}
          {titlesLine ? (
            <div className="rounded-xl border border-amber-500/20 bg-muted/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400/90">Titles</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{titlesLine}</p>
            </div>
          ) : null}
          {rivalName ? (
            <div className="rounded-xl border border-violet-500/20 bg-muted/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-400/90">Top rival</p>
              <p className="mt-1 text-sm font-semibold text-foreground truncate">{rivalName}</p>
            </div>
          ) : null}
          {threatLine ? (
            <div className="rounded-xl border border-red-500/20 bg-muted/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-400/90">Biggest threat</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{threatLine}</p>
            </div>
          ) : null}
        </div>
        <Link
          to="/my-team/profile"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-lime-400/90 hover:text-lime-300"
        >
          Open {V1.features.myGmProfile}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </IntelPanel>
    </section>
  );
}

export function FreeLeagueDnaTeaser() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const q = (trpc as any).dna.myProfile.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });

  if (!ready || q.isLoading) {
    return (
      <section aria-label={V1.home.freeJourney.ownerDnaBasic} className="space-y-4">
        <SectionHeading eyebrow={V1.navGroups.knowYourself} title={V1.home.freeJourney.ownerDnaBasic} />
        <IntelPanel variant="card" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading DNA…
        </IntelPanel>
      </section>
    );
  }

  const data = q.data;
  if (!data?.archetype) return null;

  return (
    <section aria-label={V1.home.freeJourney.ownerDnaBasic} className="space-y-4">
      <SectionHeading
        eyebrow={V1.navGroups.knowYourself}
        title={V1.home.freeJourney.ownerDnaBasic}
        action={
          <Link to="/league-dna" className="text-xs font-medium text-violet-400 hover:text-violet-300">
            {V1.features.leagueDna} →
          </Link>
        }
      />
      <IntelPanel variant="card" className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
            <Dna className="h-5 w-5 text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400/90">Your archetype</p>
            <p className="mt-1 text-2xl font-black text-foreground">{data.archetype}</p>
            {data.primaryTrait ? (
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Primary trait:</span> {data.primaryTrait}
              </p>
            ) : null}
            {data.blindSpot ? (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Blind spot:</span> {data.blindSpot}
              </p>
            ) : null}
          </div>
        </div>
        <Link
          to="/league-dna"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-violet-400 hover:text-violet-300"
        >
          See {V1.features.leagueDna}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </IntelPanel>
    </section>
  );
}

export function FreeOneRivalSection() {
  return (
    <section aria-label={V1.home.freeJourney.oneRival} className="space-y-4">
      <SectionHeading
        eyebrow={V1.navGroups.knowRivals}
        title={V1.home.freeJourney.oneRival}
        action={
          <Link to="/rivals/rivalries" className="text-xs font-medium text-violet-400 hover:text-violet-300">
            {V1.features.rivalries} →
          </Link>
        }
      />
      <RivalrySummaryCard title={V1.home.freeJourney.oneRival} className="min-h-[200px]" />
    </section>
  );
}

type StorylineRow = {
  storyType?: string;
  headline?: string | null;
  bodyText?: string | null;
  emotionalTag?: string | null;
  intensityScore?: number | null;
  season?: number;
  week?: number;
};

function pickTopStoryline(rows: StorylineRow[]): StorylineRow | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (b.intensityScore ?? 0) - (a.intensityScore ?? 0))[0] ?? null;
}

export function FreeStorylineTeaser({
  season,
  cachedSeasons,
  isPreseason,
}: {
  season: number;
  cachedSeasons: number[];
  isPreseason: boolean;
}) {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const calendarYear = new Date().getFullYear();

  const storylineSeason = useMemo(() => {
    if (isPreseason && season === calendarYear) {
      const past = cachedSeasons.filter((s) => s < calendarYear);
      if (past.length > 0) return Math.max(...past);
      return calendarYear - 1;
    }
    return season;
  }, [isPreseason, season, cachedSeasons, calendarYear]);

  const q = trpc.weeklyStorylines.getLatest.useQuery(
    withLeagueSalt({ season: storylineSeason }, leagueContextKey),
    { staleTime: 5 * 60_000, enabled: ready && storylineSeason > 0 },
  );

  const topStory = useMemo(() => pickTopStoryline((q.data ?? []) as StorylineRow[]), [q.data]);
  const showLastSeasonNote = isPreseason && season === calendarYear && topStory != null;

  if (!ready || (q.isLoading && !q.data)) {
    return (
      <section aria-label={V1.home.freeJourney.oneStoryline} className="space-y-4">
        <SectionHeading eyebrow={V1.navGroups.weekly} title={V1.home.freeJourney.oneStoryline} />
        <IntelPanel variant="card" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading storyline…
        </IntelPanel>
      </section>
    );
  }

  if (isPreseason && season === calendarYear && !topStory) {
    return (
      <section aria-label={V1.home.freeJourney.oneStoryline} className="space-y-4">
        <SectionHeading eyebrow={V1.navGroups.weekly} title={V1.home.freeJourney.oneStoryline} />
        <p className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3 text-sm text-violet-100/90">
          {V1.home.storylinesKickoffLine}
        </p>
      </section>
    );
  }

  if (!topStory?.headline) return null;

  return (
    <section aria-label={V1.home.freeJourney.oneStoryline} className="space-y-4">
      <SectionHeading
        eyebrow={V1.navGroups.weekly}
        title={V1.home.freeJourney.oneStoryline}
        action={
          <Link to="/league/commissioner" className="text-xs font-medium text-orange-400/90 hover:text-orange-300">
            More storylines →
          </Link>
        }
      />
      {showLastSeasonNote ? (
        <p className="text-xs text-muted-foreground">{V1.home.storylinesLastSeasonNote}</p>
      ) : null}
      <IntelPanel variant="card" className={cn("p-5 sm:p-6", "border-orange-500/20")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {storyIcon(String(topStory.storyType ?? ""))}
            {topStory.emotionalTag ? (
              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-300">
                {topStory.emotionalTag}
              </span>
            ) : null}
          </div>
          {typeof topStory.intensityScore === "number" ? (
            <span className="text-xs font-semibold tabular-nums text-orange-300">{topStory.intensityScore}</span>
          ) : null}
        </div>
        <p className="text-lg font-bold leading-snug text-foreground">{topStory.headline}</p>
        {topStory.bodyText ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{topStory.bodyText}</p>
        ) : null}
      </IntelPanel>
    </section>
  );
}

export function FreeExperienceJourney(props: FreeGmProfileTeaserProps & {
  season: number;
  cachedSeasons: number[];
  isPreseason: boolean;
}) {
  const { season, cachedSeasons, isPreseason, ...profileProps } = props;
  return (
    <div className="space-y-8">
      <FreeGmProfileTeaser {...profileProps} />
      <FreeLeagueDnaTeaser />
      <FreeOneRivalSection />
      <FreeStorylineTeaser season={season} cachedSeasons={cachedSeasons} isPreseason={isPreseason} />
    </div>
  );
}
