import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium", highlight ? "text-lime-400" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export function LeagueSettings() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const season = new Date().getFullYear();

  const scoringQ  = trpc.leagueScoring.getSettings.useQuery(
    { season },
    { enabled: leagueKeyReady },
  );
  const settingsQ = trpc.espn.settings.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    { enabled: leagueKeyReady },
  );

  const loading = !leagueKeyReady || scoringQ.isLoading || settingsQ.isLoading;
  const s = leagueKeyReady ? scoringQ.data : undefined;
  const meta = leagueKeyReady ? settingsQ.data : undefined;

  function scoringSourceDescription(): string {
    if (!s) return "";
    const src = (s as { scoringDataSource?: string }).scoringDataSource;
    const tier = (s as { scoringStorageTier?: string | null }).scoringStorageTier;
    const cacheSeas = (s as { scoringCacheSeason?: number | null }).scoringCacheSeason;
    const parts: string[] = [];
    if (src === "espn_combined_cache") parts.push("ESPN combined cache (same season)");
    else if (src === "espn_combined_cache_prior_season") parts.push("ESPN combined cache (prior season fallback)");
    else if (src === "fallback_defaults") parts.push("Built-in defaults — not your league sync");
    if (tier) parts.push(`tier: ${tier}`);
    if (cacheSeas != null) parts.push(`cache season ${cacheSeas}`);
    return parts.join(" · ");
  }

  const scoringSyncedAt = (s as { scoringSyncedAt?: string | null } | undefined)?.scoringSyncedAt;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading league settings…
      </div>
    );
  }

  if (!s) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <p className="text-lg font-semibold text-foreground">Settings unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run Sync from the dashboard to load scoring settings.
        </p>
      </div>
    );
  }

  // Group breakdown rows by category
  const breakdown = s.breakdown ?? [];
  const categories = [...new Set(breakdown.map((r) => r.category))];

  // Bonus rows — scoring items not in the standard breakdown categories
  const standardStats = new Set(["Reception", "Passing Yards", "Rushing Yards", "Receiving Yards",
    "Passing TD", "Rushing TD", "Receiving TD", "Interception", "Fumble Lost", "Fumble Lost (alt)"]);
  const bonusRows = breakdown.filter((r) => !standardStats.has(r.stat));
  const coreRows  = breakdown.filter((r) =>  standardStats.has(r.stat));

  // Roster slots from meta (JSON blob)
  let rosterSlots: Record<string, number> | null = null;
  if (meta?.rosterPositions && typeof meta.rosterPositions === "object") {
    rosterSlots = meta.rosterPositions as Record<string, number>;
  }

  const SLOT_LABELS: Record<string, string> = {
    "0": "QB", "2": "RB", "4": "WR", "6": "TE", "16": "D/ST",
    "17": "K",  "20": "Bench", "21": "IR", "23": "FLEX (RB/WR/TE)",
    "24": "FLEX (WR/TE)", "25": "FLEX (RB/WR)", "35": "DP",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">League Settings</h1>
        {(s as { scoringDataSource?: string }).scoringDataSource === "fallback_defaults" && (
          <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Scoring rules are showing built-in defaults because no ESPN combined cache row with scoring settings was
            found. Sync the current season on the Sync Data page — values below are not verified league rules until then.
          </div>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {String(meta?.leagueName ?? "").trim() || "League"}{" "}
          · {season} season · scoring: {scoringSourceDescription()}
          {scoringSyncedAt ? (
            <>
              {" "}
              · last scoring sync{" "}
              <span className="tabular-nums">{new Date(scoringSyncedAt).toLocaleString()}</span>
            </>
          ) : s && (s as { scoringDataSource?: string }).scoringDataSource === "fallback_defaults" ? (
            <span> · scoring sync time n/a (defaults)</span>
          ) : null}
        </p>
      </div>

      {/* 1. Scoring Summary */}
      <SectionCard title="Scoring Summary">
        <Row label="Scoring Format"   value={s.scoringDescription ?? s.scoringType} highlight />
        <Row label="Reception Points" value={`${s.receptionPoints} pt per reception`} />
        <Row label="Passing TD"       value={`${s.passingTDPoints} pts`} />
        <Row label="Rushing TD"       value={`${s.rushingTDPoints} pts`} />
        <Row label="Receiving TD"     value={`${s.receivingTDPoints} pts`} />
        <Row label="Interception"     value={`${s.interceptionPoints} pts`} />
        <Row label="Passing Yards"    value={`1 pt / ${s.passingYardsPerPoint} yds`} />
        <Row label="Rushing Yards"    value={`1 pt / ${s.rushingYardsPerPoint} yds`} />
        <Row label="Receiving Yards"  value={`1 pt / ${s.receivingYardsPerPoint} yds`} />
      </SectionCard>

      {/* 1b. Scoring Validation Report */}
      {s && (s as any).scoringValidation && (
        <details className="rounded-lg border border-zinc-700/50 bg-zinc-900/30">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-secondary hover:text-zinc-300">
            Scoring Validation Report (Cache → Displayed)
          </summary>
          <div className="overflow-x-auto px-4 pb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-ink-tertiary">
                  <th className="py-1.5 pr-4">Stat</th>
                  <th className="py-1.5 pr-4">statId</th>
                  <th className="py-1.5 pr-4">Cache Value</th>
                  <th className="py-1.5 pr-4">Displayed</th>
                  <th className="py-1.5">Source</th>
                </tr>
              </thead>
              <tbody>
                {((s as any).scoringValidation as Array<{statId:number;label:string;cached:number|null;displayed:number;status:string}>).map((row) => (
                  <tr key={row.statId} className="border-b border-zinc-800/40">
                    <td className="py-1.5 pr-4 text-zinc-300 font-medium">{row.label}</td>
                    <td className="py-1.5 pr-4 text-ink-secondary font-mono">{row.statId}</td>
                    <td className="py-1.5 pr-4 font-mono text-zinc-300">{row.cached !== null ? row.cached : <span className="text-amber-400">missing</span>}</td>
                    <td className="py-1.5 pr-4 font-mono text-zinc-100 font-bold">{row.displayed}</td>
                    <td className="py-1.5">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", row.status === "live" ? "bg-lime-500/20 text-lime-300" : "bg-amber-500/20 text-amber-300")}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* 2. Core Scoring Rules */}
      {coreRows.length > 0 && (
        <SectionCard title="Core Scoring Rules">
          {coreRows.map((r) => (
            <Row key={r.stat} label={`${r.category} — ${r.stat}`} value={r.points} />
          ))}
        </SectionCard>
      )}

      {/* 3. Bonus Scoring Rules */}
      {bonusRows.length > 0 && (
        <SectionCard title="Bonus Scoring Rules">
          {bonusRows.map((r) => (
            <Row key={r.stat} label={`${r.category} — ${r.stat}`} value={r.points} />
          ))}
        </SectionCard>
      )}

      {/* 4. Roster Slots */}
      {rosterSlots && Object.keys(rosterSlots).length > 0 && (
        <SectionCard title="Roster Slots">
          {Object.entries(rosterSlots)
            .filter(([, count]) => Number(count) > 0)
            .map(([slotId, count]) => (
              <Row
                key={slotId}
                label={SLOT_LABELS[slotId] ?? `Slot ${slotId}`}
                value={`${count} slot${Number(count) !== 1 ? "s" : ""}`}
              />
            ))}
        </SectionCard>
      )}

      {/* 5. Keeper League Rules — app defaults unless ESPN exposes keeper fields */}
      <SectionCard title="Keeper Rules (app defaults)">
        <p className="mb-2 text-xs text-muted-foreground">
          These rows describe how the Keeper Advisor models costs. ESPN keeper flags still come from draft history
          when available; this block is not a live ESPN settings dump.
        </p>
        <Row label="FA Pickup Cost"      value="Round 7" />
        <Row label="Max Keeper Duration" value="2 consecutive years" />
        <Row label="Keeper Cost Method"  value="Drafted round — 1 (min Round 1)" />
        <Row label="Keeper Tracking"     value="ESPN Draft History (isKeeper flag)" />
        {(meta?.keeperSlotsPerTeam != null || meta?.keeperCount != null) && (
          <Row
            label="Keepers Per Team (ESPN)"
            value={String(meta?.keeperSlotsPerTeam ?? meta?.keeperCount)}
          />
        )}
        {meta?.draftType != null && (
          <Row label="Draft Type" value={String(meta.draftType)} />
        )}
      </SectionCard>

      {/* 6. League Meta */}
      {meta && (
        <SectionCard title="League Info">
          {meta.size       != null && <Row label="Teams"           value={String(meta.size)} />}
          {typeof (meta as { keepers?: boolean }).keepers === "boolean" && (
            <Row
              label="Keeper league"
              value={(meta as { keepers?: boolean }).keepers ? "Yes" : "No (redraft)"}
            />
          )}
          {meta.playoffTeamCount != null && <Row label="Playoff Teams"  value={String(meta.playoffTeamCount)} />}
          {meta.matchupPeriodCount != null && <Row label="Regular Season Weeks" value={String(meta.matchupPeriodCount)} />}
        </SectionCard>
      )}

    </div>
  );
}
