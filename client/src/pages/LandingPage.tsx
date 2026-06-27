/**
 * LandingPage.tsx - public marketing route (intelligence-dossier design).
 *
 * "/" public. Signed-in users -> /dashboard. CTA -> /sign-in (post-auth /connect).
 * Real in-app screenshots (client/public/screenshots). No tRPC / backend calls. All ASCII.
 */
import { useState, type CSSProperties } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "@clerk/react-router";
import { cn } from "@/lib/utils";
import { COMMERCIAL } from "@/lib/commercialCopy";
import { RivalsProPricingFeatures } from "@/components/commercial/RivalsProPricingFeatures";
import { ScanLine, ChevronRight, ChevronDown, Check, X, Maximize2 } from "lucide-react";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 82% -8%,rgba(139,92,246,.18),transparent 44%),radial-gradient(circle at 0% 100%,rgba(163,230,53,.06),transparent 40%),linear-gradient(180deg,#0d0a10,#070509)",
  color: "#f4f8ff",
};
const PANEL =
  "rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#19121d,#120d15)] shadow-[0_0_30px_-16px_rgba(0,0,0,0.7)]";
const MONO = "font-mono text-[11px] uppercase tracking-[0.2em] text-white/40";

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

function EvidenceShot({ src, alt, onZoom }: { src: string; alt: string; onZoom: (s: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onZoom(src)}
      className="group relative block w-full overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.85)] transition hover:border-white/20"
    >
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
      <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur-sm transition group-hover:bg-black/75">
        <Maximize2 className="h-3.5 w-3.5" /> Tap to expand
      </span>
    </button>
  );
}

type EvidenceProps = {
  title: string;
  insight: string;
  src: string;
  alt: string;
  cta: string;
  onCta: () => void;
  onZoom: (s: string) => void;
  reverse?: boolean;
};

