import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { SPACE_CARD, SPACE_CARD_GAP, SPACE_CHIP, SPACE_SECTION_Y } from "@/lib/density";
import { TYPE_BADGE } from "@/lib/typeScale";
import type { StoryCollectionSummary } from "../../../../server/matchupStoryCollections";
import { STORY_COLLECTION_ACCENT, STORY_COLLECTION_ICONS } from "./storyCollectionTheme";
import { SectionLoading } from "@/components/layout";

export function StoryCollectionHome({
  collections,
  loading,
}: {
  collections: StoryCollectionSummary[];
  loading?: boolean;
}) {
  return (
    <section data-rfsn-053e data-story-collections className={SPACE_SECTION_Y}>
      <div>
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">Story Collections</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Branded historical themes compiled from recorded matchups. No AI. No invented games.
        </p>
      </div>

      {loading ? (
        <SectionLoading message="Loading story collections…" className="justify-center py-16" />
      ) : (
        <div className={cn("grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4", SPACE_CARD_GAP)}>
          {collections.map((collection) => {
            const Icon = STORY_COLLECTION_ICONS[collection.theme.icon];
            const accent = STORY_COLLECTION_ACCENT[collection.theme.accent];
            return (
              <Link
                key={collection.id}
                to={collection.href}
                data-story-collection-card={collection.id}
                className={cn(
                  "flex h-full flex-col rounded-xl border bg-card transition-colors",
                  SPACE_CARD,
                  accent.card,
                )}
              >
                <div className={cn("mb-3 h-1 w-full rounded-full", accent.bar)} aria-hidden="true" />
                <div className="flex items-start justify-between gap-2">
                  <Icon className={cn("h-5 w-5 shrink-0", accent.icon)} aria-hidden="true" />
                  <span
                    data-collection-badge
                    className={cn("rounded-full border uppercase", TYPE_BADGE, SPACE_CHIP, accent.badge)}
                  >
                    {collection.badge}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold text-foreground">{collection.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{collection.subtitle}</p>
                <p className="mt-2 flex-1 text-sm text-foreground">{collection.description}</p>
                <p
                  data-story-collection-count={collection.id}
                  className="mt-4 text-sm font-semibold tabular-nums text-foreground"
                >
                  {collection.empty && collection.id === "championship" && collection.emptyReason === "insufficient_playoff_tier"
                    ? "Championship games cannot be proven"
                    : collection.id === "blood-rival" && collection.emptyReason === "unresolved_opponent"
                      ? "Pick a rival"
                      : `${collection.count} games`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
