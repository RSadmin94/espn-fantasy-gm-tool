import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { SPACE_CARD, SPACE_CHIP, SPACE_CHIP_GAP } from "@/lib/density";
import { TYPE_BADGE } from "@/lib/typeScale";
import type { StoryCollectionId } from "@shared/matchupStoryCollections";
import type { GalleryMatchup, ScoringPrecision, GallerySort } from "../../../../server/matchupGalleryQuery";
import {
  formatGalleryScore,
  galleryCardBadges,
  matchupViewHref,
  winnerLoserLabels,
  type GalleryBadgeKind,
} from "@/lib/matchupGalleryUi";

const BADGE_CLASS: Record<GalleryBadgeKind, string> = {
  "NO MERCY": "border-amber-400/40 bg-amber-400/15 text-amber-200",
  "ONE POINT": "border-sky-400/40 bg-sky-400/15 text-sky-200",
  PLAYOFF: "border-lime-400/40 bg-lime-400/15 text-lime-200",
  CHAMPIONSHIP: "border-violet-400/40 bg-violet-400/15 text-violet-200",
  CLOSEST: "border-primary/40 bg-primary/15 text-primary",
};

export function MatchupGalleryCard({
  matchup,
  scoringPrecision,
  sort,
  showActions = true,
  collection,
}: {
  matchup: GalleryMatchup;
  scoringPrecision?: ScoringPrecision | null;
  sort?: GallerySort;
  showActions?: boolean;
  collection?: StoryCollectionId | null;
}) {
  const badges = galleryCardBadges(matchup, { sort, scoringPrecision });
  const wl = winnerLoserLabels(matchup);
  const homeScore = formatGalleryScore(matchup.homeScore, scoringPrecision);
  const awayScore = formatGalleryScore(matchup.awayScore, scoringPrecision);
  const margin = formatGalleryScore(matchup.margin, scoringPrecision);
  const phaseLabel = matchup.phase === "playoffs" ? "Playoffs" : "Regular season";
  const viewHref = matchupViewHref(matchup, { collection });

  const onShare = async () => {
    try {
      const url = `${window.location.origin}${viewHref}`;
      await navigator.clipboard.writeText(url);
    } catch {
      /* placeholder — share engine ships later */
    }
  };

  return (
    <article
      data-matchup-card
      data-matchup-id={matchup.matchupId}
      data-championship={matchup.isChampionshipGame ? "true" : "false"}
      className={cn("flex h-full flex-col rounded-xl border border-border bg-card", SPACE_CARD)}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{matchup.season}</span>
        <span aria-hidden="true">·</span>
        <span>Week {matchup.week}</span>
        <span aria-hidden="true">·</span>
        <span>{phaseLabel}</span>
      </div>

      {badges.length > 0 ? (
        <ul className={cn("mt-3 flex flex-wrap", SPACE_CHIP_GAP)} aria-label="Matchup badges">
          {badges.map((badge) => (
            <li
              key={badge}
              data-badge={badge}
              className={cn(
                "rounded-full border uppercase",
                TYPE_BADGE,
                SPACE_CHIP,
                BADGE_CLASS[badge],
              )}
            >
              {badge}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <SideColumn
          align="left"
          ownerName={matchup.homeDisplayName}
          teamName={matchup.homeTeamName}
          logoUrl={matchup.homeLogoUrl}
          score={homeScore}
          isWinner={matchup.winnerPersonId === matchup.homePersonId}
        />
        <div className="pt-6 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
          vs
        </div>
        <SideColumn
          align="right"
          ownerName={matchup.awayDisplayName}
          teamName={matchup.awayTeamName}
          logoUrl={matchup.awayLogoUrl}
          score={awayScore}
          isWinner={matchup.winnerPersonId === matchup.awayPersonId}
        />
      </div>

      <p className="mt-4 text-sm text-foreground">
        {wl.isTie ? (
          <span>Tie · margin {margin}</span>
        ) : wl.winner ? (
          <>
            <span className="font-semibold">{wl.winner}</span>
            {wl.loser ? (
              <>
                {" "}
                defeated <span className="font-semibold">{wl.loser}</span>
              </>
            ) : null}
            <span className="text-muted-foreground"> · won by {margin}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Margin {margin}</span>
        )}
      </p>

      {showActions ? (
        <div className={cn("mt-auto flex flex-wrap pt-4", SPACE_CHIP_GAP)}>
          <Link
            to={viewHref}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            View Matchup
          </Link>
          <button
            type="button"
            data-share-placeholder
            onClick={() => void onShare()}
            title="Share coming soon"
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            Share
          </button>
          <button
            type="button"
            data-screenshot-placeholder
            disabled
            title="Screenshots coming soon"
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Screenshot
          </button>
        </div>
      ) : null}
    </article>
  );
}

function SideColumn({
  align,
  ownerName,
  teamName,
  logoUrl,
  score,
  isWinner,
}: {
  align: "left" | "right";
  ownerName: string;
  teamName: string | null;
  logoUrl: string | null;
  score: string;
  isWinner: boolean;
}) {
  const logo = logoUrl?.trim() || null;
  const team = teamName?.trim() || null;
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <div className={cn("flex items-start gap-2", align === "right" && "flex-row-reverse")}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          {logo ? (
            <img src={logo} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">
              {(team || ownerName || "?").slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className={cn("truncate text-base font-semibold text-foreground", isWinner && "text-primary")}>
            {ownerName}
          </p>
          {team ? <p className="truncate text-xs text-muted-foreground">{team}</p> : null}
        </div>
      </div>
      <p className={cn("mt-2 text-2xl font-black tabular-nums text-foreground", isWinner && "text-primary")}>
        {score}
      </p>
    </div>
  );
}
