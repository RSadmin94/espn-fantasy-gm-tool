/**
 * LandingPage.tsx - public marketing route (intelligence-dossier design).
 *
 * "/" public. Signed-in users -> /dashboard. CTA -> /sign-in (post-auth /connect).
 * Canned data only (lib/demoLeague.ts). No tRPC / backend calls. All ASCII.
 */
import { type CSSProperties, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "@clerk/react-router";
import { cn } from "@/lib/utils";
import { DEMO_LEAGUE, type DemoProofCard, type DemoShowcase } from "@/lib/demoLeague";
import {
  Swords, HeartCrack, ArrowLeftRight, Crown, Fingerprint, Target,
  History, Route, Newspaper, Lock, Check, ChevronRight, ChevronDown,
  ScanLine, X, TrendingUp,
} from "lucide-react";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 82% -8%,rgba(139,92,246,.18),transparent 44%),radial-gradient(circle at 0% 100%,rgba(163,230,53,.06),transparent 40%),linear-gradient(180deg,#0d0a10,#070509)",
  color: "#f4f8ff",
};
const PANEL =
  "rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#19121d,#120d15)] shadow-[0_0_30px_-16px_rgba(0,0,0,0.7)]";
const MONO = "font-mono text-[11px] uppercase tracking-[0.2em] text-white/40";

const PROOF_ICON: Record<DemoProofCard["tone"], ReactNode> = {
  rival: <Swords className="h-4 w-4" />,
  heartbreak: <HeartCrack className="h-4 w-4" />,
  trades: <ArrowLeftRight className="h-4 w-4" />,
  dynasty: <Crown className="h-4 w-4" />,
};
const PROOF_GLOW: Record<DemoProofCard["tone"], string> = {
  rival: "text-red-300",
  heartbreak: "text-amber-300",
  trades: "text-violet-300",
  dynasty: "text-lime-300",
};
const SHOWCASE_ICON: Record<DemoShowcase["id"], ReactNode> = {
  rivalry: <Swords className="h-5 w-5" />,
  dna: <Fingerprint className="h-5 w-5" />,
  draft: <Target className="h-5 w-5" />,
  legacy: <Crown className="h-5 w-5" />,
};

const FINDS: { icon: ReactNode; label: string }[] = [
  { icon: <History className="h-4 w-4" />, label: "Full league history" },
  { icon: <Swords className="h-4 w-4" />, label: "Rivalries and grudges" },
  { icon: <Fingerprint className="h-4 w-4" />, label: "Owner DNA profiles" },
  { icon: <Target className="h-4 w-4" />, label: "Draft tendencies" },
  { icon: <ArrowLeftRight className="h-4 w-4" />, label: "Trade behavior" },
  { icon: <Route className="h-4 w-4" />, label: "Championship paths" },
  { icon: <Newspaper className="h-4 w-4" />, label: "League stories ESPN never shows" },
];

function CTA({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-6 py-3.5 text-[15px] font-bold text-[#0b0b0c] shadow-[0_0_24px_-6px_rgba(163,230,53,0.5)] transition hover:bg-lime-300 active:scale-[0.99]",
        className,
      )}
    >
      {label} <ChevronRight className="h-4 w-4" />
    </button>
  );
}

