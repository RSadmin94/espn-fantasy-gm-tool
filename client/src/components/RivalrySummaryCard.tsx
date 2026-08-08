import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { Swords, Flame, ShieldAlert, ArrowRight, Loader2 } from "lucide-react";
import { RivalryShareButton } from "@/components/RivalryShareButton";

/**
 * RivalrySummaryCard — a lightweight, reusable reference card for surfaces that need
 * rivalry context but should NOT own the full rivalry experience.
 *
 * Canonical source ONLY: `rivalry.getScores` (focal user, sorted by rivalryScore desc).
 * No new calculations, no new scoring, no page-specific rivalry logic:
 *   - Top Rival      = rivalries[0]  (already canonically sorted by rivalryScore)
 *   - H2H one-liner  = canonical loreSentence (+ h2h record when ungated)
 *   - Biggest Threat = max of the existing `playoffEliminations` field (selection, not a new metric)
 * Full rivalry detail lives in Rivalry Center; this card always links there.
 */
const HEAT_TONE: Record<string, string> = {
  Inferno: "border-red-500/40 bg-red-500/15 text-red-300",
  Burning: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  Heated: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  Simmering: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
  Cold: "border-sky-500/30 bg-sky-500/10 text-sky-200",
};

export function RivalrySummaryCard({ className, title = "Your Top Rivalry" }: { className?: string; title?: string }) {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const q = trpc.rivalry.getScores.useQuery(withLeagueSalt({}, leagueContextKey), { enabled: ready, staleTime: 120_000 });
  const data: any = ready ? q.data : undefined;
  const rivalries: any[] = data?.rivalries ?? [];
  const top = rivalries[0] ?? null;
  // Selection over the existing canonical `playoffEliminations` field — not a new score.
  const threat = rivalries.reduce(
    (best: any, p: any) => (!best || (p.playoffEliminations ?? 0) > (best.playoffEliminations ?? 0) ? p : best),
    null as any,
  );
  const hasH2H = top && typeof top.h2hWins === "number" && typeof top.h2hLosses === "number";

  const shell = "rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4";

  if (!ready || (q.isLoading && !data)) {
    return (
      <div className={cn(shell, "flex items-center gap-2 text-[13px] text-ink-secondary", className)}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading rivalry…
      </div>
    );
  }
  if (!top) {
    return (
      <div className={cn(shell, className)}>
        <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-tertiary">
          <Swords className="h-4 w-4" /> {title}
        </div>
        <p className="text-[13px] text-white/55">No rivalry data yet.</p>
        <Link to="/rivals/rivalries" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-violet-300 hover:text-violet-200">
          Open Rivalries <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className={cn(shell, className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-tertiary">
          <Swords className="h-4 w-4" /> {title}
        </span>
        <div className="flex items-center gap-2">
          {top.heatLabel && (
            <span className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold", HEAT_TONE[top.heatLabel] ?? HEAT_TONE.Cold)}>
              <Flame className="h-3 w-3" /> {top.heatLabel}
            </span>
          )}
          {top.focalKey && top.rivalKey && (
            <RivalryShareButton
              leagueId={leagueContextKey}
              focalOwnerKey={top.focalKey}
              rivalOwnerKey={top.rivalKey}
              ownerBName={top.rivalName}
              heatLabel={top.heatLabel}
            />
          )}
        </div>
      </div>

      {/* Top Rival */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[18px] font-black text-white/90">{top.rivalName}</p>
          <p className="text-[12px] text-ink-tertiary">Top Rival</p>
        </div>
        {typeof top.rivalryScore === "number" && (
          <div className="text-right">
            <div className="text-[20px] font-black tabular-nums text-violet-300">{top.rivalryScore}</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">Rivalry Score</div>
          </div>
        )}
      </div>

      {/* H2H one-liner (record when ungated, else canonical lore) */}
      {hasH2H ? (
        <p className="mt-2 text-[13px] text-white/65">
          You're <span className="font-semibold text-white/85">{top.h2hWins}-{top.h2hLosses}{top.h2hTies ? `-${top.h2hTies}` : ""}</span> all-time vs {top.rivalName}.
        </p>
      ) : top.loreSentence ? (
        <p className="mt-2 text-[13px] leading-relaxed text-white/60">{top.loreSentence}</p>
      ) : null}

      {/* Biggest Threat */}
      {threat && (threat.playoffEliminations ?? 0) > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-amber-300/90">
          <ShieldAlert className="h-3.5 w-3.5" /> Biggest threat: {threat.rivalName} — {threat.playoffEliminations} playoff KO{threat.playoffEliminations === 1 ? "" : "s"}
        </p>
      )}

      <Link to="/rivals/rivalries" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-violet-300 hover:text-violet-200">
        View Rivalries <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default RivalrySummaryCard;
