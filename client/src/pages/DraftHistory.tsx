import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";

const POS_COLORS: Record<string, string> = {
  QB: "border-red-500/30 bg-red-500/10 text-red-300",
  RB: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  WR: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  TE: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  K: "border-purple-500/30 bg-purple-500/10 text-purple-300",
  DST: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  "D/ST": "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

function PosBadge({ pos }: { pos: string | null | undefined }) {
  const p = (pos || "?").toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
        POS_COLORS[p] ?? "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {p}
    </span>
  );
}

type DraftPick = {
  overallPick: number;
  roundId: number;
  roundPick: number;
  teamId: number;
  teamName: string;
  playerName: string;
  position: string | null;
  nflTeam: string;
  isKeeper: boolean;
  source: string;
};

export function DraftHistory() {
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();
  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];
  const defaultSeason =
    allSeasons.length > 0 ? allSeasons[allSeasons.length - 1]! : 2025;

  const [season, setSeason] = useState(defaultSeason);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ rowsInserted: number; rawRows: number; skipped: number } | null>(null);

  const draftQ = trpc.espn.draftHistory.useQuery({ season }, { staleTime: 0 });
  const importMut = trpc.espn.importDraftFromEspnApi.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      setImportError(null);
      void draftQ.refetch();
    },
    onError: (err) => {
      setImportError(err.message);
    },
  });

  const picks = (draftQ.data?.picks ?? []) as DraftPick[];
  const teamCount = draftQ.data?.teamCount ?? 0;
  const diagnostics = draftQ.data?.diagnostics;

  // Group picks by roundId, then sort within each round by roundPick (or overallPick)
  const byRound = useMemo(() => {
    const map = new Map<number, DraftPick[]>();
    for (const p of picks) {
      const r = p.roundId > 0 ? p.roundId : 1;
      const arr = map.get(r) ?? [];
      arr.push(p);
      map.set(r, arr);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([round, roundPicks]) => ({
        round,
        picks: [...roundPicks].sort((a, b) =>
          a.roundPick > 0 && b.roundPick > 0
            ? a.roundPick - b.roundPick
            : a.overallPick - b.overallPick,
        ),
      }));
  }, [picks]);

  const handleImport = () => {
    if (!confirm(`Import 2025 draft picks from ESPN mDraftDetail? This will DELETE all existing picks for season ${season} and replace with fresh ESPN data.`)) return;
    setImportResult(null);
    setImportError(null);
    importMut.mutate({ season });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-1 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Draft History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ESPN mDraftDetail → normalized picks → stored rows. No source priority logic.
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="w-28">
            <Select value={String(season)} onValueChange={(v) => { setSeason(Number(v)); setImportResult(null); setImportError(null); }}>
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

          <button
            type="button"
            disabled={importMut.isPending}
            onClick={handleImport}
            className="flex items-center gap-1.5 rounded border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/20 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", importMut.isPending && "animate-spin")} />
            {importMut.isPending ? "Importing…" : "Import from ESPN"}
          </button>

          {importResult && (
            <span className="text-xs text-emerald-400">
              Imported {importResult.rowsInserted} picks ({importResult.skipped} skipped, {importResult.rawRows} raw)
            </span>
          )}
          {importError && (
            <span className="text-xs text-red-400">{importError}</span>
          )}
        </CardContent>
      </Card>

      {/* Source banner */}
      {diagnostics && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            diagnostics.sourceUsed === "espn_mDraftDetail"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : "border-amber-500/40 bg-amber-500/10 text-amber-100",
          )}
        >
          <div className="font-medium">
            Source: <span className="text-foreground">{diagnostics.sourceUsed || "—"}</span>
            {teamCount > 0 && (
              <span className="ml-3 text-muted-foreground">
                {teamCount} teams · {picks.length} picks
              </span>
            )}
          </div>
          {diagnostics.warnings.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-amber-300">
              {diagnostics.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
            </ul>
          )}
        </div>
      )}

      {draftQ.isError && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {draftQ.error.message}
        </div>
      )}

      {!draftQ.isLoading && picks.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No draft picks for {season}. Use "Import from ESPN" to fetch mDraftDetail data.
        </p>
      )}

      {/* Rounds table */}
      {byRound.map(({ round, picks: roundPicks }) => (
        <Card key={round}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Round {round}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Pick</th>
                    <th className="pb-2 pr-4 font-medium">Overall</th>
                    <th className="pb-2 pr-4 font-medium">Player</th>
                    <th className="pb-2 pr-4 font-medium">Pos</th>
                    <th className="pb-2 pr-4 font-medium">NFL Team</th>
                    <th className="pb-2 pr-4 font-medium">Fantasy Team</th>
                    <th className="pb-2 font-medium">K</th>
                  </tr>
                </thead>
                <tbody>
                  {roundPicks.map((p) => (
                    <tr key={p.overallPick} className="border-t border-border/30">
                      <td className="py-1.5 pr-4 font-mono text-muted-foreground">
                        {p.roundPick > 0 ? p.roundPick : "—"}
                      </td>
                      <td className="py-1.5 pr-4 font-mono text-muted-foreground">{p.overallPick}</td>
                      <td className="py-1.5 pr-4 font-medium text-foreground">{p.playerName}</td>
                      <td className="py-1.5 pr-4">
                        <PosBadge pos={p.position} />
                      </td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{p.nflTeam || "—"}</td>
                      <td className="py-1.5 pr-4 text-xs text-foreground/80">{p.teamName}</td>
                      <td className="py-1.5 text-xs">
                        {p.isKeeper && <span className="text-amber-400">K</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Diagnostics */}
      <Card>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
          onClick={() => setShowDiagnostics((v) => !v)}
        >
          {showDiagnostics ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Diagnostics
        </button>
        {showDiagnostics && diagnostics && (
          <CardContent className="border-t border-border/40 pt-0">
            <pre className="max-h-80 overflow-auto rounded bg-muted/20 p-3 font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
