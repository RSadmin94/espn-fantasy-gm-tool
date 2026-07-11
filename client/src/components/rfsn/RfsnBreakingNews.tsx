import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

export type RfsnBreakingNewsProps = {
  headline: string;
  body: string;
  className?: string;
};

export function RfsnBreakingNews({ headline, body, className }: RfsnBreakingNewsProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-red-500/50 bg-gradient-to-br from-red-950/80 to-black/60 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-red-400">
        <Zap className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-[10px] font-black uppercase tracking-widest">Breaking</span>
      </div>
      <h3 className="mt-1 text-sm font-black uppercase leading-tight text-white">{headline}</h3>
      <p className="mt-1 text-xs leading-snug text-white/75">{body}</p>
    </div>
  );
}
