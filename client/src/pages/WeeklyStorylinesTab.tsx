/**
 * WeeklyStorylinesTab.tsx
 * ───────────────────────
 * Sprint 3: Weekly Storylines Feed
 *
 * Journalist-voice, emotionally-tagged feed of the week's 8 story types.
 * Reads from the weeklyStorylines DB cache; includes a manual refresh button
 * that triggers LLM generation for any uncached stories.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, Zap, TrendingDown, Eye, AlertTriangle,
  Activity, TrendingUp, Flame, Swords, Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StorylineRow {
  id: number;
  season: number;
  week: number;
  storyType: string;
  emotionalTag: string;
  teamId: number;
  ownerName: string;
  record: string;
  intensityScore: number;
  headline: string | null;
  bodyText: string | null;
  supportingStat: string | null;
  opponentName: string | null;
  generatedAt: Date | string;
}

// ─── Story type metadata ──────────────────────────────────────────────────────

const STORY_META: Record<string, {
  icon: React.ReactNode;
  color: string;         // Tailwind text color
  bgColor: string;       // Tailwind bg color (light)
  borderColor: string;   // Tailwind border color
  badgeBg: string;       // badge background
}> = {
  REVENGE_GAME: {
    icon: <Swords className="w-4 h-4" />,
    color: "text-red-400",
    bgColor: "bg-red-950/30",
    borderColor: "border-red-800/40",
    badgeBg: "bg-red-900/60 text-red-300 border-red-700/50",
  },
  HEARTBREAK_PENDING: {
    icon: <Swords className="w-4 h-4" />,
    color: "text-orange-400",
    bgColor: "bg-orange-950/30",
    borderColor: "border-orange-800/40",
    badgeBg: "bg-orange-900/60 text-orange-300 border-orange-700/50",
  },
  COLLAPSE: {
    icon: <TrendingDown className="w-4 h-4" />,
    color: "text-rose-400",
    bgColor: "bg-rose-950/30",
    borderColor: "border-rose-800/40",
    badgeBg: "bg-rose-900/60 text-rose-300 border-rose-700/50",
  },
  SILENT_THREAT: {
    icon: <Eye className="w-4 h-4" />,
    color: "text-violet-400",
    bgColor: "bg-violet-950/30",
    borderColor: "border-violet-800/40",
    badgeBg: "bg-violet-900/60 text-violet-300 border-violet-700/50",
  },
  DESPERATION_WINDOW: {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: "text-amber-400",
    bgColor: "bg-amber-950/30",
    borderColor: "border-amber-800/40",
    badgeBg: "bg-amber-900/60 text-amber-300 border-amber-700/50",
  },
  PLAYOFF_BUBBLE: {
    icon: <Activity className="w-4 h-4" />,
    color: "text-cyan-400",
    bgColor: "bg-cyan-950/30",
    borderColor: "border-cyan-800/40",
    badgeBg: "bg-cyan-900/60 text-cyan-300 border-cyan-700/50",
  },
  MOMENTUM_SHIFT: {
    icon: <TrendingUp className="w-4 h-4" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-950/30",
    borderColor: "border-emerald-800/40",
    badgeBg: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  },
  FEAR_RISING: {
    icon: <Flame className="w-4 h-4" />,
    color: "text-yellow-400",
    bgColor: "bg-yellow-950/30",
    borderColor: "border-yellow-800/40",
    badgeBg: "bg-yellow-900/60 text-yellow-300 border-yellow-700/50",
  },
};

const DEFAULT_META = {
  icon: <Zap className="w-4 h-4" />,
  color: "text-slate-400",
  bgColor: "bg-slate-800/30",
  borderColor: "border-slate-700/40",
  badgeBg: "bg-slate-700/60 text-slate-300 border-slate-600/50",
};

// ─── Intensity bar ────────────────────────────────────────────────────────────

function IntensityBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color =
    pct >= 80 ? "bg-red-500" :
    pct >= 60 ? "bg-orange-500" :
    pct >= 40 ? "bg-amber-500" :
    "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-slate-700/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-500 font-mono w-7 text-right">{pct}</span>
    </div>
  );
}

// ─── Single story card ────────────────────────────────────────────────────────

function StoryCard({ story }: { story: StorylineRow }) {
  const meta = STORY_META[story.storyType] ?? DEFAULT_META;
  const isRodStory = story.storyType === "REVENGE_GAME" || story.storyType === "HEARTBREAK_PENDING";

  return (
    <Card className={`${meta.bgColor} ${meta.borderColor} border transition-all hover:border-opacity-70`}>
      <CardContent className="pt-4 pb-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`${meta.color} shrink-0`}>{meta.icon}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${meta.badgeBg}`}>
              {story.emotionalTag}
            </span>
            {isRodStory && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-blue-900/60 text-blue-300 border-blue-700/50">
                ROD
              </span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-slate-400 font-mono">{story.record}</div>
            <div className="text-[10px] text-slate-600">Week {story.week}</div>
          </div>
        </div>

        {/* Headline */}
        <h3 className="text-slate-100 font-bold text-sm leading-tight mb-2">
          {story.headline ?? `${story.ownerName}: ${story.emotionalTag}`}
        </h3>

        {/* Body */}
        {story.bodyText && (
          <p className="text-slate-400 text-xs leading-relaxed mb-3">
            {story.bodyText}
          </p>
        )}

        {/* Footer: supporting stat + intensity */}
        <div className="space-y-2">
          {story.supportingStat && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-mono">📊</span>
              <span className="text-[11px] text-slate-400">{story.supportingStat}</span>
            </div>
          )}
          {story.opponentName && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-mono">⚔️</span>
              <span className="text-[11px] text-slate-400">vs {story.opponentName}</span>
            </div>
          )}
          <IntensityBar score={story.intensityScore} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function StorySkeleton() {
  return (
    <Card className="bg-slate-800/30 border-slate-700/40">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-5/6 rounded" />
        <Skeleton className="h-1 w-full rounded" />
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WeeklyStorylinesTabProps {
  season?: number;
}

export default function WeeklyStorylinesTab({ season = 2025 }: WeeklyStorylinesTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: stories, isLoading, refetch } = trpc.weeklyStorylines.getLatest.useQuery(
    { season },
    { staleTime: 5 * 60_000 }
  );

  const refreshMutation = trpc.weeklyStorylines.refresh.useMutation({
    onSuccess: (result) => {
      toast.success(`Storylines refreshed — ${result.count} stories generated`);
      refetch();
    },
    onError: (err) => {
      toast.error(`Refresh failed: ${err.message}`);
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshMutation.mutateAsync({ season });
    } finally {
      setIsRefreshing(false);
    }
  };

  const week = stories?.[0]?.week ?? null;
  const hasStories = (stories?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-100 font-bold text-base">
            This Week's Storylines
            {week && (
              <span className="ml-2 text-xs font-normal text-slate-500">Week {week}</span>
            )}
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Journalist-voice narratives generated from league data
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || refreshMutation.isPending}
          className="gap-1.5 text-xs border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300"
        >
          {(isRefreshing || refreshMutation.isPending) ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Generate
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <StorySkeleton key={i} />)}
        </div>
      ) : !hasStories ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="w-10 h-10 text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium text-sm">No storylines yet for Week {week ?? "—"}</p>
          <p className="text-slate-600 text-xs mt-1 max-w-xs">
            Click <strong>Generate</strong> to compute this week's emotional storylines from league data.
            LLM headlines are generated once and cached.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || refreshMutation.isPending}
            className="mt-4 gap-1.5 text-xs border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300"
          >
            {(isRefreshing || refreshMutation.isPending) ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            Generate Storylines
          </Button>
        </div>
      ) : (
        <>
          {/* Story grid — sorted by intensity (already sorted server-side) */}
          <div className="grid gap-3 sm:grid-cols-2">
            {stories!.map((story) => (
              <StoryCard key={story.id} story={story as StorylineRow} />
            ))}
          </div>

          {/* Legend */}
          <div className="pt-2 border-t border-slate-800/60">
            <p className="text-[10px] text-slate-600 text-center">
              Stories are ranked by intensity score (0–100). Headlines generated by AI, cached per week.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
