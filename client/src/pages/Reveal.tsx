import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";

// ─── Suspense animation ───────────────────────────────────────────────────────
const SUSPENSE_LINES = [
  "Analyzing 9 seasons of league history…",
  "Mapping rivalry patterns across 126 matchups…",
  "Detecting trade behavior and timing patterns…",
  "Identifying your most actionable opponent…",
];

const LINE_DURATION_MS = 1150;
const SKIP_AVAILABLE_AFTER_LINE = 1; // 0-indexed

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

  // Pre-fetch rivalry scores during suspense
  const { data: rivalryData } = trpc.rivalry.getScores.useQuery(undefined, {
    staleTime: 1000 * 60 * 10,
  });
  // The biggest rival (highest score)
  const biggestRival = rivalryData?.[0] ?? null;

  // Pre-fetch during suspense so data is ready when reveal starts
  const { data, isLoading, isError } = trpc.onboarding.getRevealData.useQuery(undefined, {
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const checkoutMutation = trpc.billing.createCheckoutSession.useMutation();

  // ── Suspense sequencing ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "suspense") return;

    const advance = (lineIndex: number) => {
      if (lineIndex >= SUSPENSE_LINES.length) {
        transitionToReveal();
        return;
      }
      setActiveLine(lineIndex);
      if (lineIndex >= SKIP_AVAILABLE_AFTER_LINE) setShowSkip(true);
      timerRef.current = setTimeout(() => advance(lineIndex + 1), LINE_DURATION_MS);
    };

    timerRef.current = setTimeout(() => advance(0), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const transitionToReveal = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("reveal");
    setTimeout(() => setRevealVisible(true), 100);
    setTimeout(() => setSecondaryVisible(true), 700);
    setTimeout(() => setBlurVisible(true), 1200);
    setTimeout(() => setCtaVisible(true), 1700);
  };

  // ── Blurred profiles: exclude self, champion, rival ─────────────────────
  const blurredProfiles = useMemo(() => {
    if (!data) return [];
    return data.allProfiles
      .filter(
        (p) =>
          p.ownerName !== data.self.ownerName &&
          p.ownerName !== data.champion.ownerName &&
          p.ownerName !== data.rival.ownerName,
      )
      .slice(0, 4);
  }, [data]);

  const handleCheckout = async () => {
    try {
      const result = await checkoutMutation.mutateAsync({ origin: window.location.origin });
      if (result?.url) window.open(result.url, "_blank");
    } catch (err) {
      console.error("[Reveal] Checkout error:", err);
    }
  };

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
                i === activeLine ? "text-white opacity-100" : "text-white/40 opacity-100"
              }`}
              style={{ animation: i === activeLine ? "fadeIn 0.4s ease-out" : undefined }}
            >
              {line}
            </p>
          ))}
        </div>

        {showSkip && (
          <button
            onClick={transitionToReveal}
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

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center px-6 py-16 overflow-y-auto">
        <div className="max-w-2xl w-full flex flex-col items-center gap-12 animate-pulse">
          <div className="w-full h-64 rounded-2xl bg-white/[0.04] border border-white/8" />
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-40 rounded-xl bg-white/[0.025] border border-white/8" />
            <div className="h-40 rounded-xl bg-white/[0.025] border border-white/8" />
            <div className="h-40 rounded-xl bg-white/[0.025] border border-white/8" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6 text-center">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-white">Could not load your league profile.</h1>
          <p className="text-white/40">Your league data may not be synced yet, or there was a connection issue.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm text-white"
            >
              Try Again
            </button>
            <a
              href="/connect"
              className="px-6 py-3 rounded-xl bg-white text-[#0a0a0a] font-semibold text-sm hover:bg-white/90 transition-colors"
            >
              Reconnect League →
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Reveal screen ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center px-6 py-16 overflow-y-auto">
      <div className="max-w-2xl w-full flex flex-col items-center gap-12">

        {/* ── Main Rival Card ── */}
        <div
          className={`w-full transition-all duration-700 ${
            revealVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-8 py-12 text-center">
            <p className="text-[11px] tracking-[0.2em] uppercase text-white/40 mb-5 font-mono">
              Your Most Actionable Opponent
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-6">
              {data.rival.ownerName} Is Vulnerable Right Now.
            </h1>
            <p className="text-white/70 text-lg leading-relaxed mb-5">
              {data.rival.exploitWindows?.[0]
                ? data.rival.exploitWindows[0]
                : `${data.rival.ownerName} has a trade loss ratio of ${(data.rival.lossTradeRatio * 100).toFixed(0)}% — they consistently give up value in deals.`}
            </p>
            <p className="text-white/45 text-sm italic">
              H2H record: {data.rival.h2hRecord.wins}W–{data.rival.h2hRecord.losses}L.
              {" "}Exploitability: {data.rival.exploitabilityLabel}.
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
            {/* Your GM Style */}
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-5 py-6">
              <p className="text-[10px] tracking-[0.18em] uppercase text-white/35 mb-3 font-mono">
                Your GM Style
              </p>
              <p className="text-white font-semibold mb-2">{data.self.gmArchetype}</p>
              <p className="text-white/65 text-sm leading-relaxed">
                {data.self.dnaSummary.split(".")[0]}.
              </p>
            </div>

            {/* League Champion */}
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-5 py-6">
              <p className="text-[10px] tracking-[0.18em] uppercase text-white/35 mb-3 font-mono">
                League Champion
              </p>
              <p className="text-white/65 text-sm leading-relaxed">
                <span className="text-white font-semibold">{data.champion.ownerName}</span> has won{" "}
                {data.champion.championshipCount} title{data.champion.championshipCount !== 1 ? "s" : ""}.
                Most recent: {data.champion.mostRecentTitle}.
                Style: {data.champion.gmArchetype}.
              </p>
            </div>

            {/* Rivalry Heat */}
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-5 py-6">
              <p className="text-[10px] tracking-[0.18em] uppercase text-white/35 mb-3 font-mono">
                Rivalry Heat
              </p>
              {biggestRival ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      biggestRival.heatLabel === "Inferno" ? "bg-red-500/20 text-red-400" :
                      biggestRival.heatLabel === "Burning" ? "bg-orange-500/20 text-orange-400" :
                      biggestRival.heatLabel === "Heated" ? "bg-yellow-500/20 text-yellow-400" :
                      biggestRival.heatLabel === "Simmering" ? "bg-amber-500/20 text-amber-400" :
                      "bg-white/10 text-white/40"
                    }`}>{biggestRival.heatLabel}</span>
                    <span className="text-white font-semibold text-sm">{biggestRival.rivalName}</span>
                  </div>
                  <p className="text-white/65 text-sm leading-relaxed">
                    {biggestRival.loreSentence
                      ? biggestRival.loreSentence
                      : `${biggestRival.h2hLosses}L vs ${biggestRival.rivalName}. Score: ${biggestRival.rivalryScore}.`}
                  </p>
                  {biggestRival.painfulLossSeason && (
                    <p className="text-white/35 text-xs mt-2 font-mono">
                      Most painful: {biggestRival.painfulLossSeason} · lost by {biggestRival.painfulLossMargin?.toFixed(1)} pts
                    </p>
                  )}
                </>
              ) : (
                <p className="text-white/65 text-sm leading-relaxed">
                  {data.rival.exploitWindows?.[1]
                    ? data.rival.exploitWindows[1]
                    : `${data.rival.ownerName} is ${data.rival.exploitabilityLabel} — ${data.rival.exploitabilityScore}/100 exploitability score.`}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Blurred Cards (locked profiles) ── */}
        {blurredProfiles.length > 0 && (
          <div
            className={`w-full transition-all duration-700 ${
              blurVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {blurredProfiles.map((profile) => (
                <div
                  key={profile.ownerName}
                  className="rounded-xl border border-white/8 bg-white/[0.025] px-5 py-6 relative overflow-hidden"
                >
                  <p className="text-[10px] tracking-[0.18em] uppercase text-white/35 mb-2 font-mono">
                    {profile.ownerName}
                  </p>
                  <p className="text-white/50 text-xs font-mono mb-4">
                    → {profile.gmArchetype}
                  </p>
                  <div
                    className="space-y-2"
                    style={{ filter: "blur(4px)", opacity: 0.55, userSelect: "none" }}
                    aria-hidden="true"
                  >
                    <div className="h-3 bg-white/20 rounded w-full" />
                    <div className="h-3 bg-white/15 rounded w-4/5" />
                    <div className="h-3 bg-white/10 rounded w-3/5" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
                    <span className="text-white/25 text-xs font-mono tracking-widest uppercase">
                      🔒 Locked
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CTA ── */}
        <div
          className={`w-full flex flex-col items-center gap-4 transition-all duration-700 ${
            ctaVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <button
            onClick={handleCheckout}
            disabled={checkoutMutation.isPending}
            className="w-full sm:w-80 py-4 px-8 rounded-xl bg-white text-[#0a0a0a] font-semibold text-base tracking-wide hover:bg-white/90 transition-colors shadow-[0_0_32px_rgba(255,255,255,0.12)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {checkoutMutation.isPending ? "Opening Checkout…" : "Unlock Your Full League DNA"}
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
