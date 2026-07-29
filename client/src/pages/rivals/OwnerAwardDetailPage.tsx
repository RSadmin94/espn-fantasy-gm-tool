/**
 * Award detail — /rivals/awards/:awardId
 */
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { Award, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { rivalsOwnerDossierPath } from "@/lib/ownerIdentity";
import {
  buildAwardDetail,
  formatOwnerAwardStat,
  getOwnerAwardMetaById,
} from "@/lib/ownerAwardsDisplay";
import { CinematicPageHeader, IntelPageShell, IntelPanel, SectionLoading } from "@/components/layout";
import { ownerAwardIcon, rarityCardStyle, RARITY_COLORS } from "@/components/ownerAwards/ownerAwardVisuals";
import { OwnerAwardShareButton } from "@/components/ownerAwards/OwnerAwardShareButton";
import { cn } from "@/lib/utils";

export function OwnerAwardDetailPage() {
  const { awardId = "" } = useParams();
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const listQ = (trpc as any).owners.ownerList.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });

  const metaFallback = getOwnerAwardMetaById(awardId);
  const detail = useMemo(
    () => buildAwardDetail(awardId, (listQ.data?.ownerAwards ?? []) as any[]),
    [awardId, listQ.data?.ownerAwards],
  );
  const meta = detail?.meta ?? metaFallback;
  const leagueName = String(listQ.data?.leagueName ?? "Your league");

  if (!meta) {
    return (
      <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default">
        <p className="py-16 text-center text-sm text-zinc-400">Award not found.</p>
        <div className="text-center">
          <Link to="/rivals/awards" className="text-[#a3e635] hover:underline">
            ← Back to catalog
          </Link>
        </div>
      </IntelPageShell>
    );
  }

  const Icon = ownerAwardIcon(meta.icon);
  const colors = RARITY_COLORS[meta.rarity];

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default">
      <Link
        to="/rivals/awards"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Award Catalog
      </Link>

      <CinematicPageHeader
        eyebrowMono={`${meta.category} · ${meta.rarity}`}
        icon={Award}
        title={meta.displayName}
        subtitle={meta.shortDescription}
        className="mb-5"
        actions={
          <OwnerAwardShareButton
            awardId={meta.id}
            leagueName={leagueName}
            currentHolderName={detail?.currentHolderName ?? null}
            currentValue={detail?.currentValue ?? null}
          />
        }
      />

      {!ready || listQ.isLoading ? (
        <SectionLoading message="Loading award…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <IntelPanel variant="warm" className="overflow-hidden p-0">
            <div className="border-b border-white/[0.08] p-5" style={rarityCardStyle(meta.rarity)}>
              <div className="flex items-start gap-4">
                <span
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border"
                  style={{ borderColor: colors.border, background: colors.bg, color: colors.fg }}
                  aria-hidden
                >
                  <Icon className="h-8 w-8" />
                </span>
                <div className="min-w-0">
                  <p className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase", colors.chip)}>
                    {meta.rarity}
                  </p>
                  <h2 className="mt-2 text-xl font-black text-zinc-50">{meta.displayName}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{meta.longDescription}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <Section title="How it is earned" body={meta.howEarned} />
              <Section title="Eligibility" body={meta.eligibility} />
              {detail?.currentReason ? (
                <Section title="Current evidence" body={String(detail.currentReason)} />
              ) : null}
            </div>
          </IntelPanel>

          <div className="space-y-4">
            <IntelPanel variant="warm" className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Current holder</p>
              {detail?.currentHolderName ? (
                <>
                  <p className="mt-1 text-lg font-bold text-zinc-50">{detail.currentHolderName}</p>
                  <p className="mt-1 font-mono text-xs text-zinc-400">
                    {formatOwnerAwardStat(meta.awardName, detail.currentValue)}
                  </p>
                  {detail.currentHolderKey ? (
                    <Link
                      to={rivalsOwnerDossierPath(detail.currentHolderKey)}
                      className="mt-3 inline-flex text-xs font-bold text-[#a3e635] hover:underline"
                    >
                      Open owner dossier →
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No current holder.</p>
              )}
            </IntelPanel>

            {detail && detail.historicalWinners.length > 0 ? (
              <IntelPanel variant="warm" className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Owners Holding This Award
                </p>
                <ul className="mt-2 space-y-2">
                  {detail.historicalWinners.map((w) => (
                    <li key={`${w.ownerKey}-${w.ownerName}`} className="text-sm text-zinc-200">
                      {w.ownerName}
                      {w.seasons.length > 0 ? (
                        <span className="ml-2 text-xs text-zinc-500">{w.seasons.join(", ")}</span>
                      ) : (
                        <span className="ml-2 text-xs text-zinc-500">Holding now</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                  V1 awards track the current holder only — multi-season ledgers are omitted rather than invented.
                </p>
              </IntelPanel>
            ) : null}

            {detail && detail.related.length > 0 ? (
              <IntelPanel variant="warm" className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Related awards</p>
                <ul className="mt-2 space-y-1.5">
                  {detail.related.map((r) => (
                    <li key={r.id}>
                      <Link to={`/rivals/awards/${r.id}`} className="text-sm text-[#a3e635] hover:underline">
                        {r.displayName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </IntelPanel>
            ) : null}
          </div>
        </div>
      )}
    </IntelPageShell>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">{title}</h3>
      <p className="mt-1 leading-relaxed text-zinc-300">{body}</p>
    </div>
  );
}
