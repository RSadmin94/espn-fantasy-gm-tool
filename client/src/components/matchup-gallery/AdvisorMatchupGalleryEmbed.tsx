/**
 * RFSN-053D — Embed the 053C MatchupGallery under an Advisor reply.
 * Uses the visual.result payload first (no second fetch). Filter changes reuse matchupGallery.query.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import {
  galleryFilterToQueryInput,
  serializeGallerySearchParams,
  visualFiltersToGalleryUi,
  type GalleryUiFilter,
} from "@/lib/matchupGalleryUi";
import { getStoryCollection, storyCollectionHref } from "@shared/matchupStoryCollections";
import { collectionToShareCard } from "@shared/historicalShareCard";
import { HistoricalShareCardButton } from "@/components/share-cards/HistoricalShareCardButton";
import type { AdvisorMatchupGalleryVisual } from "../../../../server/advisorVisual";
import type { GalleryQueryResult } from "../../../../server/matchupGalleryQuery";
import { MatchupGallery } from "./MatchupGallery";
import { StoryCollectionHeader } from "./StoryCollectionHeader";
import type { GalleryOwnerOption } from "./MatchupGalleryFilters";
import { cn } from "@/lib/utils";

function sameUiFilter(a: GalleryUiFilter, b: GalleryUiFilter): boolean {
  return serializeGallerySearchParams(a) === serializeGallerySearchParams(b);
}

export function AdvisorMatchupGalleryEmbed({
  visual,
  owners,
  activeOwnerName,
  leagueContextKey,
}: {
  visual: AdvisorMatchupGalleryVisual;
  owners: GalleryOwnerOption[];
  activeOwnerName?: string | null;
  leagueContextKey: string;
}) {
  const seedFilter = useMemo(() => visualFiltersToGalleryUi(visual.filters), [visual.filters]);
  const [filter, setFilter] = useState<GalleryUiFilter>(seedFilter);
  const [seedResult, setSeedResult] = useState<GalleryQueryResult | null>(visual.result ?? null);

  useEffect(() => {
    const next = visualFiltersToGalleryUi(visual.filters);
    setFilter(next);
    setSeedResult(visual.result ?? null);
  }, [visual]);

  const filterChanged = !sameUiFilter(filter, seedFilter);
  const ready = Boolean(leagueContextKey && !leagueContextKey.startsWith("__"));
  const queryInput = galleryFilterToQueryInput(filter);
  const galleryQ = trpc.matchupGallery.query.useQuery(withLeagueSalt(queryInput, leagueContextKey), {
    enabled: ready && filterChanged,
    staleTime: 30_000,
  });

  const result = filterChanged ? galleryQ.data : seedResult;
  const collection = visual.collection ? getStoryCollection(visual.collection) : null;
  const href =
    (collection
      ? storyCollectionHref(collection.id, filter)
      : filterChanged
        ? result?.seeAllHref
        : visual.href) ||
    `/league/history/matchups${(() => {
      const qs = serializeGallerySearchParams(filter);
      return qs ? `?${qs}` : "";
    })()}`;

  return (
    <div
      data-rfsn-053d
      data-rfsn-053e
      data-advisor-visual="matchup_gallery"
      data-advisor-collection={collection?.id ?? undefined}
      className="mt-3 w-full min-w-0"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Link
          data-open-full-gallery
          to={href}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5",
            "text-label font-semibold uppercase tracking-wide text-foreground hover:border-primary/40 hover:bg-primary/10",
          )}
        >
          Open Full Gallery
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
        {collection ? (
          <HistoricalShareCardButton
            className="h-8 text-xs"
            model={collectionToShareCard(collection, {
              count: result?.total ?? null,
              summary: result?.summary,
              href,
              provenance: ["advisorMatchupGallery"],
            })}
          />
        ) : null}
      </div>
      <div data-advisor-gallery-scroll className="max-h-[560px] overflow-y-auto pr-1">
        {collection ? (
          <div className="mb-3">
            <StoryCollectionHeader collection={collection} count={result?.total ?? null} showBack={false} compact />
          </div>
        ) : null}
        <MatchupGallery
          title={collection ? `${collection.title} gallery` : "Historical Matchup Gallery"}
          filter={filter}
          result={result}
          owners={owners}
          loading={filterChanged && galleryQ.isLoading}
          onFilterChange={setFilter}
          onNoMercy={() =>
            setFilter({
              ...filter,
              noMercy: true,
              marginMin: 50,
              result: "win",
            })
          }
          noMercyActive={!!filter.noMercy || collection?.id === "no-mercy"}
          activeOwnerName={activeOwnerName}
          collection={collection?.id}
        />
      </div>
    </div>
  );
}
