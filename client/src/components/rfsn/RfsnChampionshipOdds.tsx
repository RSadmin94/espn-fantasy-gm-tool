import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

export type RfsnChampionshipOddsProps = {
  teams: { team: string; pct: number }[];
  variant?: "full" | "quiet";
  className?: string;
};

export function RfsnChampionshipOdds({
  teams,
  variant = "full",
  className,
}: RfsnChampionshipOddsProps) {
  const leader = teams.reduce((a, b) => (b.pct > a.pct ? b : a), teams[0]!);
  const max = Math.max(...teams.map((t) => t.pct), 1);

  if (variant === "quiet") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-white/5 bg-black/20 px-2.5 py-1.5 text-[10px] text-muted-foreground",
          className,
        )}
        aria-label="Championship odds"
      >
        <span className="shrink-0 font-medium uppercase tracking-wider text-white/40">Odds</span>
        {teams.map((t) => (
          <span
            key={t.team}
            className={cn(
              "inline-flex items-center gap-1",
              t.team === leader.team && "text-white/70",
            )}
          >
            <span className="max-w-[4.5rem] truncate">{t.team.replace("Team ", "")}</span>
            <span className="font-mono tabular-nums">{t.pct}%</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-sky-500/30 bg-sky-500/5 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sky-400">
        <Trophy className="h-4 w-4" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-widest">Championship odds</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {teams.map((t) => (
          <li key={t.team} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-muted-foreground">{t.team}</span>
            <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500/70 transition-all"
                style={{ width: `${(t.pct / max) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono text-white/80">{t.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
