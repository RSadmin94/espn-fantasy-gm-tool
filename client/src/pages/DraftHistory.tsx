import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type DraftPickRow = {
  overallPick: number;
  roundId: number;
  roundPick: number;
  playerName: string | null;
  position: string | null;
  nflTeam: string;
  teamName: string;
  teamId: number;
  isKeeper: boolean;
};

function PosBadge({ pos }: { pos: string | null | undefined }) {
  const p = (pos || "?").toUpperCase();
  return (
    <span className="inline-flex rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
      {p}
    </span>
  );
}

function sortDraftPicks(rows: DraftPickRow[]): DraftPickRow[] {
  return [...rows].sort((a, b) => {
    const ao = a.overallPick > 0 ? a.overallPick : 0;
    const bo = b.overallPick > 0 ? b.overallPick : 0;
    if (ao > 0 && bo > 0 && ao !== bo) return ao - bo;
    if (a.roundId !== b.roundId) return a.roundId - b.roundId;
    return (a.roundPick > 0 ? a.roundPick : 0) - (b.roundPick > 0 ? b.roundPick : 0);
  });
}

export function DraftHistory() {
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();
  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];
  const defaultSeason =
    cachedSeasons.length > 0
      ? Math.max(...cachedSeasons)
      : allSeasons.length > 0
        ? allSeasons[allSeasons.length - 1]!
        : 2025;

  const [seasonOverride, setSeasonOverride] = useState<number | null>(null);
  const season = seasonOverride ?? defaultSeason;
  const draftQ = trpc.espn.draftPicks.useQuery({ season });

  const picks = useMemo(
    () => sortDraftPicks((draftQ.data ?? []) as DraftPickRow[]),
    [draftQ.data],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Draft History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ESPN combined cache → normalized draft picks (no database table).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="w-28">
            <Select value={String(season)} onValueChange={(v) => setSeasonOverride(Number(v))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...allSeasons].reverse().map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                    {cachedSeasons.includes(s) && (
                      <span className="ml-1 text-xs text-emerald-400">✓</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {draftQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!draftQ.isLoading && (
            <span className="text-xs text-muted-foreground">{picks.length} picks</span>
          )}
        </CardContent>
      </Card>

      {draftQ.isError && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {draftQ.error.message}
        </div>
      )}

      {!draftQ.isLoading && !draftQ.isError && picks.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No draft picks for {season}. Sync or cache this season&apos;s combined ESPN data first.
        </p>
      )}

      {picks.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Overall Pick</th>
                  <th className="px-3 py-2 font-medium">Round</th>
                  <th className="px-3 py-2 font-medium">Round Pick</th>
                  <th className="px-3 py-2 font-medium">Player</th>
                  <th className="px-3 py-2 font-medium">Position</th>
                  <th className="px-3 py-2 font-medium">NFL Team</th>
                  <th className="px-3 py-2 font-medium">Fantasy Team</th>
                  <th className="px-3 py-2 font-medium">Team Id</th>
                  <th className="px-3 py-2 font-medium">Keeper</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => (
                  <tr
                    key={`${p.overallPick}-${p.teamId}-${p.playerName ?? ""}`}
                    className={cn(
                      "border-b border-border/40",
                      p.isKeeper && "bg-amber-500/5",
                    )}
                  >
                    <td className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground">
                      {p.overallPick > 0 ? p.overallPick : "—"}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">{p.roundId || "—"}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">
                      {p.roundPick > 0 ? p.roundPick : "—"}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-foreground">
                      {p.playerName ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <PosBadge pos={p.position} />
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {(p.nflTeam || "").trim() || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-foreground/90">{p.teamName}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {p.teamId}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {p.isKeeper ? (
                        <span className="text-xs font-semibold text-amber-400">K</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
