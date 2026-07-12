import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

export type RfsnChampionshipOddsProps = {
  teams: { team: string; pct: number }[];
  variant?: "full" | "quiet" | "studio-quiet";
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
          "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-white/5 bg-black/25 px-2.5 py-1.5 text-[10px] text-white/40",
          className,
        )}
        aria-label="Championship odds"
      >
        <span className="shrink-0 font-bold uppercase tracking-[0.16em] text-white/30">Odds</span>
        {teams.map((t) => (
          <span
            key={t.team}
            className={cn(
              "inline-flex items-center gap-1",
              t.team === leader.team && "text-white/65",
            )}
          >
            <span className="max-w-[4.5rem] truncate">{t.team.replace("Team ", "")}</span>
            <span className="font-mono tabular-nums">{t.pct}%</span>
          </span>
        ))}
      </div>
    );
  }

  if (variant === "studio-quiet") {
    return (
      <div
        className={cn(
          "rounded-md border border-sky-500/20 bg-sky-950/20 p-2.5",
          className,
        )}
        aria-label="Championship odds"
      >
        <div className="mb-2 flex items-center gap-1.5 text-sky-400/80">
          <Trophy className="h-3.5 w-3.5" aria-hidden />
          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Championship odds</span>
        </div>
        <ul className="space-y-1.5">
          {teams.slice(0, 4).map((t) => (
            <li key={t.team} className="flex items-center gap-2 text-[10px]">
              <span className="w-16 truncate text-white/45">{t.team.replace("Team ", "")}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-emerald-500/60"
                  style={{ width: `${(t.pct / max) * 100}%` }}
                />
              </div>
              <span className="w-7 text-right font-mono tabular-nums text-white/55">{t.pct}%</span>
            </li>
          ))}
        </ul>
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
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
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