function EvidenceSection(props: EvidenceProps) {
  return (
    <section className="border-t border-white/[0.08] py-14">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
        <div className={cn("lg:col-span-5", props.reverse && "lg:order-2")}>
          <h3 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{props.title}</h3>
          <p className="mt-4 max-w-[42ch] text-[16px] leading-relaxed text-white/65 sm:text-[18px]">{props.insight}</p>
          <div className="mt-6"><CTA label={props.cta} onClick={props.onCta} /></div>
        </div>
        <div className={cn("lg:col-span-7", props.reverse && "lg:order-1")}>
          <EvidenceShot src={props.src} alt={props.alt} onZoom={props.onZoom} />
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const go = () => navigate("/sign-in");
  const [zoom, setZoom] = useState<string | null>(null);

  if (isLoaded && isSignedIn) return <Navigate to="/dashboard" replace />;

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
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <div className="flex items-center gap-2 text-lime-300/80">
                <ScanLine className="h-4 w-4" />
                <span className={MONO}>League Intelligence // ESPN-connected</span>
              </div>
              <h1 className="mt-5 max-w-[15ch] text-[44px] font-black leading-[0.95] tracking-tight sm:text-[60px] lg:text-[66px]">
                Know Your League.{" "}
                <span className="text-lime-400">Own Your Rivals.</span>
              </h1>
              <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-white/65 sm:text-[19px]">
                Analyze years of league history to uncover rivalries, owner tendencies, championship paths, draft behavior, and the hidden stories that define your league.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <CTA label={COMMERCIAL.discoverCta} onClick={go} className="w-full sm:w-auto" />
                <a href="#finds" className="inline-flex items-center gap-1 text-[14px] font-semibold text-white/55 transition hover:text-white">
                  See what it finds <ChevronDown className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="mt-5 max-w-[52ch] text-[13px] leading-relaxed text-white/55">
                Read-only ESPN connection. We never modify league settings, rosters, transactions, or scoring.
              </p>
              <p className="mt-1.5 text-[13px] text-white/40">
                {COMMERCIAL.freemiumForeverLine}
              </p>
            </div>
            <div className="lg:pl-2">
              <EvidenceShot src="/screenshots/rivalry-center.png" alt="Rivalries" onZoom={setZoom} />
            </div>
          </div>
        </section>

        {/* Section 1 - flagship: Why Haven't You Won? */}
        <section id="finds" className="border-t border-white/[0.08] py-14">
          <h2 className="max-w-[18ch] text-[34px] font-black leading-[1.02] tracking-tight sm:text-[52px]">
            Why Haven't <span className="text-lime-400">You</span> Won?
          </h2>
          <p className="mt-3 max-w-[48ch] text-[16px] leading-relaxed text-white/55 sm:text-[18px]">
            Real answers from your actual league history.
          </p>
          <div className="mt-7">
            <EvidenceShot src="/screenshots/why-havent-i-won.png" alt="Why Haven't I Won analysis" onZoom={setZoom} />
          </div>
          <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-white/75 sm:text-[18px]">
            Discover the patterns that have kept you from a championship.
          </p>
          <div className="mt-6"><CTA label="Find Out Why" onClick={go} /></div>
        </section>

        {/* Section 2 - Rivalry Center */}
        <EvidenceSection
          reverse
          onCta={go}
          onZoom={setZoom}
          title="Every League Has One Rival"
          insight="Find the owner who always seems to stand in your way."
          cta="View Rivalries"
          alt="Rivalries"
          src="/screenshots/rivalry-center.png"
        />

        {/* Section 3 - Rivalry Receipts */}
        <EvidenceSection
          onCta={go}
          onZoom={setZoom}
          title="Rivalry Receipts"
          insight="Shareable proof of heartbreak, dominance, and league history."
          cta="Generate Receipts"
          alt="Rivalry receipts"
          src="/screenshots/rivalry-receipts.png"
        />

        {/* Section 4 - League DNA */}
        <EvidenceSection
          reverse
          onCta={go}
          onZoom={setZoom}
          title="Discover Your League DNA"
          insight="Learn what kind of manager you really are."
          cta="View DNA"
          alt="League DNA"
          src="/screenshots/league-dna.png"
        />

        {/* Section 5 - Owner Profiles */}
        <EvidenceSection
          onCta={go}
          onZoom={setZoom}
          title="Decode Every Owner"
          insight="Draft habits, roster behavior, keeper tendencies, and more."
          cta="View My GM Profile"
          alt="My GM Profile"
          src="/screenshots/owner-profiles.png"
        />

        {/* Section 6 - Every League Has Characters (The Cast) */}
        <section className="border-t border-white/[0.08] py-14">
          <h2 className="max-w-[22ch] text-[30px] font-black leading-[1.04] tracking-tight sm:text-[44px]">
            Every League Has Characters
          </h2>
          <p className="mt-4 max-w-[64ch] text-[16px] leading-relaxed text-white/60 sm:text-[18px]">
            Your league isn't just teams. It's personalities, reputations, villains, champions, and legends built over years of competition.
          </p>
          <div className="mt-7">
            <EvidenceShot src="/screenshots/the-cast.png" alt="The Cast" onZoom={setZoom} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Dynasty Architect", "League Villain", "Champion", "Trade Shark", "Waiver Predator", "All-Rounder"].map((t) => (
              <span key={t} className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-white/70">{t}</span>
            ))}
          </div>
          <div className="mt-7"><CTA label="Meet Your Cast" onClick={go} /></div>
        </section>

        {/* Section 7 - Preserve Your League's Legacy (depth proof) */}
        <section className="border-t border-white/[0.08] py-14">
          <h2 className="max-w-[22ch] text-[30px] font-black leading-[1.04] tracking-tight sm:text-[44px]">
            Preserve Your League's Legacy
          </h2>
          <p className="mt-4 max-w-[64ch] text-[16px] leading-relaxed text-white/60 sm:text-[18px]">
            Sixteen seasons of champions, records, and the exact blueprint it takes to win it all - kept and tracked across the full life of your league.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <span className={MONO}>League History</span>
              <div className="mt-2"><EvidenceShot src="/screenshots/hall-of-fame.png" alt="League History" onZoom={setZoom} /></div>
            </div>
            <div>
              <span className={MONO}>Championship Path</span>
              <div className="mt-2"><EvidenceShot src="/screenshots/championship-path.png" alt="Championship Path" onZoom={setZoom} /></div>
            </div>
          </div>
          <div className="mt-7"><CTA label="Explore League History" onClick={go} /></div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-white/[0.08] py-14">
          <span className={MONO}>How it works</span>
          <h2 className="mt-3 max-w-[20ch] text-[26px] font-extrabold tracking-tight sm:text-[32px]">
            Discover first. Understand everything with Rivals Pro.
          </h2>
          <p className="mt-2 max-w-[52ch] text-[15px] text-white/55">
            Free answers <span className="text-white/75">who</span> you are. Rivals Pro answers <span className="text-white/75">why</span> — and what to do about it.
          </p>
          <ol className="mx-auto mt-8 grid max-w-[780px] gap-4">
            {COMMERCIAL.productStorySteps.map(({ step, title, body }) => (
              <li key={step} className={cn(PANEL, "flex gap-4 p-5 sm:p-6")}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-lime-400/30 bg-lime-500/10 font-mono text-sm font-bold text-lime-300">
                  {step}
                </span>
                <div>
                  <h3 className="text-[16px] font-bold text-white/95 sm:text-[17px]">{title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/60">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section className="py-12">
          <span className={MONO}>Pricing</span>
          <h2 className="mt-3 text-[26px] font-extrabold tracking-tight sm:text-[32px]">Free forever. Complete story with Rivals Pro.</h2>
          <p className="mt-2 text-[15px] text-white/55">{COMMERCIAL.landingTagline}</p>
          <div className="mx-auto mt-7 grid max-w-[780px] grid-cols-1 gap-4 md:grid-cols-2">
            <div className={cn(PANEL, "flex flex-col p-6")}>
              <span className={MONO}>{COMMERCIAL.freePlanName}</span>
              <div className="mt-3 text-[42px] font-black leading-none">$0</div>
              <p className="mt-2 text-[13px] text-white/50">Always free — discover who you are in your league</p>
              <ul className="mt-5 flex-1 space-y-2 text-[14px] text-white/75">
                {COMMERCIAL.freePlanHighlights.map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-white/40" /> {f}</li>
                ))}
              </ul>
              <button onClick={go} className="mt-6 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2.5 text-[14px] font-bold text-white/85 transition hover:bg-white/[0.07]">
                {COMMERCIAL.discoverCta}
              </button>
            </div>
            <div className={cn(PANEL, "relative flex flex-col p-6 ring-1 ring-lime-400/40")}>
              <span className="absolute -top-2.5 left-6 rounded-full border border-lime-400/40 bg-lime-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-lime-200">
                {COMMERCIAL.foundingOfferLabel}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime-400">{COMMERCIAL.productName}</span>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[42px] font-black leading-none">{COMMERCIAL.annualPriceAmount}</span>
                <span className="text-[16px] font-bold text-white/35 line-through">{COMMERCIAL.annualPriceCompareAt}</span>
                <span className="text-[14px] text-white/45">{COMMERCIAL.annualPriceSuffix}</span>
              </div>
              <p className="mt-2 text-[13px] font-semibold text-lime-300/90">{COMMERCIAL.launchPricingLine}</p>
              <div className="mt-4 flex-1">
                <RivalsProPricingFeatures />
              </div>
              <CTA label={COMMERCIAL.unlockStoryCta} onClick={go} className="mt-6 w-full" />
            </div>
          </div>
          <p className="mt-4 text-[12px] text-white/35">{COMMERCIAL.freemiumForeverLine}.</p>
        </section>

        {/* Final CTA */}
        <section className="py-14">
          <div className={cn(PANEL, "relative overflow-hidden p-9 text-center sm:p-14")}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime-400/40 to-transparent" />
            <span className={MONO}>Your league is waiting</span>
            <h2 className="mx-auto mt-4 max-w-[26ch] text-[30px] font-black leading-tight tracking-tight sm:text-[42px]">
              See who you really are. Then unlock the complete story.
            </h2>
            <p className="mx-auto mt-3 max-w-[46ch] text-[15px] text-white/55">
              Connect your ESPN league in under a minute. {COMMERCIAL.freemiumForeverLine}
            </p>
            <div className="mt-7 flex justify-center">
              <CTA label={COMMERCIAL.discoverCta} onClick={go} />
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

      {zoom && (
        <div
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <img src={zoom} alt="Fantasy Football Rivals screenshot" className="max-h-[92vh] max-w-[96vw] rounded-xl border border-white/15 shadow-2xl" />
          <button
            onClick={() => setZoom(null)}
            className="absolute right-5 top-5 rounded-full border border-white/20 bg-black/50 p-2 text-white/80 transition hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
