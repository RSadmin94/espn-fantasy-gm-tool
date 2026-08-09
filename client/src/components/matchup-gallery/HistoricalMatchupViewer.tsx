import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { SPACE_CARD, SPACE_CARD_GAP, SPACE_CHIP, SPACE_CHIP_GAP, SPACE_ROW, SPACE_SECTION_Y } from "@/lib/density";
import { TYPE_BADGE } from "@/lib/typeScale";
import { MatchupGalleryCard } from "./MatchupGalleryCard";
import type { GalleryMatchup, ScoringPrecision } from "../../../../server/matchupGalleryQuery";
import type { ViewerLineupPlayer, ViewerSideLineup } from "../../../../server/matchupGalleryViewer";
import { formatGalleryScore } from "@/lib/matchupGalleryUi";
import type { StoryCollectionDefinition } from "@shared/matchupStoryCollections";
import { storyCollectionHomeHref, storyCollectionPath } from "@shared/matchupStoryCollections";
import { matchupToShareCard } from "@shared/historicalShareCard";
import { matchupToStoryPackage } from "@shared/historicalStoryPackage";
import { HistoricalShareCardButton } from "@/components/share-cards/HistoricalShareCardButton";
import { HistoricalNarrationPanel } from "@/components/share-cards/HistoricalNarrationPanel";
import { ShareCardRenderer } from "@/components/share-cards/HistoricalShareCard";

export function HistoricalMatchupViewer({
  matchup,
  scoringPrecision,
  leagueName,
  coverageNote,
  home,
  away,
  lineupNote,
  collection,
}: {
  matchup: GalleryMatchup;
  scoringPrecision?: ScoringPrecision | null;
  leagueName?: string | null;
  coverageNote?: string | null;
  home: ViewerSideLineup | null;
  away: ViewerSideLineup | null;
  lineupNote?: string | null;
  collection?: StoryCollectionDefinition | null;
}) {
  const backHref = collection ? storyCollectionPath(collection.id) : storyCollectionHomeHref();
  const shareModel = matchupToShareCard(matchup, {
    collectionId: collection?.id,
    leagueName,
    href: matchup.viewerHref,
    provenance: ["historicalMatchupViewer"],
  });
  const storyPackage = matchupToStoryPackage({
    ...matchup,
    leagueName,
    collectionId: collection?.id,
    coverageNote,
    provenance: ["historicalMatchupViewer"],
  });
  return (
    <div data-matchup-viewer data-collection-theme={collection?.id ?? undefined} className={SPACE_SECTION_Y}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <Link to={backHref} className="font-semibold text-foreground underline-offset-2 hover:underline">
            ← {collection ? collection.title : "Historical Matchups"}
          </Link>
        </p>
        <HistoricalShareCardButton model={shareModel} />
      </div>

      <HistoricalNarrationPanel storyPackage={storyPackage} />

      <MatchupGalleryCard matchup={matchup} scoringPrecision={scoringPrecision} collection={collection?.id} />

      <div data-viewer-share-card className="flex justify-center overflow-x-auto rounded-xl border border-border bg-black/40 p-4">
        <ShareCardRenderer model={shareModel} />
      </div>

      {(leagueName || coverageNote) ? (
        <section data-viewer-meta className={cn("rounded-xl border border-border bg-card", SPACE_CARD)}>
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">League</h2>
          <dl className={cn("mt-3 grid gap-3 sm:grid-cols-2", SPACE_CARD_GAP)}>
            {leagueName ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">League</dt>
                <dd className="text-sm font-semibold text-foreground">{leagueName}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Season / week</dt>
              <dd className="text-sm font-semibold text-foreground">
                {matchup.season} · Week {matchup.week}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phase</dt>
              <dd className="text-sm font-semibold text-foreground">
                {matchup.phase === "playoffs" ? "Playoffs" : "Regular season"}
              </dd>
            </div>
            {coverageNote ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coverage</dt>
                <dd className="text-sm text-foreground">{coverageNote}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section data-viewer-lineups className={SPACE_SECTION_Y}>
        <h2 className="text-lg font-bold text-foreground">Lineups</h2>
        {lineupNote ? (
          <p data-lineup-note className="text-sm text-muted-foreground">
            {lineupNote}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SideLineupPanel side={home} scoringPrecision={scoringPrecision} />
          <SideLineupPanel side={away} scoringPrecision={scoringPrecision} />
        </div>
      </section>
    </div>
  );
}

function SideLineupPanel({
  side,
  scoringPrecision,
}: {
  side: ViewerSideLineup | null;
  scoringPrecision?: ScoringPrecision | null;
}) {
  if (!side) {
    return (
      <article className={cn("rounded-xl border border-dashed border-border bg-card", SPACE_CARD)}>
        <p className="text-sm text-muted-foreground">Lineup not available.</p>
      </article>
    );
  }

  const hasSplit = side.starters.length > 0 || side.bench.length > 0;
  const hasRoster = side.roster.length > 0;

  return (
    <article data-viewer-side={side.teamId} className={cn("rounded-xl border border-border bg-card", SPACE_CARD)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-foreground">{side.ownerName}</h3>
          {side.teamName ? <p className="truncate text-xs text-muted-foreground">{side.teamName}</p> : null}
        </div>
        <p className="text-xl font-black tabular-nums text-foreground">
          {formatGalleryScore(side.score, scoringPrecision)}
        </p>
      </header>

      {!hasSplit && !hasRoster ? (
        <p className="mt-4 text-sm text-muted-foreground">No recorded players for this side.</p>
      ) : null}

      {hasSplit ? (
        <>
          <PlayerGroup title="Starters" players={side.starters} scoringPrecision={scoringPrecision} />
          <PlayerGroup title="Bench" players={side.bench} scoringPrecision={scoringPrecision} />
        </>
      ) : null}

      {hasRoster ? (
        <PlayerGroup title="Roster" players={side.roster} scoringPrecision={scoringPrecision} />
      ) : null}
    </article>
  );
}

function PlayerGroup({
  title,
  players,
  scoringPrecision,
}: {
  title: string;
  players: ViewerLineupPlayer[];
  scoringPrecision?: ScoringPrecision | null;
}) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
      {players.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>
      ) : (
        <ul className={cn("mt-2", SPACE_CHIP_GAP)} aria-label={title}>
          {players.map((p) => (
            <li
              key={`${p.playerId}-${p.slotLabel}`}
              data-lineup-player={p.playerId}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20",
                SPACE_ROW,
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{p.playerName}</p>
                <p className={cn("mt-1 inline-flex rounded-full border border-border uppercase text-muted-foreground", TYPE_BADGE, SPACE_CHIP)}>
                  {p.slotLabel}
                  {p.position && p.position !== p.slotLabel ? ` · ${p.position}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                {p.points == null ? "—" : formatGalleryScore(p.points, scoringPrecision)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
