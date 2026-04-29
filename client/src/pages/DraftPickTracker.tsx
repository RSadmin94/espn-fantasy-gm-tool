import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────
const TEAMS = 14;
const ROUNDS = 15;
const BASE = 3000;
const K = 0.028;
const DRAFT_YEAR = 2026;

function calcValue(round: number, pickInRound: number): number {
  const overall = (round - 1) * TEAMS + (round % 2 === 1 ? pickInRound : TEAMS + 1 - pickInRound);
  return Math.round(BASE * Math.exp(-K * (overall - 1)));
}

function pickLabel(round: number, pickInRound: number): string {
  return `${round}.${String(pickInRound).padStart(2, "0")}`;
}

function valueColor(value: number) {
  if (value >= 2000) return "text-red-400";
  if (value >= 1000) return "text-orange-400";
  if (value >= 500) return "text-yellow-400";
  if (value >= 200) return "text-blue-400";
  return "text-slate-400";
}

const LEAGUE_TEAMS = [
  "Roderick Sellers", "Tony Dorsey", "Nate West", "LOZELL STYLES",
  "Bruce Edwards", "Mark DeRoux", "Randy Broner", "Marcus Reese",
  "Team 9", "Team 10", "Team 11", "Team 12", "Team 13", "Team 14",
];

