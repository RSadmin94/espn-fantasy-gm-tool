import { cn } from "@/lib/utils";

export type LiveDraftWrapUpProps = {
  teams: Array<{ teamId: number; teamName: string; ownerName?: string }>;
  draftGrades: Map<number, { letter: string; avgDelta: number; strength: number }>;
  rostersByTeam: Map<number, Array<{ name: string; position: string; pickNumber: number; adp?: number | null }>>;
  className?: string;
};

export function LiveDraftWrapUp({
  teams,
  draftGrades,
  rostersByTeam,
  className,
}: LiveDraftWrapUpProps) {
  const ranked = [...teams]
    .map((t) => ({
      ...t,
      grade: draftGrades.get(Number(t.teamId)),
      roster: rostersByTeam.get(Number(t.teamId)) ?? [],
    }))
    .filter((t) => t.grade && t.grade.letter !== "—")
    .sort((a, b) => (b.grade?.strength ?? 0) - (a.grade?.strength ?? 0));

  const top = ranked[0];
  let bestValue: { name: string; delta: number; team: string } | null = null;
  let biggestReach: { name: string; delta: number; team: string } | null = null;
  const posCounts: Record<string, number> = {};

  for (const t of teams) {
    const roster = rostersByTeam.get(Number(t.teamId)) ?? [];
    for (const p of roster) {
      if (p.adp == null) continue;
      const delta = Number(p.pickNumber) - Number(p.adp);
      if (!bestValue || delta > bestValue.delta) {
        bestValue = { name: p.name, delta, team: t.teamName };
      }
      if (!biggestReach || delta < biggestReach.delta) {
        biggestReach = { name: p.name, delta, team: t.teamName };
      }
      const pos = String(p.position ?? "").toUpperCase();
      posCounts[pos] = (posCounts[pos] ?? 0) + 1;
    }
  }

  const notableRun = Object.entries(posCounts)
    .filter(([pos]) => !["K", "DEF", "DST", "DP"].includes(pos))
    .sort((a, b) => b[1] - a[1])[0];

  return (
    <section
      className={cn(
        "rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3",
        className,
      )}
      data-live-draft-wrap-up
    >
      <h3 className="text-sm font-black uppercase tracking-wider text-violet-200">
        Draft Wrap-Up
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-zinc-300">
        <div>
          <span className="text-zinc-500">Top draft grade</span>
          <p className="font-bold text-zinc-100">
            {top ? `${top.teamName} (${top.grade?.letter})` : "—"}
          </p>
        </div>
        <div>
          <span className="text-zinc-500">Best value</span>
          <p className="font-bold text-zinc-100">
            {bestValue ? `${bestValue.name} (+${bestValue.delta.toFixed(0)} vs ADP, ${bestValue.team})` : "—"}
          </p>
        </div>
        <div>
          <span className="text-zinc-500">Biggest reach</span>
          <p className="font-bold text-zinc-100">
            {biggestReach && biggestReach.delta < 0
              ? `${biggestReach.name} (${biggestReach.delta.toFixed(0)} vs ADP, ${biggestReach.team})`
              : "—"}
          </p>
        </div>
        <div>
          <span className="text-zinc-500">Notable position volume</span>
          <p className="font-bold text-zinc-100">
            {notableRun ? `${notableRun[1]} ${notableRun[0]}s drafted league-wide` : "—"}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500">
        RFSN wrap-up commentary appears in the booth and running log when the final pick locks.
      </p>
    </section>
  );
}
