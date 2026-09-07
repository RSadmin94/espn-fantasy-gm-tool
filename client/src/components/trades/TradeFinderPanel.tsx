import { useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";

type TargetPos = "ANY" | "QB" | "RB" | "WR" | "TE" | "FLEX";
type RiskPref = "conservative" | "balanced" | "aggressive";

type FinderAsset = {
  kind: "player" | "pick";
  assetId: string;
  playerId: number | null;
  name: string;
  position: string;
  tradeValue: number;
};

type FinderTrade = {
  partnerTeamId: number;
  partnerName: string;
  youGive: FinderAsset[];
  youReceive: FinderAsset[];
  shape: string;
  tradeScore: number;
  tradeFit: string;
  fairness: string;
  userLineupDelta: number | null;
  partnerLineupDelta: number | null;
  whyThisWorks: string;
  riskWatchout: string;
  yourImpact: string;
  theirImpact: string;
  whyAi: string | null;
  riskAi: string | null;
  behaviorFit: string;
  behaviorNote: string | null;
};

type FinderResult = {
  ok: boolean;
  gated: boolean;
  entitled: boolean;
  emptyReason: string;
  emptyExplanation: string | null;
  userNeeds: Array<{ position: string; needScore: number; surplusScore: number; label: string }>;
  userSurplus: Array<{ position: string; needScore: number; surplusScore: number; label: string }>;
  trades: FinderTrade[];
  disclaimers: string[];
  picksSupported: boolean;
  narrativeApplied: boolean;
};

const LOADING_STEPS = [
  "Analyzing your roster",
  "Finding team needs",
  "Comparing league rosters",
  "Building realistic offers",
];

const FIT_CLASS: Record<string, string> = {
  "STRONG FIT": "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  "GOOD FIT": "border-lime-500/40 bg-lime-500/10 text-lime-400",
  BALANCED: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  AGGRESSIVE: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  "LONG SHOT": "border-orange-500/40 bg-orange-500/10 text-orange-400",
};

type TeamRow = { teamId: number; teamName: string };
type AnalyzerLoad = {
  teamBId: number;
  sideA: Array<{ playerId: number; playerName: string; position: string; avgPoints: number; teamId: number }>;
  sideB: Array<{ playerId: number; playerName: string; position: string; avgPoints: number; teamId: number }>;
};

export function TradeFinderPanel(props: {
  season: number;
  teams: TeamRow[];
  seasonSynced: boolean;
  leagueKeyReady: boolean;
  onLoadIntoAnalyzer?: (trade: AnalyzerLoad) => void;
}) {
  const { myTeamId, isConnected, isLoading } = useLeagueContext();
  const [targetPosition, setTargetPosition] = useState<TargetPos>("ANY");
  const [partnerTeamId, setPartnerTeamId] = useState<string>("any");
  const [maxAssets, setMaxAssets] = useState<"1" | "2">("2");
  const [includeDraftPicks, setIncludeDraftPicks] = useState(false);
  const [risk, setRisk] = useState<RiskPref>("balanced");
  const [topN, setTopN] = useState<"5" | "10">("5");
  const [result, setResult] = useState<FinderResult | null>(null);
  const [step, setStep] = useState(0);

  const findMut = trpc.tradeFinder.find.useMutation({
    onSuccess: (data) => setResult(data as FinderResult),
  });

  useEffect(() => {
    if (!findMut.isPending) {
      setStep(0);
      return;
    }
    const id = window.setInterval(() => setStep((s) => (s + 1) % LOADING_STEPS.length), 900);
    return () => window.clearInterval(id);
  }, [findMut.isPending]);

  const canRun = props.leagueKeyReady && props.seasonSynced && !findMut.isPending;

  const handleFind = () => {
    if (!canRun) return;
    setResult(null);
    findMut.mutate({
      season: props.season,
      userTeamId: myTeamId ?? undefined,
      filters: {
        targetPosition,
        partnerTeamId: partnerTeamId === "any" ? null : Number(partnerTeamId),
        maxAssets: maxAssets === "1" ? 1 : 2,
        includeDraftPicks,
        risk,
        topN: topN === "10" ? 10 : 5,
      },
    });
  };

  const emptyConn = !isLoading && !isConnected;

  return (
    <div className="space-y-5 min-w-0">
      <p className="text-sm text-muted-foreground">
        Ranked offers that help your roster and still make sense for the other manager. Advisory only — nothing is sent to ESPN or Sleeper.
      </p>

      {emptyConn && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Connect a league to find trades against real rosters.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 min-w-0">
        <FilterSelect label="Target position" value={targetPosition} onChange={(v) => setTargetPosition(v as TargetPos)} options={[
          ["ANY", "Any"], ["QB", "QB"], ["RB", "RB"], ["WR", "WR"], ["TE", "TE"], ["FLEX", "FLEX"],
        ]} />
        <FilterSelect
          label="Trade partner"
          value={partnerTeamId}
          onChange={setPartnerTeamId}
          options={[["any", "Any"], ...props.teams.filter((t) => t.teamId !== myTeamId).map((t) => [String(t.teamId), t.teamName] as [string, string])]}
        />
        <FilterSelect label="Max assets" value={maxAssets} onChange={(v) => setMaxAssets(v as "1" | "2")} options={[["1", "1"], ["2", "2"]]} />
        <FilterSelect label="Risk" value={risk} onChange={(v) => setRisk(v as RiskPref)} options={[
          ["conservative", "Conservative"], ["balanced", "Balanced"], ["aggressive", "Aggressive"],
        ]} />
        <FilterSelect label="Show" value={topN} onChange={(v) => setTopN(v as "5" | "10")} options={[["5", "Top 5"], ["10", "Top 10"]]} />
        <div className="flex items-end min-w-0">
          <label className="flex items-center gap-2 text-sm text-muted-foreground h-9">
            <input
              type="checkbox"
              className="accent-primary"
              checked={includeDraftPicks}
              onChange={(e) => setIncludeDraftPicks(e.target.checked)}
            />
            Include draft picks
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleFind} disabled={!canRun || emptyConn} size="lg" className="gap-2 font-semibold">
          {findMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {findMut.isPending ? LOADING_STEPS[step] : "Find me a trade"}
        </Button>
        {!props.seasonSynced && (
          <span className="text-xs text-yellow-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Season not synced
          </span>
        )}
      </div>

      {findMut.isError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300 min-w-0">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words">{findMut.error.message}</span>
        </div>
      )}

      {result && <FinderResults result={result} onLoadIntoAnalyzer={props.onLoadIntoAnalyzer} userTeamId={myTeamId} />}
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger className="h-9 w-full text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map(([v, label]) => (
            <SelectItem key={v} value={v}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FinderResults(props: {
  result: FinderResult;
  userTeamId: number | null;
  onLoadIntoAnalyzer?: (trade: AnalyzerLoad) => void;
}) {
  const { result } = props;
  const needLine = result.userNeeds.map((n) => n.position).join(", ") || "none labeled";
  const surplusLine = result.userSurplus.map((n) => n.position).join(", ") || "none labeled";

  return (
    <div className="space-y-4 min-w-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <Card className="border-border/60 min-w-0">
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground uppercase tracking-wide mb-1">Needs</p>
            <p className="text-foreground font-medium break-words">{needLine}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 min-w-0">
          <CardContent className="py-3 px-4">
            <p className="text-muted-foreground uppercase tracking-wide mb-1">Surplus</p>
            <p className="text-foreground font-medium break-words">{surplusLine}</p>
          </CardContent>
        </Card>
      </div>

      {result.gated && (
        <p className="text-sm text-muted-foreground">Trade Finder recommendations are a Pro feature. Your positional needs are shown above.</p>
      )}

      {result.disclaimers.map((d) => (
        <p key={d} className="text-xs text-yellow-400/90 break-words">{d}</p>
      ))}

      {result.trades.length === 0 && !result.gated && (
        <Card className="border-border/60">
          <CardContent className="py-5 px-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">No strong trade opportunities right now.</p>
            <p className="text-sm text-muted-foreground break-words">{result.emptyExplanation}</p>
          </CardContent>
        </Card>
      )}

      {result.trades.map((t) => (
        <TradeCard
          key={`${t.partnerTeamId}-${t.youGive.map((a) => a.assetId).join("-")}-${t.youReceive.map((a) => a.assetId).join("-")}`}
          trade={t}
          userTeamId={props.userTeamId}
          onAnalyze={props.onLoadIntoAnalyzer}
        />
      ))}
    </div>
  );
}

function TradeCard(props: {
  trade: FinderTrade;
  userTeamId: number | null;
  onAnalyze?: (trade: AnalyzerLoad) => void;
}) {
  const t = props.trade;
  const why = t.whyAi || t.whyThisWorks;
  const risk = t.riskAi || t.riskWatchout;
  return (
    <Card className="border-border/60 min-w-0 overflow-hidden">
      <CardContent className="py-4 px-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Trade with</p>
            <h3 className="text-base font-semibold text-foreground break-words">{t.partnerName}</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill className={FIT_CLASS[t.tradeFit] ?? "border-border text-muted-foreground"}>{t.tradeFit}</Pill>
            <Pill className="border-border/60 text-muted-foreground">{t.fairness}</Pill>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
          <AssetCol label="You receive" assets={t.youReceive} accent="text-emerald-400" />
          <AssetCol label="You give" assets={t.youGive} accent="text-orange-300" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs min-w-0">
          <p className="text-muted-foreground break-words"><span className="text-foreground font-medium">Your impact: </span>{t.yourImpact}</p>
          <p className="text-muted-foreground break-words"><span className="text-foreground font-medium">Their impact: </span>{t.theirImpact}</p>
        </div>

        <p className="text-sm text-foreground break-words">
          <Sparkles className="inline h-3.5 w-3.5 mr-1 text-primary" />
          {why}
        </p>
        <p className="text-xs text-muted-foreground break-words">Risk: {risk}</p>
        {t.behaviorNote && t.behaviorFit !== "NONE" && (
          <p className="text-xs text-muted-foreground break-words">{t.behaviorNote}</p>
        )}

        {props.onAnalyze && props.userTeamId != null && t.youGive.every((a) => a.playerId) && t.youReceive.every((a) => a.playerId) && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => props.onAnalyze?.({
              teamBId: t.partnerTeamId,
              sideA: t.youGive.filter((a) => a.playerId).map((a) => ({
                playerId: a.playerId!,
                playerName: a.name,
                position: a.position,
                avgPoints: 0,
                teamId: props.userTeamId!,
              })),
              sideB: t.youReceive.filter((a) => a.playerId).map((a) => ({
                playerId: a.playerId!,
                playerName: a.name,
                position: a.position,
                avgPoints: 0,
                teamId: t.partnerTeamId,
              })),
            })}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> Analyze this trade
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AssetCol({ label, assets, accent }: { label: string; assets: FinderAsset[]; accent: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/50 bg-muted/10 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">{label}</p>
      <ul className="space-y-1">
        {assets.map((a) => (
          <li key={a.assetId} className="text-sm text-foreground break-words">
            <span className={cn("font-medium", accent)}>{a.name}</span>
            <span className="text-muted-foreground"> · {a.position}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)}>
      {children}
    </span>
  );
}
