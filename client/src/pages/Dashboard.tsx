import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "wouter";
import AppLayout from "@/components/AppLayout";
import { MyProfileTab } from "./MyProfileTabContent";
import { OpponentProfileModal } from "./OpponentProfileModal";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import {
  Trophy, Users, TrendingUp, Activity, Star, Target, Zap, Brain,
  Shield, AlertTriangle, CheckCircle, Clock, Calendar, Bot,
  ChevronRight, Send, Loader2, ArrowUpRight, ArrowDownRight, Minus,
  BarChart3, Swords, RefreshCw, User, BarChart2, Info,
  CheckCircle2, ArrowUp, ArrowDown
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { useLocation } from "wouter";

// ─── Static strategy content (non-person-specific) ─────────────────────────

// NOTE: OPPONENT_PROFILES, MULTI_YEAR_RANKINGS, and COMPETITOR_DRAFT_INTEL have
// been removed. All opponent data is now sourced live from trpc.analytics.ownerCareerStats.

// OPPONENT_PROFILES and MULTI_YEAR_RANKINGS removed — now computed live from ownerCareerStats

const DRAFT_ROUNDS = [
  { round: "Rounds 1–3", priority: "RB / WR", note: "Attack aggressively. Elite RBs are the scarcest commodity in 14-team PPR. Do NOT reach for QB.", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  { round: "Rounds 4–5", priority: "WR2 / Elite TE", note: "Secure second elite WR or target a top-5 TE. Elite TEs (Kelce-tier) create massive positional advantage in PPR.", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  { round: "Rounds 6–8", priority: "QB", note: "Mid-tier QBs score similarly in PPR — waiting extracts value without sacrificing production.", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  { round: "Rounds 9–12", priority: "Flex Depth / Handcuffs", note: "Flex depth, handcuffs to your RB1, high-upside sleepers.", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  { round: "Rounds 13–14", priority: "K / DEF", note: "Always last — they are interchangeable and wasteful when drafted early.", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/30" },
];

// COMPETITOR_DRAFT_INTEL removed — now computed live from ownerCareerStats

const KEEPER_PRINCIPLES = [
  { step: "1", title: "What round was this player drafted in 2025?", desc: "Your keeper costs the round they were drafted. A Round 8 pick kept costs you your Round 8 slot." },
  { step: "2", title: "What round would they go in a fresh 2026 draft?", desc: "Look at current ADP. If they'd go Round 3 but cost Round 8, that's a 5-round surplus." },
  { step: "3", title: "Is the gap 3+ rounds? Keep them.", desc: "3+ round surplus = clear keep. The bigger the gap, the more value you're extracting from the draft." },
  { step: "4", title: "Are they injury-prone or declining?", desc: "If yes, consider passing and taking a strong Round 1 instead. Health and trajectory matter." },
];

const QUICK_PROMPTS_EXEC = [
  { label: "Trade War Strategy", prompt: "Generate a complete aggressive trade strategy for the 2026 season. Who should I target, when should I strike, and what should I offer? Use the behavioral profiles of all 14 managers.", icon: Swords },
  { label: "Keeper Analysis", prompt: "Analyze my keeper options for 2026 based on my 2025 roster performance. Which player gives me the most round-surplus value? Consider PPR scoring and 14-team positional scarcity.", icon: Star },
  { label: "Draft Cheat Sheet", prompt: "Build a round-by-round draft guide for the August 29, 2026 snake draft. I'm drafting in a 14-team PPR keeper league. Give me positional priorities, value tiers, and players to target by round.", icon: BarChart3 },
];

const QUICK_PROMPTS_CHAT = [
  "Who are my biggest threats heading into 2026 and how do I neutralize them?",
  "Which managers should I target for trades and what offers should I make?",
  "What are the top waiver wire priorities for early-season PPR 14-team leagues?",
  "Analyze my 2023–2025 performance trend and what it means for 2026.",
  "Who will rise and who will fall in 2026 based on 3-year trajectories?",
];

// ─── Keeper Deadline Countdown Card ──────────────────────────────────────────
const KEEPER_DEADLINE = new Date("2026-08-18T23:59:00-04:00");

function KeeperCountdownCard() {
  const now = new Date();
  const msRemaining = KEEPER_DEADLINE.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.floor(msRemaining / (1000 * 60 * 60 * 24)));
  const isPast = msRemaining <= 0;

  type Urgency = "critical" | "urgent" | "approaching" | "upcoming" | "locked";
  const urgency: Urgency = isPast ? "locked"
    : daysRemaining < 7 ? "critical"
    : daysRemaining < 30 ? "urgent"
    : daysRemaining < 60 ? "approaching"
    : "upcoming";

  const cardClass = {
    critical: "border-red-500/50 bg-red-950/20",
    urgent: "border-amber-500/50 bg-amber-950/20",
    approaching: "border-yellow-500/30 bg-card",
    upcoming: "border-border bg-card",
    locked: "border-border bg-card opacity-60",
  }[urgency];

  const numClass = {
    critical: "text-red-400",
    urgent: "text-amber-400",
    approaching: "text-yellow-400",
    upcoming: "text-primary",
    locked: "text-muted-foreground",
  }[urgency];

  const badgeClass = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30 border",
    urgent: "bg-amber-500/20 text-amber-400 border-amber-500/30 border",
    approaching: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 border",
    upcoming: "bg-primary/10 text-primary border-primary/30 border",
    locked: "bg-muted/30 text-muted-foreground border-border border",
  }[urgency];

  const badgeLabel = {
    critical: "CRITICAL",
    urgent: "URGENT",
    approaching: "APPROACHING",
    upcoming: "UPCOMING",
    locked: "LOCKED",
  }[urgency];

  return (
    <Card className={`card-glow ${cardClass}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="p-1.5 rounded-md bg-accent">
            <Star className="w-4 h-4 text-yellow-400" />
          </div>
          <Badge className={`text-[9px] px-1.5 py-0 ${badgeClass}`}>{badgeLabel}</Badge>
        </div>
        {isPast ? (
          <p className="text-sm font-semibold text-muted-foreground mt-1">Keeper window closed</p>
        ) : (
          <>
            <p className={`text-xl font-bold ${numClass}`}>{daysRemaining}</p>
            <p className="text-xs font-medium text-foreground mt-0.5">Keeper Deadline</p>
            <p className="text-[10px] text-muted-foreground">days until Aug 18, 2026</p>
          </>
        )}
        <Link href="/keeper-lab" className="text-[10px] text-primary hover:underline mt-1 block">
          Open Keeper Lab →
        </Link>
      </CardContent>
    </Card>
  );
}

// ─── Countdown helper ─────────────────────────────────────────────────────────
function Countdown({ target, label }: { target: Date; label: string }) {
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return <span className="text-emerald-400 font-bold">TODAY</span>;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-primary" />
      <span className="text-foreground font-semibold">{days}d {hours}h</span>
      <span className="text-muted-foreground text-sm">until {label}</span>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("executive");
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSeason, setChatSeason] = useState(2025);
  const [selectedOpponent, setSelectedOpponent] = useState<{ memberId: string; name: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: standings, isLoading: standingsLoading } = trpc.espn.standings.useQuery({ season: 2025 });
  const { data: manifests } = trpc.espn.manifests.useQuery();
  const { data: draftOrder2026Raw } = trpc.espn.draftOrder.useQuery({ season: 2026 });
  const { data: keeperHistoryRaw } = trpc.espn.keeperHistory.useQuery();
  const { data: leagueDraftData, isLoading: draftTendenciesLoading } = trpc.leagueDraftTendencies.useQuery();
  const { data: ownerStatsData, isLoading: ownerStatsLoading } = trpc.ownerCareerStats.useQuery();
  const chatMutation = trpc.advisor.chat.useMutation();

  type DraftOrderEntry = { position: number; teamId: number; name?: string; owners?: string };
  type DraftOrderData = { pickOrder?: DraftOrderEntry[]; draftDate?: number; keeperDeadline?: number };
  type KeeperHistoryEntry = { season: number; teamName: string; playerName: string; position: string; roundId: number; teamId: number };
  const draftOrder2026 = draftOrder2026Raw as DraftOrderData | null;
  const keeperHistory = (keeperHistoryRaw as KeeperHistoryEntry[]) || [];

  // Live opponent profiles derived from ownerCareerStats
  type LiveOwner = {
    memberId: string; fullName: string; displayName: string;
    totalWins: number; totalLosses: number; winPct: number;
    totalPF: number; avgPF: number; championships: number;
    playoffAppearances: number; playoffRate: number; seasonsActive: number;
    gmArchetype: string; gmArchetypeDesc: string;
    waiverAggression: number; tradeFrequency: number; rosterStability: number;
    seasonRecords: { season: number; wins: number; losses: number; pf: number; rank: number }[];
    totalAcquisitions: number; totalTrades: number;
  };
  const owners: LiveOwner[] = (ownerStatsData?.owners as LiveOwner[] | undefined) ?? [];
  const ROD_KEYWORDS = ["rod", "sellers", "str8"];
  const isRod = (o: LiveOwner) => ROD_KEYWORDS.some(k => o.fullName.toLowerCase().includes(k) || o.displayName.toLowerCase().includes(k));

  // Compute live threat score: weighted combo of win%, avg PF rank, playoff rate, championships
  const computeThreat = (o: LiveOwner): number => {
    const winScore = Math.round(o.winPct * 40);
    const pfScore = Math.min(30, Math.round((o.avgPF / 1900) * 30));
    const playoffScore = Math.round((o.playoffRate / 100) * 20);
    const champScore = Math.min(10, o.championships * 5);
    return Math.min(99, winScore + pfScore + playoffScore + champScore);
  };

  const computeBadge = (threat: number, o: LiveOwner): { badge: string; badgeColor: string; tierColor: string } => {
    if (threat >= 80) return { badge: "AVOID", badgeColor: "bg-red-500/20 text-red-400 border-red-500/30", tierColor: "border-red-500/40 bg-red-500/5" };
    if (threat >= 60) return { badge: "WATCH", badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", tierColor: "border-yellow-500/40 bg-yellow-500/5" };
    if (o.waiverAggression < 35 && o.tradeFrequency < 35) return { badge: "BUY LOW", badgeColor: "bg-green-500/20 text-green-400 border-green-500/30", tierColor: "border-green-500/40 bg-green-500/5" };
    if (o.rosterStability < 40) return { badge: "SELL HIGH", badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30", tierColor: "border-blue-500/40 bg-blue-500/5" };
    return { badge: "FAIR", badgeColor: "bg-slate-500/20 text-slate-400 border-slate-500/30", tierColor: "border-slate-500/40 bg-slate-500/5" };
  };

  const computeDirective = (o: LiveOwner, threat: number): string => {
    if (threat >= 80) return `High-threat manager. Avoid lopsided trades. Beat ${o.fullName.split(' ')[0]} on the field.`;
    if (o.waiverAggression >= 65) return `Active waiver manager — monitor his adds weekly. Strike on trades before he improves his roster.`;
    if (o.tradeFrequency >= 55) return `Frequent trader. Let him offer first — he may undervalue his assets when eager to deal.`;
    if (o.waiverAggression < 30 && o.tradeFrequency < 30) return `Low-activity manager. Target his roster early in the season when he's least engaged.`;
    return `Standard trade approach. Fair value exchanges are appropriate with this manager.`;
  };

  const computeTrajectory = (o: LiveOwner): "up" | "down" | "steady" => {
    const recent = o.seasonRecords.filter(s => s.season >= 2023).sort((a, b) => a.season - b.season);
    if (recent.length < 2) return "steady";
    const first = recent[0].rank; const last = recent[recent.length - 1].rank;
    if (last < first - 2) return "up"; // lower rank number = better
    if (last > first + 2) return "down";
    return "steady";
  };

  type LiveOpp = { memberId: string; name: string; team: string; abbr: string; threat: number; badge: string; badgeColor: string; tierColor: string; trajectory: "up" | "down" | "steady"; pf25: number; rank23: number; rank24: number; rank25: number; behavioral: string; directive: string; wins25: number; losses25: number };
  type LiveRank = { manager: string; rank23: number; rank24: number; rank25: number; label: string; you: boolean };
  type LiveDraftItem = { name: string; record: string; intel: string; risk: string };
  const liveOpponents = useMemo((): LiveOpp[] =>
    owners
      .filter(o => !isRod(o))
      .map(o => {
        const threat = computeThreat(o);
        const { badge, badgeColor, tierColor } = computeBadge(threat, o);
        const trajectory = computeTrajectory(o);
        const abbr = o.fullName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || o.displayName.slice(0, 2).toUpperCase();
        const rec25 = o.seasonRecords.find(s => s.season === 2025);
        const pf25 = rec25?.pf ?? 0;
        const rank23 = o.seasonRecords.find(s => s.season === 2023)?.rank ?? 99;
        const rank24 = o.seasonRecords.find(s => s.season === 2024)?.rank ?? 99;
        const rank25 = o.seasonRecords.find(s => s.season === 2025)?.rank ?? 99;
        return { memberId: o.memberId, name: o.fullName || o.displayName, team: o.displayName, abbr, threat, badge, badgeColor, tierColor, trajectory, pf25, rank23, rank24, rank25, behavioral: o.gmArchetypeDesc, directive: computeDirective(o, threat), wins25: rec25?.wins ?? 0, losses25: rec25?.losses ?? 0 };
      })
      .sort((a, b) => b.threat - a.threat),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ownerStatsData]);

  const liveRankings = useMemo((): LiveRank[] =>
    owners
      .map(o => {
        const you = isRod(o);
        const rank23 = o.seasonRecords.find(s => s.season === 2023)?.rank ?? 99;
        const rank24 = o.seasonRecords.find(s => s.season === 2024)?.rank ?? 99;
        const rank25 = o.seasonRecords.find(s => s.season === 2025)?.rank ?? 99;
        const delta = rank23 - rank25; // positive = improved
        const label = delta >= 5 ? "Biggest Swing" : delta <= -5 ? "Fading" : rank25 <= 3 ? "Elite" : rank25 <= 7 ? "Playoff Tier" : "Rebuilding";
        return { manager: o.fullName || o.displayName, rank23, rank24, rank25, label, you };
      })
      .filter(r => r.rank25 < 99)
      .sort((a, b) => a.rank25 - b.rank25),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ownerStatsData]);

  const liveDraftIntel = useMemo((): LiveDraftItem[] =>
    owners
      .filter(o => !isRod(o))
      .map(o => {
        const rec25 = o.seasonRecords.find(s => s.season === 2025);
        const record = rec25 ? `${rec25.wins}-${rec25.losses} in 2025` : `${o.seasonsActive} seasons`;
        const risk = computeThreat(o) >= 70 ? "high" : computeThreat(o) >= 45 ? "medium" : "low";
        const intel = o.championships > 0
          ? `${o.championships}x champion. Will keep a proven stud — removes elite value from the pool. Drafts with championship pedigree.`
          : o.waiverAggression >= 65
          ? `High waiver activity (${Math.round(o.totalAcquisitions / Math.max(1, o.seasonsActive))} adds/season). Aggressively patches roster mid-draft. Expect late-round steals.`
          : o.tradeFrequency >= 55
          ? `Active trader (${Math.round(o.totalTrades / Math.max(1, o.seasonsActive))} trades/season). May reach for players he wants to trade for later. Watch his picks.`
          : `${o.gmArchetype} manager. ${o.gmArchetypeDesc}`;
        return { name: o.fullName || o.displayName, record, intel, risk };
      })
      .sort((a, b) => (a.risk === "high" ? -1 : b.risk === "high" ? 1 : a.risk === "medium" ? -1 : 1))
      .slice(0, 6),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ownerStatsData]);

  const cachedSeasons = manifests?.filter((m: Record<string, unknown>) => m.status === "success").length ?? 0;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const sendChat = async (msg?: string) => {
    const text = msg ?? chatMessage.trim();
    if (!text) return;
    if (!isAuthenticated) { toast.error("Please sign in to use the AI Advisor"); return; }
    setChatMessages((prev) => [...prev, { role: "user", content: text }]);
    setChatMessage("");
    setChatLoading(true);
    try {
      const res = await chatMutation.mutateAsync({ message: text, season: chatSeason });
      setChatMessages((prev) => [...prev, { role: "assistant", content: res.message }]);
    } catch {
      toast.error("AI response failed. Please try again.");
    } finally {
      setChatLoading(false);
    }
  };

  const launchPrompt = (prompt: string) => {
    setActiveTab("chat");
    setTimeout(() => sendChat(prompt), 100);
  };

  // Build chart data
  const chartData = standings?.map((t: Record<string, unknown>, i: number) => ({
    name: String(t.teamName || "").split(" ").slice(-1)[0]?.slice(0, 8) || `T${i + 1}`,
    pf: Math.round(Number(t.pointsFor || 0)),
    isYou: String(t.owners || "").toLowerCase().includes("rod") || String(t.teamName || "").toLowerCase().includes("str8"),
  })) ?? [];

  const myTeam = standings?.find((t: Record<string, unknown>) =>
    String(t.owners || "").toLowerCase().includes("rod") || String(t.teamName || "").toLowerCase().includes("str8")
  ) as Record<string, unknown> | undefined;

  const leagueAvgPF = standings && standings.length > 0
    ? Math.round(standings.reduce((s: number, t: Record<string, unknown>) => s + Number(t.pointsFor || 0), 0) / standings.length)
    : 0;

  return (
    <AppLayout title="GM War Room" subtitle="ATLANTAS FINEST FF · Str8FrmHell, RodZilla · Rod Sellers · 2026 Season">
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 bg-card border border-border h-10 p-1 gap-0.5">
            {[
              { value: "executive", label: "Executive Summary" },
              { value: "standings", label: "League Standings" },
              { value: "opponents", label: "Opponent Profiles" },
              { value: "draft", label: "Draft Strategy" },
              { value: "keepers", label: "Keeper Intelligence" },
              { value: "chat", label: "GM AI Chat", badge: "AI" },
              { value: "my-profile", label: "My Profile" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="text-xs font-medium px-3 data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
              >
                {tab.label}
                {tab.badge && (
                  <Badge className="ml-1.5 text-[9px] px-1 py-0 h-3.5 espn-gradient text-white border-0">
                    {tab.badge}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── TAB 1: EXECUTIVE SUMMARY ── */}
          <TabsContent value="executive" className="space-y-6 mt-0">
            {/* 6 Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {[
                { label: "2025 Rank", value: myTeam ? `#${myTeam.rankFinal || 1}` : "#1", sub: "Final Standings", icon: <Trophy className="w-4 h-4 text-yellow-400" />, color: "text-yellow-400" },
                { label: "Points Scored", value: myTeam ? `${Math.round(Number(myTeam.pointsFor || 1921))}` : "1,921", sub: "Total PF 2025", icon: <TrendingUp className="w-4 h-4 text-emerald-400" />, color: "text-emerald-400" },
                { label: "Points Allowed", value: myTeam ? `${Math.round(Number(myTeam.pointsAgainst || 1693))}` : "1,693", sub: "Total PA 2025", icon: <Shield className="w-4 h-4 text-blue-400" />, color: "text-blue-400" },
                { label: "Point Differential", value: myTeam ? `+${Math.round(Number(myTeam.pointsFor || 1921) - Number(myTeam.pointsAgainst || 1693))}` : "+228", sub: "+16.3 per game", icon: <Activity className="w-4 h-4 text-primary" />, color: "text-primary" },
                { label: "vs League Avg PF", value: leagueAvgPF > 0 ? `+${Math.round(Number(myTeam?.pointsFor || 1921) - leagueAvgPF)}` : "+124", sub: `Avg: ${leagueAvgPF || 1797} pts`, icon: <BarChart3 className="w-4 h-4 text-purple-400" />, color: "text-purple-400" },
                { label: "Playoff Spots", value: "7 / 14", sub: "50% entry rate", icon: <Star className="w-4 h-4 text-orange-400" />, color: "text-orange-400" },
              ].map((card) => (
                <Card key={card.label} className="card-glow bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-1.5 rounded-md bg-accent">{card.icon}</div>
                    </div>
                    <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{card.label}</p>
                    <p className="text-[10px] text-muted-foreground">{card.sub}</p>
                  </CardContent>
                </Card>
              ))}
              <KeeperCountdownCard />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Threat Assessment */}
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    Threat Assessment — 2026 Season
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {liveOpponents.slice(0, 6).map((opp: LiveOpp) => (
                      <div key={opp.name} className="flex items-center gap-3 px-5 py-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${opp.threat >= 85 ? "bg-red-500" : opp.threat >= 60 ? "bg-yellow-500" : "bg-emerald-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{opp.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{opp.team}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-semibold">{opp.pf25 > 0 ? opp.pf25.toLocaleString() : "—"} pts</p>
                          <p className="text-[10px] text-muted-foreground">{opp.wins25}-{opp.losses25} record</p>
                        </div>
                        <div className="w-16 flex-shrink-0">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${opp.threat >= 85 ? "bg-red-500" : opp.threat >= 60 ? "bg-yellow-500" : "bg-emerald-500"}`}
                              style={{ width: `${opp.threat}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground text-right mt-0.5">{opp.threat}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Immediate Action Items */}
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Immediate Action Items
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    {
                      priority: "CRITICAL", color: "bg-red-500/15 border-red-500/30 text-red-400",
                      title: "Lock Your Keeper",
                      desc: "Keeper deadline is August 18, 2026. Evaluate your best round-surplus player NOW.",
                      icon: <Star className="w-3.5 h-3.5" />,
                    },
                    {
                      priority: "HIGH", color: "bg-orange-500/15 border-orange-500/30 text-orange-400",
                      title: "Target Mark DeRoux & Tony Dorsey",
                      desc: "Both are frustrated sellers. Strike early in 2026 when they're 0-2 or 1-3.",
                      icon: <Target className="w-3.5 h-3.5" />,
                    },
                    {
                      priority: "HIGH", color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
                      title: "Scout Christian Graham's Keeper",
                      desc: "He went 12-2. His keeper removes one elite player from the pool. Know what's gone.",
                      icon: <Brain className="w-3.5 h-3.5" />,
                    },
                    {
                      priority: "MEDIUM", color: "bg-blue-500/15 border-blue-500/30 text-blue-400",
                      title: "Draft Prep — Aug 29 @ 3:30 PM",
                      desc: "Attack RB/WR in rounds 1-3. Wait on QB. Elite TE is a weekly edge in PPR.",
                      icon: <Calendar className="w-3.5 h-3.5" />,
                    },
                  ].map((item) => (
                    <div key={item.title} className={`flex gap-3 p-3 rounded-lg border ${item.color}`}>
                      <div className="flex-shrink-0 mt-0.5">{item.icon}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide">{item.priority}</span>
                          <span className="text-xs font-semibold text-foreground">{item.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Countdowns + Quick Launch */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Key Dates — 2026 Season
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">Keeper Deadline</p>
                      <p className="text-xs text-muted-foreground">August 18, 2026</p>
                    </div>
                    <Countdown target={new Date("2026-08-18")} label="Keeper Deadline" />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">Draft Day</p>
                      <p className="text-xs text-muted-foreground">August 29, 2026 @ 3:30 PM EDT</p>
                    </div>
                    <Countdown target={new Date("2026-08-29T15:30:00")} label="Draft Day" />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Data Pipeline</p>
                      <p className="text-xs text-muted-foreground">{cachedSeasons} seasons cached</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/refresh")}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Refresh Data
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary" />
                    Quick-Launch AI Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {QUICK_PROMPTS_EXEC.map((p) => (
                    <Button
                      key={p.label}
                      variant="outline"
                      className="w-full justify-start gap-3 text-sm h-auto py-3 border-border hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => launchPrompt(p.prompt)}
                    >
                      <p.icon className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="text-left">
                        <p className="font-medium text-foreground">{p.label}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── TAB 2: LEAGUE STANDINGS ── */}
          <TabsContent value="standings" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Full standings table */}
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    2025 Final Standings — All 14 Teams
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {standingsLoading ? (
                    <div className="px-5 pb-4 space-y-2">{[...Array(14)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : standings && standings.length > 0 ? (
                    <div className="divide-y divide-border">
                      {standings.map((team: Record<string, unknown>, i: number) => {
                        const isYou = String(team.owners || "").toLowerCase().includes("rod") || String(team.teamName || "").toLowerCase().includes("str8");
                        const tier = i < 3 ? "Elite" : i < 6 ? "Strong" : i < 9 ? "Rising" : "Trade Target";
                        const tierColor = i < 3 ? "border-yellow-500/30 text-yellow-400" : i < 6 ? "border-emerald-500/30 text-emerald-400" : i < 9 ? "border-blue-500/30 text-blue-400" : "border-slate-500/30 text-slate-400";
                        return (
                          <div key={i} className={`flex items-center gap-3 px-5 py-2.5 hover:bg-accent/30 transition-colors ${isYou ? "bg-blue-500/8 border-l-2 border-l-blue-500" : ""}`}>
                            <span className={`text-sm font-bold w-5 text-center flex-shrink-0 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className={`text-sm font-medium truncate ${isYou ? "text-blue-400" : "text-foreground"}`}>{String(team.teamName || "")}</p>
                                {isYou && <Badge className="text-[9px] px-1 py-0 h-3.5 bg-blue-500/20 text-blue-400 border-blue-500/30 border">YOU</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{String(team.owners || "")}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-semibold">{String(team.wins || 0)}-{String(team.losses || 0)}</p>
                              <p className="text-[10px] text-muted-foreground">{Math.round(Number(team.pointsFor || 0))} PF</p>
                            </div>
                            <div className="text-right flex-shrink-0 hidden xl:block">
                              <p className="text-xs font-medium text-muted-foreground">{Math.round(Number(team.pointsAgainst || 0))} PA</p>
                              <p className={`text-[10px] font-semibold ${Number(team.pointsFor || 0) - Number(team.pointsAgainst || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {Number(team.pointsFor || 0) - Number(team.pointsAgainst || 0) >= 0 ? '+' : ''}{Math.round(Number(team.pointsFor || 0) - Number(team.pointsAgainst || 0))}
                              </p>
                            </div>
                            <Badge variant="outline" className={`text-[9px] px-1.5 border ${tierColor} flex-shrink-0`}>{tier}</Badge>
                            {i < 7 && <Badge variant="outline" className="text-[9px] px-1.5 border-emerald-500/40 text-emerald-400 flex-shrink-0">PO</Badge>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center text-muted-foreground text-sm">
                      No data loaded. Use <button className="text-primary underline" onClick={() => navigate("/refresh")}>Data Refresh</button> to pull season data.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bar chart */}
              <div className="space-y-6">
                <Card className="card-glow bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      2025 Points For — All Teams
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {chartData.length === 0 ? (
                      <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data loaded.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 20, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "oklch(0.55 0.015 240)" }} angle={-35} textAnchor="end" />
                          <YAxis domain={[1400, "auto"]} tick={{ fontSize: 10, fill: "oklch(0.55 0.015 240)" }} />
                          <Tooltip
                            contentStyle={{ background: "oklch(0.14 0.018 240)", border: "1px solid oklch(0.22 0.02 240)", borderRadius: "6px", fontSize: "12px" }}
                            labelStyle={{ color: "oklch(0.95 0.01 240)", fontWeight: 600 }}
                          />
                          <Bar dataKey="pf" radius={[3, 3, 0, 0]} name="Points For">
                            {chartData.map((entry, index) => (
                              <Cell key={index} fill={entry.isYou ? "oklch(0.6 0.2 240)" : "oklch(0.65 0.22 25)"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Multi-year power rankings */}
                <Card className="card-glow bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      3-Year Power Rankings (2023–2025)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {(ownerStatsLoading ? [] as LiveRank[] : liveRankings).slice(0, 8).map((row: LiveRank) => (
                        <div key={row.manager} className={`flex items-center gap-3 px-5 py-2 ${row.you ? "bg-blue-500/8" : ""}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className={`text-xs font-medium ${row.you ? "text-blue-400" : "text-foreground"}`}>{row.manager}</p>
                              {row.you && <Badge className="text-[8px] px-1 py-0 h-3 bg-blue-500/20 text-blue-400 border-blue-500/30 border">YOU</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs flex-shrink-0">
                            <span className="text-muted-foreground w-4 text-center">#{row.rank23}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-muted-foreground w-4 text-center">#{row.rank24}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className={`font-bold w-4 text-center ${row.rank25 <= 3 ? "text-yellow-400" : row.rank25 <= 7 ? "text-emerald-400" : "text-muted-foreground"}`}>#{row.rank25}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 w-28 text-right">{row.label}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ── TAB 3: OPPONENT PROFILES ── */}
          <TabsContent value="opponents" className="mt-0">
            {selectedOpponent && (
              <OpponentProfileModal
                memberId={selectedOpponent.memberId}
                ownerName={selectedOpponent.name}
                onClose={() => setSelectedOpponent(null)}
              />
            )}
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3" /> Click any card for a full deep-dive profile
            </p>
            {ownerStatsLoading && (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading opponent profiles…</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {liveOpponents.map((opp: LiveOpp) => (
                <Card
                  key={opp.name + opp.team}
                  className={`card-glow border ${opp.tierColor} cursor-pointer hover:scale-[1.02] transition-transform`}
                  onClick={() => setSelectedOpponent({ memberId: opp.memberId, name: opp.name })}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-foreground">{opp.abbr}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground leading-tight">{opp.name}</p>
                          <p className="text-xs text-muted-foreground leading-tight truncate max-w-[140px]">{opp.team}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant="outline" className={`text-[9px] px-1.5 border ${opp.badgeColor}`}>{opp.badge}</Badge>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </div>

                    {/* 3-year record */}
                    <div className="flex items-center gap-1 mb-3">
                      {[{ year: "2023", rank: opp.rank23 }, { year: "2024", rank: opp.rank24 }, { year: "2025", rank: opp.rank25 }].map((yr, i) => (
                        <div key={yr.year} className="flex items-center gap-1">
                          <div className={`text-center px-2 py-1 rounded text-xs ${yr.rank <= 3 ? "bg-yellow-500/15 text-yellow-400" : yr.rank <= 7 ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                            <span className="font-bold">#{yr.rank}</span>
                            <span className="text-[9px] block">{yr.year}</span>
                          </div>
                          {i < 2 && (
                            opp.trajectory === "up" ? <ArrowUpRight className="w-3 h-3 text-emerald-400" /> :
                            opp.trajectory === "down" ? <ArrowDownRight className="w-3 h-3 text-red-400" /> :
                            <Minus className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                      <div className="ml-auto">
                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${opp.threat >= 85 ? "bg-red-500" : opp.threat >= 60 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${opp.threat}%` }} />
                        </div>
                        <p className="text-[9px] text-muted-foreground text-right">Threat {opp.threat}%</p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">{opp.behavioral}</p>
                    <div className="flex items-start gap-1.5 p-2 rounded bg-accent/50">
                      <Target className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground leading-relaxed">{opp.directive}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── TAB 4: DRAFT STRATEGY ── */}
          <TabsContent value="draft" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Round-by-round priority */}
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Round-by-Round Positional Priority
                    <Badge className="ml-auto text-[9px] px-1.5 espn-gradient text-white border-0">Aug 29, 2026</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {DRAFT_ROUNDS.map((r) => (
                    <div key={r.round} className={`p-3 rounded-lg border ${r.bg}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${r.color}`}>{r.round}</span>
                        <span className="text-sm font-semibold text-foreground">→ {r.priority}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{r.note}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Competitor intel + Roster blueprint */}
              <div className="space-y-4">
                <Card className="card-glow bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" />
                      Competitor Draft Intelligence
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(ownerStatsLoading ? [] as LiveDraftItem[] : liveDraftIntel).map((c: LiveDraftItem) => (
                      <div key={c.name} className="flex gap-3 p-3 rounded-lg bg-accent/40 border border-border">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${c.risk === "high" ? "bg-red-500" : c.risk === "medium" ? "bg-yellow-500" : "bg-emerald-500"}`} />
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-xs font-semibold text-foreground">{c.name}</p>
                            <span className="text-[10px] text-muted-foreground">{c.record}</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{c.intel}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="card-glow bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      Target Roster Blueprint
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { pos: "QB", target: "1", note: "Rounds 6–8", color: "text-purple-400" },
                        { pos: "RB", target: "3–4", note: "Rounds 1–3 priority", color: "text-red-400" },
                        { pos: "WR", target: "3–4", note: "PPR gold, spread picks", color: "text-blue-400" },
                        { pos: "TE", target: "1", note: "Elite TE = weekly edge", color: "text-orange-400" },
                        { pos: "FLEX", target: "2", note: "Best RB2/WR2 wins", color: "text-emerald-400" },
                        { pos: "K / DEF", target: "1 each", note: "Always last 2 picks", color: "text-slate-400" },
                      ].map((p) => (
                        <div key={p.pos} className="p-2.5 rounded-lg bg-accent/40 border border-border">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-xs font-bold ${p.color}`}>{p.pos}</span>
                            <span className="text-sm font-bold text-foreground">{p.target}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{p.note}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            {/* League Draft Tendencies Heat Map */}
            <Card className="card-glow bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  Manager Draft Tendencies — 2018–2025
                  <Badge className="ml-auto text-[9px] px-1.5 bg-blue-500/20 text-blue-400 border-blue-500/30">REAL DATA</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {draftTendenciesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading draft history...
                  </div>
                ) : leagueDraftData ? (
                  <div className="space-y-4">
                    {/* Manager cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {leagueDraftData.owners
                        .filter((o: { name: string; totalPicks: number; seasons: number; topPositions: Array<{pos: string; count: number; pct: number}>; byRound: Record<number, Record<string, number>>; round1Picks: Array<{season: number; playerName: string; position: string; isKeeper: boolean}>; r1Top: string; r2Top: string; r3Top: string; draftStyle: string; rb1Pct: number; wr1Pct: number }) => o.totalPicks > 0)
                        .map((o: { name: string; totalPicks: number; seasons: number; topPositions: Array<{pos: string; count: number; pct: number}>; byRound: Record<number, Record<string, number>>; round1Picks: Array<{season: number; playerName: string; position: string; isKeeper: boolean}>; r1Top: string; r2Top: string; r3Top: string; draftStyle: string; rb1Pct: number; wr1Pct: number }) => {
                          const posColors: Record<string, string> = { RB: "bg-red-500", WR: "bg-blue-500", QB: "bg-purple-500", TE: "bg-orange-500", K: "bg-slate-500", "D/ST": "bg-slate-400", UNK: "bg-slate-600" };
                          const styleColors: Record<string, string> = { "RB-First": "text-red-400", "WR-First": "text-blue-400", "QB-Early": "text-purple-400", "TE-Premium": "text-orange-400", "Balanced": "text-emerald-400" };
                          const isRod = o.name.toLowerCase().includes("rod") || o.name.toLowerCase().includes("str8");
                          return (
                            <div key={o.name} className={`p-3 rounded-lg border ${isRod ? "border-primary/50 bg-primary/10" : "border-border bg-accent/30"}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="text-xs font-bold text-foreground">{o.name}{isRod ? " (You)" : ""}</p>
                                  <p className="text-[10px] text-muted-foreground">{o.seasons} seasons · {o.totalPicks} picks</p>
                                </div>
                                <span className={`text-[10px] font-bold ${styleColors[o.draftStyle] || "text-muted-foreground"}`}>{o.draftStyle}</span>
                              </div>
                              {/* Position bar */}
                              <div className="flex h-2 rounded-full overflow-hidden mb-2 gap-px">
                                {o.topPositions.map((p: {pos: string; count: number; pct: number}) => (
                                  <div key={p.pos} className={`${posColors[p.pos] || "bg-slate-500"}`} style={{ width: `${p.pct}%` }} title={`${p.pos}: ${p.pct}%`} />
                                ))}
                              </div>
                              {/* Round tendencies */}
                              <div className="grid grid-cols-3 gap-1 mb-2">
                                {[1, 2, 3].map(rd => {
                                  const rdData = o.byRound[rd] || {};
                                  const topPos = Object.entries(rdData).sort((a: [string, unknown], b: [string, unknown]) => (b[1] as number) - (a[1] as number))[0];
                                  return (
                                    <div key={rd} className="text-center p-1.5 rounded bg-background/50">
                                      <p className="text-[9px] text-muted-foreground">Rd {rd}</p>
                                      <p className={`text-xs font-bold ${topPos ? (posColors[topPos[0]]?.replace("bg-", "text-") || "text-foreground") : "text-muted-foreground"}`}>
                                        {topPos ? `${topPos[0]} ×${topPos[1]}` : "—"}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Rd1 picks */}
                              {o.round1Picks.length > 0 && (
                                <div className="space-y-0.5">
                                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide">Round 1 History</p>
                                  {o.round1Picks.slice(0, 4).map((p: {season: number; playerName: string; position: string; isKeeper: boolean}, i: number) => (
                                    <div key={i} className="flex items-center gap-1">
                                      <span className="text-[9px] text-muted-foreground w-8">{p.season}</span>
                                      <span className="text-[10px] text-foreground truncate flex-1">{p.playerName}</span>
                                      <span className={`text-[9px] font-bold ${posColors[p.position]?.replace("bg-", "text-") || "text-muted-foreground"}`}>{p.position}</span>
                                      {p.isKeeper && <span className="text-[8px] text-yellow-400">K</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                      {[{pos:"RB",color:"bg-red-500"},{pos:"WR",color:"bg-blue-500"},{pos:"QB",color:"bg-purple-500"},{pos:"TE",color:"bg-orange-500"},{pos:"K/DST",color:"bg-slate-500"}].map(p => (
                        <div key={p.pos} className="flex items-center gap-1">
                          <div className={`w-2.5 h-2.5 rounded-sm ${p.color}`} />
                          <span className="text-[10px] text-muted-foreground">{p.pos}</span>
                        </div>
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-auto">Bar = positional % of all picks · Rd1/2/3 = top position drafted that round · K = keeper pick</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No draft tendency data available.</p>
                )}
              </CardContent>
            </Card>

            {/* Live 2026 Draft Order */}
            {draftOrder2026?.pickOrder && draftOrder2026.pickOrder.length > 0 && (
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    2026 Live Draft Order
                    <Badge className="ml-auto text-[9px] px-1.5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">LIVE</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                    {draftOrder2026.pickOrder.map((entry) => (
                      <div
                        key={entry.position}
                        className={`flex flex-col items-center p-2.5 rounded-lg border text-center ${
                          entry.name?.toLowerCase().includes("str8") || entry.owners?.toLowerCase().includes("rod")
                            ? "border-primary/50 bg-primary/10"
                            : "border-border bg-accent/30"
                        }`}
                      >
                        <span className="text-lg font-bold text-primary">{entry.position}</span>
                        <span className="text-[10px] text-foreground font-medium leading-tight mt-0.5 line-clamp-2">{entry.name || `Team ${entry.teamId}`}</span>
                        {entry.owners && <span className="text-[9px] text-muted-foreground mt-0.5 hidden md:block">{entry.owners.split(";")[0]?.trim()}</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 text-center">Snake draft — your pick is highlighted in blue</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── TAB 5: KEEPER INTELLIGENCE ── */}
          <TabsContent value="keepers" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 4-step framework */}
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    4-Step Keeper Evaluation Framework
                    <div className="ml-auto">
                      <Countdown target={new Date("2026-08-18")} label="Keeper Deadline" />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {KEEPER_PRINCIPLES.map((p) => (
                    <div key={p.step} className="flex gap-3 p-3 rounded-lg border border-border bg-accent/30">
                      <div className="w-7 h-7 rounded-full espn-gradient flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">{p.step}</div>
                      <div>
                        <p className="text-sm font-semibold text-foreground mb-0.5">{p.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="space-y-4">
                {/* Key principles */}
                <Card className="card-glow bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Key Keeper Principles — PPR 14-Team
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {[
                      { text: "Elite RB keepers beat elite WR keepers in most scenarios due to positional scarcity at 14 teams.", icon: "🏃" },
                      { text: "Target players drafted in rounds 8–14 who finished as top-30 scorers — that gap is where value is created.", icon: "💎" },
                      { text: "Age matters — ascending 24–26 year olds are better keeper targets than 30+ year olds on one-year runs.", icon: "📈" },
                      { text: "3+ round surplus = clear keep. The bigger the gap, the more value you extract from the draft pool.", icon: "✅" },
                    ].map((p, i) => (
                      <div key={i} className="flex gap-2.5 p-2.5 rounded-lg bg-accent/30">
                        <span className="text-base flex-shrink-0">{p.icon}</span>
                        <p className="text-xs text-muted-foreground leading-relaxed">{p.text}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* League keeper dynamics */}
                <Card className="card-glow bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" />
                      League Keeper Dynamics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { manager: "Christian Graham (12-2)", impact: "Will keep an elite stud — removes one top player from the pool.", risk: "high" },
                      { manager: "Jan Graham (2,032 pts)", impact: "Will keep her best player — another elite removed from the pool.", risk: "high" },
                      { manager: "Demetri Clark (2024 champ)", impact: "Likely has a veteran stud at a discount round.", risk: "medium" },
                      { manager: "Mark DeRoux (3-11)", impact: "Weak roster — his keeper may be low value, boosting the available pool.", risk: "low" },
                    ].map((k) => (
                      <div key={k.manager} className="flex gap-2.5 p-2.5 rounded-lg border border-border">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${k.risk === "high" ? "bg-red-500" : k.risk === "medium" ? "bg-yellow-500" : "bg-emerald-500"}`} />
                        <div>
                          <p className="text-xs font-semibold text-foreground">{k.manager}</p>
                          <p className="text-xs text-muted-foreground">{k.impact}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 2026 Keeper Eligibility Calculator CTA */}
            <Card className="card-glow bg-gradient-to-r from-primary/10 to-emerald-500/10 border-primary/30">
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">2026 Keeper Eligibility Calculator</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        See which players hit the 2-year limit, round costs for eligible keepers, and value analysis for all 14 teams.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="flex-shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => navigate("/keeper-calculator")}
                  >
                    Open Calculator
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live Keeper History Timeline */}
            {keeperHistory.length > 0 && (
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Keeper History Timeline — All Seasons
                    <Badge className="ml-auto text-[9px] px-1.5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">LIVE DATA</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Season</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Team</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Player Kept</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Pos</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Round</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keeperHistory
                          .sort((a, b) => b.season - a.season || a.teamName.localeCompare(b.teamName))
                          .map((k, i) => (
                            <tr
                              key={i}
                              className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${
                                k.teamName?.toLowerCase().includes("str8") || k.teamName?.toLowerCase().includes("rod")
                                  ? "bg-primary/5"
                                  : ""
                              }`}
                            >
                              <td className="py-2 px-3 font-semibold text-primary">{k.season}</td>
                              <td className="py-2 px-3 text-foreground max-w-[140px] truncate">{k.teamName}</td>
                              <td className="py-2 px-3 text-foreground font-medium">{k.playerName || <span className="text-muted-foreground italic">Unknown</span>}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0">{k.position || "?"}</Badge>
                              </td>
                              <td className="py-2 px-3 text-muted-foreground">Rd {k.roundId}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── TAB 6: GM AI CHAT ── */}
          <TabsContent value="chat" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-280px)] min-h-[500px]">
              {/* Quick prompts sidebar */}
              <Card className="card-glow bg-card border-border lg:col-span-1 flex flex-col">
                <CardHeader className="pb-3 flex-shrink-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Quick Prompts
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto space-y-2 p-3">
                  {QUICK_PROMPTS_CHAT.map((p) => (
                    <Button
                      key={p}
                      variant="outline"
                      size="sm"
                      className="w-full text-left justify-start h-auto py-2.5 px-3 text-xs leading-relaxed border-border hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => sendChat(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <div className="pt-2 border-t border-border">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Full league context pre-loaded: 14 managers, 3-year history, PPR scoring rules, behavioral profiles.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Chat area */}
              <Card className="card-glow bg-card border-border lg:col-span-3 flex flex-col">
                <CardHeader className="pb-3 flex-shrink-0 border-b border-border">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary" />
                    GM AI Advisor
                    <Badge className="ml-1 text-[9px] px-1.5 espn-gradient text-white border-0">AI</Badge>
                    <div className="ml-auto flex items-center gap-2">
                      <Select value={String(chatSeason)} onValueChange={(v) => setChatSeason(Number(v))}>
                        <SelectTrigger className="h-6 text-[10px] w-24 border-border bg-accent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2026,2025,2024,2023,2022,2021,2020,2019,2018,2017,2016,2015,2014,2013,2012,2011,2010,2009].map(y => (
                            <SelectItem key={y} value={String(y)} className="text-xs">{y} Season</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardTitle>
                </CardHeader>
                <ScrollArea className="flex-1 px-4">
                  <div className="py-4 space-y-4">
                    {chatMessages.length === 0 && (
                      <div className="text-center py-8">
                        <Bot className="w-10 h-10 text-primary/40 mx-auto mb-3" />
                        <p className="text-sm font-medium text-foreground">GM AI Advisor Ready</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                          Ask anything about your league — trades, keepers, draft strategy, opponent analysis, or waiver wire. Full league context is pre-loaded.
                        </p>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && (
                          <div className="w-7 h-7 rounded-full espn-gradient flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Bot className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-primary/20 text-foreground ml-auto" : "bg-accent text-foreground"}`}>
                          {msg.role === "assistant" ? <Streamdown>{msg.content}</Streamdown> : msg.content}
                        </div>
                        {msg.role === "user" && (
                          <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[10px] font-bold text-blue-400">RS</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-7 h-7 rounded-full espn-gradient flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="bg-accent rounded-xl px-4 py-3">
                          <div className="flex gap-1 items-center h-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>
                <div className="p-4 border-t border-border flex-shrink-0">
                  {!isAuthenticated ? (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-2">Sign in to use the AI Advisor</p>
                      <Button size="sm" onClick={() => window.location.href = getLoginUrl()}>Sign In</Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Textarea
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                        placeholder="Ask about trades, keepers, draft strategy, opponent analysis..."
                        className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-accent border-border text-sm"
                        rows={1}
                      />
                      <Button
                        onClick={() => sendChat()}
                        disabled={chatLoading || !chatMessage.trim()}
                        className="espn-gradient text-white border-0 flex-shrink-0"
                        size="sm"
                      >
                        {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* ── TAB 7: MY PROFILE ── */}
          <TabsContent value="my-profile" className="mt-0">
            <MyProfileTab />
          </TabsContent>

        </Tabs>
      </div>
    </AppLayout>
  );
}

// ── My Profile Tab Component ───────────────────────────────────────────────

