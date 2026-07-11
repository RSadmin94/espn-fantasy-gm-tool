import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

export type RfsnBreakingNewsProps = {
  headline: string;
  body: string;
  compact?: boolean;
  className?: string;
};

export function RfsnBreakingNews({
  headline,
  body,
  compact = false,
  className,
}: RfsnBreakingNewsProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-red-500/50 bg-gradient-to-br from-red-950/80 to-black/60",
        compact ? "p-2.5" : "p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-red-400">
        <Zap className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-[10px] font-black uppercase tracking-widest">Breaking</span>
      </div>
      <h3 className={cn("mt-1 font-black uppercase leading-tight text-white", compact ? "text-xs" : "text-sm")}>
        {headline}
      </h3>
      <p
        className={cn(
          "mt-1 leading-snug text-white/75",
          compact ? "line-clamp-2 text-[11px]" : "text-xs",
        )}
      >
        {body}
      </p>
    </div>
  );
}
