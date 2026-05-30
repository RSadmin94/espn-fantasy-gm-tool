import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, HeartCrack, ScrollText } from "lucide-react";

const TAG_STYLES: Record<string, string> = {
  Nemesis: "border-red-700 bg-red-900/30 text-red-300",
  "Punching Bag": "border-emerald-700 bg-emerald-900/30 text-emerald-300",
  Rival: "border-amber-700 bg-amber-900/30 text-amber-300",
  Favorable: "border-blue-700 bg-blue-900/30 text-blue-300",
  Difficult: "border-orange-700 bg-orange-900/30 text-orange-300",
  Normal: "border-border bg-muted/30 text-muted-foreground",
};

function Tag({ tag }: { tag: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        TAG_STYLES[tag] ?? TAG_STYLES.Normal,
      )}
    >
      {tag}
    </span>
  );
}

function pct(n: number) {
  return `${Number(n ?? 0).toFixed(1)}%`;
}

export type RivalryPickerOption = { ownerKey: string; label: string };

type Props = {
  /** Canonical ownerKey for the focal manager (syncs when this prop changes). */
  focalOwnerKey: string;
  /** When provided, shows owner dropdown (e.g. league history). */
  pickerOptions?: RivalryPickerOption[];
};

export function RivalryDossierPanel({ focalOwnerKey, pickerOptions }: Props) {
  const trpcAny = trpc as any;
  const [queryKey, setQueryKey] = useState(focalOwnerKey.trim());

  useEffect(() => {
    setQueryKey(focalOwnerKey.trim());
  }, [focalOwnerKey]);

  const q = trpcAny.owners.rivalryDossier.useQuery(
    { ownerKey: queryKey },
    { enabled: queryKey.length > 0, staleTime: 60_000 },
  );

  const sortedPickers = useMemo(() => {
    if (!pickerOptions?.length) return [];
    return [...pickerOptions].sort((a, b) => a.label.localeCompare(b.label));
  }, [pickerOptions]);

  if (!queryKey) {
    return <p className="text-sm text-muted-foreground">Select an owner to load the dossier.</p>;
  }

  if (q.isPending || q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading rivalry dossier…
      </div>
    );
  }

  if (q.isError) {
    return (
      <p className="text-sm text-destructive">
        Could not load dossier: {String((q.error as Error)?.message ?? q.error)}
      </p>
    );
  }

  const data = q.data as
    | {
        ownerKey: string;
        ownerDisplayName: string;
        opponents: Array<{
          opponentOwnerKey: string;
          opponentDisplayName: string;
          gamesPlayed: number;
          wins: number;
          losses: number;
          ties: number;
          winPct: number;
          pointsFor: number;
          pointsAgainst: number;
          avgMargin: number;
          largestWin: number | null;
          worstLoss: number | null;
          heartbreakLosses: number;
          heartbreakWins: number;
          lastFiveMeetings: Array<{
            season: number;
            week: number;
            matchupPeriodId: number;
            ownerScore: number;
            opponentScore: number;
            result: string;
            margin: number;
          }>;
          tag: string;
        }>;
        matchupRowsUsed: number;
      }
    | null
    | undefined;

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No dossier for this owner — they may not resolve against gmTeams / gmMatchups yet.
      </p>
    );
  }

  const totalHb = data.opponents.reduce((s, r) => s + r.heartbreakLosses + r.heartbreakWins, 0);
  const totalHbLoss = data.opponents.reduce((s, r) => s + r.heartbreakLosses, 0);
  const totalHbWin = data.opponents.reduce((s, r) => s + r.heartbreakWins, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-foreground">
            <ScrollText className="h-4 w-4 text-sky-400/90" />
            <h3 className="text-sm font-semibold">Rivalry Dossier</h3>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            gmMatchups · completed regular season · {data.matchupRowsUsed} deduped rows in scope · focal{" "}
            <span className="font-mono text-foreground/90">{data.ownerKey}</span>
          </p>
        </div>
        {sortedPickers.length > 0 && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:items-end">
            <span>Focal owner</span>
            <select
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground min-w-[200px] max-w-full"
              value={queryKey}
              onChange={(e) => setQueryKey(e.target.value)}
            >
              {sortedPickers.map((o) => (
                <option key={o.ownerKey} value={o.ownerKey}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="rounded-lg border border-rose-700/35 bg-rose-950/20 px-4 py-3">
        <div className="flex items-start gap-2">
          <HeartCrack className="h-4 w-4 text-rose-300/90 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-200/95">Heartbreak index</p>
            <p className="mt-1 text-sm text-foreground/90">
              <span className="tabular-nums font-medium text-foreground">{totalHb}</span> total nail-biters
              (≤3 pts):{" "}
              <span className="text-rose-200/90">
                {totalHbLoss} losses · {totalHbWin} wins
              </span>{" "}
              across {data.opponents.length} opponent{data.opponents.length !== 1 ? "s" : ""}.
            </p>
          </div>
        </div>
      </div>

      {data.opponents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
          No head-to-head rows in gmMatchups for {data.ownerDisplayName}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-xs min-w-[880px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/25 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pl-3 pr-2">Opponent</th>
                <th className="py-2 pr-2 text-right">GP</th>
                <th className="py-2 pr-2 text-right">W–L–T</th>
                <th className="py-2 pr-2 text-right">Win %</th>
                <th className="py-2 pr-2 text-right">PF</th>
                <th className="py-2 pr-2 text-right">PA</th>
                <th className="py-2 pr-2 text-right">Avg Δ</th>
                <th className="py-2 pr-2 text-right">Best W</th>
                <th className="py-2 pr-2 text-right">Worst L</th>
                <th className="py-2 pr-2 text-right">HB L</th>
                <th className="py-2 pr-2 text-right">HB W</th>
                <th className="py-2 pr-3 text-right">Tag</th>
              </tr>
            </thead>
            <tbody>
              {data.opponents.map((row) => (
                <FragmentRow key={row.opponentOwnerKey} row={row} focalName={data.ownerDisplayName} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  row,
  focalName,
}: {
  row: {
    opponentDisplayName: string;
    opponentOwnerKey: string;
    gamesPlayed: number;
    wins: number;
    losses: number;
    ties: number;
    winPct: number;
    pointsFor: number;
    pointsAgainst: number;
    avgMargin: number;
    largestWin: number | null;
    worstLoss: number | null;
    heartbreakLosses: number;
    heartbreakWins: number;
    lastFiveMeetings: Array<{
      season: number;
      week: number;
      matchupPeriodId: number;
      ownerScore: number;
      opponentScore: number;
      result: string;
      margin: number;
    }>;
    tag: string;
  };
  focalName: string;
}) {
  const [open, setOpen] = useState(false);
  const wl = `${row.wins}–${row.losses}${row.ties ? `–${row.ties}` : ""}`;
  return (
    <>
      <tr className="border-b border-border/40 hover:bg-muted/15">
        <td className="py-2 pl-3 pr-2">
          <button
            type="button"
            className="text-left font-medium text-foreground hover:underline"
            onClick={() => setOpen((v) => !v)}
          >
            {row.opponentDisplayName}
          </button>
          <div className="font-mono text-[10px] text-muted-foreground/80 truncate max-w-[200px]">
            {row.opponentOwnerKey}
          </div>
        </td>
        <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{row.gamesPlayed}</td>
        <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{wl}</td>
        <td className="py-2 pr-2 text-right tabular-nums">{pct(row.winPct)}</td>
        <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{row.pointsFor.toFixed(1)}</td>
        <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{row.pointsAgainst.toFixed(1)}</td>
        <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
          {row.avgMargin > 0 ? "+" : ""}
          {row.avgMargin.toFixed(2)}
        </td>
        <td className="py-2 pr-2 text-right tabular-nums text-emerald-300/90">
          {row.largestWin != null ? `+${row.largestWin.toFixed(2)}` : "—"}
        </td>
        <td className="py-2 pr-2 text-right tabular-nums text-rose-300/90">
          {row.worstLoss != null ? row.worstLoss.toFixed(2) : "—"}
        </td>
        <td className="py-2 pr-2 text-right tabular-nums">{row.heartbreakLosses}</td>
        <td className="py-2 pr-2 text-right tabular-nums">{row.heartbreakWins}</td>
        <td className="py-2 pr-3 text-right">
          <Tag tag={row.tag} />
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/40 bg-muted/10">
          <td colSpan={12} className="px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Last 5 meetings vs {row.opponentDisplayName} ({focalName})
            </p>
            {row.lastFiveMeetings.length === 0 ? (
              <p className="text-xs text-muted-foreground">No meetings on file.</p>
            ) : (
              <div className="overflow-x-auto rounded border border-border/50">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/50 bg-muted/30">
                      <th className="text-left py-1 px-2">Season</th>
                      <th className="text-right py-1 px-2">Period</th>
                      <th className="text-right py-1 px-2">Week</th>
                      <th className="text-right py-1 px-2">Score (you–opp)</th>
                      <th className="text-center py-1 px-2">Res</th>
                      <th className="text-right py-1 px-2">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.lastFiveMeetings.map((g, i) => (
                      <tr key={`${g.season}-${g.matchupPeriodId}-${i}`} className="border-b border-border/30 last:border-0">
                        <td className="py-1 px-2 font-medium">{g.season}</td>
                        <td className="py-1 px-2 text-right text-muted-foreground">{g.matchupPeriodId}</td>
                        <td className="py-1 px-2 text-right text-muted-foreground">{g.week}</td>
                        <td className="py-1 px-2 text-right tabular-nums">
                          {g.ownerScore.toFixed(2)} – {g.opponentScore.toFixed(2)}
                        </td>
                        <td className="py-1 px-2 text-center font-semibold">{g.result}</td>
                        <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">
                          {g.margin > 0 ? "+" : ""}
                          {g.margin.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
