import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { RivalryDossierPanel } from "@/components/RivalryDossierPanel";

type VsRec = { wins: number; losses: number; ties: number; gamesPlayed?: number };
type MatrixRow = { owner: string; vs: Record<string, VsRec> };

type H2hDiagnostics = {
  rawMatchupRows?: number;
  uniqueMatchups?: number;
  duplicateMatchups?: number;
  unresolvedTeamMappings?: number;
  ownerResolutionFailures?: number;
  skippedUnresolvedOwners?: number;
  ownersWithZeroH2H?: string[];
  unresolvedTeamSamples?: { season: number; teamId: number }[];
  coverageWarning?: boolean;
};

type Props = {
  h2hOwners: string[];
  h2hMatrix: MatrixRow[];
  rivalOwner: string;
  setRivalOwner: (o: string) => void;
  isLoading: boolean;
  diagnostics?: H2hDiagnostics | null;
  dossierPickerOptions: Array<{ ownerKey: string; label: string }>;
};

function gamesPlayed(rec: VsRec): number {
  if (typeof rec.gamesPlayed === "number" && rec.gamesPlayed > 0) return rec.gamesPlayed;
  return rec.wins + rec.losses + rec.ties;
}

export function RivalriesTab({
  h2hOwners,
  h2hMatrix,
  rivalOwner,
  setRivalOwner,
  isLoading,
  diagnostics,
  dossierPickerOptions,
}: Props) {
  const activeRival = rivalOwner || h2hOwners[0] || "";
  const rivalRow = h2hMatrix.find((r) => r.owner === activeRival);

  const rivalCards = rivalRow
    ? Object.entries(rivalRow.vs)
        .map(([rival, rec]) => ({ rival, rec, gp: gamesPlayed(rec) }))
        .filter((x) => x.gp > 0)
        .sort((a, b) => b.gp - a.gp)
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading rivalries…
      </div>
    );
  }

  if (h2hOwners.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
        No H2H data yet. Sync matchup data on the Sync Data page.
      </div>
    );
  }

  const zeroOwners = diagnostics?.ownersWithZeroH2H ?? [];
  const activeHasNoResolved = Boolean(rivalRow && rivalCards.length === 0);

  return (
    <div className="space-y-4">
      {dossierPickerOptions.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-card/30 p-4">
          <RivalryDossierPanel
            focalOwnerKey={dossierPickerOptions[0]!.ownerKey}
            pickerOptions={dossierPickerOptions}
          />
        </div>
      )}

      {diagnostics && (
        <details className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 font-mono text-[11px] text-muted-foreground">
          <summary className="cursor-pointer select-none text-foreground/70">H2H resolution diagnostics</summary>
          <div className="mt-2 space-y-1">
            <div>
              rows: {diagnostics.rawMatchupRows ?? "—"} · unique: {diagnostics.uniqueMatchups ?? "—"} · dups:{" "}
              {diagnostics.duplicateMatchups ?? "—"} · unresolved-team: {diagnostics.unresolvedTeamMappings ?? "—"} ·
              owner-failures: {diagnostics.ownerResolutionFailures ?? "—"} · skipped-unresolved:{" "}
              {diagnostics.skippedUnresolvedOwners ?? "—"}
            </div>
            {zeroOwners.length > 0 && (
              <div className="text-amber-400/90">
                Owners with zero counted H2H games (check team→owner mapping): {zeroOwners.join(", ")}
              </div>
            )}
            {(diagnostics.unresolvedTeamSamples?.length ?? 0) > 0 && (
              <div>
                Sample unresolved team slots:{" "}
                {diagnostics.unresolvedTeamSamples!.slice(0, 12).map((s) => `${s.season}:${s.teamId}`).join(", ")}
                {(diagnostics.unresolvedTeamSamples!.length ?? 0) > 12 ? " …" : ""}
              </div>
            )}
          </div>
        </details>
      )}

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Select owner to view their rivalries:</div>
        <div className="flex flex-wrap gap-1.5">
          {h2hOwners.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setRivalOwner(o)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                activeRival === o
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {activeHasNoResolved && (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No resolved matchup history for this owner.
        </div>
      )}

      {rivalRow && rivalCards.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground">{activeRival} — all-time head-to-head</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rivalCards.map(({ rival, rec }) => {
              const total = gamesPlayed(rec);
              const winning = rec.wins > rec.losses;
              const losing = rec.losses > rec.wins;
              const winFrac = total > 0 ? (rec.wins / total) * 100 : 0;

              return (
                <Card key={rival}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">vs</div>
                        <div className="font-semibold text-foreground">{rival}</div>
                      </div>
                      <div
                        className={cn(
                          "text-2xl font-bold tabular-nums",
                          winning && "text-emerald-400",
                          losing && "text-red-400",
                          !winning && !losing && "text-muted-foreground",
                        )}
                      >
                        {rec.wins}–{rec.losses}
                        {rec.ties > 0 && <span className="text-base">–{rec.ties}</span>}
                      </div>
                    </div>

                    {total > 0 && (
                      <div className="space-y-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              winning ? "bg-emerald-400" : losing ? "bg-red-400" : "bg-muted-foreground",
                            )}
                            style={{ width: `${winFrac}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>{winFrac.toFixed(0)}% win rate</span>
                          <span>
                            {total} game{total !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
