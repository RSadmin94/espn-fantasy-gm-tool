import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

type MedalRow = {
  season: number;
  championOwner: string;
  runnerUpOwner: string;
  thirdPlaceOwner: string;
};

function cell(value: string | null | undefined): string {
  const s = value?.trim();
  return s || "—";
}

export function Championships() {
  const medalsQ = trpc.espn.leagueMedals.useQuery(undefined, { staleTime: 60_000 });
  const medals = (medalsQ.data ?? []) as MedalRow[];

  const bySeason = useMemo(
    () => [...medals].sort((a, b) => a.season - b.season),
    [medals],
  );

  const titleCountsByTeam = useMemo(() => {
    const map = new Map<string, { titles: number; seasons: number[] }>();
    for (const row of medals) {
      const team = row.championOwner?.trim() ?? "";
      if (!team) continue;
      const entry = map.get(team) ?? { titles: 0, seasons: [] };
      entry.titles += 1;
      entry.seasons.push(row.season);
      map.set(team, entry);
    }
    return [...map.entries()]
      .map(([championTeam, { titles, seasons }]) => ({
        championTeam,
        titles,
        seasons: [...seasons].sort((a, b) => a - b),
      }))
      .sort((a, b) => b.titles - a.titles || a.championTeam.localeCompare(b.championTeam));
  }, [medals]);

  const totalChampionRows = medals.filter((m) => m.championOwner?.trim()).length;
  const totalTitlesListed = titleCountsByTeam.reduce((sum, r) => sum + r.titles, 0);

  if (medalsQ.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading medals…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-1 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Championships</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Validation view — source: <code className="text-xs">league_medals</code> only.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Champion rows: {totalChampionRows} · Title sum: {totalTitlesListed}
          {totalChampionRows !== totalTitlesListed ? " (mismatch)" : ""}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Champions by Season</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Season</TableHead>
              <TableHead>Champion Team</TableHead>
              <TableHead>Runner-Up</TableHead>
              <TableHead>Third</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bySeason.map((row) => (
              <TableRow key={row.season}>
                <TableCell>{row.season}</TableCell>
                <TableCell>{cell(row.championOwner)}</TableCell>
                <TableCell>{cell(row.runnerUpOwner)}</TableCell>
                <TableCell>{cell(row.thirdPlaceOwner)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Title Counts by Champion Team</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Champion Team</TableHead>
              <TableHead className="text-right">Titles</TableHead>
              <TableHead>Seasons</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {titleCountsByTeam.map((row) => (
              <TableRow key={row.championTeam}>
                <TableCell>{row.championTeam}</TableCell>
                <TableCell className="text-right tabular-nums">{row.titles}</TableCell>
                <TableCell>{row.seasons.join(", ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
