import { X, TrendingUp, TrendingDown, Minus, Star, Users, BarChart2, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MergedPlayer {
  fpId: number;
  name: string;
  team: string;
  position: string;
  ecrRank: number;
  ecrTier: number;
  posRank: string;
  adp: number | null;
  adpGap: number | null;
  byeWeek: number | null;
  ownedPct: number | null;
  ecrMin: number | null;
  ecrMax: number | null;
  ecrAvg: number | null;
  ecrStd: number | null;
  pfr2025: {
    rushYds: number | null;
    rushTd: number | null;
    recYds: number | null;
    recTd: number | null;
    rec: number | null;
    targets: number | null;
    passYds: number | null;
    passTd: number | null;
    pprPts: number | null;
    vbd: number | null;
    fantasyRank: number | null;
  } | null;
}

interface Props {
  player: MergedPlayer;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  WR: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  TE: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  K:  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  DST:"bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function GapBadge({ gap }: { gap: number | null }) {
  if (gap === null) return <span className="text-slate-500 text-xs">—</span>;
  const abs = Math.abs(gap);
  if (gap <= -5) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-400">
      <TrendingDown className="w-3 h-3" /> Value +{abs}
    </span>
  );
  if (gap >= 5) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-400">
      <TrendingUp className="w-3 h-3" /> Reach +{abs}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
      <Minus className="w-3 h-3" /> Fair
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="bg-slate-800/60 rounded-lg p-3 text-center">
      <div className="text-lg font-bold text-slate-100">{value ?? "—"}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

/** Compute a composite "Rod's Edge" score (0–100) */
function computeEdgeScore(player: MergedPlayer): { score: number; label: string; color: string } {
  let score = 50;
  // ADP gap: big value = +20, big reach = -20
  if (player.adpGap !== null) {
    if (player.adpGap <= -10) score += 20;
    else if (player.adpGap <= -5) score += 12;
    else if (player.adpGap >= 10) score -= 20;
    else if (player.adpGap >= 5) score -= 10;
  }
  // ECR tier: tier 1 = +10, tier 5+ = -10
  if (player.ecrTier <= 1) score += 10;
  else if (player.ecrTier <= 2) score += 5;
  else if (player.ecrTier >= 5) score -= 10;
  // ECR consensus tightness (low std = high confidence)
  if (player.ecrStd !== null) {
    if (player.ecrStd < 5) score += 8;
    else if (player.ecrStd > 15) score -= 8;
  }
  // 2025 PFR VBD
  if (player.pfr2025?.vbd !== null && player.pfr2025?.vbd !== undefined) {
    if (player.pfr2025.vbd > 100) score += 10;
    else if (player.pfr2025.vbd > 50) score += 5;
    else if (player.pfr2025.vbd < 0) score -= 5;
  }
  score = Math.max(5, Math.min(99, score));
  const label = score >= 75 ? "Strong Value" : score >= 55 ? "Solid Pick" : score >= 40 ? "Neutral" : "Risky";
  const color = score >= 75 ? "text-emerald-400" : score >= 55 ? "text-blue-400" : score >= 40 ? "text-slate-400" : "text-red-400";
  return { score, label, color };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PlayerDetailDrawer({ player, onClose }: Props) {
  const edge = computeEdgeScore(player);
  const posColor = POS_COLORS[player.position] || POS_COLORS.DST;

  // Fetch draft history from ESPN cache
  const { data: draftHistory, isLoading: histLoading } = trpc.draftBoard.getPlayerDraftHistory.useQuery(
    { playerName: player.name },
    { staleTime: 1000 * 60 * 30 }
  );

  // Fetch ADP trend (only if we have a valid fpId)
  const { data: adpTrend } = trpc.draftBoard.getAdpTrend.useQuery(
    { fpId: player.fpId, limit: 6 },
    { enabled: player.fpId > 0, staleTime: 1000 * 60 * 60 }
  );

  const pfr = player.pfr2025;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      {/* Drawer */}
      <div
        className="relative z-10 w-full max-w-md h-full bg-slate-900 border-l border-slate-700 overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-5 py-4 flex items-start justify-between z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={`text-xs font-bold ${posColor}`}>{player.position}</Badge>
              <span className="text-xs text-slate-500">{player.team}</span>
              {player.byeWeek && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Bye {player.byeWeek}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-100">{player.name}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
              <span>ECR #{player.ecrRank}</span>
              <span className="text-slate-600">·</span>
              <span>{player.posRank}</span>
              {player.adp && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>ADP {player.adp.toFixed(1)}</span>
                </>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-slate-200 mt-1">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Rod's Edge Score */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-800/60 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-slate-300">Rod's Edge Score</span>
              </div>
              <span className={`text-2xl font-black ${edge.color}`}>{edge.score}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all ${edge.score >= 75 ? "bg-emerald-500" : edge.score >= 55 ? "bg-blue-500" : edge.score >= 40 ? "bg-slate-500" : "bg-red-500"}`}
                style={{ width: `${edge.score}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium ${edge.color}`}>{edge.label}</span>
              <GapBadge gap={player.adpGap} />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Composite of ECR tier, ADP gap, consensus tightness, and 2025 VBD. Higher = better value for Rod.
            </p>
          </div>

          {/* ECR Consensus */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" /> Expert Consensus (ECR)
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="ECR Rank" value={`#${player.ecrRank}`} />
              <StatBox label="Tier" value={player.ecrTier} />
              <StatBox label="ADP" value={player.adp ? player.adp.toFixed(1) : null} />
              <StatBox label="Own %" value={player.ownedPct ? `${player.ownedPct}%` : null} />
            </div>
            {player.ecrMin !== null && player.ecrMax !== null && (
              <div className="mt-3 bg-slate-800/60 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>Expert Range</span>
                  <span className="font-medium text-slate-300">#{player.ecrMin} – #{player.ecrMax}</span>
                </div>
                <div className="relative h-2 bg-slate-700 rounded-full">
                  {/* Range bar */}
                  <div
                    className="absolute h-2 bg-blue-500/40 rounded-full"
                    style={{
                      left: `${Math.max(0, ((player.ecrMin - 1) / 200) * 100)}%`,
                      width: `${Math.min(100, ((player.ecrMax - player.ecrMin) / 200) * 100)}%`,
                    }}
                  />
                  {/* ECR dot */}
                  <div
                    className="absolute w-3 h-3 bg-blue-400 rounded-full -top-0.5 -translate-x-1/2 border-2 border-slate-900"
                    style={{ left: `${Math.min(99, ((player.ecrRank - 1) / 200) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                  <span>#1</span>
                  <span className="text-slate-500">
                    {player.ecrStd !== null ? `±${player.ecrStd.toFixed(1)} std dev` : ""}
                  </span>
                  <span>#200</span>
                </div>
              </div>
            )}
          </div>

          {/* ADP Trend */}
          {adpTrend && adpTrend.length >= 2 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">ADP Trend</h3>
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="flex items-end gap-1 h-12">
                  {adpTrend.map((entry, i) => {
                    const adpVals = adpTrend.map(e => e.adp ?? 0);
                    const maxAdp = Math.max(...adpVals);
                    const minAdp = Math.min(...adpVals);
                    const range = maxAdp - minAdp || 1;
                    const adpVal = entry.adp ?? 0;
                    const heightPct = 100 - ((adpVal - minAdp) / range) * 80;
                    const isLast = i === adpTrend.length - 1;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div
                          className={`w-full rounded-sm transition-all ${isLast ? "bg-blue-500" : "bg-slate-600"}`}
                          style={{ height: `${Math.max(10, heightPct)}%` }}
                        />
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-700 text-xs text-slate-200 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                          ADP {entry.adp?.toFixed(1) ?? "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                  <span>Older</span>
                  <span>Latest: ADP {adpTrend[adpTrend.length - 1]?.adp?.toFixed(1) ?? "—"}</span>
                </div>
              </div>
            </div>
          )}

          {/* 2025 PFR Stats */}
          {pfr && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">2025 Season Stats (PFR)</h3>
              <div className="grid grid-cols-3 gap-2">
                {player.position === "QB" ? (
                  <>
                    <StatBox label="Pass Yds" value={pfr.passYds?.toLocaleString() ?? null} />
                    <StatBox label="Pass TD" value={pfr.passTd} />
                    <StatBox label="Rush Yds" value={pfr.rushYds?.toLocaleString() ?? null} />
                  </>
                ) : player.position === "RB" ? (
                  <>
                    <StatBox label="Rush Yds" value={pfr.rushYds?.toLocaleString() ?? null} />
                    <StatBox label="Rush TD" value={pfr.rushTd} />
                    <StatBox label="Rec Yds" value={pfr.recYds?.toLocaleString() ?? null} />
                  </>
                ) : player.position === "WR" || player.position === "TE" ? (
                  <>
                    <StatBox label="Targets" value={pfr.targets} />
                    <StatBox label="Rec" value={pfr.rec} />
                    <StatBox label="Rec Yds" value={pfr.recYds?.toLocaleString() ?? null} />
                  </>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <StatBox label="PPR Pts" value={pfr.pprPts?.toFixed(1) ?? null} />
                <StatBox label="VBD" value={pfr.vbd} />
                <StatBox label="Pos Rank" value={pfr.fantasyRank ? `#${pfr.fantasyRank}` : null} />
              </div>
            </div>
          )}

          <Separator className="border-slate-700" />

          {/* League Draft History */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> League Draft History (2018–2025)
            </h3>
            {histLoading ? (
              <div className="text-xs text-slate-500 animate-pulse">Loading draft history…</div>
            ) : !draftHistory || draftHistory.length === 0 ? (
              <div className="text-xs text-slate-500 bg-slate-800/40 rounded-lg p-3 text-center">
                No draft history found in this league for <span className="text-slate-300">{player.name}</span>.
              </div>
            ) : (
              <div className="space-y-2">
                {draftHistory.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-slate-200">{entry.ownerName}</span>
                      <span className="text-xs text-slate-500 ml-2">{entry.teamName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">{entry.season}</span>
                      <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                        Rd {entry.round}{entry.pick > 0 ? `, Pk ${entry.pick}` : ""}
                      </Badge>
                      {entry.isKeeper && (
                        <Badge variant="outline" className="text-xs border-yellow-500/40 text-yellow-400 bg-yellow-500/10">
                          Keeper
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-600 mt-1">
                  Drafted {draftHistory.length}× in this league across {new Set(draftHistory.map(e => e.season)).size} seasons.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
