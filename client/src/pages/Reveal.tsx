import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";

// ─── Suspense layer copy ──────────────────────────────────────────────────────
const SUSPENSE_LINES = [
  "Analyzing 9 seasons of league history…",
  "Mapping rivalry patterns across 126 matchups…",
  "Detecting trade behavior and timing patterns…",
  "Identifying your most actionable opponent…",
];

const LINE_DURATION_MS = 1150; // 4 lines × 1.15s ≈ 4.6s total
const SKIP_AVAILABLE_AFTER_LINE = 1; // 0-indexed: after line 2 (index 1)

// ─── Reveal content ───────────────────────────────────────────────────────────
const MAIN_REVEAL = {
  label: "YOUR MOST ACTIONABLE OPPONENT",
  headline: "Christian Is Vulnerable Right Now.",
  evidence:
    "Over the last 3 seasons, Christian's trade activity spikes after consecutive losses — and he consistently overpays in those windows.",
  implication: "You have a small window before Week 4. He'll be motivated to deal.",
};

const SECONDARY_CARDS = [
  {
    label: "YOUR DRAFT TENDENCIES",
    copy: "You consistently reach for aging RBs in rounds 3–5 after strong playoff finishes. This pattern appears consistently in your draft history.",
  },
  {
    label: "MOST LIKELY TO DEAL RIGHT NOW",
    copy: "Snake has initiated 3 of his last 4 trades within 48 hours of a primetime loss. He's your best trade partner in this window.",
  },
  {
    label: "LEAGUE MARKET PATTERN",
    copy: "Future 2nd-round picks are consistently undervalued in your league after Week 5. This is your most repeatable edge.",
  },
];

const BLURRED_CARDS = [
  { label: "FULL MANAGER PROFILES", meta: "14 managers analyzed" },
  { label: "TRADE NEGOTIATION PATTERNS", meta: "Your optimal timing windows" },
  { label: "BEHAVIORAL TIMELINES", meta: "Season-by-season tendencies" },
  { label: "CHAMPIONSHIP WINDOW ANALYSIS", meta: "Your realistic title path" },
];

// ─── Animation helpers ────────────────────────────────────────────────────────
type Phase = "suspense" | "reveal";

export default function Reveal() {
  const [phase, setPhase] = useState<Phase>("suspense");
  const [activeLine, setActiveLine] = useState(0);
  const [showSkip, setShowSkip] = useState(false);
  const [revealVisible, setRevealVisible] = useState(false);
  const [secondaryVisible, setSecondaryVisible] = useState(false);
  const [blurVisible, setBlurVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, navigate] = useLocation();

  // ── Suspense sequencing ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "suspense") return;

    const advance = (lineIndex: number) => {
      if (lineIndex >= SUSPENSE_LINES.length) {
        transitionToReveal();
        return;
      }
      setActiveLine(lineIndex);
      if (lineIndex >= SKIP_AVAILABLE_AFTER_LINE) {
        setShowSkip(true);
      }
      timerRef.current = setTimeout(() => advance(lineIndex + 1), LINE_DURATION_MS);
    };

    timerRef.current = setTimeout(() => advance(0), 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const transitionToReveal = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("reveal");
    // Staggered fade-in sequence
    setTimeout(() => setRevealVisible(true), 100);
    setTimeout(() => setSecondaryVisible(true), 700);
    setTimeout(() => setBlurVisible(true), 1200);
    setTimeout(() => setCtaVisible(true), 1700);
  };

  const handleSkip = () => transitionToReveal();

  // ─── Suspense screen ────────────────────────────────────────────────────────
  if (phase === "suspense") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 relative">
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
          <div
            className="h-full bg-white/30 transition-all ease-linear"
            style={{
              width: `${((activeLine + 1) / SUSPENSE_LINES.length) * 100}%`,
              transitionDuration: `${LINE_DURATION_MS}ms`,
            }}
          />
        </div>

        {/* Lines */}
        <div className="max-w-xl w-full space-y-5">
          {SUSPENSE_LINES.slice(0, activeLine + 1).map((line, i) => (
            <p
              key={i}
              className={`text-lg font-mono transition-all duration-500 ${
                i === activeLine
                  ? "text-white opacity-100"
                  : "text-white/40 opacity-100"
              }`}
              style={{
                animation: i === activeLine ? "fadeIn 0.4s ease-out" : undefined,
              }}
            >
              {line}
            </p>
          ))}
        </div>

        {/* Skip */}
        {showSkip && (
          <button
            onClick={handleSkip}
            className="absolute bottom-8 right-8 text-white/25 text-sm font-mono hover:text-white/50 transition-colors"
          >
            Skip →
          </button>
        )}

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // ─── Reveal screen ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center px-6 py-16 overflow-y-auto">
      <div className="max-w-2xl w-full flex flex-col items-center gap-12">

        {/* ── Main Reveal Card ── */}
        <div
          className={`w-full transition-all duration-700 ${
            revealVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-8 py-12 text-center">
            <p className="text-[11px] tracking-[0.2em] uppercase text-white/40 mb-5 font-mono">
              {MAIN_REVEAL.label}
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-6">
              {MAIN_REVEAL.headline}
            </h1>
            <p className="text-white/70 text-lg leading-relaxed mb-5">
              {MAIN_REVEAL.evidence}
            </p>
            <p className="text-white/45 text-sm italic">
              {MAIN_REVEAL.implication}
            </p>
          </div>
        </div>

        {/* ── Secondary Cards ── */}
        <div
          className={`w-full transition-all duration-700 ${
            secondaryVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {SECONDARY_CARDS.map((card, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/8 bg-white/[0.025] px-5 py-6"
              >
                <p className="text-[10px] tracking-[0.18em] uppercase text-white/35 mb-3 font-mono">
                  {card.label}
                </p>
                <p className="text-white/65 text-sm leading-relaxed">
                  {card.copy}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Blurred Cards ── */}
        <div
          className={`w-full transition-all duration-700 ${
            blurVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {BLURRED_CARDS.map((card, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/8 bg-white/[0.025] px-5 py-6 relative overflow-hidden"
              >
                {/* Visible label */}
                <p className="text-[10px] tracking-[0.18em] uppercase text-white/35 mb-3 font-mono">
                  {card.label}
                </p>
                <p className="text-white/50 text-xs font-mono mb-4">
                  → {card.meta}
                </p>
                {/* Blurred content placeholder */}
                <div
                  className="space-y-2"
                  style={{ filter: "blur(4px)", opacity: 0.55, userSelect: "none" }}
                  aria-hidden="true"
                >
                  <div className="h-3 bg-white/20 rounded w-full" />
                  <div className="h-3 bg-white/15 rounded w-4/5" />
                  <div className="h-3 bg-white/10 rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ── */}
        <div
          className={`w-full flex flex-col items-center gap-4 transition-all duration-700 ${
            ctaVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <button
            onClick={() => navigate("/command-center")}
            className="w-full sm:w-80 py-4 px-8 rounded-xl bg-white text-[#0a0a0a] font-semibold text-base tracking-wide hover:bg-white/90 transition-colors shadow-[0_0_32px_rgba(255,255,255,0.12)]"
          >
            Unlock Your Full League DNA
          </button>
          <p className="text-white/30 text-xs text-center max-w-xs leading-relaxed">
            See every manager's behavioral profile, trade patterns, and your full
            championship intelligence report.
          </p>
        </div>

      </div>
    </div>
  );
}
