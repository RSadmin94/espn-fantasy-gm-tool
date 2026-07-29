import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { ArrowRight, Loader2, ScrollText } from "lucide-react";
import type { CSSProperties } from "react";
import { trpc } from "@/lib/trpc";

const GOLD = "#f5c518";
const LIME = "#a3e635";
const MUTED = "#8b97a8";
const RED = "#ef4444";
const LINE = "rgba(255,255,255,0.08)";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 50% -8%,rgba(245,197,24,.10),transparent 45%),radial-gradient(circle at 85% 18%,rgba(239,68,68,.16),transparent 42%),linear-gradient(180deg,#0b0809,#060405)",
  color: "#f3f8ff",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={PAGEBG} className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export function HistoricalReceiptSharePage() {
  const { shareCode } = useParams();
  const q = (trpc as any).historicalReceiptShare.get.useQuery(
    { shareCode: shareCode ?? "" },
    { enabled: !!shareCode, staleTime: Infinity, retry: false },
  );
  const r = q.data?.valid ? q.data.receipt : null;

  useEffect(() => {
    document.title = r
      ? `${r.headline} | Fantasy Football Rivals`
      : "Historical Receipt | Fantasy Football Rivals";
  }, [r]);

  if (q.isLoading) {
    return (
      <Shell>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
        </div>
      </Shell>
    );
  }

  if (!r) {
    return (
      <Shell>
        <div className="rounded-2xl p-8 text-center" style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.02)" }}>
          <p className="text-lg font-black">This receipt link is invalid or expired.</p>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>The link may have been truncated when it was shared.</p>
          <Link to="/" className="mt-5 inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-extrabold" style={{ background: LIME, color: "#0b0809" }}>
            Explore Fantasy Football Rivals <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Shell>
    );
  }

  const tone = r.tone === "good" ? LIME : RED;

  return (
    <Shell>
      <div className="rounded-2xl p-6" style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.03)" }}>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
          <ScrollText className="h-3.5 w-3.5" /> Fantasy Football Rivals
        </div>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-widest" style={{ color: tone }}>{r.typeLabel}</p>
        <h1 className="mt-2 text-2xl font-black leading-tight">{r.headline}</h1>
        <p className="mt-2 text-sm" style={{ color: MUTED }}>{r.leagueName} · {r.whenLabel}</p>
        <p className="mt-4 text-lg font-extrabold" style={{ color: LIME }}>{r.centralResult}</p>
        {r.focalScore != null && r.rivalScore != null ? (
          <p className="mt-1 text-sm tabular-nums" style={{ color: MUTED }}>
            Final score · margin {r.margin != null ? `${Number(r.margin).toFixed(1)} pts` : "—"}
            {r.matchupType ? ` · ${r.matchupType}` : ""}
          </p>
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-zinc-200">{r.evidence}</p>
        <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>Why this matters</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-100">{r.whyMatters}</p>
        </div>
        {r.seriesRecord ? (
          <p className="mt-3 text-xs" style={{ color: MUTED }}>Regular-season series: {r.seriesRecord}</p>
        ) : null}
        <Link
          to="/sign-in"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-5 py-3 text-sm font-extrabold"
          style={{ background: LIME, color: "#0b0809" }}
        >
          Explore your league on Fantasy Football Rivals <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Shell>
  );
}
