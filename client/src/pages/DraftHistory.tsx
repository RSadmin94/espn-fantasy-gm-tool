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
import { AlertCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

type CanonicalPick = {
  pickInRound: number;
  overallPick: number;
  teamId: number;
  playerName: string;
  position: string | null;
  nflTeam: string;
  fantasyTeamName: string;
  ownerName: string;
  source: string;
  confidence: string;
  isKeeper: boolean;
};

type CanonicalRound = {
  round: number;
  picks: CanonicalPick[];
};

function PosBadge({ pos }: { pos: string | null | undefined }) {
  const p = (pos || "?").toUpperCase();
  const colors: Record<string, string> = {
    QB: "border-red-500/30 bg-red-500/10 text-red-300",
    RB: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    WR: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    TE: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    K: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    DST: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    "D/ST": "border-slate-500/30 bg-slate-500/10 text-slate-300",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
        colors[p] ?? "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {p}
    </span>
  );
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

  const [season, setSeason] = useState(defaultSeason);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const draftQ = trpc.espn.draftHistory.useQuery({ season }, { staleTime: 0 });
  const reconcileMut = trpc.espn.reconcileDraftOrderFromScrapes.useMutation();
  const importEspnMut = trpc.espn.importDraftFromEspnApi.useMutation();
  const utils = trpc.useUtils();

  const board = draftQ.data;
  const teamCount = board?.teamCount ?? 0;
  const rounds = (board?.rounds ?? []) as CanonicalRound[];
  const diagnostics = board?.diagnostics;
  const sourceUsed = board?.sourceUsed ?? "";
  const sourcePriority = board?.sourcePriority ?? "";
  const hasScrape = (diagnostics?.scrapeRowCount ?? 0) > 0;
  const has2025Scrape = season === 2025 && hasScrape;

  const flatPicks = useMemo(
    () =>
      rounds.flatMap((r) =>
        r.picks.map((p) => ({ ...p, round: r.round })),
      ),
    [rounds],
  );

  const maxRound = rounds.length > 0 ? Math.max(...rounds.map((r) => r.round)) : 0;
  const boardCols = teamCount > 0 ? teamCount : 14;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Draft History</h1>
        <p className="mt-1 text-muted-foreground">
          Canonical board — chronological pick order per round (ESPN Draft Recap when scraped).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="w-28">
            <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
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
        </CardContent>
      </Card>

      {/* Source banner */}
      <div
        className={cn(
          "rounded-lg border px-4 py-3 text-sm",
          hasScrape
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
            : "border-amber-500/40 bg-amber-500/10 text-amber-100",
        )}
      >
        <div className="font-medium">
          Source: <span className="text-foreground">{sourceUsed || "—"}</span>
          {teamCount > 0 && (
            <span className="ml-3 text-muted-foreground">
              {teamCount} teams · {flatPicks.length} picks · {maxRound} rounds
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sourcePriority}</div>
        {(diagnostics?.warnings?.length ?? 0) > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs">
            {diagnostics!.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {season === 2025 && (
            <button
              type="button"
              disabled={reconcileMut.isPending}
              onClick={async () => {
                await reconcileMut.mutateAsync({ season: 2025 });
                await draftQ.refetch();
                void utils.espn.draftHistory.invalidate({ season: 2025 });
              }}
              className="rounded border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {reconcileMut.isPending ? "Applying…" : "Use Draft Recap Order (2025)"}
            </button>
          )}
          {season === 2025 && (
            <button
              type="button"
              title={
                has2025Scrape
                  ? "Blocked while draft_recap_html rows exist"
                  : "Fallback only — API may not match visual recap"
              }
              disabled={importEspnMut.isPending || has2025Scrape}
              onClick={async () => {
                if (has2025Scrape) {
                  window.alert("2025 scrape rows exist — API import disabled.");
                  return;
                }
                if (!window.confirm("Import 2025 from mDraftDetail API?")) return;
                await importEspnMut.mutateAsync({ season: 2025 });
                await draftQ.refetch();
              }}
              className={cn(
                "rounded border px-2.5 py-1 text-xs disabled:opacity-50",
                has2025Scrape
                  ? "border-border/50 text-muted-foreground"
                  : "border-blue-500/50 text-blue-200",
              )}
            >
              Import 2025 from API (non-canonical)
            </button>
          )}
        </div>
      </div>

      {draftQ.isError && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {draftQ.error.message}
        </div>
      )}

      {!draftQ.isLoading && flatPicks.length === 0 && (
        <p className="text-sm text-muted-foreground">No draft picks for {season}. Sync draft data from the extension.</p>
      )}

      {/* Board grid — columns = Pick 1..N chronological */}
      {flatPicks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Draft board</CardTitle>
            <p className="text-xs font-normal text-muted-foreground">
              Columns are pick order within each round (not snake slots).
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-medium text-muted-foreground">
                    Rd
                  </th>
                  {Array.from({ length: boardCols }, (_, i) => (
                    <th key={i} className="px-1 py-1 text-center font-medium text-muted-foreground">
                      Pick {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rounds.map((rd) => (
                  <tr key={rd.round} className="border-t border-border/40">
                    <td className="sticky left-0 z-10 bg-card px-2 py-2 font-semibold text-foreground">
                      {rd.round}
                    </td>
                    {Array.from({ length: boardCols }, (_, colIdx) => {
                      const pickNum = colIdx + 1;
                      const cell = rd.picks.find((p) => p.pickInRound === pickNum);
                      if (!cell) {
                        return (
                          <td key={colIdx} className="px-1 py-1 align-top text-muted-foreground/30">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={colIdx} className="px-1 py-1 align-top">
                          <div className="rounded border border-border/50 bg-muted/20 p-1.5">
                            <div className="font-medium text-foreground leading-tight">
                              {cell.playerName}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              <PosBadge pos={cell.position} />
                              {cell.isKeeper && (
                                <span className="text-[9px] text-amber-400">K</span>
                              )}
                            </div>
                            <div
                              className={cn(
                                "mt-0.5 truncate text-[10px]",
                                cell.confidence === "unresolved"
                                  ? "text-red-400"
                                  : "text-muted-foreground",
                              )}
                              title={cell.fantasyTeamName}
                            >
                              {cell.fantasyTeamName}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Round cards */}
      {rounds.map((rd) => (
        <Card key={rd.round}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Round {rd.round}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3">#</th>
                    <th className="pb-2 pr-3">Overall</th>
                    <th className="pb-2 pr-3">Player</th>
                    <th className="pb-2 pr-3">Pos</th>
                    <th className="pb-2 pr-3">Fantasy team</th>
                    <th className="pb-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rd.picks.map((p) => (
                    <tr key={p.overallPick} className="border-t border-border/30">
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{p.pickInRound}</td>
                      <td className="py-2 pr-3 font-mono">{p.overallPick}</td>
                      <td className="py-2 pr-3 font-medium">{p.playerName}</td>
                      <td className="py-2 pr-3">
                        <PosBadge pos={p.position} />
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-3",
                          p.confidence === "unresolved" && "text-red-400",
                        )}
                      >
                        {p.fantasyTeamName}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{p.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Collapsible diagnostics */}
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
          Raw diagnostics
        </button>
        {showDiagnostics && diagnostics && (
          <CardContent className="border-t border-border/40 pt-0">
            <pre className="max-h-96 overflow-auto rounded bg-muted/20 p-3 font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
