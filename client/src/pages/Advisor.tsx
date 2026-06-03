import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
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
  Bot,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  User,
  Dna,
  BarChart3,
  Swords,
  Flame,
  ArrowRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

interface HistoryRow {
  role: string;
  content: string;
  createdAt?: Date | string;
}

interface OwnerRow {
  ownerKey: string;
  ownerName?: string;
  seasons?: number[];
  championships?: number;
}

// ── Suggested questions (LeagueDNA framing) ─────────────────────────────────

const SUGGESTED_PROMPTS = [
  "Why haven't I won?",
  "Who is my biggest rival?",
  "What does a championship team look like in this league?",
  "What patterns do champions follow?",
  "Who always reaches in the draft?",
  "How can I win this year?",
];

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ── Chat message bubble ─────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-3 items-start", isUser && "flex-row-reverse")}>
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
        isUser
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground"
      )}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn(
        "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "rounded-tr-sm bg-primary/15 text-foreground"
          : "rounded-tl-sm bg-card border border-border text-foreground"
      )}>
        {msg.pending
          ? <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </span>
          : <span className="whitespace-pre-wrap">{msg.content}</span>}
      </div>
    </div>
  );
}

// ── League-wide insight card ────────────────────────────────────────────────

function InsightCard({ icon, tag, children }: { icon: React.ReactNode; tag: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          {icon}
          {tag}
        </div>
        <div className="mt-3 text-sm leading-relaxed text-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}

// ── Biggest Threat card (LeagueDNA Advisor — Increment 2) ────────────────────
// Consumes me.biggestThreat (deterministic, no LLM). Renders one prominent card
// near the top, or hides entirely when no threat is available.

const THREAT_COLORS: Record<string, { text: string; ring: string; bg: string }> = {
  "Apex Threat":     { text: "#ef4444", ring: "rgba(239,68,68,.50)",   bg: "rgba(239,68,68,.08)" },
  "Major Threat":    { text: "#f7902f", ring: "rgba(247,144,47,.50)",  bg: "rgba(247,144,47,.07)" },
  "Moderate Threat": { text: "#f5c518", ring: "rgba(245,197,24,.45)",  bg: "rgba(245,197,24,.06)" },
  "Minor Threat":    { text: "#a3e635", ring: "rgba(163,230,53,.40)",  bg: "rgba(163,230,53,.05)" },
  "Negligible":      { text: "#8b97a8", ring: "rgba(139,151,168,.35)", bg: "rgba(139,151,168,.05)" },
};

interface ThreatStats {
  h2hRecordVsYou: string;
  playoffEliminations: number;
  championships: number;
  runnerUps: number;
  heatLabel: string;
  gmArchetype: string | null;
  exploitabilityLabel: string | null;
  currentStreak: string;
}
interface ThreatData {
  threat: {
    ownerName: string;
    threatScore: number;
    threatLevel: string;
    reason: string;
    stats: ThreatStats;
  } | null;
}

function BiggestThreatCard({ data, loading }: { data: ThreatData | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Swords className="h-4 w-4" /> Biggest Threat
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning the league for your biggest threat&hellip;
        </div>
      </div>
    );
  }

  const threat = data?.threat ?? null;
  if (!threat) return null; // clean hide when no threat exists

  const c = THREAT_COLORS[threat.threatLevel] ?? THREAT_COLORS["Negligible"];
  const s = threat.stats;

  const chips: string[] = [`${s.h2hRecordVsYou} vs you`];
  if (s.playoffEliminations > 0)
    chips.push(`${s.playoffEliminations}× knocked you out`);
  if (s.championships > 0) chips.push(`${s.championships}× champion`);
  else if (s.runnerUps > 0) chips.push(`${s.runnerUps}× finalist`);
  if (s.heatLabel) chips.push(`${s.heatLabel} rivalry`);
  if (s.exploitabilityLabel) chips.push(s.exploitabilityLabel);

  const showStreak = !!s.currentStreak && !s.currentStreak.startsWith("No active");

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-6"
      style={{ borderColor: c.ring, background: `linear-gradient(135deg, ${c.bg}, transparent 62%)` }}
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: c.text }}>
        <Swords className="h-4 w-4" /> Biggest Threat
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight text-foreground">{threat.ownerName}</h2>
          <span
            className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
            style={{ color: c.text, background: c.bg, border: `1px solid ${c.ring}` }}
          >
            {threat.threatLevel}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full border-2"
            style={{ borderColor: c.ring, color: c.text, background: c.bg }}
          >
            <span className="text-2xl font-black tabular-nums">{threat.threatScore}</span>
          </div>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Threat / 100</span>
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground">{threat.reason}</p>

      {showStreak && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: c.text }}>
          <Flame className="h-3.5 w-3.5" /> {s.currentStreak}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {chips.map((chip, i) => (
          <span key={i} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <a
          href="/rivalry-center"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-opacity hover:opacity-85"
          style={{ color: c.text, background: c.bg, border: `1px solid ${c.ring}` }}
        >
          Open Rivalry Center <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export function Advisor() {
  const cachedQ = trpc.espn.cachedSeasons.useQuery();
  const cachedSeasons: number[] = cachedQ.data ?? [];
  const defaultSeason = cachedSeasons.length > 0 ? Math.max(...cachedSeasons) : 2025;

  // League-wide briefing data (no focal-user dependency — safe for all users)
  const profileQ = (trpc as any).me.activeProfile.useQuery(undefined, { retry: false, staleTime: 600_000 });
  const summaryQ = (trpc as any).me.leagueSummary.useQuery(undefined, { staleTime: 600_000 });
  const threatQ = (trpc as any).me.biggestThreat.useQuery(undefined, { staleTime: 600_000, retry: false });
  const ownersQ = (trpc as any).owners.ownerList.useQuery(undefined, { staleTime: 300_000 });

  const ownerName: string | null = profileQ.data?.isSetupComplete ? (profileQ.data.selectedOwnerName ?? null) : null;
  const firstName = ownerName ? String(ownerName).split(/\s+/)[0] : null;

  const allOwners: OwnerRow[] = ownersQ.data?.allOwners ?? [];
  const seasonsCount: number = summaryQ.data?.seasons ?? cachedSeasons.length;
  const ownersCount = allOwners.length;
  const matchupsCount: number | null = summaryQ.data?.matchups ?? null;
  const picksCount: number | null = summaryQ.data?.draftPicks ?? null;

  const totalTitles = allOwners.reduce((s, o) => s + (o.championships ?? 0), 0);
  const championCount = allOwners.filter((o) => (o.championships ?? 0) > 0).length;
  const topChamp = allOwners.length
    ? [...allOwners].sort((a, b) => (b.championships ?? 0) - (a.championships ?? 0))[0]
    : null;
  const mostTenured = allOwners.length
    ? [...allOwners].sort((a, b) => (b.seasons?.length ?? 0) - (a.seasons?.length ?? 0))[0]
    : null;

  const [season, setSeason] = useState(defaultSeason);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const historyQ = trpc.advisor.history.useQuery(
    { season },
    { retry: false, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (historyQ.data && !historyLoaded) {
      const rows = historyQ.data as HistoryRow[];
      const mapped: ChatMessage[] = rows
        .filter((r) => r.role === "user" || r.role === "assistant")
        .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
      if (mapped.length > 0) setMessages(mapped);
      setHistoryLoaded(true);
    }
  }, [historyQ.data, historyLoaded]);

  useEffect(() => {
    setHistoryLoaded(false);
    setMessages([]);
  }, [season]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const utils = trpc.useUtils();

  const clearMutation = trpc.advisor.clearHistory.useMutation({
    onSuccess: () => {
      setMessages([]);
      void utils.advisor.history.invalidate();
    },
  });

  const chatMutation = trpc.advisor.chat.useMutation({
    onSuccess: (data) => {
      const resp = data as { message: string };
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => !m.pending);
        return [...withoutPending, { role: "assistant", content: resp.message }];
      });
    },
    onError: (err) => {
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => !m.pending);
        return [
          ...withoutPending,
          {
            role: "assistant",
            content: err.message.includes("trial")
              ? "Your free trial has ended. Upgrade to continue using the advisor."
              : err.message.includes("Rate limit")
                ? "You've hit the rate limit. Please wait a moment before sending another message."
                : "Error: " + err.message,
          },
        ];
      });
    },
  });

  const isSending = chatMutation.isPending;

  function sendMessage(text: string) {
    const msg = text.trim();
    if (!msg || isSending) return;
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: msg },
      { role: "assistant", content: "", pending: true },
    ]);
    chatMutation.mutate({ message: msg, season });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0 && !historyQ.isLoading;

  const heroLine =
    "I've analyzed " +
    (seasonsCount ? seasonsCount + " seasons" : "your league") +
    (matchupsCount != null ? ", " + matchupsCount.toLocaleString() + " matchups" : "") +
    (ownersCount ? ", " + ownersCount + " owners" : "") +
    (picksCount != null ? ", and " + picksCount.toLocaleString() + " draft picks" : ", and your draft history") +
    ". Here are today's insights.";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-10">
      {/* Hero */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-card to-background p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Dna className="h-4 w-4" />
          LeagueDNA Advisor
        </div>
        <h1 className="mt-2 text-2xl font-bold text-foreground">
          {timeGreeting()}{firstName ? ", " + firstName : ""}.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{heroLine}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">The only AI trained on your league's history.</p>
      </div>

      {/* Biggest Threat (LeagueDNA Advisor — Increment 2) */}
      <BiggestThreatCard data={threatQ.data} loading={threatQ.isLoading} />

      {/* League-wide insight cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <InsightCard icon={<Dna className="h-3.5 w-3.5" />} tag="League DNA">
          {topChamp ? (
            <>
              <span className="font-semibold text-foreground">{topChamp.ownerName ?? "Unknown"}</span>
              {" "}leads the league with{" "}
              <span className="font-semibold text-foreground">{topChamp.championships ?? 0}</span>
              {" "}{(topChamp.championships ?? 0) === 1 ? "title" : "titles"}.
              <div className="mt-2 text-muted-foreground">
                {championCount} of {ownersCount} owners have won a championship
                {seasonsCount ? " across " + seasonsCount + " seasons" : ""}. Total titles awarded: {totalTitles}.
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">Loading league championship history...</span>
          )}
        </InsightCard>

        <InsightCard icon={<BarChart3 className="h-3.5 w-3.5" />} tag="League at a Glance">
          {mostTenured ? (
            <>
              <span className="font-semibold text-foreground">{ownersCount}</span> managers have competed
              {seasonsCount ? <> across <span className="font-semibold text-foreground">{seasonsCount}</span> seasons</> : null}
              {matchupsCount != null ? <> and <span className="font-semibold text-foreground">{matchupsCount.toLocaleString()}</span> matchups</> : null}.
              <div className="mt-2 text-muted-foreground">
                Longest-tenured: <span className="text-foreground">{mostTenured.ownerName ?? "Unknown"}</span>
                {" "}({mostTenured.seasons?.length ?? 0} seasons).
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">Loading league overview...</span>
          )}
        </InsightCard>
      </div>

      {/* Ask LeagueDNA Advisor (chat) */}
      <Card className="flex flex-col overflow-hidden">
        <CardContent className="flex flex-col p-0">
          {/* Chat header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Ask LeagueDNA Advisor</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...cachedSeasons].reverse().map((s) => (
                    <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground"
                  disabled={clearMutation.isPending}
                  onClick={() => clearMutation.mutate()}
                >
                  {clearMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="h-[420px] space-y-4 overflow-y-auto px-4 py-4">
            {historyQ.isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading history...
              </div>
            )}
            {isEmpty && (
              <div className="flex h-full flex-col items-center justify-center space-y-3 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Ask anything about your league</p>
                  <p className="mt-1 text-sm text-muted-foreground">Rivals, draft patterns, championship paths -- backed by your real history.</p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested prompts */}
          {isEmpty && (
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={isSending}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your LeagueDNA Advisor... (Enter to send, Shift+Enter for newline)"
                disabled={isSending}
                className={cn(
                  "flex-1 resize-none rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring",
                  "disabled:opacity-50 min-h-[40px] max-h-32 overflow-y-auto"
                )}
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0"
                disabled={!input.trim() || isSending}
                onClick={() => sendMessage(input)}
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              Responses use real {season} season data &middot; Requires active subscription
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
