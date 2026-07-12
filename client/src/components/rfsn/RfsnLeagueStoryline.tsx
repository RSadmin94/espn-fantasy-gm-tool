import { cn } from "@/lib/utils";
import { BookOpen } from "lucide-react";

export type RfsnLeagueStorylineProps = {
  title: string;
  body: string;
  className?: string;
};

export function RfsnLeagueStoryline({ title, body, className }: RfsnLeagueStorylineProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-violet-500/40 bg-gradient-to-br from-violet-500/12 to-black/50 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-violet-400">
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-[9px] font-black uppercase tracking-[0.18em]">League storyline</span>
      </div>
      <h3 className="mt-1.5 text-sm font-bold text-white md:text-base">{title}</h3>
      <p className="mt-1 line-clamp-3 text-xs leading-snug text-white/72">{body}</p>
    </div>
  );
}
