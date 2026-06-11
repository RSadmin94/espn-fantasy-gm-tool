/**
 * LandingPage.tsx — public marketing route (Option A: lives inside the SPA).
 *
 * Cold visitor at "/" sees: hero → demo-league "holy crap" → tease cards →
 * manager path → commissioner path → pricing preview → CTA. Signed-in users
 * are redirected to /dashboard. The CTA sends visitors to Clerk (/sign-in),
 * which is configured to land on /connect after auth.
 *
 * Uses only canned data (lib/demoLeague.ts). No tRPC, no backend calls.
 * Visual tokens (PAGEBG / PANEL / pills) mirror the existing LeagueDNA pages.
 */
import { type CSSProperties, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "@clerk/react-router";
import { cn } from "@/lib/utils";
import { DEMO_LEAGUE, type DemoTeaseCard } from "@/lib/demoLeague";
import {
  Swords, Trophy, ArrowLeftRight, Crown, Lock, Route, ShieldCheck,
  Check, ChevronRight, Users, User, Sparkles, Activity, Zap,
} from "lucide-react";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),linear-gradient(180deg,#0e0a10,#080609)",
  color: "#f3f8ff",
};
const PANEL =
  "rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#1b131f,#140e17)] shadow-[0_0_28px_-14px_rgba(0,0,0,0.65)]";

const CARD_TONE: Record<DemoTeaseCard["tone"], { icon: ReactNode; ring: string; glow: string }> = {
  rival:   { icon: <Swords className="h-5 w-5" />,        ring: "border-red-400/20",    glow: "text-red-300" },
  why:     { icon: <Trophy className="h-5 w-5" />,        ring: "border-amber-400/20",  glow: "text-amber-300" },
  trades:  { icon: <ArrowLeftRight className="h-5 w-5" />, ring: "border-violet-400/20", glow: "text-violet-300" },
  dynasty: { icon: <Crown className="h-5 w-5" />,         ring: "border-lime-400/20",   glow: "text-lime-300" },
};

function PrimaryCTA({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-6 py-3 text-[15px] font-bold text-[#0b0b0c] transition hover:bg-lime-300 active:scale-[0.99]",
        className,
      )}
    >
      {label} <ChevronRight className="h-4 w-4" />
    </button>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-violet-300">
      <Route className="h-3.5 w-3.5" /> {children}
    </div>
  );
}

