import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "D/ST"] as const;

const STYLE_COLORS: Record<string, string> = {
  "RB Heavy":                  "text-orange-400 border-orange-500/30 bg-orange-500/10",
  "WR Heavy":                  "text-sky-400 border-sky-500/30 bg-sky-500/10",
  "QB Early":                  "text-violet-400 border-violet-500/30 bg-violet-500/10",
  "Keeper Dependent":          "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  "Balanced":                  "text-foreground border-border/40 bg-muted/20",
  "Unknown / Insufficient Data": "text-muted-foreground border-border/20 bg-muted/10",
};

const POS_COLORS: Record<string, string> = {
  QB: "bg-violet-500/20 text-violet-300",
  RB: "bg-orange-500/20 text-orange-300",
  WR: "bg-sky-500/20 text-sky-300",
  TE: "bg-emerald-500/20 text-emerald-300",
  K:  "bg-zinc-500/20 text-zinc-300",
  "D/ST": "bg-rose-500/20 text-rose-300",
  Other: "bg-muted/30 text-muted-foreground",
};

function PosBadge({ pos }: { pos: string }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", POS_COLORS[pos] ?? POS_COLORS.Other)}>
      {pos}
    </span>
  );
}

function PositionBar({ counts, total }: { counts: Record<string, number>; total: number }) {
  if (total === 0) return null;
  const ordered = POSITIONS.filter((p) => (counts[p] ?? 0) > 0);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full">
      {ordered.map((pos) => {
        const pct = ((counts[pos] ?? 0) / total) * 100;
        return (
          <div
            key={pos}
            style={{ width: `${pct}%` }}
            title={`${pos}: ${(counts[pos] ?? 0)} (${pct.toFixed(1)}%)`}
            className={cn(POS_COLORS[pos] ?? "", "transition-all")}
          />
        );
      })}
    </div>
  );
}

type Profile = {
  ownerKey: string;
  ownerName: string;
  seasons: number[];
  totalPicks: number;
  picksPerSeason: number;
  positionCounts: Record<string, number>;
  positionPercentages: Record<string, number>;
  firstRoundPickCount: number;
  mostCommonFirstRoundPos: string | null;
  firstRoundBySeason: Record<number, { playerName: string | null; position: string; roundPick: number }[]>;
  keeperCount: number;
  keeperRate: number;
  keeperSeasons: number[];
  draftStyleLabel: string;
};

function OwnerProfileCard({ profile }: { profile: Profile }) {
  const [expanded, setExpanded] = useState(false);
  const styleClass = STYLE_COLORS[profile.draftStyleLabel] ?? STYLE_COLORS["Balanced"];

  const firstRoundSeasons = Object.keys(profile.firstRoundBySeason)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="rounded-lg border border-border/60 bg-card/50">
      {/* Header row */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{profile.ownerName}</span>
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", styleClass)}>
              {profile.draftStyleLabel}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{profile.seasons.length} season{profile.seasons.length !== 1 ? "s" : ""}</span>
            <span>{profile.totalPicks} picks</span>
            <span>{profile.picksPerSeason}/season avg</span>
            {profile.keeperCount > 0 && (
              <span className="text-emerald-400">{profile.keeperCount} keeper{profile.keeperCount !== 1 ? "s" : ""} ({profile.keeperRate.toFixed(1)}%)</span>
            )}
          </div>
        </div>

        {/* Position bar mini preview */}
        <div className="hidden w-32 sm:block">
          <PositionBar counts={profile.positionCounts} total={profile.totalPicks} />
        </div>

        <div className="ml-2 shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-4">

          {/* Position breakdown */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Position Mix</div>
            <PositionBar counts={profile.positionCounts} total={profile.totalPicks} />
            <div className="flex flex-wrap gap-2 pt-1">
              {POSITIONS.filter((p) => (profile.positionCounts[p] ?? 0) > 0).map((pos) => (
                <div key={pos} className="flex items-center gap-1">
                  <PosBadge pos={pos} />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {profile.positionCounts[pos]} ({(profile.positionPercentages[pos] ?? 0).toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* First round picks */}
          {firstRoundSeasons.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                First Round Picks ({profile.firstRoundPickCount})
                {profile.mostCommonFirstRoundPos && (
                  <span className="ml-2 normal-case font-normal">
                    — most common: <PosBadge pos={profile.mostCommonFirstRoundPos} />
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/30 text-left text-muted-foreground">
                      <th className="py-1 pr-3">Season</th>
                      <th className="py-1 pr-3">Pick</th>
                      <th className="py-1 pr-3">Pos</th>
                      <th className="py-1">Player</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstRoundSeasons.flatMap((s) =>
                      (profile.firstRoundBySeason[s] ?? []).map((pick, i) => (
                        <tr key={`${s}-${i}`} className="border-b border-border/20">
                          <td className="py-0.5 pr-3 text-muted-foreground">{i === 0 ? s : ""}</td>
                          <td className="py-0.5 pr-3 tabular-nums">#{pick.roundPick}</td>
                          <td className="py-0.5 pr-3"><PosBadge pos={pick.position} /></td>
                          <td className="py-0.5 text-foreground/80">{pick.playerName ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Keeper seasons */}
          {profile.keeperCount > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keeper Seasons</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.keeperSeasons.map((s) => (
                  <span key={s} className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] tabular-nums text-emerald-400">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Draft seasons coverage */}
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seasons With Draft Data</div>
            <div className="flex flex-wrap gap-1">
              {profile.seasons.map((s) => (
                <span key={s} className="rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export function OwnerProfilesTab() {
  const q = trpc.espn.ownerDraftProfiles.useQuery(undefined, { staleTime: 60_000 });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading draft profiles…
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {q.error.message}
      </div>
    );
  }

  const profiles = q.data?.profiles ?? [];
  const diag = q.data?.diagnostics;

  if (profiles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
        <p>No draft pick data found in the database.</p>
        <p className="mt-2">Sync draft history on the Sync Data page first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Coverage diagnostics */}
      {diag && (
        <div className={cn(
          "rounded-md border px-4 py-2 font-mono text-xs text-muted-foreground space-y-0.5",
          diag.coverageWarning ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 bg-muted/10",
        )}>
          <div>
            <span className="font-semibold text-foreground/60">draft-coverage</span>
            {" · "}rows: <span className="text-foreground">{diag.totalRows}</span>
            {" · "}owners: <span className="text-foreground">{profiles.length}</span>
            {" · "}seasons-with-data: <span className="text-emerald-400">{diag.seasonsWithPicks.join(", ") || "none"}</span>
            {diag.unresolvedPicks > 0 && (
              <>{" · "}unresolved: <span className="text-amber-400">{diag.unresolvedPicks}</span></>
            )}
          </div>
          {diag.coverageWarning && (
            <div className="text-amber-300">
              ⚠ Missing draft data for: {diag.seasonsMissingPicks.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Profile cards */}
      <div className="space-y-3">
        {(profiles as Profile[]).map((p) => (
          <OwnerProfileCard key={p.ownerKey} profile={p} />
        ))}
      </div>

    </div>
  );
}
