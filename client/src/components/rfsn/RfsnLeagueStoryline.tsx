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
        "rounded-lg border border-violet-500/40 bg-violet-500/10 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-violet-400">
        <BookOpen className="h-4 w-4" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-widest">League storyline</span>
      </div>
      <h3 className="mt-1 text-sm font-bold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-snug text-white/75">{body}</p>
    </div>
  );
}