// ── Add Trade Form ─────────────────────────────────────────────────────────────
function AddTradeForm({ onSuccess }: { onSuccess: () => void }) {
  const [type, setType] = useState<"acquired" | "traded_away">("acquired");
  const [round, setRound] = useState("1");
  const [pickInRound, setPickInRound] = useState("1");
  const [counterparty, setCounterparty] = useState(LEAGUE_TEAMS[1]);
  const [notes, setNotes] = useState("");

  const addMutation = trpc.addPickTrade.useMutation({
    onSuccess: () => {
      toast.success(`Pick ${pickLabel(parseInt(round), parseInt(pickInRound))} logged`);
      setNotes("");
      onSuccess();
    },
    onError: (err) => toast.error(`Failed to log trade: ${err.message}`),
  });

  const picksForRound = useMemo(() => {
    const r = parseInt(round);
    return Array.from({ length: TEAMS }, (_, i) => {
      const pir = i + 1;
      return { pir, label: pickLabel(r, pir), value: calcValue(r, pir) };
    }).sort((a, b) => a.pir - b.pir);
  }, [round]);

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Log a Pick Trade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Type toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setType("acquired")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              type === "acquired"
                ? "bg-emerald-700/40 border-emerald-600/60 text-emerald-300"
                : "bg-slate-800/40 border-slate-700/40 text-slate-500 hover:text-slate-300"
            }`}
          >
            ↓ Pick Acquired
          </button>
          <button
            onClick={() => setType("traded_away")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              type === "traded_away"
                ? "bg-red-700/40 border-red-600/60 text-red-300"
                : "bg-slate-800/40 border-slate-700/40 text-slate-500 hover:text-slate-300"
            }`}
          >
            ↑ Pick Traded Away
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-500 mb-1">Round</div>
            <Select value={round} onValueChange={setRound}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: ROUNDS }, (_, i) => i + 1).map((r) => (
                  <SelectItem key={r} value={String(r)}>Round {r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Pick Position</div>
            <Select value={pickInRound} onValueChange={setPickInRound}>
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {picksForRound.map((p) => (
                  <SelectItem key={p.pir} value={String(p.pir)}>
                    {p.label} <span className="text-slate-500 ml-1">({p.value})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-1">
            {type === "acquired" ? "Acquired From" : "Traded To"}
          </div>
          <Select value={counterparty} onValueChange={setCounterparty}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAGUE_TEAMS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-1">Notes (optional)</div>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Part of the Davante Adams trade package"
            className="h-9 bg-slate-800 border-slate-700 text-sm"
          />
        </div>

        <Button
          onClick={() =>
            addMutation.mutate({
              draftYear: DRAFT_YEAR,
              type,
              round: parseInt(round),
              pickInRound: parseInt(pickInRound),
              counterparty,
              notes: notes.trim() || undefined,
            })
          }
          disabled={addMutation.isPending}
          className={`w-full ${type === "acquired" ? "bg-emerald-700 hover:bg-emerald-600" : "bg-red-700 hover:bg-red-600"} text-white`}
        >
          {addMutation.isPending ? "Logging..." : type === "acquired" ? "Log Acquired Pick" : "Log Traded Away Pick"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Pick Row ──────────────────────────────────────────────────────────────────
function PickRow({
  trade,
  onRemove,
  removing,
}: {
  trade: { id: number; type: string; label: string; pickValue: number; counterparty: string; notes: string | null; round: number; pickInRound: number };
  onRemove: (id: number) => void;
  removing: boolean;
}) {
  const isAcquired = trade.type === "acquired";
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${isAcquired ? "bg-emerald-950/20 border-emerald-700/30" : "bg-red-950/20 border-red-700/30"}`}>
      <span className={`text-xs font-bold ${isAcquired ? "text-emerald-400" : "text-red-400"}`}>
        {isAcquired ? "↓" : "↑"}
      </span>
      <span className="text-white font-bold text-sm w-12">{trade.label}</span>
      <span className={`text-xs font-semibold ${valueColor(trade.pickValue)}`}>{trade.pickValue} pts</span>
      <span className="text-slate-500 text-xs">{isAcquired ? "from" : "to"} {trade.counterparty}</span>
      {trade.notes && <span className="text-slate-600 text-xs italic ml-1 truncate max-w-[120px]">{trade.notes}</span>}
      <button
        onClick={() => onRemove(trade.id)}
        disabled={removing}
        className="text-slate-600 hover:text-red-400 text-xs ml-auto flex-shrink-0 disabled:opacity-40"
      >
        ✕
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DraftPickTracker() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.getPickTrades.useQuery({ draftYear: DRAFT_YEAR });
  const [removingId, setRemovingId] = useState<number | null>(null);

  const removeMutation = trpc.removePickTrade.useMutation({
    onMutate: ({ id }) => setRemovingId(id),
    onSuccess: () => {
      toast.success("Pick trade removed");
      utils.getPickTrades.invalidate();
      setRemovingId(null);
    },
    onError: (err) => {
      toast.error(`Failed to remove: ${err.message}`);
      setRemovingId(null);
    },
  });

  const trades = data?.trades ?? [];
  const acquired = useMemo(() => trades.filter((t) => t.type === "acquired"), [trades]);
  const tradedAway = useMemo(() => trades.filter((t) => t.type === "traded_away"), [trades]);
  const acquiredValue = data?.acquiredValue ?? 0;
  const tradedValue = data?.tradedValue ?? 0;
  const netValue = data?.netValue ?? 0;

  // Group by round for board view
  const activeRounds = useMemo(() => {
    const rounds = new Set(trades.map((t) => t.round));
    return Array.from(rounds).sort((a, b) => a - b);
  }, [trades]);

  const byRound = useMemo(() => {
    const map: Record<number, typeof trades> = {};
    for (const t of trades) {
      if (!map[t.round]) map[t.round] = [];
      map[t.round].push(t);
    }
    return map;
  }, [trades]);

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Draft Pick Trade Tracker</h1>
            <Badge className="bg-purple-600/30 text-purple-300 border-purple-500/50 text-xs">2026 Draft</Badge>
          </div>
          <p className="text-sm text-slate-400">
            Track every pick you've acquired or traded away. Your live portfolio heading into Aug 29.
            All trades are saved to the server and shared across devices.
          </p>
        </div>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-emerald-950/20 border-emerald-700/30">
            <CardContent className="pt-5 pb-4">
              <div className="text-xs text-emerald-400 uppercase tracking-wide mb-1">Picks Acquired</div>
              <div className="text-3xl font-black text-emerald-300">{acquired.length}</div>
              <div className="text-xs text-slate-500 mt-1">{acquiredValue.toLocaleString()} total pts</div>
            </CardContent>
          </Card>
          <Card className={`border ${netValue >= 0 ? "bg-blue-950/20 border-blue-700/30" : "bg-red-950/20 border-red-700/30"}`}>
            <CardContent className="pt-5 pb-4">
              <div className={`text-xs uppercase tracking-wide mb-1 ${netValue >= 0 ? "text-blue-400" : "text-red-400"}`}>Net Portfolio Value</div>
              <div className={`text-3xl font-black ${netValue >= 0 ? "text-blue-300" : "text-red-300"}`}>
                {netValue >= 0 ? "+" : ""}{netValue.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {netValue > 0 ? "Ahead on value" : netValue < 0 ? "Behind on value" : "Even"}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-950/20 border-red-700/30">
            <CardContent className="pt-5 pb-4">
              <div className="text-xs text-red-400 uppercase tracking-wide mb-1">Picks Traded Away</div>
              <div className="text-3xl font-black text-red-300">{tradedAway.length}</div>
              <div className="text-xs text-slate-500 mt-1">{tradedValue.toLocaleString()} total pts</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-6">
          {/* Left: Board + Log */}
          <div className="space-y-5">
            <Tabs defaultValue="board">
              <TabsList className="bg-slate-800/60 border border-slate-700/40">
                <TabsTrigger value="board" className="data-[state=active]:bg-slate-700">Pick Board</TabsTrigger>
                <TabsTrigger value="acquired" className="data-[state=active]:bg-slate-700">
                  Acquired ({acquired.length})
                </TabsTrigger>
                <TabsTrigger value="traded" className="data-[state=active]:bg-slate-700">
                  Traded Away ({tradedAway.length})
                </TabsTrigger>
              </TabsList>

              {/* Board view */}
              <TabsContent value="board" className="mt-4 space-y-3">
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                  </div>
                ) : trades.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 text-sm">
                    <div className="text-3xl mb-3">📋</div>
                    <div className="font-medium">No pick trades logged yet</div>
                    <div className="text-xs mt-1">Use the form on the right to log your first trade</div>
                  </div>
                ) : (
                  activeRounds.map((r) => (
                    <div key={r} className="bg-slate-900/40 border border-slate-700/40 rounded-xl p-4">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Round {r}</div>
                      <div className="space-y-2">
                        {(byRound[r] ?? [])
                          .sort((a, b) => a.pickInRound - b.pickInRound)
                          .map((t) => (
                            <PickRow
                              key={t.id}
                              trade={t}
                              onRemove={(id) => removeMutation.mutate({ id })}
                              removing={removingId === t.id}
                            />
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* Acquired list */}
              <TabsContent value="acquired" className="mt-4">
                {isLoading ? (
                  <Skeleton className="h-48 rounded-xl" />
                ) : acquired.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">No picks acquired yet</div>
                ) : (
                  <div className="space-y-2">
                    {acquired
                      .sort((a, b) => a.round - b.round || a.pickInRound - b.pickInRound)
                      .map((t) => (
                        <PickRow
                          key={t.id}
                          trade={t}
                          onRemove={(id) => removeMutation.mutate({ id })}
                          removing={removingId === t.id}
                        />
                      ))}
                  </div>
                )}
              </TabsContent>

              {/* Traded away list */}
              <TabsContent value="traded" className="mt-4">
                {isLoading ? (
                  <Skeleton className="h-48 rounded-xl" />
                ) : tradedAway.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">No picks traded away yet</div>
                ) : (
                  <div className="space-y-2">
                    {tradedAway
                      .sort((a, b) => a.round - b.round || a.pickInRound - b.pickInRound)
                      .map((t) => (
                        <PickRow
                          key={t.id}
                          trade={t}
                          onRemove={(id) => removeMutation.mutate({ id })}
                          removing={removingId === t.id}
                        />
                      ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Add form + legend */}
          <div className="space-y-4">
            <AddTradeForm onSuccess={() => utils.getPickTrades.invalidate()} />

            {/* Value legend */}
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Value Tiers</div>
                {[
                  { label: "Elite", range: "≥ 2,000 pts", color: "text-red-400", desc: "Rounds 1–2 early" },
                  { label: "Premium", range: "1,000–1,999", color: "text-orange-400", desc: "Rounds 2–3" },
                  { label: "Solid", range: "500–999", color: "text-yellow-400", desc: "Rounds 3–5" },
                  { label: "Value", range: "200–499", color: "text-blue-400", desc: "Rounds 5–8" },
                  { label: "Filler", range: "< 200 pts", color: "text-slate-400", desc: "Rounds 9+" },
                ].map((tier) => (
                  <div key={tier.label} className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${tier.color}`}>{tier.label}</span>
                    <span className="text-slate-500">{tier.range}</span>
                    <span className="text-slate-600">{tier.desc}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
