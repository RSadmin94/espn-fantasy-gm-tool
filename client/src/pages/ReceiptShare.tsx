import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "@clerk/react-router";
import { Crown, Loader2, ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { trpc } from "@/lib/trpc";

const GOLD = "#f5c518";
const LIME = "#a3e635";
const MUTED = "#8b97a8";
const LINE = "rgba(255,255,255,0.08)";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 50% -8%,rgba(245,197,24,.10),transparent 45%),radial-gradient(circle at 85% 18%,rgba(139,92,246,.16),transparent 42%),linear-gradient(180deg,#0b0809,#060405)",
  color: "#f3f8ff",
};

const TIER_LABEL: Record<string, string> = {
  villain: "League Villain", dynasty: "Dynasty Architect", gatekeeper: "Gatekeeper", playoff_fixture: "Playoff Fixture",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={PAGEBG} className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export function ReceiptShare() {
  const { token } = useParams();
  const { isSignedIn } = useAuth();
  const q = trpc.dna.getReceipt.useQuery({ token: token ?? "" }, { enabled: !!token, staleTime: Infinity, retry: false });

  const r = q.data?.valid ? q.data.receipt : null;
  useEffect(() => {
    document.title = r ? `${r.ownerName} - ${r.archetype} | Fantasy Football Rivals` : "DNA Receipt | Fantasy Football Rivals";
  }, [r]);

  if (q.isLoading) {
    return <Shell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} /></div></Shell>;
  }

  if (!r) {
    return (
      <Shell>
        <div className="rounded-2xl p-8 text-center" style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.02)" }}>
          <p className="text-lg font-black">This Receipt link is invalid or expired.</p>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>The link may have been truncated when it was shared.</p>
          <Link to="/" className="mt-5 inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-extrabold" style={{ background: LIME, color: "#0b0809" }}>
            Get your own League DNA <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Shell>
    );
  }

  const champLabel = r.championships > 1 ? `${r.championships}x Champion` : r.championships === 1 ? "Champion" : null;
  const otherBadges = r.badges.filter((b) => b.tier !== "champion");
  const frozen = new Date(r.dateISO).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Shell>
      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.4em]" style={{ color: GOLD }}>Fantasy Football Rivals</div>
        <div className="mt-2 text-sm font-semibold tracking-wide" style={{ color: "#cfd2d8" }}>{r.leagueName}</div>
      </div>

      {/* Receipt card */}
      <div className="mt-5 overflow-hidden rounded-2xl p-6" style={{ background: "linear-gradient(160deg,rgba(245,197,24,.10),rgba(245,197,24,.02))", border: `1px solid ${GOLD}55` }}>
        <div className="flex items-start justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: MUTED }}>DNA Receipt</div>
          <Crown className="h-6 w-6 opacity-30" style={{ color: GOLD }} />
        </div>

        {otherBadges.length > 0 && (
          <div className="mt-3 text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>
            {otherBadges.map((b) => TIER_LABEL[b.tier] ?? b.label).join(" \u00b7 ")}
          </div>
        )}

        <div className="mt-1 text-3xl font-black leading-tight">{r.ownerName}</div>

        {champLabel && (
          <>
            <div className="mt-1 text-lg font-black" style={{ color: GOLD }}>{champLabel}</div>
            {r.championshipYears.length > 0 && (
              <div className="text-xs" style={{ color: MUTED }}>Won it all in {r.championshipYears.join(", ")}.</div>
            )}
          </>
        )}

        <div className="mt-3 flex items-center gap-2">
          <span className="text-base font-black" style={{ color: LIME }}>{r.archetype}</span>
          {r.identityRank && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={{ background: "rgba(163,230,53,.14)", color: LIME }}>
              #{r.identityRank.rank}/{r.identityRank.of}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#cfd2d8" }}>{r.archetypeReceipt}</p>

        <div className="my-4 h-px" style={{ background: LINE }} />
        <div className="text-[11px]" style={{ color: MUTED }}>Frozen {frozen} &middot; gmwarroom.online</div>
      </div>

      {/* Warm/cold CTA */}
      {isSignedIn ? (
        <Link to="/the-cast" className="mt-5 flex items-center justify-center gap-2 rounded-[12px] px-5 py-3.5 text-sm font-extrabold" style={{ background: LIME, color: "#0b0809" }}>
          Open your War Room <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <div className="mt-5 rounded-2xl p-5 text-center" style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.02)" }}>
          <p className="text-base font-black">Every manager in your league has a DNA like this.</p>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>Find out yours - your archetype, your badges, your rank in the league.</p>
          <Link to="/" className="mt-4 inline-flex items-center justify-center gap-2 rounded-[12px] px-6 py-3 text-sm font-extrabold" style={{ background: LIME, color: "#0b0809" }}>
            Reveal your League DNA <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-2 text-[11px]" style={{ color: MUTED }}>Know your league. Own your rivals.</p>
        </div>
      )}
    </Shell>
  );
}

export default ReceiptShare;
