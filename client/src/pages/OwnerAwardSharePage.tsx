import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { ArrowRight, Award, Loader2 } from "lucide-react";
import type { CSSProperties } from "react";
import { trpc } from "@/lib/trpc";
import { getOwnerAwardMetaById } from "@/lib/ownerAwardsDisplay";
import { ownerAwardIcon, RARITY_COLORS } from "@/components/ownerAwards/ownerAwardVisuals";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 50% -8%,rgba(245,197,24,.10),transparent 45%),radial-gradient(circle at 85% 18%,rgba(192,132,252,.16),transparent 42%),linear-gradient(180deg,#0b0809,#060405)",
  color: "#f3f8ff",
};

export function OwnerAwardSharePage() {
  const { shareCode } = useParams();
  const q = (trpc as any).ownerAwardShare.get.useQuery(
    { shareCode: shareCode ?? "" },
    { enabled: !!shareCode, staleTime: Infinity, retry: false },
  );
  const award = q.data?.valid ? q.data.award : null;
  const meta = award ? getOwnerAwardMetaById(award.awardId) : null;

  useEffect(() => {
    document.title = award
      ? `${award.displayName} | Fantasy Football Rivals`
      : "Owner Award | Fantasy Football Rivals";
  }, [award]);

  if (q.isLoading) {
    return (
      <div style={PAGEBG} className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!award) {
    return (
      <div style={PAGEBG} className="flex min-h-screen items-center justify-center px-5">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-lg font-black">This award link is invalid or expired.</p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-[#a3e635] px-5 py-2.5 text-sm font-extrabold text-[#0b0809]"
          >
            Explore Fantasy Football Rivals <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const Icon = meta ? ownerAwardIcon(meta.icon) : Award;
  const rarityKey = (award.rarity in RARITY_COLORS ? award.rarity : "Common") as keyof typeof RARITY_COLORS;
  const colors = RARITY_COLORS[rarityKey];

  return (
    <div style={PAGEBG} className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-400">
          <Award className="h-3.5 w-3.5" /> Fantasy Football Rivals
        </div>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-widest" style={{ color: colors.fg }}>
          {award.rarity} · {award.category}
        </p>
        <div className="mt-4 flex items-start gap-3">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border"
            style={{ borderColor: colors.border, background: colors.bg, color: colors.fg }}
          >
            <Icon className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-black leading-tight">{award.displayName}</h1>
            <p className="mt-1 text-sm text-zinc-400">{award.leagueName}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">{award.shortDescription}</p>
        {award.currentHolderName ? (
          <p className="mt-4 text-lg font-extrabold text-[#a3e635]">
            Held by {award.currentHolderName}
          </p>
        ) : null}
        {award.statLabel ? (
          <p className="mt-1 font-mono text-sm text-zinc-400">{award.statLabel}</p>
        ) : null}
        <Link
          to="/rivals/awards"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#a3e635] px-5 py-2.5 text-sm font-extrabold text-[#0b0809]"
        >
          Explore the Award Catalog <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
