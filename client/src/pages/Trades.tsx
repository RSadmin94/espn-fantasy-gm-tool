import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamRow {
  teamId: number;
  teamName: string;
  owners?: string;
}

interface RosterEntry {
  teamId: number;
  playerId?: number;
  playerName?: string;
  position?: string;
  lineupSlot?: string;
  appliedAverage?: number | null;
  appliedTotal?: number | null;
  injuryStatus?: string;
}

interface TradePlayer {
  playerId: number;
  playerName: string;
  position: string;
  avgPoints: number;
  teamId: number;
}

interface PlayerValue {
  playerId: number;
  name: string;
  compositeValue: number;
  valueBreakdown: string;
}

interface TradeResult {
  sideAValues: PlayerValue[];
  sideBValues: PlayerValue[];
  totalA: number;
  totalB: number;
  ratio: number;
  fairnessGrade: string;
  aiVerdict: string;
  teamANeeds: Record<string, number>;
  teamBNeeds: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADE_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  "FAIR":          { label: "Fair Trade",       className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", icon: <Scale className="h-4 w-4" /> },
  "SLIGHT EDGE A": { label: "Slight Edge: You", className: "border-blue-500/30 bg-blue-500/10 text-blue-400",         icon: <TrendingUp className="h-4 w-4" /> },
  "SLIGHT EDGE B": { label: "Slight Edge: Them",className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",  icon: <TrendingDown className="h-4 w-4" /> },
  "A WINS":        { label: "You Win",           className: "border-primary/30 bg-primary/10 text-primary",            icon: <TrendingUp className="h-4 w-4" /> },
  "B WINS":        { label: "They Win",          className: "border-red-500/30 bg-red-500/10 text-red-400",            icon: <TrendingDown className="h-4 w-4" /> },
  "LOPSIDED":      { label: "Lopsided",          className: "border-red-500/30 bg-red-500/10 text-red-400",            icon: <AlertCircle className="h-4 w-4" /> },
};

function PosBadge({ pos }: { pos: string | undefined }) {
  const colors: Record<string, string> = {
    QB: "border-red-500/30 bg-red-500/10 text-red-400",
    RB: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    WR: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    TE: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    K:  "border-purple-500/30 bg-purple-500/10 text-purple-400",
    "D/ST": "border-slate-500/30 bg-slate-500/10 text-slate-400",
  };
  return (
    <span className={cn(
      "inline-flex rounded border px-1.5 py-0 text-xs font-semibold shrink-0",
      colors[pos ?? ""] ?? "border-border bg-muted/30 text-muted-foreground"
    )}>
      {pos ?? "?"}
    </span>
  );
}

// ── Player picker panel ───────────────────────────────────────────────────────

function RosterPicker({
  label,
  teamId,
  season,
  cachedSeasons,
  teams,
  selectedPlayers,
  onTeamChange,
  onTogglePlayer,
}: {
  label: string;
  teamId: number | null;
  season: number;
  cachedSeasons: number[];
  teams: TeamRow[];
  selectedPlayers: TradePlayer[];
  onTeamChange: (id: number) => void;
  onTogglePlayer: (p: TradePlayer) => void;
}) {
  const rosterQ = trpc.espn.rosters.useQuery(
    { season, teamId: teamId ?? undefined },
    { enabled: teamId != null && cachedSeasons.includes(season) }
  );

  const players = (rosterQ.data as RosterEntry[] | undefined) ?? [];
  const selectedIds = new Set(selectedPlayers.map(p => p.playerId));

  // Filter to starters + bench (exclude IR, D/ST optionally)
  const selectable = players.filter(
    p => p.playerName && p.lineupSlot !== "IR" && p.position !== "D/ST" && p.playerId
  );

  const isSelected = (p: RosterEntry) =>
    p.playerId != null && selectedIds.has(p.playerId);

  const toggle = (p: RosterEntry) => {
    if (!p.playerId || !p.playerName) return;
    onTogglePlayer({
      playerId: p.playerId,
      playerName: p.playerName,
      position: p.position ?? "?",
      avgPoints: Number(p.appliedAverage ?? 0),
      teamId: p.teamId,
    });
  };

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </CardTitle>
        <Select
          value={teamId != null ? String(teamId) : ""}
          onValueChange={v => onTeamChange(Number(v))}
        >
          <SelectTrigger className="h-9 text-sm mt-1">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => (
              <SelectItem key={t.teamId} value={String(t.teamId)}>
                {t.teamName || `Team ${t.teamId}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent className="space-y-2 p-3 pt-0">
        {/* Selected players */}
        {selectedPlayers.length > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-xs font-medium text-foreground mb-1">
              Selected ({selectedPlayers.length})
            </p>
            {selectedPlayers.map(p => (
              <div
                key={p.playerId}
                className="flex items-center justify-between rounded border border-primary/20 bg-primary/5 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PosBadge pos={p.position} />
                  <span className="text-sm font-medium text-foreground truncate">{p.playerName}</span>
                </div>
                <button
                  onClick={() => onTogglePlayer(p)}
                  className="ml-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Roster list */}
        {teamId == null && (
          <p className="text-xs text-muted-foreground text-center py-6">Select a team above.</p>
        )}

        {rosterQ.isLoading && (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading roster…
          </div>
        )}

        {!rosterQ.isLoading && teamId != null && selectable.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No players found.</p>
        )}

        <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1">
          {selectable.map(p => {
            const sel = isSelected(p);
            return (
              <button
                key={p.playerId}
                onClick={() => toggle(p)}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-all hover:bg-accent/30",
                  sel && "bg-primary/10 hover:bg-primary/15"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PosBadge pos={p.position} />
                  <span className={cn("text-sm truncate", sel ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {p.playerName}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground font-mono">
                    {p.appliedAverage != null ? Number(p.appliedAverage).toFixed(1) : "—"}
                  </span>
                  {sel
                    ? <Minus className="h-3.5 w-3.5 text-primary" />
                    : <Plus className="h-3.5 w-3.5 text-muted-foreground/50" />}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Results display ───────────────────────────────────────────────────────────

function TradeResults({ result, teamAName, teamBName }: {
  result: TradeResult;
  teamAName: string;
  teamBName: string;
}) {
  const grade = GRADE_CONFIG[result.fairnessGrade] ?? {
    label: result.fairnessGrade,
    className: "border-border bg-muted/30 text-muted-foreground",
    icon: <Scale className="h-4 w-4" />,
  };

  const maxVal = Math.max(result.totalA, result.totalB, 1);
  const barA = Math.round((result.totalA / maxVal) * 100);
  const barB = Math.round((result.totalB / maxVal) * 100);

  return (
    <div className="space-y-4">
      {/* Grade badge */}
      <div className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-3 font-semibold",
        grade.className
      )}>
        {grade.icon}
        <span className="text-base">{grade.label}</span>
        <span className="ml-auto text-sm font-normal opacity-70">
          Ratio: {result.ratio.toFixed(2)}
        </span>
      </div>

      {/* Value comparison bars */}
      <div className="space-y-3">
        {[
          { label: teamAName, value: result.totalA, bar: barA, players: result.sideAValues },
          { label: teamBName, value: result.totalB, bar: barB, players: result.sideBValues },
        ].map(({ label, value, bar, players }) => (
          <div key={label}>
            <div className="flex items-center justify-between mb-1.5 text-sm">
              <span className="font-medium text-foreground truncate">{label}</span>
              <span className="font-mono text-foreground ml-2 shrink-0">{Math.round(value)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${bar}%` }}
              />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {players.map(pv => (
                <span key={pv.playerId} className="text-xs text-muted-foreground">
                  {pv.name}: <span className="text-foreground font-medium">{Math.round(pv.compositeValue)}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* AI verdict */}
      {result.aiVerdict && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
              {result.aiVerdict}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Positional needs */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: `${teamAName} depth`, needs: result.teamANeeds },
          { label: `${teamBName} depth`, needs: result.teamBNeeds },
        ].map(({ label, needs }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="py-3 px-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(needs).map(([pos, count]) => (
                  <span key={pos} className="text-xs">
                    <span className="font-semibold text-foreground">{pos}</span>
                    <span className="text-muted-foreground">:{count}</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Trades() {
  const allSeasonsQ = trpc.espn.allSeasons.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();
  const allSeasons: number[] = allSeasonsQ.data ?? [];
  const cachedSeasons: number[] = cachedQ.data ?? [];
  const defaultSeason = cachedSeasons.length > 0
    ? Math.max(...cachedSeasons)
    : allSeasons.length > 0 ? allSeasons[allSeasons.length - 1] : 2025;

  const [season, setSeason] = useState(defaultSeason);
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [sideA, setSideA] = useState<TradePlayer[]>([]);
  const [sideB, setSideB] = useState<TradePlayer[]>([]);
  const [result, setResult] = useState<TradeResult | null>(null);

  const teamsQ = trpc.espn.teams.useQuery(
    { season },
    { enabled: cachedSeasons.includes(season) }
  );
  const teams = (teamsQ.data as TeamRow[] | undefined) ?? [];

  const analyzeMutation = trpc.tradeAnalyze.useMutation({
    onSuccess: (data) => setResult(data as TradeResult),
  });

  const canAnalyze =
    teamAId != null && teamBId != null &&
    sideA.length > 0 && sideB.length > 0 &&
    teamAId !== teamBId;

  const teamAName = teams.find(t => t.teamId === teamAId)?.teamName ?? "Your Team";
  const teamBName = teams.find(t => t.teamId === teamBId)?.teamName ?? "Their Team";

  const handleToggleA = (p: TradePlayer) => {
    setSideA(prev =>
      prev.some(x => x.playerId === p.playerId)
        ? prev.filter(x => x.playerId !== p.playerId)
        : [...prev, p]
    );
    setResult(null);
  };
  const handleToggleB = (p: TradePlayer) => {
    setSideB(prev =>
      prev.some(x => x.playerId === p.playerId)
        ? prev.filter(x => x.playerId !== p.playerId)
        : [...prev, p]
    );
    setResult(null);
  };

  const handleAnalyze = () => {
    if (!canAnalyze || teamAId == null || teamBId == null) return;
    setResult(null);
    analyzeMutation.mutate({
      season,
      sideA,
      sideB,
      teamAId,
      teamBId,
    });
  };

  const handleReset = () => {
    setSideA([]);
    setSideB([]);
    setResult(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Trades</h1>
        <p className="mt-1 text-muted-foreground">
          Analyze trade fairness using real season data and AI evaluation.
        </p>
      </div>

      {/* Season selector */}
      <div className="flex items-center gap-3">
        <Select
          value={String(season)}
          onValueChange={v => {
            setSeason(Number(v));
            setTeamAId(null);
            setTeamBId(null);
            setSideA([]);
            setSideB([]);
            setResult(null);
          }}
        >
          <SelectTrigger className="w-32 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...allSeasons].reverse().map(s => (
              <SelectItem key={s} value={String(s)}>
                <span className="flex items-center gap-1.5">
                  {s}
                  {cachedSeasons.includes(s) && <span className="text-emerald-400 text-xs">✓</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!cachedSeasons.includes(season) && (
          <span className="text-xs text-yellow-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Season not synced
          </span>
        )}
      </div>

      {/* Two-panel player picker */}
      <div className="flex flex-col gap-4 md:flex-row">
        <RosterPicker
          label="You Give"
          teamId={teamAId}
          season={season}
          cachedSeasons={cachedSeasons}
          teams={teams}
          selectedPlayers={sideA}
          onTeamChange={id => { setTeamAId(id); setSideA([]); setResult(null); }}
          onTogglePlayer={handleToggleA}
        />

        {/* Center arrow */}
        <div className="flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <RosterPicker
          label="You Receive"
          teamId={teamBId}
          season={season}
          cachedSeasons={cachedSeasons}
          teams={teams}
          selectedPlayers={sideB}
          onTeamChange={id => { setTeamBId(id); setSideB([]); setResult(null); }}
          onTogglePlayer={handleToggleB}
        />
      </div>

      {/* Analyze button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleAnalyze}
          disabled={!canAnalyze || analyzeMutation.isPending}
          className="gap-2 font-semibold"
          size="lg"
        >
          {analyzeMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Sparkles className="h-4 w-4" />}
          {analyzeMutation.isPending ? "Analyzing…" : "Analyze Trade"}
        </Button>
        {(sideA.length > 0 || sideB.length > 0) && (
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
        )}
        {!canAnalyze && (sideA.length > 0 || sideB.length > 0) && (
          <span className="text-xs text-muted-foreground">
            {teamAId == null || teamBId == null
              ? "Select both teams first"
              : teamAId === teamBId
                ? "Teams must be different"
                : sideA.length === 0
                  ? "Select players to give"
                  : "Select players to receive"}
          </span>
        )}
      </div>

      {/* Error */}
      {analyzeMutation.isError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {analyzeMutation.error.message}
        </div>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              Trade Analysis
              <span className="text-sm font-normal text-muted-foreground">
                {teamAName} ↔ {teamBName}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TradeResults
              result={result}
              teamAName={teamAName}
              teamBName={teamBName}
            />
          </CardContent>
        </Card>
      )}

      {/* Trade offer generator note */}
      <Card className="border-border/40 bg-muted/10">
        <CardContent className="flex items-center gap-3 py-4">
          <Sparkles className="h-4 w-4 text-primary/60 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">AI Trade Offer Generator</span>
            {" "}— generates counter-offer suggestions and negotiation strategy — is available for subscribers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
