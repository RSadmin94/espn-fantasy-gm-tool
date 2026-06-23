import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { Loader2, AlertTriangle, Dna, Brain, Sparkles, Info } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types (server-provided; the client never recomputes value/recommendation) ──

type KeeperValueTier = "elite" | "strong" | "viable" | "borderline" | "pass";

type KeeperValuation = {
  playerId: number;
  playerName: string;
  position: string;
  nflTeam: string;
  ownerKey: string;
  ownerName: string;
  keeperRoundCost: number;
  marketValue: number | null;
  marketConfidence: number | null;
  adp: number | null;
  adpRound: number | null;
  roundSavings: number | null;
  valueTier: KeeperValueTier;
  recommendation: string;
  explanation: string;
};

// keeperPool rows are still used for the Keeper-DNA sidebar stats (rate / avg round /
// top position) — descriptive history only, no scoring.
type KeeperPoolRow = {
  ownerName: string;
  position: string;
  keepYear: 0 | 1;
  isLastKeeperYear: boolean;
  keeperRoundCost: number;
};

// ─── Position colors ────────────────────────────────────────────────────────────

const POS_STYLE: Record<string, string> = {
  QB:   "text-red-400 font-bold",
  RB:   "text-lime-400 font-bold",
  WR:   "text-violet-400 font-bold",
  TE:   "text-orange-400 font-bold",
  K:    "text-zinc-400 font-bold",
  "D/ST": "text-violet-400 font-bold",
};

// ─── Tier badge — styled ONLY from server valueTier + recommendation label ──────

const TIER_STYLE: Record<KeeperValueTier, string> = {
  elite:      "border-lime-600 bg-lime-600/20 text-lime-300",
  strong:     "border-emerald-600 bg-emerald-600/15 text-emerald-300",
  viable:     "border-amber-600 bg-amber-600/15 text-amber-300",
  borderline: "border-zinc-600 bg-zinc-700/40 text-zinc-300",
  pass:       "border-red-700 bg-red-700/15 text-red-400",
};

function TierBadge({ tier, label }: { tier: KeeperValueTier; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
      TIER_STYLE[tier] ?? TIER_STYLE.borderline,
    )}>
      {label}
    </span>
  );
}

// ─── Display-only formatters (NOT scoring) ──────────────────────────────────────

function fmtAdp(adp: number | null): string {
  return adp != null ? adp.toFixed(1) : "—";
}
function fmtSavings(s: number | null): string {
  if (s == null) return "—";
  return s > 0 ? `+${s}` : String(s);
}
function savingsColor(s: number | null): string {
  if (s == null) return "text-zinc-600";
  if (s >= 3) return "text-lime-400";
  if (s >= 1) return "text-amber-400";
  if (s === 0) return "text-zinc-400";
  return "text-red-400";
}

// ─── Keeper DNA sidebar (descriptive history; no scoring) ───────────────────────

