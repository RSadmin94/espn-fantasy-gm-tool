import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeftRight, Plus, X, Brain, Scale, Loader2, TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

const POS_MAP: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "D/ST": "text-purple-400 border-purple-500/30 bg-purple-500/10",
  K: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  Pick: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
};

interface PlayerEntry {
  playerId: number;
  playerName: string;
  position: string;
  avgPoints: number;
  teamId: number;
}
interface PickEntry { round: number; pick: number; label: string; }

interface TradeResult {
  sideAValues: ValueResult[];
  sideBValues: ValueResult[];
  totalA: number;
  totalB: number;
  pickValueA: number;
  pickValueB: number;
  ratio: number;
  fairnessGrade: string;
  aiVerdict: string;
  mathSummary: string;
  teamANeeds: Record<string, number>;
  teamBNeeds: Record<string, number>;
}

interface ValueResult {
  name: string;
  position: string;
  avgPoints: number;
  vorp: number;
  rosValue: number;
  keeperBonus: number;
  positionalScarcityBonus: number;
  compositeValue: number;
  valueBreakdown: string;
}

function VerdictBanner({ grade, totalA, totalB, pickValueA, pickValueB }: {
  grade: string; totalA: number; totalB: number; pickValueA: number; pickValueB: number;
}) {
  const isAWins = grade.includes("A WINS") || grade === "LOPSIDED" && totalA > totalB;
  const isBWins = grade.includes("B WINS") || grade === "LOPSIDED" && totalB > totalA;
  const isFair = grade === "FAIR";
  const diff = Math.abs(totalA - totalB);
  const pct = totalB > 0 ? Math.round(Math.abs((totalA - totalB) / totalB) * 100) : 0;

  const color = isFair
    ? "border-blue-500/30 bg-blue-500/10"
    : isAWins
    ? "border-emerald-500/30 bg-emerald-500/10"
    : "border-red-500/30 bg-red-500/10";

  const icon = isFair
    ? <Scale className="w-5 h-5 text-blue-400" />
    : isAWins
    ? <TrendingUp className="w-5 h-5 text-emerald-400" />
    : <TrendingDown className="w-5 h-5 text-red-400" />;

  const label = isFair ? "Fair trade" : isAWins ? "Team A wins" : "Team B wins";
  const labelColor = isFair ? "text-blue-400" : isAWins ? "text-emerald-400" : "text-red-400";

  return (
    <div className={`rounded-xl border p-4 ${color} flex items-center justify-between flex-wrap gap-4`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className={`text-xl font-bold ${labelColor}`}>{label}</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {grade} · {pct}% value gap · Δ{diff.toLocaleString()} pts
          </div>
        </div>
      </div>
      <div className="flex gap-6">
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Side A value</div>
          <div className={`text-2xl font-bold ${isAWins ? "text-emerald-400" : "text-foreground"}`}>
            {(totalA + pickValueA).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center text-muted-foreground text-sm">vs</div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Side B value</div>
          <div className={`text-2xl font-bold ${isBWins ? "text-emerald-400" : "text-foreground"}`}>
            {(totalB + pickValueB).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function ValueBar({ value, maxValue, color }: { value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.min(100, Math.round((value / maxValue) * 100)) : 0;
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PlayerValueCard({ val, maxVal, isReceiving }: { val: ValueResult; maxVal: number; isReceiving: boolean }) {
  const posColor = POS_COLORS[val.position] || POS_COLORS["QB"];
  const accentColor = isReceiving ? "text-emerald-400" : "text-red-400";
  const barColor = isReceiving ? "bg-emerald-500" : "bg-red-500";

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className={`text-[10px] shrink-0 ${posColor}`}>{val.position}</Badge>
          <span className="font-medium text-sm truncate">{val.name}</span>
        </div>
        <span className={`text-lg font-bold shrink-0 ${accentColor}`}>{val.compositeValue.toLocaleString()}</span>
      </div>
      <ValueBar value={val.compositeValue} maxValue={maxVal} color={barColor} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        <span>ROS value <span className="text-foreground font-medium">{val.rosValue.toFixed(0)}</span></span>
        <span>VORP <span className={`font-medium ${val.vorp >= 0 ? "text-emerald-400" : "text-red-400"}`}>{val.vorp >= 0 ? "+" : ""}{val.vorp.toFixed(1)}</span></span>
        {val.keeperBonus > 0 && <span>Keeper bonus <span className="text-yellow-400 font-medium">+{val.keeperBonus}</span></span>}
        {val.positionalScarcityBonus > 0 && <span>Scarcity <span className="text-cyan-400 font-medium">+{val.positionalScarcityBonus}</span></span>}
      </div>
    </div>
  );
}

function RosterNeedsRow({ label, needs }: { label: string; needs: Record<string, number> }) {
  const positions = ["QB", "RB", "WR", "TE"];
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      {positions.map(pos => (
        <div key={pos} className="flex items-center gap-1">
          <Badge variant="outline" className={`text-[10px] ${POS_COLORS[pos] || ""}`}>{pos}</Badge>
          <span className="text-xs font-medium">{needs[pos] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

interface TeamTradePanelProps {
  label: string;
  teams: Record<string, unknown>[];
  selectedTeamId: number | undefined;
  onSelectTeam: (id: number) => void;
  players: Record<string, unknown>[];
  selected: PlayerEntry[];
  onToggle: (p: PlayerEntry) => void;
  picks: PickEntry[];
  onAddPick: (p: PickEntry) => void;
  onRemovePick: (label: string) => void;
}

function TeamTradePanel({
  label, teams, selectedTeamId, onSelectTeam, players, selected, onToggle, picks, onAddPick, onRemovePick
}: TeamTradePanelProps) {
  const [pickRound, setPickRound] = useState("1");
  const [pickNum, setPickNum] = useState("7");

  const addPick = () => {
    const r = parseInt(pickRound);
    const p = parseInt(pickNum);
    if (isNaN(r) || isNaN(p) || r < 1 || r > 14 || p < 1 || p > 14) return;
    const lbl = `${r}.${String(p).padStart(2, "0")}`;
    if (!picks.find(pk => pk.label === lbl)) onAddPick({ round: r, pick: p, label: lbl });
  };

  return (
    <Card className="card-glow bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={selectedTeamId?.toString() || ""} onValueChange={v => onSelectTeam(parseInt(v))}>
          <SelectTrigger className="w-full text-sm border-border bg-input">
            <SelectValue placeholder="Select team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => (
              <SelectItem key={String(t.teamId)} value={String(t.teamId)}>
                {String(t.teamName || t.abbrev)} — {String(t.owners || "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Selected players */}
        {selected.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground font-medium">Selected players</div>
            {selected.map(p => (
              <div key={p.playerId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-accent/20 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${POS_COLORS[p.position] || ""}`}>{p.position}</Badge>
                  <span className="text-sm font-medium truncate">{p.playerName}</span>
                  <span className="text-xs text-muted-foreground">{p.avgPoints.toFixed(1)} ppg</span>
                </div>
                <button onClick={() => onToggle(p)} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Selected picks */}
        {picks.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground font-medium">Draft picks</div>
            {picks.map(pk => (
              <div key={pk.label} className="flex items-center justify-between gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 bg-cyan-500/10">Pick</Badge>
                  <span className="text-sm font-medium text-cyan-300">Round {pk.label}</span>
                </div>
                <button onClick={() => onRemovePick(pk.label)} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add pick */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground shrink-0">Add pick</span>
          <Select value={pickRound} onValueChange={setPickRound}>
            <SelectTrigger className="w-20 h-8 text-xs border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 14 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>Rd {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pickNum} onValueChange={setPickNum}>
            <SelectTrigger className="w-20 h-8 text-xs border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 14 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>Pick {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={addPick} className="h-8 text-xs px-2 border-border">
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </div>

        {/* Player roster */}
        {selectedTeamId && players.length === 0 && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        )}
        {players.length > 0 && (
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            <div className="text-xs text-muted-foreground font-medium">Roster — click to add</div>
            {players.map(p => {
              const player = p as Record<string, unknown>;
              const pos = POS_MAP[player.defaultPositionId as number] || "?";
              const pid = player.playerId as number;
              const isSelected = selected.some(s => s.playerId === pid);
              return (
                <button
                  key={pid}
                  onClick={() => onToggle({
                    playerId: pid,
                    playerName: String(player.playerName || player.fullName || ""),
                    position: pos,
                    avgPoints: (player.appliedAverage as number) || (player.avgPoints as number) || 0,
                    teamId: player.teamId as number,
                  })}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-accent/10 hover:bg-accent/30"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${POS_COLORS[pos] || ""}`}>{pos}</Badge>
                    <span className="text-sm truncate">{String(player.playerName || player.fullName || "")}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{((player.appliedAverage as number) || 0).toFixed(1)}</span>
                    {isSelected ? <Minus className="w-3 h-3 text-primary" /> : <Plus className="w-3 h-3 text-muted-foreground" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TradeAnalyzer() {
  const [season, setSeason] = useState(2025);
  const [teamA, setTeamA] = useState<number | undefined>(undefined);
  const [teamB, setTeamB] = useState<number | undefined>(undefined);
  const [sideA, setSideA] = useState<PlayerEntry[]>([]);
  const [sideB, setSideB] = useState<PlayerEntry[]>([]);
  const [picksA, setPicksA] = useState<PickEntry[]>([]);
  const [picksB, setPicksB] = useState<PickEntry[]>([]);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [loading, setLoading] = useState(false);

  const { isAuthenticated } = useAuth();
  const { data: teams } = trpc.espn.teams.useQuery({ season });
  const { data: rostersA } = trpc.espn.rosters.useQuery({ season, teamId: teamA! }, { enabled: teamA !== undefined });
  const { data: rostersB } = trpc.espn.rosters.useQuery({ season, teamId: teamB! }, { enabled: teamB !== undefined });
  const tradeAnalyzeMutation = trpc.tradeAnalyze.useMutation();

  const teamList = (teams as Record<string, unknown>[]) || [];
  const playersA = (rostersA as Record<string, unknown>[]) || [];
  const playersB = (rostersB as Record<string, unknown>[]) || [];

  const togglePlayer = (player: PlayerEntry, side: "A" | "B") => {
    const setter = side === "A" ? setSideA : setSideB;
    const current = side === "A" ? sideA : sideB;
    const exists = current.find(p => p.playerId === player.playerId);
    setter(exists ? current.filter(p => p.playerId !== player.playerId) : [...current, player]);
  };

  const clearAll = () => {
    setSideA([]); setSideB([]);
    setPicksA([]); setPicksB([]);
    setResult(null);
  };

  const canAnalyze = (sideA.length > 0 || picksA.length > 0) && (sideB.length > 0 || picksB.length > 0) && teamA !== undefined && teamB !== undefined;

  const analyzeTrade = async () => {
    if (!isAuthenticated) { window.location.href = getLoginUrl(); return; }
    if (!canAnalyze) { toast.error("Select at least one player or pick from each side, and choose both teams"); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await tradeAnalyzeMutation.mutateAsync({
        season,
        sideA,
        sideB,
        teamAId: teamA!,
        teamBId: teamB!,
        picksA: picksA.map(p => ({ round: p.round, pick: p.pick })),
        picksB: picksB.map(p => ({ round: p.round, pick: p.pick })),
      });
      setResult(res as unknown as TradeResult);
    } catch (e) {
      toast.error("Trade analysis failed. Make sure ESPN data is synced for this season.");
    } finally {
      setLoading(false);
    }
  };

  const maxVal = result
    ? Math.max(
        ...result.sideAValues.map(v => v.compositeValue),
        ...result.sideBValues.map(v => v.compositeValue),
        result.pickValueA, result.pickValueB, 1
      )
    : 1;

  return (
    <AppLayout title="Trade Analyzer" subtitle="Math-first trade evaluation — VORP, ROS value, keeper bonus, positional scarcity">
      <div className="p-6 space-y-6">

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <SeasonSelector value={season} onChange={s => { setSeason(s); setTeamA(undefined); setTeamB(undefined); clearAll(); }} />
          <div className="ml-auto flex items-center gap-2">
            {(sideA.length > 0 || sideB.length > 0 || picksA.length > 0 || picksB.length > 0) && (
              <Button variant="outline" size="sm" onClick={clearAll} className="text-xs border-border">
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>

        {/* How it works */}
        <Card className="card-glow bg-card border-border border-blue-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
              {[
                ["VORP", "Value over replacement player — how irreplaceable are they?"],
                ["ROS value", "Rest-of-season projected total, injury-adjusted"],
                ["Keeper bonus", "Extra value if player is a cheap keeper deal"],
                ["Scarcity", "Position depth bonus for scarce positions (RB > WR > TE)"],
              ].map(([label, desc]) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="font-semibold text-foreground shrink-0">{label}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Team panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TeamTradePanel
            label="Side A — gives"
            teams={teamList}
            selectedTeamId={teamA}
            onSelectTeam={id => { setTeamA(id); setSideA([]); setPicksA([]); }}
            players={playersA}
            selected={sideA}
            onToggle={p => togglePlayer(p, "A")}
            picks={picksA}
            onAddPick={p => setPicksA(prev => [...prev, p])}
            onRemovePick={lbl => setPicksA(prev => prev.filter(p => p.label !== lbl))}
          />
          <TeamTradePanel
            label="Side B — gives"
            teams={teamList}
            selectedTeamId={teamB}
            onSelectTeam={id => { setTeamB(id); setSideB([]); setPicksB([]); }}
            players={playersB}
            selected={sideB}
            onToggle={p => togglePlayer(p, "B")}
            picks={picksB}
            onAddPick={p => setPicksB(prev => [...prev, p])}
            onRemovePick={lbl => setPicksB(prev => prev.filter(p => p.label !== lbl))}
          />
        </div>

        {/* Analyze button */}
        <Button
          className="w-full espn-gradient text-white font-semibold h-12 text-base disabled:opacity-50"
          onClick={analyzeTrade}
          disabled={!canAnalyze || loading}
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Running math analysis...</>
          ) : (
            <><Scale className="w-5 h-5 mr-2" /> Analyze trade — show me the math</>
          )}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-6">

            {/* Verdict banner */}
            <VerdictBanner
              grade={result.fairnessGrade}
              totalA={result.totalA}
              totalB={result.totalB}
              pickValueA={result.pickValueA}
              pickValueB={result.pickValueB}
            />

            {/* Value breakdown — side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Side A receives — {(result.totalA + result.pickValueA).toLocaleString()} total
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.sideBValues.map((val, i) => (
                    <PlayerValueCard key={i} val={val} maxVal={maxVal} isReceiving={true} />
                  ))}
                  {result.pickValueB > 0 && (
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 bg-transparent">Picks</Badge>
                        <span className="text-sm font-medium text-cyan-300">
                          {picksB.map(p => p.label).join(", ")}
                        </span>
                      </div>
                      <span className="text-lg font-bold text-cyan-400">{result.pickValueB.toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Side B receives — {(result.totalB + result.pickValueB).toLocaleString()} total
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.sideAValues.map((val, i) => (
                    <PlayerValueCard key={i} val={val} maxVal={maxVal} isReceiving={false} />
                  ))}
                  {result.pickValueA > 0 && (
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 bg-transparent">Picks</Badge>
                        <span className="text-sm font-medium text-cyan-300">
                          {picksA.map(p => p.label).join(", ")}
                        </span>
                      </div>
                      <span className="text-lg font-bold text-cyan-400">{result.pickValueA.toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Math scorecard */}
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-4 h-4" /> Math scorecard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Value bar comparison */}
                {[
                  { label: "Composite value", a: result.totalA + result.pickValueA, b: result.totalB + result.pickValueB },
                  { label: "Player value only", a: result.totalA, b: result.totalB },
                  { label: "Pick value", a: result.pickValueA, b: result.pickValueB },
                  { label: "VORP total", a: result.sideAValues.reduce((s, v) => s + v.vorp, 0), b: result.sideBValues.reduce((s, v) => s + v.vorp, 0) },
                  { label: "ROS value total", a: result.sideAValues.reduce((s, v) => s + v.rosValue, 0), b: result.sideBValues.reduce((s, v) => s + v.rosValue, 0) },
                  { label: "Keeper bonus total", a: result.sideAValues.reduce((s, v) => s + v.keeperBonus, 0), b: result.sideBValues.reduce((s, v) => s + v.keeperBonus, 0) },
                ].map(({ label, a, b }) => {
                  const max = Math.max(a, b, 1);
                  const pctA = Math.round((a / max) * 100);
                  const pctB = Math.round((b / max) * 100);
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{label}</span>
                        <span className="text-foreground font-medium">{a.toLocaleString()} vs {b.toLocaleString()}</span>
                      </div>
                      <div className="flex gap-1 h-2">
                        <div className="flex-1 bg-muted rounded-l overflow-hidden flex justify-end">
                          <div className="h-full bg-emerald-500 rounded-l" style={{ width: `${pctA}%` }} />
                        </div>
                        <div className="w-px bg-border" />
                        <div className="flex-1 bg-muted rounded-r overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-r" style={{ width: `${pctB}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Roster needs */}
                <div className="pt-2 border-t border-border space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Roster depth</div>
                  <RosterNeedsRow label="Team A" needs={result.teamANeeds} />
                  <RosterNeedsRow label="Team B" needs={result.teamBNeeds} />
                </div>

                {/* Legend */}
                <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-emerald-500 inline-block" /> Side A</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-500 inline-block" /> Side B</span>
                </div>
              </CardContent>
            </Card>

            {/* AI verdict */}
            <Card className="card-glow bg-card border-border border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" /> AI verdict — explains the math
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {result.aiVerdict}
                </div>
              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </AppLayout>
  );
}
