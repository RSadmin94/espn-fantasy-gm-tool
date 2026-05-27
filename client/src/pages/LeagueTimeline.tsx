import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  if (n === 11 || n === 12 || n === 13) return `${n}th`;
  const s = ["th", "st", "nd", "rd"];
  return `${n}${s[n % 10] ?? "th"}`;
}

function winPct(w: number, l: number, t: number): string {
  const g = w + l + t;
  return g === 0 ? "—" : ((w / g) * 100).toFixed(1) + "%";
}

function chipStyle(place: number | null | undefined): string {
  if (!place) return "bg-muted/30 text-muted-foreground/40 border-transparent";
  if (place === 1) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40 font-bold";
  if (place === 2) return "bg-slate-400/15 text-slate-300 border-slate-400/30";
  if (place === 3) return "bg-amber-700/15 text-amber-500 border-amber-600/30";
  if (place <= 6)  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  return "bg-muted/20 text-muted-foreground/50 border-transparent";
}

// Mirrors server normalizeOwnerStr — used to match medal names to ownerKeys.
function normalizeOwnerForMatch(raw: string): string {
  if (!raw) return "";
  return raw.trim().replace(/^\(+|\)+$/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

// ── component ─────────────────────────────────────────────────────────────────

type Tab = "dynasty" | "seasons" | "rivalries";
type SortKey = "titles" | "wins" | "winpct";

export function LeagueTimeline() {
  const [tab, setTab]                       = useState<Tab>("dynasty");
  const [sortBy, setSortBy]                 = useState<SortKey>("titles");
  const [expandedOwner, setExpandedOwner]   = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [rivalOwner, setRivalOwner]         = useState<string>("");

  const standingsQ = trpc.espn.leagueHistoryStandings.useQuery(undefined, { staleTime: 60_000 });
  const medalsQ    = trpc.espn.leagueMedals.useQuery(undefined, { staleTime: 60_000 });
  const h2hQ = trpc.espn.leagueHistoryH2H.useQuery(undefined, {
    staleTime: 60_000,
    enabled: tab === "rivalries",
  });
  const diagQ = trpc.espn.leagueDiagnostics.useQuery(undefined, { staleTime: 60_000 });

  const allSeasons = standingsQ.data?.seasons ?? [];
  const rawOwners  = standingsQ.data?.owners  ?? [];
  const medals     = medalsQ.data ?? [];

  // ── Medal title counts: normalizedName → count ────────────────────────────
  // Medal championOwner names are matched against owner displayName and ownerKey.
  const medalTitleCounts = new Map<string, number>();
  for (const m of medals) {
    if (!m.championOwner) continue;
    const k = normalizeOwnerForMatch(m.championOwner);
    medalTitleCounts.set(k, (medalTitleCounts.get(k) ?? 0) + 1);
  }
  const getMedalTitles = (owner: { ownerKey: string; displayName: string }) =>
    medalTitleCounts.get(owner.ownerKey) ??
    medalTitleCounts.get(normalizeOwnerForMatch(owner.displayName)) ??
    0;

  // ── Dynasty Board sort (client-side display sort only) ────────────────────
  const owners = [...rawOwners].sort((a, b) => {
    const wA = a.seasons.reduce((s, r) => s + r.entry.wins,   0);
    const lA = a.seasons.reduce((s, r) => s + r.entry.losses, 0);
    const tA = a.seasons.reduce((s, r) => s + r.entry.ties,   0);
    const wB = b.seasons.reduce((s, r) => s + r.entry.wins,   0);
    const lB = b.seasons.reduce((s, r) => s + r.entry.losses, 0);
    const tB = b.seasons.reduce((s, r) => s + r.entry.ties,   0);
    const titlesA = getMedalTitles(a);
    const titlesB = getMedalTitles(b);
    if (sortBy === "titles") {
      if (titlesB !== titlesA) return titlesB - titlesA;
      return wB - wA;
    }
    if (sortBy === "wins")   return wB - wA;
    const pA = (wA + lA + tA) === 0 ? 0 : wA / (wA + lA + tA);
    const pB = (wB + lB + tB) === 0 ? 0 : wB / (wB + lB + tB);
    return pB - pA;
  });

  // ── Season Explorer ───────────────────────────────────────────────────────
  const activeSeason = selectedSeason ?? allSeasons[allSeasons.length - 1] ?? null;
  const seasonRows = activeSeason
    ? rawOwners
        .flatMap((o) => {
          const s = o.seasons.find((r) => r.season === activeSeason);
          return s ? [{ owner: o.displayName, ...s.entry }] : [];
        })
        .sort((a, b) => (a.finalStanding ?? 99) - (b.finalStanding ?? 99))
    : [];
  const topScorer = seasonRows.length
    ? [...seasonRows].sort((a, b) => b.pointsFor - a.pointsFor)[0]!
    : null;

  // ── Rivalries ─────────────────────────────────────────────────────────────
  const h2hOwners = h2hQ.data?.owners ?? [];
  const h2hMatrix = h2hQ.data?.matrix ?? [];
  const activeRival = rivalOwner || h2hOwners[0] || "";
  const rivalRow    = h2hMatrix.find((r) => r.owner === activeRival);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-12">

      {/* ── Page header ── */}
      <div className="space-y-0.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
          LEAGUE TIMELINE V1 ACTIVE
        </div>
        <h1 className="text-3xl font-bold text-foreground">League Timeline</h1>
        <p className="text-sm text-muted-foreground">History · Dynasties · Rivalries</p>
      </div>

      {/* ── Diagnostics bar ── */}
      {(() => {
        const d = diagQ.data;
        const medalSeasons = medals.length;
        const allSeasonCount = allSeasons.length;
        const missingMedals = allSeasonCount > 0 ? allSeasonCount - medalSeasons : 0;
        const dupStandingSeasons = (d?.standings ?? []).filter((s) => s.duplicateFinalStandingRanks.length > 0 || s.duplicateOwnerRows > 0).length;
        const missingRankSeasons = (d?.standings ?? []).filter((s) => s.missingFinalStandingRanks.length > 0).length;
        const dupMatchupSeasons = (d?.matchups ?? []).filter((m) => m.duplicateMatchups > 0).length;
        const mismatchSeasons = (d?.matchups ?? []).filter((m) => m.winnerScoreMismatches > 0).length;
        const missingScoreSeasons = (d?.matchups ?? []).filter((m) => m.missingScores > 0).length;
        const anyIssue = missingMedals + dupStandingSeasons + missingRankSeasons + dupMatchupSeasons + mismatchSeasons + missingScoreSeasons > 0;
        return (
          <div className={cn(
            "rounded-md border px-4 py-2 font-mono text-xs text-muted-foreground",
            anyIssue ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/10",
          )}>
            <span className="text-foreground/60 font-semibold">diag</span>
            {" · "}seasons: <span className="text-foreground">{allSeasonCount}</span>
            {" · "}medals: <span className={cn(missingMedals > 0 ? "text-red-400 font-bold" : "text-emerald-400")}>
              {medalSeasons}/{allSeasonCount}{missingMedals > 0 ? ` (${missingMedals} missing)` : " ok"}
            </span>
            {" · "}standings: <span className={cn(dupStandingSeasons + missingRankSeasons > 0 ? "text-amber-400" : d ? "text-emerald-400" : "text-muted-foreground")}>
              {dupStandingSeasons > 0 ? `${dupStandingSeasons} dup-ranks` : missingRankSeasons > 0 ? `${missingRankSeasons} missing-ranks` : d ? "ok" : "…"}
            </span>
            {" · "}matchups: <span className={cn(dupMatchupSeasons + mismatchSeasons > 0 ? "text-red-400 font-bold" : missingScoreSeasons > 0 ? "text-amber-400" : d ? "text-emerald-400" : "text-muted-foreground")}>
              {dupMatchupSeasons > 0 ? `${dupMatchupSeasons} dups` : mismatchSeasons > 0 ? `${mismatchSeasons} mismatches` : missingScoreSeasons > 0 ? `${missingScoreSeasons} missing-scores` : d ? "ok" : "…"}
            </span>
          </div>
        );
      })()}

      {/* ── Tab bar ── */}
      <ToggleGroup
        type="single"
        value={tab}
        onValueChange={(v) => { if (v) setTab(v as Tab); }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="dynasty">Dynasty Board</ToggleGroupItem>
        <ToggleGroupItem value="seasons">Season Explorer</ToggleGroupItem>
        <ToggleGroupItem value="rivalries">Rivalries</ToggleGroupItem>
      </ToggleGroup>

      {standingsQ.isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1 — Dynasty Board
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "dynasty" && !standingsQ.isLoading && (
        <div className="space-y-4">

          {/* Sort bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Sort by:</span>
            {(["titles", "wins", "winpct"] as SortKey[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs border transition-colors",
                  sortBy === s
                    ? "border-primary/60 text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80",
                )}
              >
                {s === "titles" ? "Titles" : s === "wins" ? "Wins" : "Win %"}
              </button>
            ))}
          </div>

          {owners.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
              No standings data yet. Sync seasons on the Sync Data page.
            </div>
          )}

          {/* Owner cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {owners.map((owner) => {
              const totalW = owner.seasons.reduce((s, r) => s + r.entry.wins,   0);
              const totalL = owner.seasons.reduce((s, r) => s + r.entry.losses, 0);
              const totalT = owner.seasons.reduce((s, r) => s + r.entry.ties,   0);
              const best   = owner.seasons.reduce((b, r) => Math.min(b, r.entry.finalStanding ?? 99), 99);
              const isOpen = expandedOwner === owner.ownerKey;
              const titles = getMedalTitles(owner);

              return (
                <Card key={owner.ownerKey} className={cn("transition-all", isOpen && "ring-1 ring-primary/25")}>
                  <CardContent className="p-4 space-y-3">

                    {/* Name + title badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-foreground leading-tight">{owner.displayName}</div>
                      {titles > 0 && (
                        <div className="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-yellow-300 text-xs font-bold">
                          🏆&nbsp;{titles}
                        </div>
                      )}
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">📈 Seasons</span>
                      <span className="text-right tabular-nums">{owner.seasons.length}</span>

                      <span className="text-muted-foreground">🔥 Best Finish</span>
                      <span className={cn(
                        "text-right tabular-nums font-medium",
                        best === 1 && "text-yellow-300",
                        best === 2 && "text-slate-300",
                        best === 3 && "text-amber-500",
                      )}>
                        {best < 99 ? ordinal(best) : "—"}
                      </span>

                      <span className="text-muted-foreground">📊 Record</span>
                      <span className="text-right tabular-nums">
                        {totalW}–{totalL}{totalT > 0 ? `–${totalT}` : ""}
                      </span>

                      <span className="text-muted-foreground">💯 Win %</span>
                      <span className="text-right tabular-nums">{winPct(totalW, totalL, totalT)}</span>
                    </div>

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedOwner(isOpen ? null : owner.ownerKey)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isOpen
                        ? <><ChevronUp className="h-3 w-3" /> Hide seasons</>
                        : <><ChevronDown className="h-3 w-3" /> Show seasons</>}
                    </button>

                    {/* Season chips */}
                    {isOpen && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {owner.seasons.map(({ season, entry }) => (
                          <button
                            key={season}
                            title={`${season}: ${entry.wins}–${entry.losses}, Place ${entry.finalStanding ?? "?"}`}
                            onClick={() => { setSelectedSeason(season); setTab("seasons"); }}
                            className={cn(
                              "rounded border px-2 py-0.5 text-[11px] tabular-nums transition-opacity hover:opacity-80",
                              chipStyle(entry.finalStanding),
                            )}
                          >
                            {season}
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2 — Season Explorer
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "seasons" && !standingsQ.isLoading && (
        <div className="space-y-4">

          {/* Horizontal season strip */}
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-1.5 min-w-max">
              {allSeasons.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSeason(s)}
                  className={cn(
                    "rounded px-3 py-1.5 text-sm font-medium border transition-colors whitespace-nowrap",
                    activeSeason === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {activeSeason && seasonRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
              No standings data for {activeSeason}.
            </div>
          )}

          {activeSeason && seasonRows.length > 0 && (
            <Card>
              <CardContent className="p-5 space-y-5">

                {/* Season heading */}
                <div className="text-xl font-bold text-foreground">{activeSeason} Season</div>

                {/* Champion + runner-up */}
                <div className="flex gap-3">
                  {seasonRows[0] && (
                    <div className="flex-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-widest font-semibold text-yellow-400 mb-1">Champion</div>
                      <div className="font-bold text-yellow-300">{seasonRows[0].owner}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {seasonRows[0].wins}–{seasonRows[0].losses} · {seasonRows[0].pointsFor.toFixed(1)} pts
                      </div>
                    </div>
                  )}
                  {seasonRows[1] && (
                    <div className="flex-1 rounded-lg bg-slate-400/10 border border-slate-400/15 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-1">Runner-Up</div>
                      <div className="font-semibold text-slate-300">{seasonRows[1].owner}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {seasonRows[1].wins}–{seasonRows[1].losses} · {seasonRows[1].pointsFor.toFixed(1)} pts
                      </div>
                    </div>
                  )}
                  {topScorer && topScorer.owner !== seasonRows[0]?.owner && (
                    <div className="flex-1 rounded-lg bg-blue-500/10 border border-blue-500/15 p-3 text-center">
                      <div className="text-[10px] uppercase tracking-widest font-semibold text-blue-400 mb-1">Top Scorer</div>
                      <div className="font-semibold text-blue-300">{topScorer.owner}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {topScorer.pointsFor.toFixed(1)} pts
                      </div>
                    </div>
                  )}
                </div>

                {/* Full standings list */}
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                    Final Standings
                  </div>
                  <div className="space-y-1">
                    {seasonRows.map((row, idx) => (
                      <div
                        key={row.owner}
                        className={cn(
                          "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                          idx === 0 && "bg-yellow-500/8",
                          idx === 1 && "bg-slate-400/6",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "w-5 text-center text-xs font-semibold tabular-nums",
                            idx === 0 && "text-yellow-400",
                            idx === 1 && "text-slate-400",
                            idx === 2 && "text-amber-500",
                            idx >= 3 && "text-muted-foreground",
                          )}>
                            {row.finalStanding ?? idx + 1}
                          </span>
                          <span className="text-foreground">{row.owner}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                          <span>{row.wins}–{row.losses}</span>
                          <span>{row.pointsFor.toFixed(1)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 3 — Rivalries
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "rivalries" && (
        <div className="space-y-4">

          {h2hQ.isLoading && (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading rivalries…
            </div>
          )}

          {!h2hQ.isLoading && h2hOwners.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
              No H2H data yet. Sync matchup data on the Sync Data page.
            </div>
          )}

          {!h2hQ.isLoading && h2hOwners.length > 0 && (
            <>
              {/* Owner pill selector */}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Select owner to view their rivalries:</div>
                <div className="flex flex-wrap gap-1.5">
                  {h2hOwners.map((o) => (
                    <button
                      key={o}
                      onClick={() => setRivalOwner(o)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs border transition-colors",
                        activeRival === o
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
                      )}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rivalry cards */}
              {rivalRow && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">
                    {activeRival} — all-time head-to-head
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(rivalRow.vs)
                      .sort(([, a], [, b]) => (b.wins + b.losses + b.ties) - (a.wins + a.losses + a.ties))
                      .map(([rival, rec]) => {
                        const total   = rec.wins + rec.losses + rec.ties;
                        const winning = rec.wins > rec.losses;
                        const losing  = rec.losses > rec.wins;
                        const winFrac = total > 0 ? (rec.wins / total) * 100 : 0;

                        return (
                          <Card key={rival}>
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">vs</div>
                                  <div className="font-semibold text-foreground">{rival}</div>
                                </div>
                                <div className={cn(
                                  "text-2xl font-bold tabular-nums",
                                  winning && "text-emerald-400",
                                  losing  && "text-red-400",
                                  !winning && !losing && "text-muted-foreground",
                                )}>
                                  {rec.wins}–{rec.losses}
                                  {rec.ties > 0 && <span className="text-base">–{rec.ties}</span>}
                                </div>
                              </div>

                              {/* Win rate bar */}
                              {total > 0 && (
                                <div className="space-y-1">
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
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
                                    <span>{total} game{total !== 1 ? "s" : ""}</span>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
