import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { Swords, Flame, ArrowRight, Loader2 } from "lucide-react";
import type { CSSProperties } from "react";
import { trpc } from "@/lib/trpc";

const GOLD = "#f5c518";
const LIME = "#a3e635";
const MUTED = "var(--color-muted-foreground)";
const LINE = "rgba(255,255,255,0.08)";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 50% -8%,rgba(245,197,24,.10),transparent 45%),radial-gradient(circle at 85% 18%,rgba(239,68,68,.16),transparent 42%),linear-gradient(180deg,#0b0809,#060405)",
  color: "#f3f8ff",
};

// Heat tone matches RivalrySummaryCard so the shared card feels like the app.
const HEAT_TONE: Record<string, string> = {
  Inferno: "border-red-500/40 bg-red-500/15 text-red-300",
  Burning: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  Heated: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  Simmering: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
  Cold: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  Legendary: "border-red-500/40 bg-red-500/15 text-red-300",
  Active: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  Quiet: "border-sky-500/30 bg-sky-500/10 text-sky-200",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={PAGEBG} className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function formatRecord(r: { wins: number; losses: number; ties: number }): string {
  return r.ties > 0 ? `${r.wins}\u2013${r.losses}\u2013${r.ties}` : `${r.wins}\u2013${r.losses}`;
}

export function RivalryShare() {
  const { shareCode } = useParams();
  const q = trpc.rivalryShare.get.useQuery(
    { shareCode: shareCode ?? "" },
    { enabled: !!shareCode, staleTime: Infinity, retry: false },
  );
  const r = q.data?.valid ? q.data.rivalry : null;

  useEffect(() => {
    document.title = r
      ? `${r.ownerA} vs ${r.ownerB} | Fantasy Football Rivals`
      : "Rivalry | Fantasy Football Rivals";
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
          <p className="text-lg font-black">This rivalry link is invalid or expired.</p>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>The link may have been truncated when it was shared.</p>
          <Link to="/" className="mt-5 inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-extrabold" style={{ background: LIME, color: "#0b0809" }}>
            Import your league and find your rival <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Shell>
    );
  }

  const heatTone = HEAT_TONE[r.heatLabel] ?? HEAT_TONE.Cold;

  return (
    <Shell>
      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.4em]" style={{ color: GOLD }}>Fantasy Football Rivals</div>
        <div className="mt-2 text-sm font-semibold tracking-wide" style={{ color: "#cfd2d8" }}>{r.leagueName}</div>
      </div>

      {/* Rivalry card */}
      <div className="mt-5 overflow-hidden rounded-2xl p-6" style={{ background: "linear-gradient(160deg,rgba(239,68,68,.10),rgba(245,197,24,.02))", border: `1px solid ${GOLD}44` }}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: MUTED }}>Head-to-Head</div>
          <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${heatTone}`}>
            <Flame className="h-3 w-3" /> {r.heatLabel}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 text-3xl font-black leading-tight">
          <span>{r.ownerA}</span>
          <Swords className="h-5 w-5 shrink-0" style={{ color: MUTED }} />
          <span style={{ color: LIME }}>{r.ownerB}</span>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <div className="text-5xl font-black" style={{ color: GOLD }}>{formatRecord(r.record)}</div>
          <div className="pb-1 text-sm" style={{ color: MUTED }}>
            head-to-head<br />
            {r.totalMeetings} meeting{r.totalMeetings === 1 ? "" : "s"}
            {r.playoffRecord ? ` \u00b7 Playoffs ${r.playoffRecord.wins}\u2013${r.playoffRecord.losses}` : ""}
          </div>
        </div>

        {r.summary && (
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "#cfd2d8" }}>{r.summary}</p>
        )}
      </div>

      {/* CTA */}
      <div className="mt-5 rounded-2xl p-5 text-center" style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.02)" }}>
        <p className="text-base font-black">Every league has a rivalry like this.</p>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>Import your league and find your biggest rival — records, heat, and the receipts behind every feud.</p>
        <Link to="/" className="mt-4 inline-flex items-center justify-center gap-2 rounded-[12px] px-6 py-3 text-sm font-extrabold" style={{ background: LIME, color: "#0b0809" }}>
          Import your league and find your rival <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-2 text-[11px]" style={{ color: MUTED }}>Know your league. Own your rivals.</p>
      </div>
    </Shell>
  );
}

export default RivalryShare;
