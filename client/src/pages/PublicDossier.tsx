import type { ReactNode } from "react";

const GOLD = "#f5c518";
const LIME = "#a3e635";
const MUTED = "var(--color-muted-foreground)";
const LINE = "rgba(255,255,255,0.08)";
const RED = "#f87171";

const TIER_LABEL: Record<string, string> = {
  villain: "League Villain", dynasty: "Dynasty Architect", gatekeeper: "Gatekeeper", playoff_fixture: "Playoff Fixture",
};

// Mirrors the public, token-safe shape returned by payloadToReceipt (getReceipt / getReceiptByCode).
// Identity tier only — never Pain, Title Path, or paid scouting (those are not in the token).
export type PublicDossierReceipt = {
  ownerName: string;
  leagueName: string;
  archetype: string;
  archetypeReceipt: string;
  identityRank: { rank: number; of: number } | null;
  badges: { label: string; tier: string }[];
  championships: number;
  championshipYears: number[];
  leagueTwin: { ownerName: string; similarityPct: number } | null;
  blindSpot: string | null;
  primaryTrait: string | null;
  topRival: { name: string; severity: number; yearsActive: number | null; playoffEliminations: number | null } | null;
};

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-2xl p-4" style={{ border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.02)" }}>
      <div className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: MUTED }}>{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function PublicDossier({ r }: { r: PublicDossierReceipt }) {
  const hasHonors = r.championships > 0 || r.badges.length > 0;
  const rival = r.topRival;
  const rivalStats = rival ? [
    rival.yearsActive ? `${rival.yearsActive} seasons` : null,
    rival.playoffEliminations ? `${rival.playoffEliminations} playoff KO${rival.playoffEliminations === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" \u00b7 ") : "";

  return (
    <div className="mt-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: LINE }} />
        <div className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: MUTED }}>The Dossier</div>
        <div className="h-px flex-1" style={{ background: LINE }} />
      </div>

      {/* 1. Identity */}
      <Section label="Identity">
        <div className="text-2xl font-black leading-tight">{r.ownerName}</div>
        <div className="mt-0.5 text-sm font-black" style={{ color: LIME }}>
          {r.archetype}{r.identityRank ? ` \u00b7 #${r.identityRank.rank}/${r.identityRank.of}` : ""}
        </div>
        <div className="text-xs" style={{ color: MUTED }}>{r.leagueName}</div>
        {r.archetypeReceipt && <p className="mt-2 text-sm leading-relaxed" style={{ color: "#cfd2d8" }}>{r.archetypeReceipt}</p>}
      </Section>

      {/* 2. Honors (badges / rings) */}
      {hasHonors && (
        <Section label="Honors">
          {r.championships > 0 && (
            <div className="text-sm font-black" style={{ color: GOLD }}>
              {r.championships > 1 ? `${r.championships}\u00d7 Champion` : "Champion"}
              {r.championshipYears.length > 0 && (
                <span className="ml-1 text-xs font-semibold" style={{ color: MUTED }}>({r.championshipYears.join(", ")})</span>
              )}
            </div>
          )}
          {r.badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.badges.map((b, i) => (
                <span key={i} className="rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ background: "rgba(245,197,24,.12)", color: GOLD }}>
                  {TIER_LABEL[b.tier] ?? b.label}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 3. League Twin */}
      {r.leagueTwin && (
        <Section label="League Twin">
          <div className="text-sm">You manage most like <span className="font-black">{r.leagueTwin.ownerName}</span></div>
          <div className="mt-1.5 inline-block rounded px-2 py-0.5 text-[11px] font-black" style={{ background: "rgba(163,230,53,.14)", color: LIME }}>
            {r.leagueTwin.similarityPct}% match
          </div>
        </Section>
      )}

      {/* 4. Primary Trait */}
      {r.primaryTrait && (
        <Section label="Primary Trait">
          <p className="text-sm leading-relaxed" style={{ color: "#cfd2d8" }}>{r.primaryTrait}</p>
        </Section>
      )}

      {/* 5. Blind Spot */}
      {r.blindSpot && (
        <Section label="Blind Spot">
          <p className="text-sm leading-relaxed" style={{ color: "#cfd2d8" }}>{r.blindSpot}</p>
        </Section>
      )}

      {/* 6. Top Rival (teaser only) */}
      {rival && (
        <Section label="Top Rival">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-black leading-tight">{rival.name}</span>
            <span className="shrink-0 text-[11px] font-black uppercase tracking-wide" style={{ color: RED }}>Rivalry {rival.severity}</span>
          </div>
          {rivalStats && <div className="mt-1 text-xs" style={{ color: MUTED }}>{rivalStats}</div>}
        </Section>
      )}
    </div>
  );
}

export default PublicDossier;
