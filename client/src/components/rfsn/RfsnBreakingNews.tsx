import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

export type RfsnBreakingNewsProps = {
  headline: string;
  body: string;
  compact?: boolean;
  size?: "medium" | "large";
  className?: string;
};

export function RfsnBreakingNews({
  headline,
  body,
  compact = false,
  size = "medium",
  className,
}: RfsnBreakingNewsProps) {
  const isLarge = size === "large" && !compact;

  return (
    <div
      className={cn(
        "rounded-md border border-red-500/55 bg-gradient-to-br from-red-950/90 via-red-950/50 to-black/70 rfsn-breaking-live",
        compact ? "p-2.5" : "p-3 md:p-4",
        isLarge && "md:p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-red-400">
        <Zap className={cn("shrink-0 rfsn-mic-live", isLarge ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
        <span className="text-2xs font-semibold uppercase tracking-wide">Breaking</span>
      </div>
      <h3
        className={cn(
          "mt-1 font-black uppercase leading-tight text-white",
          compact ? "text-xs" : isLarge ? "text-base md:text-lg" : "text-sm",
        )}
      >
        {headline}
      </h3>
      <p
        className={cn(
          "mt-1 leading-snug text-white/75",
          compact ? "line-clamp-2 text-label" : "text-sm md:text-[15px]",
          isLarge && "line-clamp-3",
        )}
      >
        {body}
      </p>
    </div>
  );
}
