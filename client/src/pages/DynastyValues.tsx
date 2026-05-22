// FILE: client/src/pages/DynastyValues.tsx
// Dynasty Values — live player values from FantasyCalc API.
// Shows dynasty rankings, age curves, buy/sell signals, and rookie tiers.
// Data: api.fantasycalc.com (free, public, CORS-open)

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Minus, Search,
  Star, AlertTriangle, ShoppingCart, Tag,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type FCPlayer = {
  name: string;
  pos: string;
  team: string;
  age: number | null;
  value: number;
  rank: number;
  posRank: number;
  trend30: number;
  redraftValue: number;
  redraftRank: number;
};

// ── Position colors ───────────────────────────────────────────────────────────
const POS_COLOR: Record<string, string> = {
  QB:  "bg-red-900/50 text-red-300 border-red-700/50",
  RB:  "bg-green-900/50 text-green-300 border-green-700/50",
  WR:  "bg-blue-900/50 text-blue-300 border-blue-700/50",
  TE:  "bg-orange-900/50 text-orange-300 border-orange-700/50",
  K:   "bg-purple-900/50 text-purple-300 border-purple-700/50",
};

// ── Age curve helpers ─────────────────────────────────────────────────────────
const PEAK_AGES: Record<string, [number, number]> = {
  QB: [27, 35], RB: [22, 26], WR: [24, 28], TE: [26, 30],
};

function ageCurveLabel(pos: string, age: number | null): { label: string; color: string } {
  if (!age || !PEAK_AGES[pos]) return { label: "—", color: "text-slate-500" };
  const [low, high] = PEAK_AGES[pos];
  if (age < low)  return { label: "Pre-peak", color: "text-blue-400" };
  if (age <= high) return { label: "Peak",    color: "text-green-400" };
  if (age <= high + 2) return { label: "Post-peak", color: "text-yellow-400" };
  return { label: "Declining", color: "text-red-400" };
}

function buySignal(p: FCPlayer): { signal: string; icon: React.ReactNode; color: string } | null {
  const dynastyVsRedraft = p.value - p.redraftValue;
  const ageCurve = ageCurveLabel(p.pos, p.age);
  if (p.trend30 > 100 && p.rank > 30)
    return { signal: "Rising Buy", icon: <TrendingUp className="w-3 h-3" />, color: "text-green-400" };
  if (dynastyVsRedraft > 500 && ageCurve.label === "Pre-peak")
    return { signal: "Buy Window", icon: <ShoppingCart className="w-3 h-3" />, color: "text-blue-400" };
  if (dynastyVsRedraft < -400 && (ageCurve.label === "Declining" || ageCurve.label === "Post-peak"))
    return { signal: "Sell High", icon: <Tag className="w-3 h-3" />, color: "text-yellow-400" };
  if (p.trend30 < -100)
    return { signal: "Falling", icon: <TrendingDown className="w-3 h-3" />, color: "text-red-400" };
  return null;
}

// ── FantasyCalc fetch (client-side, CORS-open API) ────────────────────────────
async function fetchDynastyValues(numQbs: number, ppr: number): Promise<FCPlayer[]> {
  const dynastyUrl = `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${numQbs}&numTeams=14&ppr=${ppr}`;
  const redraftUrl = `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=${numQbs}&numTeams=14&ppr=${ppr}`;

  const [dynastyRes, redraftRes] = await Promise.all([
    fetch(dynastyUrl),
    fetch(redraftUrl),
  ]);

  if (!dynastyRes.ok) throw new Error(`FantasyCalc dynasty ${dynastyRes.status}`);
  const dynastyData = await dynastyRes.json();

  let redraftMap: Record<string, number> = {};
  if (redraftRes.ok) {
    const redraftData = await redraftRes.json();
    for (const p of redraftData) {
      if (p.player?.name) redraftMap[p.player.name] = p.value;
    }
  }

  return dynastyData
    .filter((p: Record<string, unknown>) => (p.player as Record<string, unknown>)?.name)
    .map((p: Record<string, unknown>) => {
      const player = p.player as Record<string, unknown>;
      return {
        name:         player.name as string,
        pos:          (player.position as string)?.toUpperCase(),
        team:         (player.maybeTeam as string) ?? "FA",
        age:          player.maybeAge ? Math.round(player.maybeAge as number) : null,
        value:        p.value as number,
        rank:         p.overallRank as number,
        posRank:      p.positionRank as number,
        trend30:      (p.trend30Day as number) ?? 0,
        redraftValue: redraftMap[player.name as string] ?? 0,
        redraftRank:  0,
      };
    })
    .sort((a: FCPlayer, b: FCPlayer) => a.rank - b.rank);
}