export function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const go = () => navigate("/sign-in");

  if (isLoaded && isSignedIn) return <Navigate to="/dashboard" replace />;

  const d = DEMO_LEAGUE;

  return (
    <div className="min-h-screen w-full" style={PAGEBG}>
      <div className="mx-auto max-w-[1160px] px-5 sm:px-6">

        {/* Header */}
        <header className="flex items-center justify-between py-4">
          <img src="/logo.png" alt="Fantasy Football Rivals" className="h-24 w-auto sm:h-28" />
          <button onClick={go} className="text-[14px] font-semibold text-white/70 transition hover:text-white">
            Sign in
          </button>
        </header>

        {/* Hero - outcome-first */}
        <section className="pb-10 pt-8 sm:pt-14">
          <div className="flex items-center gap-2 text-lime-300/80">
            <ScanLine className="h-4 w-4" />
            <span className={MONO}>League Intelligence // ESPN-connected</span>
          </div>
          <h1 className="mt-5 max-w-[15ch] text-[46px] font-black leading-[0.95] tracking-tight sm:text-[68px] lg:text-[80px]">
            Know Your League.{" "}
            <span className="text-lime-400">Own Your Rivals.</span>
          </h1>
          <p className="mt-6 max-w-[60ch] text-[17px] leading-relaxed text-white/65 sm:text-[20px]">
            Fantasy Football Rivals reads every season of your ESPN league history and hands you the
            rivalries, owner tendencies, and championship patterns hiding in plain sight -
            the intelligence ESPN never shows you.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <CTA label="Analyze My League" onClick={go} className="w-full sm:w-auto" />
            <a href="#finds" className="inline-flex items-center gap-1 text-[14px] font-semibold text-white/55 transition hover:text-white">
              See what it finds <ChevronDown className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-3 text-[13px] text-white/40">
            Free to start / 7-day trial when you connect a league / no card required
          </p>
        </section>

        {/* Above-the-fold proof: intel readout strip */}
        <section className="pb-14">
          <div className="mb-3 flex items-center justify-between">
            <span className={MONO}>Live read // {d.leagueName}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/30">{d.seasons} seasons</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.cards.map((c) => (
              <button
                key={c.id}
                onClick={go}
                className={cn(PANEL, "group relative overflow-hidden p-4 text-left transition hover:border-white/15")}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <div className="mb-2 flex items-center gap-2">
                  <span className={PROOF_GLOW[c.tone]}>{PROOF_ICON[c.tone]}</span>
                  <span className={MONO}>{c.kicker}</span>
                </div>
                <p className="text-[16px] font-extrabold leading-snug">{c.headline}</p>
                <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-white/55">{c.proof}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-white/70 group-hover:text-lime-300">
                  <Lock className="h-3 w-3" /> {c.unlock}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Gets smarter every season - moat narrative */}
        <section className="border-t border-white/[0.08] py-14">
          <span className={MONO}>The compounding edge</span>
          <h2 className="mt-3 max-w-[18ch] text-[32px] font-black leading-[1.02] tracking-tight sm:text-[46px]">
            Rivals doesn't reset.{" "}
            <span className="text-lime-400">It remembers.</span>
          </h2>
          <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-white/60 sm:text-[18px]">
            The only fantasy platform that gets smarter every season. Every trade, every draft,
            every rivalry, every championship adds another layer to your league's intelligence.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={cn(PANEL, "p-6")}>
              <span className={MONO}>Most fantasy tools forget</span>
              <p className="mt-3 text-[15px] text-white/55">When the season ends, it all disappears:</p>
              <ul className="mt-4 space-y-2">
                {["Rankings disappear","Draft boards disappear","Waiver recommendations disappear"].map((x) => (
                  <li key={x} className="flex items-center gap-2 text-[15px] text-white/35 line-through decoration-red-400/50">
                    <X className="h-4 w-4 shrink-0 text-red-400/60" /> {x}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] text-white/40">The history is lost.</p>
            </div>
            <div className={cn(PANEL, "relative overflow-hidden p-6 ring-1 ring-lime-400/30")}>
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime-400/40 to-transparent" />
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime-300">Fantasy Football Rivals remembers everything</span>
              <div className="mt-4 space-y-2">
                {[
                  { n: "01", t: "Every season makes your league intelligence deeper." },
                  { n: "02", t: "Every season makes your rivalries sharper." },
                  { n: "03", t: "Every season makes the receipts harder to argue with." },
                ].map((r, i) => (
                  <div key={r.n} className="flex items-center gap-3 rounded-lg border border-lime-400/15 bg-lime-500/[0.04] p-3" style={{ marginLeft: i * 14 + "px" }}>
                    <span className="font-mono text-[11px] text-lime-300/70">{r.n}</span>
                    <span className="text-[14px] font-semibold text-white/85">{r.t}</span>
                    <TrendingUp className="ml-auto h-4 w-4 shrink-0 text-lime-300/60" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* What Fantasy Football Rivals finds - the briefing */}
        <section id="finds" className="border-t border-white/[0.08] py-14">
          <span className={MONO}>The briefing</span>
          <h2 className="mt-3 max-w-[20ch] text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
            Every other tool studies players.{" "}
            <span className="text-lime-400">Fantasy Football Rivals studies your league.</span>
          </h2>
          <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-white/55">
            Connect once and it pulls your entire ESPN history, then turns it into a dossier
            on the only opponents that matter: the people in your league.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
            {FINDS.map((f, i) => (
              <div key={f.label} className="flex items-center gap-3 bg-[#0e0a12] p-4">
                <span className="font-mono text-[11px] text-white/30">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-lime-300">{f.icon}</span>
                <span className="text-[14px] font-semibold text-white/85">{f.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Showcase - alternating emotional feature rows */}
        <section>
          {d.showcase.map((s, i) => (
            <div key={s.id} className="grid grid-cols-1 items-center gap-6 border-t border-white/[0.08] py-12 lg:grid-cols-2 lg:gap-12">
              <div className={cn(i % 2 === 1 && "lg:order-2")}>
                <div className="flex items-center gap-2 text-lime-300">
                  {SHOWCASE_ICON[s.id]}
                  <span className={MONO}>{s.eyebrow}</span>
                </div>
                <h3 className="mt-3 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{s.title}</h3>
                <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-white/60">{s.line}</p>
              </div>
              <div className={cn(i % 2 === 1 && "lg:order-1")}>
                <div className={cn(PANEL, "p-5")}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className={MONO}>Sample readout</span>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-lime-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {s.chips.map((ch) => (
                      <div key={ch.k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <div className="text-[22px] font-black tracking-tight">{ch.v}</div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/40">{ch.k}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-lime-400/15 bg-lime-500/[0.05] p-3 text-[12px] text-white/70">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-lime-300" /> Full breakdown unlocks when you connect your league
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Pricing */}
        <section className="py-12">
          <span className={MONO}>Pricing</span>
          <h2 className="mt-3 text-[26px] font-extrabold tracking-tight sm:text-[32px]">One season. One price. Every answer.</h2>
          <p className="mt-2 text-[15px] text-white/55">Start free. Upgrade when you want the answers.</p>
          <div className="mx-auto mt-7 grid max-w-[780px] grid-cols-1 gap-4 md:grid-cols-2">
            <div className={cn(PANEL, "flex flex-col p-6")}>
              <span className={MONO}>Free</span>
              <div className="mt-3 text-[42px] font-black leading-none">$0</div>
              <p className="mt-2 text-[13px] text-white/50">Connect and explore your league</p>
              <ul className="mt-5 flex-1 space-y-2 text-[14px] text-white/75">
                {["League snapshot and Hall of Fame rank","One DNA insight","Rivalry and dynasty teasers"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-white/40" /> {f}</li>
                ))}
              </ul>
              <button onClick={go} className="mt-6 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2.5 text-[14px] font-bold text-white/85 transition hover:bg-white/[0.07]">
                Start free
              </button>
            </div>
            <div className={cn(PANEL, "relative flex flex-col p-6 ring-1 ring-lime-400/40")}>
              <span className="absolute -top-2.5 left-6 rounded-full border border-lime-400/40 bg-lime-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-lime-200">
                Founding offer
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime-400">Founding Member</span>
              <div className="mt-3 flex items-baseline gap-2"><span className="text-[42px] font-black leading-none">$79.99</span><span className="text-[16px] font-bold text-white/35 line-through">$99.99</span><span className="text-[14px] text-white/45">/ year</span></div>
              <p className="mt-2 text-[13px] font-semibold text-lime-300/90">Intro price - first 100 members, then $99.99</p>
              <p className="mt-3 text-[14px] leading-relaxed text-white/70">Access your league. Unlock every rivalry, dynasty, draft trend, championship path, and DNA profile in your league.</p>
              <ul className="mt-4 flex-1 space-y-2 text-[14px] text-white/75">
                {["Every rivalry and grudge","Every dynasty and Hall of Fame","Draft trends and reaches","Championship paths","Owner DNA profiles"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-lime-400" /> {f}</li>
                ))}
              </ul>
              <CTA label="Analyze My League" onClick={go} className="mt-6 w-full" />
            </div>
          </div>
          <p className="mt-4 text-[12px] text-white/35">Prices shown are a preview. Final checkout options are set at launch.</p>
        </section>

        {/* Final CTA */}
        <section className="py-14">
          <div className={cn(PANEL, "relative overflow-hidden p-9 text-center sm:p-14")}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime-400/40 to-transparent" />
            <span className={MONO}>Your league is waiting</span>
            <h2 className="mx-auto mt-4 max-w-[20ch] text-[30px] font-black leading-tight tracking-tight sm:text-[42px]">
              Eleven seasons of receipts. Time to read them.
            </h2>
            <p className="mx-auto mt-3 max-w-[46ch] text-[15px] text-white/55">
              Connect your ESPN league in under a minute. Free to start.
            </p>
            <div className="mt-7 flex justify-center">
              <CTA label="Analyze My League" onClick={go} />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] py-8 text-[12px] text-white/35">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-5 w-auto opacity-70" />
            <span>Fantasy Football Rivals - League Intelligence</span>
          </div>
          <button onClick={go} className="font-semibold text-white/55 transition hover:text-white">Sign in</button>
        </footer>

      </div>
    </div>
  );
}
