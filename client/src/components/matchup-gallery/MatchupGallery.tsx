import type { StoryCollectionId } from "@shared/matchupStoryCollections";
import type { GalleryQueryResult } from "../../../../server/matchupGalleryQuery";
import {
  applyGalleryPreset,
  formatCoverageRange,
  galleryFilterChips,
  type GalleryPresetId,
  type GalleryUiFilter,
} from "@/lib/matchupGalleryUi";
import { SPACE_CARD_GAP, SPACE_CHIP, SPACE_CHIP_GAP, SPACE_SECTION_Y } from "@/lib/density";
import { cn } from "@/lib/utils";
import { MatchupGalleryCard } from "./MatchupGalleryCard";
import { MatchupGalleryEmpty } from "./MatchupGalleryEmpty";
import { MatchupGalleryFilters, type GalleryOwnerOption } from "./MatchupGalleryFilters";
import { MatchupGalleryPresets } from "./MatchupGalleryPresets";
import { SectionLoading } from "@/components/layout";

export function MatchupGallery({
  title,
  leagueName,
  filter,
  result,
  owners,
  loading,
  onFilterChange,
  onNoMercy,
  noMercyActive,
  activeOwnerName,
  collection,
}: {
  title: string;
  leagueName?: string | null;
  filter: GalleryUiFilter;
  result?: GalleryQueryResult | null;
  owners: GalleryOwnerOption[];
  loading?: boolean;
  onFilterChange: (next: GalleryUiFilter) => void;
  onNoMercy?: () => void;
  noMercyActive?: boolean;
  activeOwnerName?: string | null;
  collection?: StoryCollectionId | null;
}) {
  const chips = galleryFilterChips(filter);
  const coverage = formatCoverageRange(result?.coverage.seasonFrom, result?.coverage.seasonTo);
  const count = result?.total ?? 0;
  const shown = result?.matchups.length ?? 0;

  const onPreset = (id: GalleryPresetId) => {
    if (id === "no-mercy") {
      onNoMercy?.();
      return;
    }
    onFilterChange(applyGalleryPreset(id, filter, activeOwnerName));
  };

  return (
    <div data-matchup-gallery className={SPACE_SECTION_Y}>
      <header data-gallery-header className={SPACE_SECTION_Y}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h2>
            {leagueName ? <p className="mt-1 text-sm text-muted-foreground">{leagueName}</p> : null}
          </div>
          <div className={cn("flex flex-wrap text-sm text-foreground", SPACE_CHIP_GAP)}>
            {coverage ? (
              <span data-gallery-coverage className={cn("rounded-full border border-border font-semibold", SPACE_CHIP)}>
                {coverage}
              </span>
            ) : null}
            <span data-gallery-count className={cn("rounded-full border border-border font-semibold", SPACE_CHIP)}>
              {loading ? "Loading…" : `${shown}${count > shown ? ` of ${count}` : ""} games`}
            </span>
          </div>
        </div>
        {chips.length > 0 ? (
          <ul data-gallery-active-filters className={cn("flex flex-wrap", SPACE_CHIP_GAP)} aria-label="Applied filters">
            {chips.map((chip) => (
              <li
                key={chip.id}
                className={cn("rounded-full border border-border bg-muted/30 text-xs font-semibold text-foreground", SPACE_CHIP)}
              >
                {chip.label}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <MatchupGalleryPresets filter={filter} isNoMercyRoute={noMercyActive} onSelect={onPreset} />

      <MatchupGalleryFilters filter={filter} owners={owners} onChange={onFilterChange} />

      {loading ? (
        <SectionLoading message="Loading historical matchups…" className="justify-center py-16" />
      ) : result?.empty ? (
        <MatchupGalleryEmpty reason={result.emptyReason} summary={result.summary} />
      ) : (
        <div
          data-gallery-grid
          className={cn("grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3", SPACE_CARD_GAP)}
        >
          {(result?.matchups ?? []).map((matchup) => (
            <MatchupGalleryCard
              key={matchup.matchupId}
              matchup={matchup}
              scoringPrecision={result?.coverage.scoringPrecision}
              sort={filter.sort}
              collection={collection}
            />
          ))}
        </div>
      )}
    </div>
  );
}