// ── Trend badge ───────────────────────────────────────────────────────────────
function TrendBadge({ val }: { val: number }) {
  if (Math.abs(val) < 20) return <span className="text-slate-500 text-xs">—</span>;
  const up = val > 0;
  return (
    <span className={`text-xs font-bold ${up ? "text-green-400" : "text-red-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(val))}
    </span>
  );
}

// ── Player row ────────────────────────────────────────────────────────────────
function PlayerRow({ p, i }: { p: FCPlayer; i: number }) {
  const curve = ageCurveLabel(p.pos, p.age);
  const signal = buySignal(p);
  const dynastyDelta = p.redraftValue ? Math.round(p.value - p.redraftValue) : null;

  return (
    <div className="grid grid-cols-[40px_1fr_60px_60px_80px_80px_80px_90px] gap-2 items-center py-2 px-4 border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
      <span className="text-slate-500 text-sm text-right">{i + 1}</span>
      <div className="min-w-0">
        <div className="text-slate-100 text-sm font-medium truncate">{p.name}</div>
        <div className="text-slate-500 text-xs">{p.team} · {p.age ? `Age ${p.age}` : "—"}</div>
      </div>
      <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded border text-xs font-bold ${POS_COLOR[p.pos] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>
        {p.pos}
      </span>
      <span className="text-slate-300 text-sm font-bold text-right">{p.value.toLocaleString()}</span>
      <span className={`text-xs text-right ${curve.color}`}>{curve.label}</span>
      <TrendBadge val={p.trend30} />
      {dynastyDelta !== null ? (
        <span className={`text-xs font-semibold text-right ${dynastyDelta > 0 ? "text-green-400" : dynastyDelta < 0 ? "text-red-400" : "text-slate-500"}`}>
          {dynastyDelta > 0 ? "+" : ""}{dynastyDelta.toLocaleString()}
        </span>
      ) : <span className="text-slate-600 text-xs text-right">—</span>}
      {signal ? (
        <span className={`inline-flex items-center gap-1 text-xs font-semibold justify-end ${signal.color}`}>
          {signal.icon} {signal.signal}
        </span>
      ) : <span />}
    </div>
  );
}

// ── Rookie tier card ──────────────────────────────────────────────────────────
const ROOKIE_TIERS = [
  { label: "Tier 1 — Instant Starters", range: [1, 12],  color: "text-green-400",  bg: "border-green-700/40" },
  { label: "Tier 2 — Year 2 Breakouts", range: [13, 36], color: "text-blue-400",   bg: "border-blue-700/40"  },
  { label: "Tier 3 — Developmental",    range: [37, 72], color: "text-yellow-400", bg: "border-yellow-700/40"},
  { label: "Tier 4 — Deep Stashes",     range: [73, 999],color: "text-slate-400",  bg: "border-slate-700/40" },
];

function RookieSection({ players }: { players: FCPlayer[] }) {
  // Rookies: age ≤ 23 and low redraft value relative to dynasty value
  const rookies = players.filter(p => p.age !== null && p.age <= 23 && p.rank <= 200);
  if (!rookies.length) return null;

  return (
    <Card className="bg-slate-900/60 border-slate-700/50 mb-5">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-400" />
          <h3 className="text-slate-100 font-semibold">2026 Rookie Class</h3>
          <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">{rookies.length} players</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ROOKIE_TIERS.map(tier => {
          const tierRookies = rookies.filter(p => p.rank >= tier.range[0] && p.rank <= tier.range[1]);
          if (!tierRookies.length) return null;
          return (
            <div key={tier.label}>
              <div className={`text-xs font-bold mb-2 ${tier.color}`}>{tier.label}</div>
              <div className="flex flex-wrap gap-2">
                {tierRookies.map(p => (
                  <div key={p.name} className={`flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2.5 py-1.5 border ${tier.bg}`}>
                    <span className={`text-xs font-bold px-1 py-0.5 rounded ${POS_COLOR[p.pos] ?? "bg-slate-700 text-slate-300"}`}>{p.pos}</span>
                    <span className="text-slate-200 text-xs font-medium">{p.name}</span>
                    <span className="text-slate-500 text-xs">{p.team}</span>
                    <span className={`text-xs font-bold ${tier.color}`}>{p.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DynastyValues() {
  const [qbFormat, setQbFormat] = useState<"1qb" | "sf">("1qb");
  const [pprFormat, setPprFormat] = useState<"ppr" | "half" | "std">("half");
  const [posFilter, setPosFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"rankings" | "buysell" | "rookies">("rankings");
  const [players, setPlayers] = useState<FCPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const numQbs = qbFormat === "sf" ? 2 : 1;
  const pprVal = pprFormat === "ppr" ? 1 : pprFormat === "half" ? 0.5 : 0;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchDynastyValues(numQbs, pprVal);
      setPlayers(data);
    } catch (e) {
      setError(`Could not load dynasty values: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [numQbs, pprVal]);

  useEffect(() => { load(); }, [load]);

  const filtered = players.filter(p => {
    const matchPos = posFilter === "ALL" || p.pos === posFilter;
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.team.toLowerCase().includes(search.toLowerCase());
    return matchPos && matchSearch;
  });

  const buySell = players.filter(p => buySignal(p) !== null);

  return (
    <AppLayout title="Dynasty Values" subtitle="Live dynasty player values powered by FantasyCalc — updated daily">

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex rounded-lg border border-slate-700 overflow-hidden">
          {(["1qb","sf"] as const).map(f => (
            <button key={f} onClick={() => setQbFormat(f)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${qbFormat === f ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {f === "1qb" ? "1QB" : "Superflex"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-slate-700 overflow-hidden">
          {(["ppr","half","std"] as const).map(f => (
            <button key={f} onClick={() => setPprFormat(f)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${pprFormat === f ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {f === "ppr" ? "PPR" : f === "half" ? "Half-PPR" : "Standard"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-slate-700 overflow-hidden">
          {["ALL","QB","RB","WR","TE"].map(p => (
            <button key={p} onClick={() => setPosFilter(p)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${posFilter === p ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {p}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input placeholder="Search player or team..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500" />
        </div>
        {loading && <span className="text-slate-500 text-xs self-center">Loading live data...</span>}
        {error && <span className="text-red-400 text-xs self-center">{error}</span>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-5">
        {([["rankings","Rankings"], ["buysell","Buy/Sell Board"], ["rookies","Rookie Class"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id ? "border-green-500 text-green-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Rankings Tab */}
      {tab === "rankings" && (
        <Card className="bg-slate-900/60 border-slate-700/50">
          {/* Header */}
          <div className="grid grid-cols-[40px_1fr_60px_60px_80px_80px_80px_90px] gap-2 px-4 py-2 border-b border-slate-700/50">
            {["#","Player","POS","Value","Age Curve","Trend 30d","Dyn-Rdft","Signal"].map(h => (
              <span key={h} className="text-slate-500 text-xs font-semibold uppercase tracking-wide">{h}</span>
            ))}
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({length:12}).map((_,i) => <Skeleton key={i} className="h-10 bg-slate-800/50" />)}
            </div>
          ) : (
            <div>
              {filtered.slice(0, 200).map((p, i) => <PlayerRow key={p.name} p={p} i={i} />)}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-slate-500">No players found.</div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Buy/Sell Tab */}
      {tab === "buysell" && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { title: "Buy Window", signals: ["Rising Buy","Buy Window"], icon: <TrendingUp className="w-4 h-4 text-green-400" />, color: "text-green-400", border: "border-green-700/40" },
            { title: "Sell High / Avoid", signals: ["Sell High","Falling"], icon: <TrendingDown className="w-4 h-4 text-red-400" />, color: "text-red-400", border: "border-red-700/40" },
          ].map(col => (
            <Card key={col.title} className={`bg-slate-900/60 border-slate-700/50`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {col.icon}
                  <h3 className={`font-semibold ${col.color}`}>{col.title}</h3>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {buySell.filter(p => col.signals.includes(buySignal(p)!.signal)).slice(0,20).map(p => {
                  const sig = buySignal(p)!;
                  const curve = ageCurveLabel(p.pos, p.age);
                  return (
                    <div key={p.name} className={`flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2 border ${col.border}`}>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${POS_COLOR[p.pos] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>{p.pos}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-100 text-sm font-medium truncate">{p.name}</div>
                        <div className="text-slate-500 text-xs">{p.team} · {p.age ? `Age ${p.age}` : "—"} · <span className={curve.color}>{curve.label}</span></div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-slate-200 text-sm font-bold">{p.value.toLocaleString()}</div>
                        <div className={`text-xs ${sig.color}`}>{sig.signal}</div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rookie Tab */}
      {tab === "rookies" && !loading && <RookieSection players={players} />}

      <div className="mt-4 text-xs text-slate-600 text-center">
        Dynasty values live from FantasyCalc · Updates daily · {players.length} players loaded
      </div>
    </AppLayout>
  );
}
