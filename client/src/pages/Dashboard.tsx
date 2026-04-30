import { useState, useRef, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
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

// ─── Static league intelligence data ──────────────────────────────────────────

const OPPONENT_PROFILES = [
  {
    name: "Jan Graham", team: "ALLFRUMTHEWEST JG", abbr: "JG",
    record25: "11-3", pf25: 2032, rank25: 2, rank24: 9, rank23: 5,
    trajectory: "up", threat: 95,
    behavioral: "League-high scorer, expert trader, never gives value. Most dangerous manager in the league.",
    directive: "Avoid trading. Beat her on the field. Study her roster weekly.",
    badge: "AVOID", badgeColor: "bg-red-500/20 text-red-400 border-red-500/30",
    tierColor: "border-red-500/40 bg-red-500/5",
  },
  {
    name: "Christian Graham", team: "Comebzck S\"ING\"ZZNNN", abbr: "CG",
    record25: "12-2", pf25: 1980, rank25: 1, rank24: 3, rank23: 4,
    trajectory: "steady", threat: 92,
    behavioral: "Most consistent 3-year manager. Does not panic sell. Never gives up value in trades.",
    directive: "Study his keeper pick. Bet against his safe plays. Beat him in head-to-head.",
    badge: "AVOID", badgeColor: "bg-red-500/20 text-red-400 border-red-500/30",
    tierColor: "border-red-500/40 bg-red-500/5",
  },
  {
    name: "Demetri Clark", team: "Giv'me My Trophy", abbr: "DC",
    record25: "8-6", pf25: 1820, rank25: 4, rank24: 1, rank23: 7,
    trajectory: "down", threat: 72,
    behavioral: "2024 champion. Veteran manager. Has championship pedigree and knows how to peak at the right time.",
    directive: "Watch his roster moves. He knows what he's doing. Don't underestimate.",
    badge: "WATCH", badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    tierColor: "border-yellow-500/40 bg-yellow-500/5",
  },
  {
    name: "Marcus Reese", team: "BLUReese6", abbr: "MR",
    record25: "9-5", pf25: 1855, rank25: 3, rank24: 8, rank23: 10,
    trajectory: "up", threat: 70,
    behavioral: "Ascending trajectory. Improving roster management. Dangerous sleeper threat for 2026.",
    directive: "Monitor his waiver adds. He's getting better fast. Don't sleep on him.",
    badge: "WATCH", badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    tierColor: "border-yellow-500/40 bg-yellow-500/5",
  },
  {
    name: "Mark DeRoux", team: "Dominus Thus", abbr: "MD",
    record25: "3-11", pf25: 1580, rank25: 14, rank24: 2, rank23: 14,
    trajectory: "volatile", threat: 45,
    behavioral: "Extreme boom-bust. Desperate when losing. Emotional trader. Will overpay for help early in season.",
    directive: "Hit early when he's 0-2 or 1-3. He'll give up value out of frustration.",
    badge: "BUY LOW", badgeColor: "bg-green-500/20 text-green-400 border-green-500/30",
    tierColor: "border-green-500/40 bg-green-500/5",
  },
  {
    name: "Tony Dorsey", team: "PRIMETIME PLAYAZ", abbr: "TD",
    record25: "5-9", pf25: 1710, rank25: 9, rank24: 11, rank23: 9,
    trajectory: "steady", threat: 40,
    behavioral: "Chronic bad luck. Frustrated manager. Trades volume for wins. Will take less than fair value.",
    directive: "Offer 2-for-1 when he's at 2-4 record. He wants wins, not value.",
    badge: "BUY LOW", badgeColor: "bg-green-500/20 text-green-400 border-green-500/30",
    tierColor: "border-green-500/40 bg-green-500/5",
  },
  {
    name: "Sheldon deRoux", team: "DARE2BGR8", abbr: "SD",
    record25: "7-7", pf25: 1890, rank25: 5, rank24: 6, rank23: 8,
    trajectory: "steady", threat: 55,
    behavioral: "High scorer with terrible schedule luck. His players are undervalued due to his record.",
    directive: "Target his roster. Ignore his record — his players are better than they look.",
    badge: "BUY LOW", badgeColor: "bg-green-500/20 text-green-400 border-green-500/30",
    tierColor: "border-green-500/40 bg-green-500/5",
  },
  {
    name: "Steffon Bizzell", team: "Winkstradamus", abbr: "SB",
    record25: "6-8", pf25: 1760, rank25: 7, rank24: 5, rank23: 11,
    trajectory: "down", threat: 42,
    behavioral: "Overconfident after 2024 Top 5. Overvalues his own players. Will ask too little when he offers first.",
    directive: "Let him offer first. He'll undervalue his own players. Sell high to him.",
    badge: "SELL HIGH", badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    tierColor: "border-blue-500/40 bg-blue-500/5",
  },
  {
    name: "Nate West", team: "Snake 🐍", abbr: "NW",
    record25: "7-7", pf25: 1795, rank25: 6, rank24: 7, rank23: 6,
    trajectory: "steady", threat: 50,
    behavioral: "Consistent mid-tier manager. Steady but not elite. Drafts well but struggles in-season.",
    directive: "Standard trade approach. Fair value exchanges are fine.",
    badge: "FAIR", badgeColor: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    tierColor: "border-slate-500/40 bg-slate-500/5",
  },
  {
    name: "Randy Broner Jr", team: "3 And A Possible", abbr: "RB",
    record25: "6-8", pf25: 1740, rank25: 8, rank24: 10, rank23: 12,
    trajectory: "up", threat: 38,
    behavioral: "Improving manager. Learning the game. Can be exploited with complex trade structures.",
    directive: "Standard approach. Offer fair trades — he's less experienced.",
    badge: "FAIR", badgeColor: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    tierColor: "border-slate-500/40 bg-slate-500/5",
  },
  {
    name: "LOZELL STYLES", team: "SMASHVILLE TITANS", abbr: "LS",
    record25: "4-10", pf25: 1620, rank25: 12, rank24: 3, rank23: 13,
    trajectory: "volatile", threat: 48,
    behavioral: "Volatile manager. Dropped from #3 in 2024 to #12 in 2025. Unpredictable draft behavior.",
    directive: "Watch round 1 for unpredictable picks. Can bounce back fast — don't ignore.",
    badge: "WATCH", badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    tierColor: "border-yellow-500/40 bg-yellow-500/5",
  },
  {
    name: "Marlon Moore", team: "TigerCommander", abbr: "MM",
    record25: "5-9", pf25: 1680, rank25: 10, rank24: 12, rank23: 10,
    trajectory: "steady", threat: 35,
    behavioral: "Consistent lower-tier manager. Predictable draft patterns. Rarely makes aggressive moves.",
    directive: "Safe trade partner. Fair value exchanges work well.",
    badge: "FAIR", badgeColor: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    tierColor: "border-slate-500/40 bg-slate-500/5",
  },
  {
    name: "Jan Graham", team: "Comebzck S\"ING\"ZZNNN", abbr: "CG2",
    record25: "4-10", pf25: 1640, rank25: 11, rank24: 13, rank23: 11,
    trajectory: "down", threat: 32,
    behavioral: "Struggling manager. Below-average roster construction. Potential trade target.",
    directive: "Target for trades when he's desperate. Offer fair value and he'll accept.",
    badge: "BUY LOW", badgeColor: "bg-green-500/20 text-green-400 border-green-500/30",
    tierColor: "border-green-500/40 bg-green-500/5",
  },
  {
    name: "Bruce Edwards", team: "The Playmakers", abbr: "BE",
    record25: "6-8", pf25: 1720, rank25: 13, rank24: 4, rank23: 1,
    trajectory: "down", threat: 44,
    behavioral: "Former champion (#1 in 2023) now declining. Fading trajectory. Overvalues past glory.",
    directive: "Exploit his overconfidence. He thinks he's better than his current roster.",
    badge: "SELL HIGH", badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    tierColor: "border-blue-500/40 bg-blue-500/5",
  },
];

const MULTI_YEAR_RANKINGS = [
  { manager: "Rod Sellers", team: "Str8FrmHell", rank23: 13, rank24: 13, rank25: 1, label: "Biggest Swing ⚡", you: true },
  { manager: "Christian Graham", team: "Comebzck", rank23: 4, rank24: 3, rank25: 1, label: "Consistency King 👑", you: false },
  { manager: "Jan Graham", team: "ALLFRUMTHEWEST", rank23: 5, rank24: 9, rank25: 2, label: "Trending Up 📈", you: false },
  { manager: "Marcus Reese", team: "BLUReese6", rank23: 10, rank24: 8, rank25: 3, label: "Trending Up 📈", you: false },
  { manager: "Demetri Clark", team: "Giv'me My Trophy", rank23: 7, rank24: 1, rank25: 4, label: "Fading 📉", you: false },
  { manager: "Sheldon deRoux", team: "DARE2BGR8", rank23: 8, rank24: 6, rank25: 5, label: "Steady 🔄", you: false },
  { manager: "Nate West", team: "Snake 🐍", rank23: 6, rank24: 7, rank25: 6, label: "Steady 🔄", you: false },
  { manager: "Steffon Bizzell", team: "Winkstradamus", rank23: 11, rank24: 5, rank25: 7, label: "Volatile 🎲", you: false },
  { manager: "Randy Broner Jr", team: "3 And A Possible", rank23: 12, rank24: 10, rank25: 8, label: "Trending Up 📈", you: false },
  { manager: "Tony Dorsey", team: "PRIMETIME PLAYAZ", rank23: 9, rank24: 11, rank25: 9, label: "Steady 🔄", you: false },
  { manager: "Marlon Moore", team: "TigerCommander", rank23: 10, rank24: 12, rank25: 10, label: "Steady 🔄", you: false },
  { manager: "LOZELL STYLES", team: "SMASHVILLE TITANS", rank23: 13, rank24: 3, rank25: 12, label: "Volatile 🎲", you: false },
  { manager: "Mark DeRoux", team: "Dominus Thus", rank23: 14, rank24: 2, rank25: 14, label: "Extreme Volatile 💥", you: false },
  { manager: "Bruce Edwards", team: "The Playmakers", rank23: 1, rank24: 4, rank25: 13, label: "Fading 📉", you: false },
];

const DRAFT_ROUNDS = [
  { round: "Rounds 1–3", priority: "RB / WR", note: "Attack aggressively. Elite RBs are the scarcest commodity in 14-team PPR. Do NOT reach for QB.", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  { round: "Rounds 4–5", priority: "WR2 / Elite TE", note: "Secure second elite WR or target a top-5 TE. Elite TEs (Kelce-tier) create massive positional advantage in PPR.", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  { round: "Rounds 6–8", priority: "QB", note: "Mid-tier QBs score similarly in PPR — waiting extracts value without sacrificing production.", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  { round: "Rounds 9–12", priority: "Flex Depth / Handcuffs", note: "Flex depth, handcuffs to your RB1, high-upside sleepers.", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  { round: "Rounds 13–14", priority: "K / DEF", note: "Always last — they are interchangeable and wasteful when drafted early.", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/30" },
];

const COMPETITOR_DRAFT_INTEL = [
  { name: "Christian Graham", record: "12-2 in 2025", intel: "Will keep an elite stud — removes one top player from the draft pool. Drafts methodically, no panic picks.", risk: "high" },
  { name: "Jan Graham", record: "2,032 pts in 2025", intel: "Will keep her best player and draft aggressively regardless. Expert drafter — don't expect value to fall to you.", risk: "high" },
  { name: "Mark DeRoux", record: "3-11 in 2025", intel: "Will draft emotionally, reaching for name recognition over value. You benefit from his reaches.", risk: "low" },
  { name: "LOZELL STYLES", record: "Volatile (3rd→12th)", intel: "Watch round 1 for unpredictable picks. Dropped 9 spots in one year — could go either way.", risk: "medium" },
];

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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: standings, isLoading: standingsLoading } = trpc.espn.standings.useQuery({ season: 2025 });
  const { data: manifests } = trpc.espn.manifests.useQuery();
  const { data: draftOrder2026Raw } = trpc.espn.draftOrder.useQuery({ season: 2026 });
  const { data: keeperHistoryRaw } = trpc.espn.keeperHistory.useQuery();
  const chatMutation = trpc.advisor.chat.useMutation();

  type DraftOrderEntry = { position: number; teamId: number; name?: string; owners?: string };
  type DraftOrderData = { pickOrder?: DraftOrderEntry[]; draftDate?: number; keeperDeadline?: number };
  type KeeperHistoryEntry = { season: number; teamName: string; playerName: string; position: string; roundId: number; teamId: number };
  const draftOrder2026 = draftOrder2026Raw as DraftOrderData | null;
  const keeperHistory = (keeperHistoryRaw as KeeperHistoryEntry[]) || [];

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
                    {OPPONENT_PROFILES.slice(0, 6).map((opp) => (
                      <div key={opp.name} className="flex items-center gap-3 px-5 py-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${opp.threat >= 85 ? "bg-red-500" : opp.threat >= 60 ? "bg-yellow-500" : "bg-emerald-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{opp.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{opp.team}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-semibold">{opp.pf25.toLocaleString()} pts</p>
                          <p className="text-[10px] text-muted-foreground">{opp.record25} record</p>
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
                      {MULTI_YEAR_RANKINGS.slice(0, 8).map((row) => (
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {OPPONENT_PROFILES.map((opp) => (
                <Card key={opp.name + opp.team} className={`card-glow border ${opp.tierColor}`}>
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
                      <Badge variant="outline" className={`text-[9px] px-1.5 border flex-shrink-0 ${opp.badgeColor}`}>{opp.badge}</Badge>
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
                    {COMPETITOR_DRAFT_INTEL.map((c) => (
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

const POSITION_COLORS_DASH: Record<string, string> = {
  QB:  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  RB:  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  TE:  "bg-orange-500/20 text-orange-300 border-orange-500/30",
  K:   "bg-gray-500/20 text-gray-300 border-gray-500/30",
  DEF: "bg-red-500/20 text-red-300 border-red-500/30",
};

const VALUE_CONFIG_DASH: Record<string, { color: string; bg: string; label: string }> = {
  elite: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", label: "Elite Value" },
  good:  { color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30",       label: "Good Value" },
  fair:  { color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30",   label: "Fair Value" },
  poor:  { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30",         label: "Poor Value" },
};

function MyProfileTab() {
  const { data, isLoading, error } = trpc.espn.keeperEligibility2026.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
      </div>
    );
  }

  if (error || !data?.ownerProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <User className="w-10 h-10 opacity-30" />
        <p className="text-sm">Profile data unavailable</p>
      </div>
    );
  }

  const profile = data.ownerProfile;
  const { careerStats, careerSeasons, keeperHistory, keeper2026 } = profile;

  const trendIcon = careerStats.trend === "improving"
    ? <ArrowUp className="w-3 h-3 text-emerald-400" />
    : careerStats.trend === "declining"
    ? <ArrowDown className="w-3 h-3 text-red-400" />
    : <Minus className="w-3 h-3 text-yellow-400" />;
  const trendColor = careerStats.trend === "improving" ? "text-emerald-400"
    : careerStats.trend === "declining" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="space-y-5">
      {/* Profile Header */}
      <Card className="border-primary/40 bg-primary/5 ring-1 ring-primary/20">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{profile.ownerName}</h2>
                <Badge className="text-[9px] px-1.5 bg-primary/20 text-primary border-primary/30">YOUR TEAM</Badge>
                <Badge variant="outline" className={`text-[9px] px-1.5 flex items-center gap-1 ${trendColor}`}>
                  {trendIcon}
                  {careerStats.trend.charAt(0).toUpperCase() + careerStats.trend.slice(1)}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">{profile.teamName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {careerStats.totalSeasons} seasons · {careerStats.totalWins}W–{careerStats.totalLosses}L · {careerStats.winPct}% win rate · {careerStats.playoffSeasons} playoff appearances
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Career Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Career W–L", value: `${careerStats.totalWins}–${careerStats.totalLosses}`, sub: `${careerStats.winPct}% win rate`, color: "text-foreground" },
          { label: "Total PF", value: careerStats.totalPF.toLocaleString(), sub: `Avg ${careerStats.avgPF.toFixed(0)}/season`, color: "text-blue-400" },
          { label: "Playoff Appearances", value: `${careerStats.playoffSeasons}/${careerStats.totalSeasons}`, sub: "seasons made playoffs", color: "text-emerald-400" },
          { label: "Recent Win %", value: `${careerStats.recentWinPct}%`, sub: "last 3 seasons", color: trendColor },
        ].map((stat, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="py-3 px-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</div>
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Season-by-Season Record */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <BarChart2 className="w-4 h-4 text-primary" />
            Season-by-Season Record (2018–2025)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Season</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Record</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">PF</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">PA</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Seed</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {careerSeasons.map((s) => {
                  const isBest  = s.season === careerStats.bestSeason.season;
                  const isWorst = s.season === careerStats.worstSeason.season;
                  const madePlayoffs = s.seed <= 7;
                  return (
                    <tr key={s.season} className={`border-b border-border/50 transition-colors ${
                      isBest ? "bg-emerald-500/5" : isWorst ? "bg-red-500/5" : "hover:bg-accent/20"
                    }`}>
                      <td className="py-2 px-2 font-semibold text-foreground">
                        {s.season}
                        {isBest  && <Badge className="ml-1.5 text-[8px] px-1 py-0 bg-emerald-600 text-white border-0">BEST</Badge>}
                        {isWorst && <Badge className="ml-1.5 text-[8px] px-1 py-0 bg-red-700 text-white border-0">WORST</Badge>}
                      </td>
                      <td className="py-2 px-2">
                        <span className={s.wins > s.losses ? "text-emerald-400 font-semibold" : s.wins < s.losses ? "text-red-400 font-semibold" : "text-yellow-400 font-semibold"}>
                          {s.wins}–{s.losses}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-foreground">{s.pf.toFixed(1)}</td>
                      <td className="py-2 px-2 text-muted-foreground">{s.pa.toFixed(1)}</td>
                      <td className="py-2 px-2 text-muted-foreground">#{s.seed}</td>
                      <td className="py-2 px-2">
                        {madePlayoffs ? (
                          <Badge variant="outline" className="text-[9px] px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Playoffs</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1.5 bg-slate-500/10 text-slate-400 border-slate-500/30">Missed</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Keeper History */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Star className="w-4 h-4 text-yellow-400" />
            Keeper History (2022–2025)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {keeperHistory.map((k, i) => {
              const posClass = POSITION_COLORS_DASH[k.position?.toUpperCase()] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                  k.eligible2026 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-slate-800/40 border-border/50"
                }`}>
                  <div className="text-sm font-bold text-muted-foreground w-10 flex-shrink-0">{k.season}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{k.playerName}</span>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${posClass}`}>{k.position}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Kept in Round {k.round}</div>
                  </div>
                  {k.eligible2026 ? (
                    <Badge variant="outline" className="text-[9px] px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex-shrink-0">Eligible 2026</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1.5 bg-slate-500/10 text-slate-400 border-slate-500/30 flex-shrink-0">Past</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 2026 Keeper Decision */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
            <Target className="w-4 h-4" />
            2026 Keeper Decision
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {keeper2026.eligible.length > 0 ? (
            keeper2026.eligible.map((p, i) => {
              const valCfg = VALUE_CONFIG_DASH[p.valueTier] ?? VALUE_CONFIG_DASH.fair;
              const posClass = POSITION_COLORS_DASH[p.position?.toUpperCase()] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{p.playerName}</span>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${posClass}`}>{p.position}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Keep in Round {p.roundCost2026} for 2026</div>
                  </div>
                  <Badge variant="outline" className={`text-[9px] px-1.5 flex-shrink-0 ${valCfg.bg} ${valCfg.color}`}>
                    {valCfg.label}
                  </Badge>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-muted-foreground italic">No eligible keepers for 2026</div>
          )}
          <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mt-2">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-200/80">{keeper2026.recommendation}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