function KeeperDNA({ pool, ownerFilter }: { pool: KeeperPoolRow[]; ownerFilter: string }) {
  const subset = ownerFilter === "all" ? pool : pool.filter(p => p.ownerName === ownerFilter);
  const total = subset.length;

  const keeperPicks = subset.filter(p => p.keepYear === 1 || p.isLastKeeperYear);
  const keeperRate = total > 0 ? Math.round((keeperPicks.length / total) * 100) : 0;

  const avgRound = total > 0
    ? (subset.reduce((s, p) => s + p.keeperRoundCost, 0) / total).toFixed(1)
    : "—";

  const posDist: Record<string, number> = {};
  for (const p of subset) posDist[p.position] = (posDist[p.position] ?? 0) + 1;
  const topPos = Object.entries(posDist).sort((a, b) => b[1] - a[1])[0];
  const topPosPct = topPos && total > 0 ? Math.round((topPos[1] / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-[#18111c] p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime-900/40">
          <Dna className="h-4 w-4 text-lime-400" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-100">Your Keeper DNA</h3>
      </div>
      <p className="mb-4 text-[11px] text-zinc-500">Insights from your historical keeper patterns.</p>

      <div className="space-y-3">
        {[
          { icon: "📊", label: "Keeper Rate", value: total > 0 ? `${keeperRate}%` : "—" },
          { icon: "📅", label: "Avg Keeper Round", value: avgRound },
          { icon: "👥", label: "Most Kept Position", value: topPos ? `${topPos[0]} (${topPosPct}%)` : "—" },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">{row.icon}</span>
              <span className="text-xs text-zinc-400">{row.label}</span>
            </div>
            <span className="text-sm font-bold text-zinc-100">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Insight sidebar — reads the server's top valuation (no client scoring) ──

function AIInsight({ valuations, ownerFilter }: { valuations: KeeperValuation[]; ownerFilter: string }) {
  const subset = ownerFilter === "all" ? valuations : valuations.filter(v => v.ownerName === ownerFilter);
  const top = subset[0]; // server returns best-savings-first
  const eliteCount = subset.filter(v => v.valueTier === "elite").length;
  const strongPlus = subset.filter(v => v.valueTier === "elite" || v.valueTier === "strong").length;

  let insight = "Run a Full Import to generate keeper valuations for your roster.";
  if (top) {
    if (top.roundSavings != null && top.roundSavings > 0) {
      insight = `${top.playerName} is the strongest keeper value here — ${top.explanation}`;
      if (strongPlus > 1) insight += ` ${strongPlus} keepers grade Strong or better this year.`;
    } else {
      insight = `No bargain keepers stand out${ownerFilter === "all" ? " league-wide" : ""}. The best available is ${top.playerName} (${top.recommendation}). Most rostered players cost more than their draft-market value.`;
    }
  }

  return (
    <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-800/50">
            <Brain className="h-4 w-4 text-amber-400" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">AI Insight</h3>
        </div>
        <Sparkles className="h-4 w-4 text-amber-400/60" />
      </div>
      <p className="text-sm leading-relaxed text-amber-100/90">{insight}</p>
      <p className="mt-2 text-[10px] text-amber-700/80">
        Deterministic · No LLM · {eliteCount} elite-value {eliteCount === 1 ? "keeper" : "keepers"}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function KeeperAdvisor() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const draftYear    = new Date().getFullYear();
  const { myOwnerName, teamCount } = useLeagueContext();
  const [ownerFilter, setOwnerFilter] = useState<string>(() => myOwnerName ?? "all");
  const [posFilter,   setPosFilter]   = useState<string>("all");
  const [maxKeepers,  setMaxKeepers]  = useState<string>("all");

  useEffect(() => {
    setOwnerFilter(myOwnerName ?? "all");
  }, [leagueContextKey, myOwnerName]);

  // Single source of truth: the authoritative keeper valuation service.
  const valQ = trpc.espn.keeperValuation.useQuery(
    withLeagueSalt({ draftYear }, leagueContextKey),
    { enabled: leagueKeyReady },
  );

  const payload = leagueKeyReady ? valQ.data : undefined;

  const valuations = useMemo((): KeeperValuation[] => {
    const raw = (payload as { valuations?: KeeperValuation[] } | undefined)?.valuations;
    return Array.isArray(raw) ? raw : [];
  }, [payload]);

  // keeperPool rows for the DNA sidebar (descriptive stats only).
  const pool = useMemo((): KeeperPoolRow[] => {
    const raw = (payload as { pool?: KeeperPoolRow[] } | undefined)?.pool;
    return Array.isArray(raw) ? raw : [];
  }, [payload]);

  // ── Manual keeper selections (user override) ─────────────────────────────────
  const [manualError, setManualError] = useState<string | null>(null);
  const manualQ = trpc.espn.getManualKeeperSelections.useQuery(
    { season: draftYear },
    { enabled: leagueKeyReady },
  );
  const setManual = trpc.espn.setManualKeeperSelection.useMutation({
    onSuccess: (res) => {
      const r = res as { ok?: boolean; error?: string; limit?: number | null } | undefined;
      if (r && r.ok === false) {
        setManualError(
          r.error === "limit_reached"
            ? `Keeper limit reached — max ${r.limit ?? "?"} per team. Deselect one first.`
            : r.error === "table_missing"
              ? "Manual keepers aren't available yet (storage not provisioned)."
              : "Could not save that selection.",
        );
      } else {
        setManualError(null);
      }
      void manualQ.refetch();
    },
    onError: () => setManualError("Could not save that selection."),
  });

  const manualLimit = (manualQ.data as { keeperLimit?: number | null } | undefined)?.keeperLimit ?? null;
  const manualSelections = useMemo(
    () => ((manualQ.data as { selections?: Array<{ ownerKey: string; playerId: number }> } | undefined)?.selections ?? []),
    [manualQ.data],
  );
  const selectedPlayerIds = useMemo(() => new Set(manualSelections.map((s) => s.playerId)), [manualSelections]);
  const selectedCountByOwnerKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of manualSelections) m.set(s.ownerKey, (m.get(s.ownerKey) ?? 0) + 1);
    return m;
  }, [manualSelections]);

  const toggleKeep = (v: KeeperValuation) => {
    const isSel = selectedPlayerIds.has(v.playerId);
    setManualError(null);
    setManual.mutate({
      season: draftYear,
      ownerKey: v.ownerKey,
      playerId: v.playerId,
      playerName: v.playerName,
      position: v.position,
      keep: !isSel,
    });
  };

  const errorMsg = (payload as { error?: string } | undefined)?.error;
  const hintMsg  = (payload as { hint?: string }  | undefined)?.hint;
  const isRedraftDisabled = Boolean(
    payload &&
      typeof payload === "object" &&
      "disabled" in payload &&
      (payload as { disabled?: boolean }).disabled === true,
  );

  const owners    = useMemo(() => [...new Set(valuations.map(v => v.ownerName))].sort(), [valuations]);
  const positions = useMemo(() => [...new Set(valuations.map(v => v.position).filter(Boolean))].sort(), [valuations]);

  // Server already orders best-savings-first. The client only FILTERS — never re-scores.
  const filtered = useMemo(() => {
    let rows = valuations.filter(v => {
      if (ownerFilter !== "all" && v.ownerName !== ownerFilter) return false;
      if (posFilter   !== "all" && v.position   !== posFilter)   return false;
      return true;
    });
    if (maxKeepers !== "all") {
      const max = parseInt(maxKeepers, 10);
      const ownerCounts = new Map<string, number>();
      rows = rows.filter(v => {
        const c = ownerCounts.get(v.ownerName) ?? 0;
        if (c >= max) return false;
        ownerCounts.set(v.ownerName, c + 1);
        return true;
      });
    }
    return rows;
  }, [valuations, ownerFilter, posFilter, maxKeepers]);

  // Redraft league — server gate
  if (isRedraftDisabled && payload && typeof payload === "object") {
    const slots = (payload as { keeperSlotsPerTeam?: number | null }).keeperSlotsPerTeam;
    const slotsTxt = typeof slots === "number" && Number.isFinite(slots) ? String(slots) : "0";
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <Info className="mx-auto mb-4 h-10 w-10 text-zinc-500" />
        <h1 className="text-xl font-bold text-zinc-100">Keeper tools unavailable</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          This league is configured as a redraft league.
          ESPN reports {slotsTxt} keeper slot{slotsTxt === "1" ? "" : "s"} per team.
          Keeper tools are unavailable.
        </p>
      </div>
    );
  }

  // Loading
  if (!leagueKeyReady || valQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Valuing keeper pool…
      </div>
    );
  }

  // Error
  if (errorMsg) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <p className="text-lg font-semibold text-zinc-100">No draft data found</p>
        <p className="mt-1 text-sm text-zinc-400">{hintMsg ?? errorMsg}</p>
        <p className="mt-4 text-xs text-zinc-500">
          Open the extension popup → Import Historical League Data → <strong>FULL IMPORT</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c090e] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1400px]">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-red-600 bg-red-900/30">
            <span className="text-2xl font-black text-red-400">K</span>
          </div>
          <div>
            <h1 className="text-3xl font-black text-zinc-50">Keeper Advisor {draftYear}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Value vs. draft cost — real ADP and market value, joined to each keeper
            </p>
            <p className="mt-0.5 text-xs text-zinc-600">
              {valuations.length} eligible players across {owners.length} teams{teamCount > 0 && owners.length < teamCount ? ` · ${teamCount - owners.length} team(s) need roster sync` : ""} · {draftYear - 1} season draft history
            </p>
            {manualLimit != null && (
              <p className="mt-0.5 text-xs text-zinc-500">
                Manual keepers: up to <span className="font-semibold text-zinc-300">{manualLimit}</span> per team
                {ownerFilter !== "all" && (() => {
                  const ok = valuations.find((v) => v.ownerName === ownerFilter)?.ownerKey;
                  const c = ok ? (selectedCountByOwnerKey.get(ok) ?? 0) : 0;
                  return <> · {ownerFilter}: <span className="font-semibold text-lime-400">{c}/{manualLimit} kept</span></>;
                })()}
              </p>
            )}
            {manualError && <p className="mt-0.5 text-xs text-red-400">{manualError}</p>}
          </div>
        </div>

        {/* ── Filter bar ───────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 bg-[#140e17] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Owner:</span>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-8 w-44 border-zinc-700 bg-zinc-800 text-xs text-zinc-200">
                <SelectValue placeholder="All Owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Position:</span>
            <Select value={posFilter} onValueChange={setPosFilter}>
              <SelectTrigger className="h-8 w-28 border-zinc-700 bg-zinc-800 text-xs text-zinc-200">
                <SelectValue placeholder="All Pos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pos</SelectItem>
                {positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Max Keepers:</span>
            <Select value={maxKeepers} onValueChange={setMaxKeepers}>
              <SelectTrigger className="h-8 w-24 border-zinc-700 bg-zinc-800 text-xs text-zinc-200">
                <SelectValue placeholder="No limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">No limit</SelectItem>
                {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Info className="h-3 w-3" />
            Savings = keeper round − ADP round · ranked best value first
          </div>
        </div>

        {/* ── Main grid: table + sidebar ───────────────────────────────── */}
        <div className="flex gap-5">

          {/* Table */}
          <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-[#140e17]">
            {filtered.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-semibold text-zinc-300">
                  {ownerFilter !== "all"
                    ? `No keeper data found for ${ownerFilter}`
                    : "No players match the current filters."}
                </p>
                {ownerFilter !== "all" && !owners.includes(ownerFilter) && (
                  <p className="mt-2 text-xs text-zinc-600">
                    This team's current roster hasn't been synced yet. Run a Full Sync from the extension to populate their players.
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60">
                      <th className="px-3 py-3 text-center text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Keep</th>
                      <th className="px-4 py-3 text-left  text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Player</th>
                      <th className="px-3 py-3 text-center text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Keeper Cost</th>
                      <th className="px-3 py-3 text-center text-[12px] font-semibold uppercase tracking-wider text-zinc-500">ADP</th>
                      <th className="px-3 py-3 text-center text-[12px] font-semibold uppercase tracking-wider text-zinc-500">ADP Rd</th>
                      <th className="px-3 py-3 text-center text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Savings</th>
                      <th className="px-4 py-3 text-center text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Recommendation</th>
                      <th className="px-4 py-3 text-left  text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v, i) => {
                      const posStyle = POS_STYLE[v.position] ?? "text-zinc-400 font-bold";
                      return (
                        <tr
                          key={`${v.ownerName}-${v.playerId}-${i}`}
                          className={cn(
                            "border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/20",
                            i % 2 === 0 ? "" : "bg-zinc-900/20",
                          )}
                        >
                          {/* Keep toggle (manual override) */}
                          <td className="px-3 py-3 text-center">
                            {(() => {
                              const isSel = selectedPlayerIds.has(v.playerId);
                              const ownerCount = selectedCountByOwnerKey.get(v.ownerKey) ?? 0;
                              const atLimit = manualLimit != null && manualLimit > 0 && ownerCount >= manualLimit;
                              const disabled = setManual.isPending || (!isSel && atLimit);
                              return (
                                <button
                                  type="button"
                                  onClick={() => toggleKeep(v)}
                                  disabled={disabled}
                                  title={!isSel && atLimit ? `Keeper limit reached (${manualLimit} per team)` : isSel ? "Remove keeper" : "Mark as keeper"}
                                  className={cn(
                                    "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors",
                                    isSel
                                      ? "border-lime-600 bg-lime-600/20 text-lime-300 hover:bg-lime-600/30"
                                      : disabled
                                        ? "cursor-not-allowed border-zinc-800 bg-zinc-900/40 text-zinc-600"
                                        : "border-zinc-700 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-700/50",
                                  )}
                                >
                                  {isSel ? "✓ Keeper" : "Keep"}
                                </button>
                              );
                            })()}
                          </td>

                          {/* Player + owner + pos/nfl */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[11px] font-bold text-zinc-300">
                                {v.playerName.split(" ").map(w => w[0]).slice(0, 2).join("")}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-zinc-100">{v.playerName}</div>
                                <div className="flex items-center gap-2 text-[12px]">
                                  <span className={posStyle}>{v.position || "—"}</span>
                                  <span className="text-zinc-600">{v.nflTeam || ""}</span>
                                  <span className="text-zinc-500">· {v.ownerName}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Keeper cost */}
                          <td className="px-3 py-3 text-center">
                            <span className="text-sm font-semibold text-zinc-200">Round {v.keeperRoundCost}</span>
                          </td>

                          {/* ADP */}
                          <td className="px-3 py-3 text-center">
                            <span className="tabular-nums text-zinc-300">{fmtAdp(v.adp)}</span>
                          </td>

                          {/* ADP round */}
                          <td className="px-3 py-3 text-center">
                            <span className="tabular-nums text-zinc-400">{v.adpRound != null ? `R${v.adpRound}` : "—"}</span>
                          </td>

                          {/* Round savings */}
                          <td className="px-3 py-3 text-center">
                            <span className={cn("text-base font-black tabular-nums", savingsColor(v.roundSavings))}>
                              {fmtSavings(v.roundSavings)}
                            </span>
                          </td>

                          {/* Recommendation (server) */}
                          <td className="px-4 py-3 text-center">
                            <TierBadge tier={v.valueTier} label={v.recommendation} />
                          </td>

                          {/* Explanation (server) */}
                          <td className="px-4 py-3">
                            <span className="text-[12px] leading-snug text-zinc-400">{v.explanation}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Table footer */}
            <div className="flex items-center gap-2 border-t border-zinc-800/60 px-4 py-2.5">
              <Info className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
              <p className="text-[12px] text-zinc-600">
                Recommendations come from one server-side valuation: real ESPN ADP vs. keeper round cost, with market value from the shared engine. Players with no ADP (e.g. IDP) show no savings rather than an estimate.
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-72 shrink-0 space-y-4">
            <KeeperDNA pool={pool} ownerFilter={ownerFilter} />
            <AIInsight valuations={valuations} ownerFilter={ownerFilter} />

            <div className="rounded-xl border border-zinc-800 bg-[#140e17] p-4 text-xs text-zinc-500 space-y-1.5">
              <p className="font-semibold uppercase tracking-wide text-zinc-400">League Rules</p>
              <p>Max keeper duration: <span className="text-zinc-300">2 consecutive years</span></p>
              <p>FA pickup cost: <span className="text-zinc-300">Round 7</span></p>
              <p>Cost method: <span className="text-zinc-300">Drafted round − 1</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
