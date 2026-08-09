import {
  Crown,
  Flame,
  HeartCrack,
  Receipt,
  Rocket,
  Swords,
  Target,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import type { StoryCollectionAccent, StoryCollectionIconKey } from "@shared/matchupStoryCollections";

export const STORY_COLLECTION_ICONS: Record<StoryCollectionIconKey, LucideIcon> = {
  flame: Flame,
  "heart-crack": HeartCrack,
  crown: Crown,
  swords: Swords,
  target: Target,
  rocket: Rocket,
  "trending-down": TrendingDown,
  receipt: Receipt,
};

export const STORY_COLLECTION_ACCENT: Record<
  StoryCollectionAccent,
  { card: string; badge: string; icon: string; bar: string }
> = {
  amber: {
    card: "border-amber-400/30 hover:border-amber-400/50",
    badge: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    icon: "text-amber-200",
    bar: "bg-amber-400/80",
  },
  rose: {
    card: "border-rose-400/30 hover:border-rose-400/50",
    badge: "border-rose-400/40 bg-rose-400/15 text-rose-200",
    icon: "text-rose-200",
    bar: "bg-rose-400/80",
  },
  violet: {
    card: "border-violet-400/30 hover:border-violet-400/50",
    badge: "border-violet-400/40 bg-violet-400/15 text-violet-200",
    icon: "text-violet-200",
    bar: "bg-violet-400/80",
  },
  red: {
    card: "border-red-400/30 hover:border-red-400/50",
    badge: "border-red-400/40 bg-red-400/15 text-red-200",
    icon: "text-red-200",
    bar: "bg-red-400/80",
  },
  sky: {
    card: "border-sky-400/30 hover:border-sky-400/50",
    badge: "border-sky-400/40 bg-sky-400/15 text-sky-200",
    icon: "text-sky-200",
    bar: "bg-sky-400/80",
  },
  lime: {
    card: "border-lime-400/30 hover:border-lime-400/50",
    badge: "border-lime-400/40 bg-lime-400/15 text-lime-200",
    icon: "text-lime-200",
    bar: "bg-lime-400/80",
  },
  orange: {
    card: "border-orange-400/30 hover:border-orange-400/50",
    badge: "border-orange-400/40 bg-orange-400/15 text-orange-200",
    icon: "text-orange-200",
    bar: "bg-orange-400/80",
  },
  gold: {
    card: "border-yellow-400/30 hover:border-yellow-400/50",
    badge: "border-yellow-400/40 bg-yellow-400/15 text-yellow-200",
    icon: "text-yellow-200",
    bar: "bg-yellow-400/80",
  },
};
