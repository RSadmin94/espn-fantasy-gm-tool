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
  AlertCircle,
  Bot,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  User,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Prompt chips ──────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "Who should I start this week?",
  "Who should I target in a trade?",
  "What is my biggest roster weakness?",
  "Who should I drop from my bench?",
  "How do my playoff odds look?",
  "Who is the best keeper value on my roster?",
];

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-3 items-start", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
        isUser
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground"
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5" />
          : <Bot className="h-3.5 w-3.5" />}
      </div>

      {/* Bubble */}
      <div className={cn(
        "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "rounded-tr-sm bg-primary/15 text-foreground"
          : "rounded-tl-sm bg-card border border-border text-foreground"
      )}>
        {msg.pending
          ? <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </span>
          : <span className="whitespace-pre-wrap">{msg.content}</span>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Advisor() {
  const cachedQ = trpc.espn.cachedSeasons.useQuery();
  const cachedSeasons: number[] = cachedQ.data ?? [];
  const defaultSeason = cachedSeasons.length > 0
    ? Math.max(...cachedSeasons)
    : 2025;

  const [season, setSeason] = useState(defaultSeason);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history from DB on mount / season change
  const historyQ = trpc.advisor.history.useQuery(
    { season },
    {
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (historyQ.data && !historyLoaded) {
      const rows = historyQ.data as HistoryRow[];
      const mapped: ChatMessage[] = rows
        .filter(r => r.role === "user" || r.role === "assistant")
        .map(r => ({ role: r.role as "user" | "assistant", content: r.content }));
      if (mapped.length > 0) setMessages(mapped);
      setHistoryLoaded(true);
    }
  }, [historyQ.data, historyLoaded]);

  // Reset history flag when season changes
  useEffect(() => {
    setHistoryLoaded(false);
    setMessages([]);
  }, [season]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const utils = trpc.useUtils();

  // Clear history mutation
  const clearMutation = trpc.advisor.clearHistory.useMutation({
    onSuccess: () => {
      setMessages([]);
      void utils.advisor.history.invalidate();
    },
  });

  // Chat mutation
  const chatMutation = trpc.advisor.chat.useMutation({
    onSuccess: (data) => {
      const resp = data as { message: string };
      setMessages(prev => {
        // Replace the last pending bubble with the real response
        const withoutPending = prev.filter(m => !m.pending);
        return [...withoutPending, { role: "assistant", content: resp.message }];
      });
    },
    onError: (err) => {
      setMessages(prev => {
        const withoutPending = prev.filter(m => !m.pending);
        return [
          ...withoutPending,
          {
            role: "assistant",
            content: err.message.includes("trial")
              ? "⚠️ Your free trial has ended. Upgrade to continue using the AI Advisor."
              : err.message.includes("Rate limit")
                ? "⚠️ You've hit the rate limit. Please wait a moment before sending another message."
                : `⚠️ Error: ${err.message}`,
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
    setMessages(prev => [
      ...prev,
      { role: "user", content: msg },
      { role: "assistant", content: "", pending: true },
    ]);

    chatMutation.mutate({ message: msg, season });

    // Refocus input
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0 && !historyQ.isLoading;

  return (
    <div className="mx-auto flex max-w-3xl flex-col" style={{ height: "calc(100vh - 8rem)" }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Advisor</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Ask your GM strategy questions — backed by real league data.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Season context */}
          <Select
            value={String(season)}
            onValueChange={v => setSeason(Number(v))}
          >
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...cachedSeasons].reverse().map(s => (
                <SelectItem key={s} value={String(s)} className="text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear history */}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              disabled={clearMutation.isPending}
              onClick={() => clearMutation.mutate()}
            >
              {clearMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RotateCcw className="h-3.5 w-3.5" />}
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Chat area */}
      <Card className="flex flex-1 flex-col overflow-hidden min-h-0">
        <CardContent className="flex flex-1 flex-col p-0 min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
            {/* Loading history */}
            {historyQ.isLoading && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading history…
              </div>
            )}

            {/* Empty state */}
            {isEmpty && (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center space-y-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">GM Advisor</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ask anything about your league, roster, or strategy.
                  </p>
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested prompts — only shown when chat is empty and history loaded */}
          {isEmpty && (
            <div className="px-4 pb-3 flex flex-wrap gap-2 shrink-0">
              {SUGGESTED_PROMPTS.map(prompt => (
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
          <div className="border-t border-border p-3 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your GM advisor… (Enter to send, Shift+Enter for newline)"
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
                {isSending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              Responses use real {season} season data · Requires active subscription
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