export function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const goSignIn = () => navigate("/sign-in");

  // Returning, signed-in users skip the marketing page.
  if (isLoaded && isSignedIn) return <Navigate to="/dashboard" replace />;

  const d = DEMO_LEAGUE;

  return (
    <div className="min-h-screen w-full" style={PAGEBG}>
      {/* Top bar */}
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-[17px] font-black tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-lime-400 text-[#0b0b0c]">
            <Swords className="h-4 w-4" />
          </span>
          GM War Room
        </div>
        <button onClick={goSignIn} className="text-[14px] font-semibold text-white/70 transition hover:text-white">
          Sign in
        </button>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1100px] px-6 pb-10 pt-8 sm:pt-14">
        <Pill>LeagueDNA Intelligence</Pill>
        <h1 className="mt-4 max-w-[18ch] text-[40px] font-black leading-[1.03] tracking-tight sm:text-[60px]">
          Know Your League.<br />
          <span className="text-lime-400">Own Your Rivals.</span>
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-white/60 sm:text-[19px]">
          Find out what your fantasy league history has been hiding. Connect your
          ESPN league and uncover the rivalries, patterns, and dynasties buried in
          years of box scores.
        </p>
        <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <PrimaryCTA label="Connect My ESPN League" onClick={goSignIn} className="w-full sm:w-auto" />
          <a href="#demo" className="text-[14px] font-semibold text-white/55 transition hover:text-white">
            See a live demo ↓
          </a>
        </div>
        <p className="mt-3 text-[13px] text-white/40">
          7-day free trial when you connect a league · no card to start
        </p>
      </section>

      {/* Demo league "holy crap" */}
      <section id="demo" className="mx-auto max-w-[1100px] px-6 py-10">
        <div className="mb-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">
          <Sparkles className="h-4 w-4 text-lime-400" /> Demo league — this is what you'll see for yours
        </div>
        <div className={cn(PANEL, "p-5 sm:p-7")}>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-4">
            <div>
              <div className="text-[13px] text-white/45">{d.leagueName}</div>
              <div className="text-[22px] font-extrabold tracking-tight">
                The {d.you} <span className="text-white/40">· {d.seasons} seasons · {d.teams} teams</span>
              </div>
            </div>
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-[11px] font-semibold text-zinc-300">
              Sample data
            </span>
          </div>

          {/* Snapshot stats */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {d.snapshot.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{s.label}</div>
                <div className="mt-1 text-[26px] font-black tracking-tight">{s.value}</div>
                {s.hint && <div className="text-[12px] text-white/40">{s.hint}</div>}
              </div>
            ))}
          </div>

          {/* Two free-tier insights */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex gap-3 rounded-xl border border-lime-400/20 bg-lime-500/[0.05] p-4">
              <Activity className="mt-0.5 h-5 w-5 shrink-0 text-lime-300" />
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-white/45">League DNA</div>
                <p className="mt-1 text-[14px] leading-relaxed text-white/80">{d.dnaInsight}</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border border-red-400/20 bg-red-500/[0.05] p-4">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-white/45">Matchup Edge</div>
                <p className="mt-1 text-[14px] leading-relaxed text-white/80">{d.matchupInsight}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tease cards — proof without resolution */}
      <section className="mx-auto max-w-[1100px] px-6 py-6">
        <h2 className="text-[24px] font-extrabold tracking-tight sm:text-[28px]">
          Four things your league doesn't know about itself
        </h2>
        <p className="mt-1 text-[15px] text-white/55">We find them. You unlock the answers.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {d.cards.map((c) => {
            const tone = CARD_TONE[c.tone];
            return (
              <div key={c.id} className={cn(PANEL, "relative overflow-hidden p-5")}>
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">
                  <span className={tone.glow}>{tone.icon}</span> {c.kicker}
                </div>
                <p className="text-[19px] font-extrabold leading-snug">{c.headline}</p>
                <ul className="mt-3 space-y-1.5">
                  {c.proof.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-[14px] text-white/70">
                      <span className={cn("h-1.5 w-1.5 rounded-full", "bg-white/30")} /> {p}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={goSignIn}
                  className={cn(
                    "mt-4 inline-flex items-center gap-2 rounded-lg border bg-white/[0.03] px-3 py-2 text-[13px] font-semibold text-white/80 transition hover:bg-white/[0.06]",
                    tone.ring,
                  )}
                >
                  <Lock className="h-3.5 w-3.5" /> {c.unlock}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Two paths: manager vs commissioner */}
      <section className="mx-auto max-w-[1100px] px-6 py-10">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Manager */}
          <div className={cn(PANEL, "p-6")}>
            <div className="mb-3 flex items-center gap-2 text-lime-400">
              <User className="h-5 w-5" />
              <span className="text-[12px] font-semibold uppercase tracking-wide text-white/45">For Managers</span>
            </div>
            <h3 className="text-[22px] font-extrabold tracking-tight">See your rivalries, DNA, and draft tendencies</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-white/60">
              Every rivalry, every draft habit, every reason you keep falling short — pulled
              straight from your league's full history.
            </p>
            <ul className="mt-4 space-y-2">
              {["Head-to-head rivalry reports", "Your manager DNA profile", "Draft tendencies & reaches", "Why you haven't won — and the path that fixes it"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-[14px] text-white/80">
                  <Check className="h-4 w-4 text-lime-400" /> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Commissioner */}
          <div className={cn(PANEL, "p-6")}>
            <div className="mb-3 flex items-center gap-2 text-violet-300">
              <Users className="h-5 w-5" />
              <span className="text-[12px] font-semibold uppercase tracking-wide text-white/45">For Commissioners</span>
            </div>
            <h3 className="text-[22px] font-extrabold tracking-tight">Unlock League Pass for the whole league</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-white/60">
              One connection pulls your entire league's history — so a single League Pass
              covers all your managers with shared reports, rivalries, and a living Hall of Fame.
            </p>
            <ul className="mt-4 space-y-2">
              {["One connection covers all 12 teams", "Shared league reports & Hall of Fame", "Year-round rivalries and league banter", "Draft intelligence for the whole room"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-[14px] text-white/80">
                  <Check className="h-4 w-4 text-violet-300" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="mx-auto max-w-[1100px] px-6 py-10">
        <h2 className="text-[24px] font-extrabold tracking-tight sm:text-[28px]">Simple pricing, built for a season</h2>
        <p className="mt-1 text-[15px] text-white/55">Start free. Upgrade when you want the answers.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {/* Free */}
          <div className={cn(PANEL, "flex flex-col p-6")}>
            <div className="text-[13px] font-semibold uppercase tracking-wide text-white/45">Free</div>
            <div className="mt-2 flex items-baseline gap-1"><span className="text-[40px] font-black">$0</span></div>
            <p className="mt-1 text-[13px] text-white/50">Connect & explore your league</p>
            <ul className="mt-4 flex-1 space-y-2 text-[14px] text-white/75">
              {["League snapshot & Hall of Fame rank", "One DNA insight", "Rivalry & dynasty teasers"].map((f) => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-white/40" /> {f}</li>
              ))}
            </ul>
            <button onClick={goSignIn} className="mt-5 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2.5 text-[14px] font-bold text-white/85 transition hover:bg-white/[0.07]">
              Start free
            </button>
          </div>

          {/* Season Pass */}
          <div className={cn(PANEL, "flex flex-col p-6")}>
            <div className="text-[13px] font-semibold uppercase tracking-wide text-lime-400">Season Pass</div>
            <div className="mt-2 flex items-baseline gap-1"><span className="text-[40px] font-black">$59</span><span className="text-[14px] text-white/45">/ season</span></div>
            <p className="mt-1 text-[13px] text-white/50">For the serious manager</p>
            <ul className="mt-4 flex-1 space-y-2 text-[14px] text-white/75">
              {["Full league intelligence", "Every rivalry & DNA report", "Draft + matchup intelligence", "League history & storylines"].map((f) => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-lime-400" /> {f}</li>
              ))}
            </ul>
            <PrimaryCTA label="Get Season Pass" onClick={goSignIn} className="mt-5 w-full" />
          </div>

          {/* League Pass — hero */}
          <div className={cn(PANEL, "relative flex flex-col p-6 ring-1 ring-violet-400/40")}>
            <span className="absolute -top-2.5 left-6 rounded-full border border-violet-400/40 bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-200">
              Best value
            </span>
            <div className="text-[13px] font-semibold uppercase tracking-wide text-violet-300">League Pass</div>
            <div className="mt-2 flex items-baseline gap-1"><span className="text-[40px] font-black">$199</span><span className="text-[14px] text-white/45">/ year</span></div>
            <p className="mt-1 text-[13px] text-white/50">For the whole league — all members</p>
            <ul className="mt-4 flex-1 space-y-2 text-[14px] text-white/75">
              {["Everything in Season Pass", "Unlimited league members", "Shared reports & Hall of Fame", "AI Advisor + agent debates", "Historical exports"].map((f) => (
                <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-violet-300" /> {f}</li>
              ))}
            </ul>
            <button onClick={goSignIn} className="mt-5 rounded-xl bg-violet-500 px-4 py-2.5 text-[14px] font-bold text-white transition hover:bg-violet-400">
              Get League Pass
            </button>
          </div>
        </div>
        <p className="mt-4 text-[12px] text-white/35">Prices shown are a preview. Final checkout options are set at launch.</p>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-[1100px] px-6 py-12">
        <div className={cn(PANEL, "flex flex-col items-center gap-4 p-8 text-center sm:p-12")}>
          <ShieldCheck className="h-8 w-8 text-lime-400" />
          <h2 className="max-w-[20ch] text-[28px] font-black leading-tight tracking-tight sm:text-[34px]">
            Your league has a story. Go find out what it says about you.
          </h2>
          <p className="max-w-[46ch] text-[15px] text-white/55">
            Connect your ESPN league in under a minute. Free to start.
          </p>
          <PrimaryCTA label="Connect My ESPN League" onClick={goSignIn} />
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-[1100px] px-6 pb-10 pt-2 text-[12px] text-white/35">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-6">
          <span>GM War Room — LeagueDNA Intelligence</span>
          <button onClick={goSignIn} className="font-semibold text-white/55 transition hover:text-white">Sign in</button>
        </div>
      </footer>
    </div>
  );
}
