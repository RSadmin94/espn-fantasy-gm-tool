import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Trash2, User, Loader2, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

const SUGGESTED_PROMPTS = [
  "Who are my biggest threats heading into 2026 and how do I neutralize them?",
  "Which managers should I target for trades and what offers should I make?",
  "What are the top waiver wire priorities for early-season 2026?",
  "Analyze my 2025-2026 performance trend and what it means for 2026.",
  "Who will rise and who will fall in 2026 based on 3-year trajectory?",
  "What is the current 2026 draft order?",
];

interface AdvisorPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AdvisorPanel({ open, onClose }: AdvisorPanelProps) {
  const [season] = useState(2025);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: history, isLoading: histLoading } = trpc.advisor.history.useQuery(
    { season },
    { enabled: isAuthenticated && open }
  );

  const chatMutation = trpc.advisor.chat.useMutation({
    onSuccess: () => {
      utils.advisor.history.invalidate({ season });
      setMessage("");
    },
    onError: (err) => toast.error(err.message || "Failed to get response"),
  });

  const clearMutation = trpc.advisor.clearHistory.useMutation({
    onSuccess: () => utils.advisor.history.invalidate({ season }),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const handleSend = () => {
    if (!message.trim()) return;
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    chatMutation.mutate({ message: message.trim(), season });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messages = history || [];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] max-w-[95vw] bg-card border-l border-border z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-card/80 backdrop-blur-sm flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl espn-gradient flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">AI GM Advisor</p>
            <p className="text-[11px] text-muted-foreground leading-tight">ATLANTAS FINEST FF · 2025 Season</p>
          </div>
          <Badge className="espn-gradient text-white border-0 text-[9px] px-1.5">AI</Badge>
          {messages.length > 0 && (
            <button
              onClick={() => clearMutation.mutate()}
              className="text-muted-foreground hover:text-red-400 transition-colors p-1"
              title="Clear history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 ml-1"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!isAuthenticated ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Bot className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">Sign in to use the AI GM Advisor</p>
              <Button
                size="sm"
                onClick={() => { window.location.href = getLoginUrl(); }}
                className="espn-gradient text-white border-0"
              >
                Sign In
              </Button>
            </div>
          ) : histLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-5">
              <div className="w-12 h-12 rounded-2xl espn-gradient flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">GM Advisor Ready</p>
                <p className="text-xs text-muted-foreground mt-1">Ask anything about ATLANTAS FINEST FF</p>
              </div>
              <div className="w-full space-y-2">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setMessage(prompt)}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-accent/50 hover:border-primary/40 transition-all text-xs text-muted-foreground hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {(messages as Record<string, unknown>[]).map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div key={i} className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${isUser ? "bg-primary/20" : "espn-gradient"}`}>
                      {isUser ? <User className="w-3 h-3 text-primary" /> : <Bot className="w-3 h-3 text-white" />}
                    </div>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-xs ${isUser ? "bg-primary/15 text-foreground" : "bg-background border border-border text-foreground"}`}>
                      {isUser ? (
                        <p>{String(msg.content || "")}</p>
                      ) : (
                        <div className="prose prose-invert prose-xs max-w-none">
                          <Streamdown>{String(msg.content || "")}</Streamdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {chatMutation.isPending && (
                <div className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full flex-shrink-0 espn-gradient flex items-center justify-center">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <div className="bg-background border border-border rounded-xl px-3 py-2.5">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        {isAuthenticated && (
          <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-card/50">
            <div className="flex gap-2 items-end">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your league, players, trades, or strategy..."
                className="flex-1 min-h-[40px] max-h-28 resize-none bg-input border-border text-foreground placeholder:text-muted-foreground text-xs"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!message.trim() || chatMutation.isPending}
                className="espn-gradient text-white border-0 h-10 w-10 p-0 flex-shrink-0"
              >
                {chatMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
          </div>
        )}
      </div>
    </>
  );
}
