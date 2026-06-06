import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { Activity, Info } from "lucide-react";

/**
 * Activity DNA card — deterministic owner management-style profile.
 * Phase 1: 6 computable archetypes (transactionCounter + keepers). Draft Reliant & Streamer
 * are shown as pending until the playerId crosswalk lands. No fabricated scores.
 */

type ArchetypeCell = { score: number | null; status: "ok" | "pending-data" };

// Display order for the ranked bars (descending score is applied after).
const COMPUTABLE: { key: string; label: string }[] = [
  { key: "tradeOpportunist", label: "Trade Opportunist" },
  { key: "rosterBuilder", label: "Roster Builder" },
  { key: "waiverAggressive", label: "Waiver Aggressive" },
  { key: "draftAndHold", label: "Draft-and-Hold" },
  { key: "highActivity", label: "High Activity" },
  { key: "lowActivity", label: "Low Activity" },
];
const PENDING: { key: string; label: string }[] = [
  { key: "draftReliant", label: "Draft Reliant" },
  { key: "streamer", label: "Streamer" },
];

const SURFACE =
  "rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#1b131f] to-[#140e17]";

function confidenceClasses(c: string): string {
  if (c === "High") return "border-lime-400/30 bg-lime-400/10 text-lime-300";
  if (c === "Medium") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-white/15 bg-white/5 text-zinc-400";
}

export function ActivityDnaCard({ ownerKey }: { ownerKey?: string }) {
  const { leagueContextKey } = useLeagueActiveGate();
  const q = trpc.activityDna.owner.useQuery(
    withLeagueSalt({ ownerKey: ownerKey || undefined }, leagueContextKey),
    { staleTime: 60_000, enabled: !!ownerKey },
  );

  if (q.isLoading) {
    return (
      <div className={cn(SURFACE, "p-4 sm:p-5")}>
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Activity className="h-4 w-4 text-lime-400/80" aria-hidden />
          Activity DNA
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 w-full animate-pulse rounded bg-white/[0.05]" />
          ))}
        </div>
      </div>
    );
  }

  const data = q.data;
  if (!data) {
    return (
      <div className={cn(SURFACE, "p-4 sm:p-5")}>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Activity className="h-4 w-4 text-lime-400/80" aria-hidden />
          Activity DNA
        </div>
        <p className="text-[13px] text-zinc-500">Not enough league history to profile this owner yet.</p>
      </div>
    );
  }

  const archetypes = data.archetypes as Record<string, ArchetypeCell>;
  const bars = COMPUTABLE.map((a) => ({ ...a, score: archetypes[a.key]?.score ?? 0 }))
    .filter((a) => archetypes[a.key]?.status === "ok")
    .sort((x, y) => y.score - x.score);

  const barColor = (label: string) => {
    if (label === data.primaryDNA) return "bg-lime-400";
    if (label === data.secondaryDNA) return "bg-violet-500";
    return "bg-white/25";
  };

  return (
    <div className={cn(SURFACE, "overflow-hidden p-4 sm:p-5")}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Activity className="h-4 w-4 text-lime-400/80" aria-hidden />
          Activity DNA
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
            confidenceClasses(data.confidence),
          )}
        >
          {data.confidence} confidence
        </span>
      </div>

      {/* Primary / Secondary */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-lime-400/20 bg-lime-400/[0.06] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-lime-300/70">Primary DNA</div>
          <div className="text-[17px] font-extrabold leading-tight text-lime-300">{data.primaryDNA}</div>
        </div>
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-violet-300/70">Secondary DNA</div>
          <div className="text-[17px] font-extrabold leading-tight text-violet-300">{data.secondaryDNA}</div>
        </div>
      </div>

      {/* Ranked bars */}
      <div className="space-y-2.5">
        {bars.map((b) => (
          <div key={b.key} className="flex items-center gap-3">
            <div className="w-32 shrink-0 text-[12px] text-zinc-300">{b.label}</div>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn("h-full rounded-full", barColor(b.label))}
                style={{ width: `${Math.max(0, Math.min(100, b.score))}%` }}
              />
            </div>
            <div className="w-8 shrink-0 text-right text-[12px] font-semibold tabular-nums text-zinc-200">
              {b.score}
            </div>
          </div>
        ))}
      </div>

      {/* Pending (Phase 2) chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {PENDING.map((p) => (
          <span
            key={p.key}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-500"
            title="Requires deeper player-linking data (Phase 2)"
          >
            {p.label}
            <span className="text-zinc-600">· pending</span>
          </span>
        ))}
      </div>

      {/* Evidence chips */}
      {Array.isArray(data.evidence) && data.evidence.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Evidence</div>
          <div className="flex flex-col gap-1.5">
            {data.evidence.map((e: string, i: number) => (
              <div
                key={i}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[12px] text-zinc-400"
              >
                {e}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limitation / status note */}
      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-snug text-zinc-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        <span>
          Deterministic classification from {data.seasons} season{data.seasons === 1 ? "" : "s"} of transaction and
          draft history. Draft Reliant &amp; Streamer are pending deeper player-linking data and are not yet scored.
        </span>
      </p>
    </div>
  );
}

export default ActivityDnaCard;
