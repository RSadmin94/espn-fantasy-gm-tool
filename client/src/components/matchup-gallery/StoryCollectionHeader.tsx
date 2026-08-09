import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { SPACE_CARD, SPACE_CHIP } from "@/lib/density";
import { TYPE_BADGE } from "@/lib/typeScale";
import { storyCollectionHomeHref, type StoryCollectionDefinition } from "@shared/matchupStoryCollections";
import { STORY_COLLECTION_ACCENT, STORY_COLLECTION_ICONS } from "./storyCollectionTheme";

export function StoryCollectionHeader({
  collection,
  count,
  showBack = true,
  compact = false,
}: {
  collection: StoryCollectionDefinition;
  count?: number | null;
  showBack?: boolean;
  compact?: boolean;
}) {
  const Icon = STORY_COLLECTION_ICONS[collection.theme.icon];
  const accent = STORY_COLLECTION_ACCENT[collection.theme.accent];

  return (
    <header
      data-story-collection-header
      data-story-collection={collection.id}
      className={cn("overflow-hidden rounded-xl border border-border bg-card", SPACE_CARD)}
    >
      <div className={cn("mb-3 h-1 w-full rounded-full", accent.bar)} aria-hidden="true" />
      {showBack ? (
        <p className="mb-2 text-sm text-muted-foreground">
          <Link
            data-story-collections-back
            to={storyCollectionHomeHref()}
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            ← Story Collections
          </Link>
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", accent.icon)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={cn("font-bold text-foreground", compact ? "text-base" : "text-xl sm:text-2xl")}>
              {collection.title}
            </h2>
            <span
              data-collection-badge
              className={cn("rounded-full border uppercase", TYPE_BADGE, SPACE_CHIP, accent.badge)}
            >
              {collection.badge}
            </span>
            {count != null ? (
              <span data-story-collection-count className={cn("rounded-full border border-border font-semibold", SPACE_CHIP)}>
                {count} games
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{collection.subtitle}</p>
          {!compact ? <p className="mt-2 text-sm text-foreground">{collection.description}</p> : null}
        </div>
      </div>
    </header>
  );
}
