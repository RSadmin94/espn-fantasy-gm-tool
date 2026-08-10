import React from "react";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { V1 } from "@/lib/v1Copy";
import { AlertCircle, Loader2, Gem, Landmark, Hourglass, TrendingUp, Scale, Building } from "lucide-react";

// ── theme (matches the rest of GM War Room) ─────────────────────────────────
const TEXT = "var(--color-foreground)";
const MUTED = "var(--color-ink-secondary)";
const LINE = "color-mix(in oklch, var(--color-foreground) 7%, transparent)";
const PAGEBG: React.CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.18),transparent 42%),var(--color-background)",
  color: TEXT,
};
const PANEL: React.CSSProperties = {
  background: "var(--color-card)",
  border: `1px solid ${LINE}`,
  borderRadius: 15,
};

// Now / Later axis colors
const NOW_COLOR = "#a3e635"; // lime — win-now
const LATER_COLOR = "#38bdf8"; // sky — long-term

// One entry per identity badge (keyed by badge.key from the server)
const BADGE_META: Record<string, { color: string; icon: typeof Gem; blurb: string }> = {
  built_to_last: { color: "#34d399", icon: Landmark, blurb: "Strong now and sustainable" },
  win_now_window: { color: "#f5c518", icon: Hourglass, blurb: "Elite now, future thinner" },
  rising_empire: { color: "#8b5cf6", icon: TrendingUp, blurb: "Built for what's coming" },
  crossroads: { color: "#94a3b8", icon: Scale, blurb: "Middle of the pack" },
  ground_floor: { color: "#f7902f", icon: Building, blurb: "A roster in rebuild" },
};
const BADGE_ORDER = ["built_to_last", "win_now_window", "rising_empire", "crossroads", "ground_floor"];

interface BadgeT { key: string; label: string; icon: string; explanation: string }
interface TeamRow {
  teamId: number; ownerName: string; rosterSize: number;
  nowScore: number; laterScore: number; nowPct: number; laterPct: number;
  powerScore: number; powerRank: number; badge: BadgeT;
}

function AxisBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs font-bold uppercase tracking-wide w-10" style={{ color: MUTED }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "color-mix(in oklch, var(--color-foreground) 8%, transparent)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
      <span className="text-label font-extrabold tabular-nums w-9 text-right" style={{ color: TEXT }}>{Math.round(pct)}</span>
    </div>
  );
}

function BadgeChip({ badge, size = "md" }: { badge: BadgeT; size?: "sm" | "md" }) {
  const meta = BADGE_META[badge.key] ?? { color: MUTED, icon: Gem };
  const Icon = meta.icon;
  const pad = size === "sm" ? "px-2 py-1 text-2xs" : "px-3 py-1.5 text-[13px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-extrabold ${pad}`}
      style={{ color: meta.color, background: `color-mix(in oklch, ${meta.color} 14%, transparent)`, border: `1px solid color-mix(in oklch, ${meta.color} 40%, transparent)` }}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} /> {badge.label}
    </span>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-2">
      {BADGE_ORDER.map((k) => {
        const meta = BADGE_META[k];
        const Icon = meta.icon;
        return (
          <div key={k} className="flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: "color-mix(in oklch, var(--color-foreground) 3%, transparent)", border: `1px solid ${LINE}` }}>
            <Icon className="h-4 w-4" style={{ color: meta.color }} />
            <span className="text-[12px] font-extrabold" style={{ color: meta.color }}>{k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
            <span className="text-caption" style={{ color: MUTED }}>{meta.blurb}</span>
          </div>
        );
      })}
    </div>
  );
}

const SEASON = 2026;

export default function DynastyPowerRankings() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && leagueContextKey && !leagueContextKey.startsWith("__"),
  );

  const q = trpc.dynasty.powerRankings.useQuery(
    withLeagueSalt({ season: SEASON }, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );

  const teams = ((q.data?.teams as TeamRow[] | undefined) ?? []).slice().sort((a, b) => a.powerRank - b.powerRank);

  return (
    <div className="min-h-screen" style={PAGEBG}>
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <PageHeader
          eyebrow="Dynasty Identity"
          title={V1.features.powerRankings}
          subtitle="Every team's roster strength right now vs. its long-term dynasty value — and the identity that falls out of the two."
          icon={Gem}
        />

        <div className="mt-5"><Legend /></div>

        {!leagueKeyReady && (
          <div className="mt-6 flex items-center gap-2 text-sm" style={{ color: MUTED }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Resolving your active league…
          </div>
        )}

        {leagueKeyReady && q.isLoading && (
          <div className="mt-6 flex items-center gap-2 text-sm" style={{ color: MUTED }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Building the dynasty board…
          </div>
        )}

        {leagueKeyReady && q.isError && (
          <div className="mt-6 flex items-center gap-2 text-sm" style={{ color: "#ef4444" }}>
            <AlertCircle className="h-4 w-4" /> Couldn't load the dynasty rankings. Try again shortly.
          </div>
        )}

        {leagueKeyReady && !q.isLoading && !q.isError && teams.length === 0 && (
          <div className="mt-6 rounded-[12px] p-5 text-sm" style={{ ...PANEL, color: MUTED }}>
            No dynasty data for this league yet. Sync the league, then check back.
          </div>
        )}

        {teams.length > 0 && (
          <div className="mt-5 space-y-2.5">
            {teams.map((t) => {
              const meta = BADGE_META[t.badge.key] ?? { color: MUTED };
              return (
                <section key={t.teamId} style={{ ...PANEL, borderLeft: `4px solid ${meta.color}` }} className="overflow-hidden">
                  <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-[auto_1fr_260px] gap-4 md:items-center">
                    <div className="flex items-center gap-3 md:gap-4">
                      <span className="text-[26px] font-black tabular-nums w-9 text-center" style={{ color: MUTED }}>{t.powerRank}</span>
                      <div>
                        <div className="text-[17px] font-extrabold leading-tight" style={{ color: TEXT }}>{t.ownerName}</div>
                        <div className="mt-1.5"><BadgeChip badge={t.badge} /></div>
                      </div>
                    </div>

                    <p className="text-[12.5px] leading-snug md:pr-4" style={{ color: MUTED }}>{t.badge.explanation}</p>

                    <div className="space-y-1.5 md:w-[260px]">
                      <AxisBar label="Now" pct={t.nowPct} color={NOW_COLOR} />
                      <AxisBar label="Later" pct={t.laterPct} color={LATER_COLOR} />
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {teams.length > 0 && (
          <p className="mt-5 text-caption leading-relaxed" style={{ color: MUTED }}>
            <span style={{ color: NOW_COLOR, fontWeight: 800 }}>Now</span> = starting-lineup strength ·{" "}
            <span style={{ color: LATER_COLOR, fontWeight: 800 }}>Later</span> = 50% current dynasty value + 50% future keeper value.
            Both are league percentiles; the identity badge follows from where a team lands on the two.
          </p>
        )}
      </div>
    </div>
  );
}
