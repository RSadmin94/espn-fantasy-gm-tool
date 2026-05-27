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

function dash(v: string | null | undefined): string {
  return v?.trim() || "—";
}

function normalizeOwnerKey(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^\(+|\)+$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function Championships() {
  const ringQ = trpc.espn.ringOfHonor.useQuery(undefined, { staleTime: 60_000 });
  const recordsQ = trpc.espn.ownerAllTimeRecords.useQuery(undefined, { staleTime: 60_000 });

  const isLoading = ringQ.isLoading || recordsQ.isLoading;

  const mergedOwners = useMemo(() => {
    const leaderboard = ringQ.data?.leaderboard ?? [];
    const records = recordsQ.data?.owners ?? [];
    const recordByKey = new Map(records.map((r) => [r.ownerKey, r]));
    const recordByNorm = new Map(records.map((r) => [normalizeOwnerKey(r.displayName), r]));

    const keys = new Set<string>();
    for (const row of leaderboard) keys.add(row.ownerKey);
    for (const row of records) keys.add(row.ownerKey);

    return [...keys]
      .map((ownerKey) => {
        const titles = leaderboard.find((l) => l.ownerKey === ownerKey);
        const rec = recordByKey.get(ownerKey) ?? recordByNorm.get(ownerKey);
        const displayName = titles?.ownerName ?? rec?.displayName ?? ownerKey;
        const wins = rec?.wins ?? 0;
        const losses = rec?.losses ?? 0;
        const ties = rec?.ties ?? 0;
        const gamesPlayed = rec?.gamesPlayed ?? wins + losses + ties;
        const winPct = rec?.winPct ?? (gamesPlayed > 0 ? ((wins + 0.5 * ties) / gamesPlayed) * 100 : 0);
        return {
          ownerKey,
          displayName,
          titles: titles?.titles ?? 0,
          titleSeasons: titles?.seasons ?? [],
          wins,
          losses,
          ties,
          gamesPlayed,
          winPct,
        };
      })
      .sort(
        (a, b) =>
          b.titles - a.titles ||
          b.winPct - a.winPct ||
          b.wins - a.wins ||
          a.displayName.localeCompare(b.displayName),
      );
  }, [ringQ.data, recordsQ.data]);

  const medals = ringQ.data?.medals ?? [];
  const bySeason = useMemo(() => [...medals].sort((a, b) => a.season - b.season), [medals]);

  const totalTitles = mergedOwners.reduce((sum, o) => sum + o.titles, 0);
  const totalGames = mergedOwners.reduce((sum, o) => sum + o.gamesPlayed, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-1 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Championships</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Titles from <code className="text-xs">ringOfHonor</code> · W-L-T from{" "}
          <code className="text-xs">ownerAllTimeRecords</code> (weekly matchups)
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Owners: {mergedOwners.length} · Titles credited: {totalTitles} · Matchup games counted:{" "}
          {totalGames}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Owner Records</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Titles</TableHead>
              <TableHead>Title Seasons</TableHead>
              <TableHead className="text-right">W</TableHead>
              <TableHead className="text-right">L</TableHead>
              <TableHead className="text-right">T</TableHead>
              <TableHead className="text-right">Win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mergedOwners.map((row) => (
              <TableRow key={row.ownerKey}>
                <TableCell className="font-medium">{row.displayName}</TableCell>
                <TableCell className="text-right tabular-nums">{row.titles}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {row.titleSeasons.length > 0 ? row.titleSeasons.join(", ") : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.wins}</TableCell>
                <TableCell className="text-right tabular-nums">{row.losses}</TableCell>
                <TableCell className="text-right tabular-nums">{row.ties}</TableCell>
                <TableCell className="text-right tabular-nums">{row.winPct.toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Champions by Season</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Season</TableHead>
              <TableHead>Champion Team</TableHead>
              <TableHead>Champion Owner</TableHead>
              <TableHead>Runner-Up</TableHead>
              <TableHead>Third</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bySeason.map((row) => (
              <TableRow key={row.season}>
                <TableCell>{row.season}</TableCell>
                <TableCell>{dash(row.championTeam)}</TableCell>
                <TableCell>{dash(row.resolvedChampionOwner)}</TableCell>
                <TableCell>{dash(row.runnerUpTeam)}</TableCell>
                <TableCell>{dash(row.thirdTeam)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
