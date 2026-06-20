import { useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
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
  ArrowRight,
  CalendarDays,
  Lightbulb,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Scale,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
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
  injuryStatus?: string;
}

interface TradePlayer {
  playerId: number;
  playerName: string;
  position: string;
  avgPoints: number;
  teamId: number;
}

/** Matches tradeAnalyze picksA / picksB schema exactly (year, via, and key are UI-only) */
interface TradePick {
  round: number;
  pick: number;
  /** Draft year — UI display only, not sent to backend */
  year: number;
  /** Acquiring team name — UI display only, not sent to backend */
  via?: string;
  /** UI-only unique key for list rendering */
  key: string;
}

interface PlayerValue {
  playerId: number;
  name: string;
  compositeValue: number;
  valueBreakdown: string;
}

interface OwnerIntel {
  ownerName: string;
  completedTrades: number;
  avgTradesPerSeason: number;
  mostAcquiredPos: string | null;
  mostTradedAwayPos: string | null;
  tradeStyle: string;
  riskProfile: string;
  tradeAggression: "Low" | "Moderate" | "High" | "Unknown";
  inferredNote: string;
}
interface RivalryReport {
  completedTrades: number;
  mostRecent: { season: number; summary: string } | null;
  commonAssets: string[];
  yearsActiveTogether: number;
  relationship: string;
}
interface ChampWindow {
  classification: string;
  reasons: string[];
  basis: string;
}
interface FitScore {
  grade: string;
  evidence: { ok: boolean; text: string }[];
}
interface SplitSide {
  valueGrade: string;
  rosterFit: string;
  championshipContext: string;
  overallVerdict: string;
  confidence: string;
}
interface TradeIntelligence {
  ownerIntelligence: { teamA: OwnerIntel; teamB: OwnerIntel };
  rivalry: RivalryReport;
  championshipWindow: { teamA: ChampWindow; teamB: ChampWindow };
  tradeFitScore: { teamA: FitScore; teamB: FitScore };
  verdict: { verdict: string; confidence: string };
  splitVerdict: { teamA: SplitSide; teamB: SplitSide };
  negotiationAdvice: string[];
}

interface TradeResult {
  sideAValues: PlayerValue[];
  sideBValues: PlayerValue[];
  totalA: number;
  totalB: number;
  pickValueA: number;
  pickValueB: number;
  ratio: number;
  fairnessGrade: string;
  aiVerdict: string;
  teamANeeds: Record<string, number>;
  teamBNeeds: Record<string, number>;
  tradeIntelligence?: TradeIntelligence | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
/** "2027 R1.05" or "2027 R1.05 (via Team Alpha)" */
function formatPick(year: number, round: number, pick: number, via?: string) {
  const base = `${year} R${round}.${String(pick).padStart(2, "0")}`;
  return via ? `${base} (via ${via})` : base;
}
/** Kept for backward-compat callsites — same output as formatPick */
function pickLabel(year: number, round: number, pick: number, via?: string) { return formatPick(year, round, pick, via); }
function pickShort(year: number, round: number, pick: number, via?: string) { return formatPick(year, round, pick, via); }

const GRADE_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  "FAIR":          { label: "Fair Trade",        className: "border-lime-500/30 bg-lime-500/10 text-lime-400", icon: <Scale className="h-4 w-4" /> },
  "SLIGHT EDGE A": { label: "Slight Edge: You",  className: "border-violet-500/30 bg-violet-500/10 text-violet-400",         icon: <TrendingUp className="h-4 w-4" /> },
  "SLIGHT EDGE B": { label: "Slight Edge: Them", className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",   icon: <TrendingDown className="h-4 w-4" /> },
  "A WINS":        { label: "You Win",            className: "border-primary/30 bg-primary/10 text-primary",            icon: <TrendingUp className="h-4 w-4" /> },
  "B WINS":        { label: "They Win",           className: "border-red-500/30 bg-red-500/10 text-red-400",            icon: <TrendingDown className="h-4 w-4" /> },
  "LOPSIDED":      { label: "Lopsided",           className: "border-red-500/30 bg-red-500/10 text-red-400",            icon: <AlertCircle className="h-4 w-4" /> },
};

// ── Trade Intelligence presentation helpers ───────────────────────────────────
const VERDICT_CONFIG: Record<string, { className: string; icon: React.ReactNode }> = {
  ACCEPT:  { className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", icon: <TrendingUp className="h-5 w-5" /> },
  FAIR:    { className: "border-lime-500/40 bg-lime-500/10 text-lime-400",          icon: <Scale className="h-5 w-5" /> },
  COUNTER: { className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",    icon: <AlertCircle className="h-5 w-5" /> },
  RISKY:   { className: "border-orange-500/40 bg-orange-500/10 text-orange-400",    icon: <AlertCircle className="h-5 w-5" /> },
  AVOID:   { className: "border-red-500/40 bg-red-500/10 text-red-400",             icon: <TrendingDown className="h-5 w-5" /> },
};
function fitGradeClass(grade: string): string {
  if (grade.startsWith("A")) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
  if (grade.startsWith("B")) return "border-lime-500/40 bg-lime-500/10 text-lime-400";
  if (grade === "C") return "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
  return "border-red-500/40 bg-red-500/10 text-red-400";
}
const WINDOW_CLASS: Record<string, string> = {
  "Contender":    "text-emerald-400",
  "Playoff Team": "text-lime-400",
  "Bubble Team":  "text-yellow-400",
  "Retooling":    "text-orange-400",
  "Rebuilding":   "text-red-400",
};

function SectionLabel({ icon, children, note }: { icon: React.ReactNode; children: React.ReactNode; note?: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
      {icon} {children}
      {note && <span className="font-normal normal-case text-muted-foreground/70">— {note}</span>}
    </p>
  );
}

function OwnerIntelCard({ intel, teamName }: { intel: OwnerIntel; teamName: string }) {
  const rows: [string, React.ReactNode][] = [
    ["Completed trades", intel.completedTrades],
    ["Avg / season", intel.avgTradesPerSeason],
    ["Most acquired", intel.mostAcquiredPos ?? "—"],
    ["Most traded away", intel.mostTradedAwayPos ?? "—"],
    ["Trade aggression", intel.tradeAggression],
  ];
  return (
    <Card className="border-border/60">
      <CardContent className="py-3 px-4 space-y-2">
        <p className="text-sm font-semibold text-foreground truncate">{teamName}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="text-muted-foreground">{k}</span>
              <span className="text-foreground font-medium text-right">{v}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="space-y-1 pt-1 border-t border-border/40">
          <p className="text-xs"><span className="text-muted-foreground">Style: </span><span className="text-foreground">{intel.tradeStyle}</span></p>
          <p className="text-xs"><span className="text-muted-foreground">Tilt: </span><span className="text-foreground">{intel.riskProfile}</span></p>
          <p className="text-[10px] italic text-muted-foreground/70">{intel.inferredNote}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TradeIntelSections({ ti, teamAName, teamBName }: { ti: TradeIntelligence; teamAName: string; teamBName: string }) {
  const win = ti.championshipWindow;
  const fit = ti.tradeFitScore;
  return (
    <div className="space-y-4">
      {/* 3. Owner Intelligence */}
      <div>
        <SectionLabel icon={<Users className="h-3.5 w-3.5" />}>Owner Intelligence</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OwnerIntelCard intel={ti.ownerIntelligence.teamA} teamName={teamAName} />
          <OwnerIntelCard intel={ti.ownerIntelligence.teamB} teamName={teamBName} />
        </div>
      </div>

      {/* 4. Rivalry & Trade History */}
      <div>
        <SectionLabel icon={<Swords className="h-3.5 w-3.5" />}>Rivalry &amp; Trade History</SectionLabel>
        <Card className="border-border/60">
          <CardContent className="py-3 px-4 space-y-1.5 text-xs">
            <p className="text-sm text-foreground font-medium">{ti.rivalry.relationship}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-muted-foreground">Completed trades together</span>
              <span className="text-foreground font-medium text-right">{ti.rivalry.completedTrades}</span>
              <span className="text-muted-foreground">Years active together</span>
              <span className="text-foreground font-medium text-right">{ti.rivalry.yearsActiveTogether}</span>
            </div>
            {ti.rivalry.mostRecent && (
              <p><span className="text-muted-foreground">Most recent: </span><span className="text-foreground">{ti.rivalry.mostRecent.season} — {ti.rivalry.mostRecent.summary}</span></p>
            )}
            {ti.rivalry.commonAssets.length > 0 && (
              <p><span className="text-muted-foreground">Common assets: </span><span className="text-foreground">{ti.rivalry.commonAssets.join(", ")}</span></p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. Championship Window */}
      <div>
        <SectionLabel icon={<Trophy className="h-3.5 w-3.5" />}>Championship Window</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([{ w: win.teamA, name: teamAName }, { w: win.teamB, name: teamBName }] as const).map(({ w, name }) => (
            <Card key={name} className="border-border/60">
              <CardContent className="py-3 px-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">{name}</span>
                  <span className={cn("text-sm font-bold", WINDOW_CLASS[w.classification] ?? "text-foreground")}>{w.classification}</span>
                </div>
                <ul className="space-y-0.5">
                  {w.reasons.map((r, i) => <li key={i} className="text-xs text-muted-foreground">• {r}</li>)}
                </ul>
                <p className="text-[10px] italic text-muted-foreground/70 pt-1 border-t border-border/40">{w.basis}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 6. Trade Fit Score */}
      <div>
        <SectionLabel icon={<Target className="h-3.5 w-3.5" />} note="alignment grade, not a probability">Trade Fit Score</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([{ f: fit.teamA, name: teamAName }, { f: fit.teamB, name: teamBName }] as const).map(({ f, name }) => (
            <Card key={name} className="border-border/60">
              <CardContent className="py-3 px-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">{name}</span>
                  <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-base font-bold", fitGradeClass(f.grade))}>{f.grade}</span>
                </div>
                <ul className="space-y-1">
                  {f.evidence.length === 0 && <li className="text-xs text-muted-foreground">No strong signals either way.</li>}
                  {f.evidence.map((e, i) => (
                    <li key={i} className={cn("text-xs flex gap-1.5", e.ok ? "text-foreground" : "text-orange-300")}>
                      <span className="shrink-0">{e.ok ? "✓" : "⚠"}</span><span>{e.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 7. Negotiation Advice */}
      <div>
        <SectionLabel icon={<Lightbulb className="h-3.5 w-3.5" />}>Negotiation Advice</SectionLabel>
        <Card className="border-border/60">
          <CardContent className="py-3 px-4">
            <ul className="space-y-1.5">
              {ti.negotiationAdvice.map((a, i) => (
                <li key={i} className="text-xs text-foreground flex gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" /><span>{a}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PosBadge({ pos }: { pos: string | undefined }) {
  const colors: Record<string, string> = {
    QB: "border-red-500/30 bg-red-500/10 text-red-400",
    RB: "border-lime-500/30 bg-lime-500/10 text-lime-400",
    WR: "border-violet-500/30 bg-violet-500/10 text-violet-400",
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

// ── Pick adder ────────────────────────────────────────────────────────────────

function PickAdder({
  picks,
  onAdd,
  onRemove,
  teamCount,
  season,
  teams,
}: {
  picks: TradePick[];
  onAdd: (p: TradePick) => void;
  onRemove: (key: string) => void;
  teamCount: number;
  season: number;
  teams: TeamRow[];
}) {
  const maxPick = teamCount > 0 ? teamCount : 14;
  const midPick = teamCount > 0 ? Math.ceil(teamCount / 2) : 7;

  const [round, setRound] = useState("1");
  const [pick, setPick] = useState(String(midPick));
  const [isFuture, setIsFuture] = useState(false);
  const [pickMode, setPickMode] = useState<"original" | "acquired">("original");
  const [viaTeam, setViaTeam] = useState("");

  // When team count resolves, snap default pick to the true midpoint
  // only if the user hasn't changed it from the previous default
  const prevMidRef = React.useRef(midPick);
  React.useEffect(() => {
    if (prevMidRef.current !== midPick) {
      setPick(String(midPick));
      prevMidRef.current = midPick;
    }
  }, [midPick]);

  const pickYear = isFuture ? season + 1 : season;

  const handleAdd = () => {
    const r = Number(round);
    const p = Math.max(1, Math.min(maxPick, Number(pick) || midPick));
    const via = pickMode === "acquired" && viaTeam ? viaTeam : undefined;
    onAdd({ round: r, pick: p, year: pickYear, via, key: `${pickYear}-${r}-${p}-${Date.now()}` });
  };

  return (
    <div className="space-y-2 border-t border-border/60 pt-3 mt-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        Draft Picks
      </p>

      {/* Selected picks chips */}
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picks.map(pk => (
            <span
              key={pk.key}
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              {pickShort(pk.year, pk.round, pk.pick, pk.via)}
              <button
                onClick={() => onRemove(pk.key)}
                className="ml-0.5 hover:text-destructive transition-colors"
                aria-label="Remove pick"
              >
                <Minus className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Round */}
        <Select value={round} onValueChange={setRound}>
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6, 7].map(r => (
              <SelectItem key={r} value={String(r)} className="text-xs">
                {ORDINALS[r]} Rd
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Pick number */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Pick</span>
          <input
            type="number"
            min={1}
            max={maxPick}
            value={pick}
            onChange={e => setPick(e.target.value)}
            className="h-7 w-12 rounded border border-border bg-muted/30 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {teamCount > 0 && (
            <span className="text-xs text-muted-foreground/60">/{maxPick}</span>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs px-2"
          onClick={handleAdd}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>

      {/* Ownership mode */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={`pickMode-${season}`}
              value="original"
              checked={pickMode === "original"}
              onChange={() => { setPickMode("original"); setViaTeam(""); }}
              className="h-3.5 w-3.5 accent-primary"
            />
            <span className="text-xs text-muted-foreground">Original owner</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={`pickMode-${season}`}
              value="acquired"
              checked={pickMode === "acquired"}
              onChange={() => setPickMode("acquired")}
              className="h-3.5 w-3.5 accent-primary"
            />
            <span className="text-xs text-muted-foreground">Acquired pick</span>
          </label>
        </div>

        {pickMode === "acquired" && (
          <Select value={viaTeam} onValueChange={setViaTeam}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select original team…" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(t => (
                <SelectItem key={t.teamId} value={t.teamName || `Team ${t.teamId}`} className="text-xs">
                  {t.teamName || `Team ${t.teamId}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Future pick checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isFuture}
          onChange={e => setIsFuture(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border accent-primary"
        />
        <span className="text-xs text-muted-foreground">
          Future pick — next season ({season + 1})
        </span>
      </label>

      <p className="text-xs text-muted-foreground/60">
        {picks.length === 0
          ? `e.g. ${formatPick(season, 1, midPick)} = mid-1st`
          : picks.map(pk => pickLabel(pk.year, pk.round, pk.pick, pk.via)).join(" · ")}
      </p>
    </div>
  );
}

// ── Player + pick panel ───────────────────────────────────────────────────────

function RosterPicker({
  label,
  teamId,
  season,
  cachedSeasons,
  teams,
  selectedPlayers,
  picks,
  teamCount,
  leagueContextKey,
  onTeamChange,
  onTogglePlayer,
  onAddPick,
  onRemovePick,
}: {
  label: string;
  teamId: number | null;
  season: number;
  cachedSeasons: number[];
  teams: TeamRow[];
  selectedPlayers: TradePlayer[];
  picks: TradePick[];
  teamCount: number;
  leagueContextKey: string;
  onTeamChange: (id: number) => void;
  onTogglePlayer: (p: TradePlayer) => void;
  onAddPick: (p: TradePick) => void;
  onRemovePick: (key: string) => void;
}) {
  const rosterQ = trpc.espn.rosters.useQuery(
    withLeagueSalt({ season, teamId: teamId ?? undefined }, leagueContextKey),
    { enabled: teamId != null && cachedSeasons.includes(season) }
  );

  const players = (rosterQ.data as RosterEntry[] | undefined) ?? [];
  const selectedIds = new Set(selectedPlayers.map(p => p.playerId));

  const selectable = players.filter(
    p => p.playerName && p.lineupSlot !== "IR" && p.position !== "D/ST" && p.playerId
  );

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

  const totalItems = selectedPlayers.length + picks.length;

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
        {/* Summary of selected items */}
        {totalItems > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-xs font-medium text-foreground mb-1.5">
              Selected ({totalItems})
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
            {picks.map(pk => (
              <div
                key={pk.key}
                className="flex items-center justify-between rounded border border-primary/20 bg-primary/5 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex rounded border border-primary/25 bg-primary/10 px-1.5 py-0 text-xs font-semibold text-primary shrink-0">
                    PICK
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">
                    {pickLabel(pk.year, pk.round, pk.pick, pk.via)}
                  </span>
                </div>
                <button
                  onClick={() => onRemovePick(pk.key)}
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
          <p className="text-xs text-muted-foreground text-center py-4">Select a team above.</p>
        )}

        {rosterQ.isLoading && (
          <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading roster…
          </div>
        )}

        {!rosterQ.isLoading && teamId != null && selectable.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No players found.</p>
        )}

        <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
          {selectable.map(p => {
            const sel = p.playerId != null && selectedIds.has(p.playerId);
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

        {/* Pick adder — always visible, not gated on team selection */}
        <PickAdder
          picks={picks}
          onAdd={onAddPick}
          onRemove={onRemovePick}
          teamCount={teamCount}
          season={season}
          teams={teams}
        />
      </CardContent>
    </Card>
  );
}

// ── Results display ───────────────────────────────────────────────────────────

function TradeResults({
  result,
  teamAName,
  teamBName,
  picksA,
  picksB,
}: {
  result: TradeResult;
  teamAName: string;
  teamBName: string;
  picksA: TradePick[];
  picksB: TradePick[];
}) {
  const grade = GRADE_CONFIG[result.fairnessGrade] ?? {
    label: result.fairnessGrade,
    className: "border-border bg-muted/30 text-muted-foreground",
    icon: <Scale className="h-4 w-4" />,
  };

  const ftA = Number.isFinite(result.totalA) ? result.totalA : 0;
  const ftB = Number.isFinite(result.totalB) ? result.totalB : 0;
  const maxVal = Math.max(ftA, ftB, 1);
  const barA = Math.round((ftA / maxVal) * 100);
  const barB = Math.round((ftB / maxVal) * 100);
  const ti = result.tradeIntelligence ?? null;
  const verdictCfg = ti ? VERDICT_CONFIG[ti.verdict.verdict] : undefined;

  return (
    <div className="space-y-4">
      {/* 1. Executive Summary — deterministic verdict */}
      {ti && (
        <div className={cn("rounded-lg border px-4 py-3", verdictCfg?.className ?? "border-border bg-muted/30 text-foreground")}>
          <div className="flex items-center gap-2">
            {verdictCfg?.icon}
            <span className="text-xl font-extrabold tracking-tight">{ti.verdict.verdict}</span>
            <span className="ml-auto text-xs font-medium opacity-80">Confidence: {ti.verdict.confidence}</span>
          </div>
        </div>
      )}

      {/* 1b. Split Verdict (Tier 1) — value / fit / context / overall; headline = your (YOU GIVE) side */}
      {ti?.splitVerdict && (
        <div className="space-y-1 rounded-lg border border-border bg-muted/20 px-4 py-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Verdict Breakdown — Your Side
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Value Grade</span>
            <span className="text-sm font-semibold">{ti.splitVerdict.teamA.valueGrade}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Roster Fit</span>
            <span className={cn("rounded border px-1.5 text-sm font-semibold", fitGradeClass(ti.splitVerdict.teamA.rosterFit))}>
              {ti.splitVerdict.teamA.rosterFit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Championship Context</span>
            <span className="text-sm font-semibold">{ti.splitVerdict.teamA.championshipContext}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wide">Overall Verdict</span>
            <span className={cn("rounded border px-2 py-0.5 text-sm font-extrabold", VERDICT_CONFIG[ti.splitVerdict.teamA.overallVerdict]?.className)}>
              {ti.splitVerdict.teamA.overallVerdict}
            </span>
          </div>
          <div className="pt-1 text-[11px] text-muted-foreground">
            Other side overall <span className="font-semibold">{ti.splitVerdict.teamB.overallVerdict}</span>
            {" "}({ti.splitVerdict.teamB.valueGrade.toLowerCase()} value · {ti.splitVerdict.teamB.championshipContext.toLowerCase()} · fit {ti.splitVerdict.teamB.rosterFit})
          </div>
        </div>
      )}

      {/* 2. Trade Value */}
      {ti && <SectionLabel icon={<Scale className="h-3.5 w-3.5" />}>Trade Value</SectionLabel>}
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
      <div className="space-y-4">
        {(
          [
            { label: teamAName, value: result.totalA, bar: barA, players: result.sideAValues, pickVal: result.pickValueA, picks: picksA },
            { label: teamBName, value: result.totalB, bar: barB, players: result.sideBValues, pickVal: result.pickValueB, picks: picksB },
          ] as const
        ).map(({ label, value, bar, players, pickVal, picks }) => (
          <div key={label}>
            <div className="flex items-center justify-between mb-1.5 text-sm">
              <span className="font-medium text-foreground truncate">{label}</span>
              <span className="font-mono text-foreground ml-2 shrink-0">{Number.isFinite(value) ? Math.round(value) : "—"}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${bar}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {players.map(pv => (
                <span key={pv.playerId} className="text-xs text-muted-foreground">
                  {pv.name}:{" "}
                  <span className="text-foreground font-medium">{Number.isFinite(pv.compositeValue) ? Math.round(pv.compositeValue) : "Not available yet"}</span>
                </span>
              ))}
              {picks.map((pk, i) => (
                <span key={i} className="text-xs text-muted-foreground">
                  <span className="text-primary font-medium">{pickShort(pk.year, pk.round, pk.pick, pk.via)}</span>
                  {pickVal > 0 && picks.length === 1 && (
                    <span className="text-foreground font-medium"> +{Math.round(pickVal)}</span>
                  )}
                </span>
              ))}
              {picks.length > 1 && pickVal > 0 && (
                <span className="text-xs text-muted-foreground">
                  Picks total:{" "}
                  <span className="text-foreground font-medium">{Math.round(pickVal)}</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Phase 1 Trade Intelligence — structured deterministic report */}
      {ti && <TradeIntelSections ti={ti} teamAName={teamAName} teamBName={teamBName} />}

      {/* Positional depth */}
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
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );
  const allSeasonsQ = trpc.espn.allSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const cachedQ = trpc.espn.cachedSeasons.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { enabled: leagueKeyReady },
  );
  const allSeasons: number[] = leagueKeyReady ? (allSeasonsQ.data ?? []) : [];
  const cachedSeasons: number[] = leagueKeyReady ? (cachedQ.data ?? []) : [];
  const defaultSeason = cachedSeasons.length > 0
    ? Math.max(...cachedSeasons)
    : allSeasons.length > 0 ? allSeasons[allSeasons.length - 1] : 2025;

  const [season, setSeason] = useState(defaultSeason);
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [sideA, setSideA] = useState<TradePlayer[]>([]);
  const [sideB, setSideB] = useState<TradePlayer[]>([]);
  const [picksA, setPicksA] = useState<TradePick[]>([]);
  const [picksB, setPicksB] = useState<TradePick[]>([]);
  const [result, setResult] = useState<TradeResult | null>(null);

  // Tracks the league we've already auto-selected a season for, so we force the
  // default exactly once per league (and re-default on league switch) without
  // fighting a manual season change the user makes afterward.
  const initedLeagueRef = useRef<string | null>(null);

  useEffect(() => {
    if (cachedSeasons.length === 0) return;
    const maxS = Math.max(...cachedSeasons);
    if (initedLeagueRef.current !== leagueContextKey) {
      // First time we have real, data-bearing seasons for this league: default to
      // the latest season that actually has roster/draft data, not the placeholder
      // value the selector was initialized with before data loaded.
      initedLeagueRef.current = leagueContextKey;
      setSeason(maxS);
    } else {
      // Already defaulted for this league — keep the user's chosen season unless it
      // is no longer synced (e.g. after a data change), then snap to the latest.
      setSeason((s) => (cachedSeasons.includes(s) ? s : maxS));
    }
  }, [cachedSeasons, leagueContextKey]);

  const teamsQ = trpc.espn.teams.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    { enabled: leagueKeyReady && cachedSeasons.includes(season) }
  );
  const teams =
    (leagueKeyReady && cachedSeasons.includes(season)
      ? (teamsQ.data as TeamRow[] | undefined)
      : undefined) ?? [];

  const analyzeMutation = trpc.tradeAnalyze.useMutation({
    onSuccess: data => setResult(data as TradeResult),
  });

  // A valid trade needs both teams, and each side must have at least 1 player OR 1 pick
  const sideAHasItems = sideA.length > 0 || picksA.length > 0;
  const sideBHasItems = sideB.length > 0 || picksB.length > 0;
  const canAnalyze =
    teamAId != null && teamBId != null &&
    teamAId !== teamBId &&
    sideAHasItems && sideBHasItems;

  const teamAName = teams.find(t => t.teamId === teamAId)?.teamName ?? "Your Team";
  const teamBName = teams.find(t => t.teamId === teamBId)?.teamName ?? "Their Team";

  const handleAnalyze = () => {
    if (!canAnalyze || teamAId == null || teamBId == null) return;
    setResult(null);
    analyzeMutation.mutate({
      season,
      sideA,
      sideB,
      teamAId,
      teamBId,
      picksA: picksA.map(({ round, pick }) => ({ round, pick })),
      picksB: picksB.map(({ round, pick }) => ({ round, pick })),
    });
  };

  const handleReset = () => {
    setSideA([]); setSideB([]);
    setPicksA([]); setPicksB([]);
    setResult(null);
  };

  const hasAnySelection = sideA.length > 0 || sideB.length > 0 || picksA.length > 0 || picksB.length > 0;

  const validationHint = useMemo(() => {
    if (!teamAId || !teamBId) return "Select both teams first";
    if (teamAId === teamBId) return "Teams must be different";
    if (!sideAHasItems) return "Add at least one player or pick to give";
    if (!sideBHasItems) return "Add at least one player or pick to receive";
    return null;
  }, [teamAId, teamBId, sideAHasItems, sideBHasItems]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Trades</h1>
        <p className="mt-1 text-muted-foreground">
          Analyze trade fairness using real season data, draft pick values, and AI evaluation.
        </p>
      </div>

      {/* Season selector */}
      <div className="flex items-center gap-3">
        <Select
          value={String(season)}
          onValueChange={v => {
            setSeason(Number(v));
            setTeamAId(null); setTeamBId(null);
            setSideA([]); setSideB([]);
            setPicksA([]); setPicksB([]);
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
                  {cachedSeasons.includes(s) && <span className="text-lime-400 text-xs">✓</span>}
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

      {/* Two-panel picker */}
      <div className="flex flex-col gap-4 md:flex-row">
        <RosterPicker
          label="You Give"
          teamId={teamAId}
          season={season}
          cachedSeasons={cachedSeasons}
          teams={teams}
          selectedPlayers={sideA}
          picks={picksA}
          teamCount={teams.length}
          leagueContextKey={leagueContextKey}
          onTeamChange={id => { setTeamAId(id); setSideA([]); setPicksA([]); setResult(null); }}
          onTogglePlayer={p => { setSideA(prev => prev.some(x => x.playerId === p.playerId) ? prev.filter(x => x.playerId !== p.playerId) : [...prev, p]); setResult(null); }}
          onAddPick={pk => { setPicksA(prev => [...prev, pk]); setResult(null); }}
          onRemovePick={key => { setPicksA(prev => prev.filter(p => p.key !== key)); setResult(null); }}
        />

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
          picks={picksB}
          teamCount={teams.length}
          leagueContextKey={leagueContextKey}
          onTeamChange={id => { setTeamBId(id); setSideB([]); setPicksB([]); setResult(null); }}
          onTogglePlayer={p => { setSideB(prev => prev.some(x => x.playerId === p.playerId) ? prev.filter(x => x.playerId !== p.playerId) : [...prev, p]); setResult(null); }}
          onAddPick={pk => { setPicksB(prev => [...prev, pk]); setResult(null); }}
          onRemovePick={key => { setPicksB(prev => prev.filter(p => p.key !== key)); setResult(null); }}
        />
      </div>

      {/* Analyze button */}
      <div className="flex items-center gap-3 flex-wrap">
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
        {hasAnySelection && (
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
        )}
        {!canAnalyze && hasAnySelection && validationHint && (
          <span className="text-xs text-muted-foreground">{validationHint}</span>
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
              picksA={picksA}
              picksB={picksB}
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
