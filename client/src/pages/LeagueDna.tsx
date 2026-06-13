import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import {
  Dna, Users, TrendingUp, AlertTriangle, ChevronRight, Loader2,
  Trophy, Repeat2, Boxes, Crown,
} from "lucide-react";

const PAGEBG: React.CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),linear-gradient(180deg,#0e0a10,#080609)",
  color: "#f3f8ff",
};
const PAPER = "linear-gradient(180deg,#1b131f,#140e17)";
const LINE = "rgba(255,255,255,0.07)";
const TEXT = "#f3f8ff";
const MUTED = "#8b97a8";
const GOLD = "#f5c518";
const ACCENT = "#a3e635";
const RED = "#ef4444";
const PANEL: React.CSSProperties = { background: PAPER, border: `1px solid ${LINE}`, borderRadius: 15 };
const SUB: React.CSSProperties = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 };

function gradeColor(g: string): string {
  const c = (g || "")[0];
  return c === "A" ? ACCENT : c === "B" ? "#bef264" : c === "C" ? GOLD : RED;
}

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div style={{ ...SUB, ...style }} className={`p-5 ${className}`}>{children}</div>;
}
function Eyebrow({ children, color = MUTED }: { children: React.ReactNode; color?: string }) {
  return <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color }}>{children}</div>;
}

export function LeagueDna() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const q = (trpc as any).dna.myProfile.useQuery(withLeagueSalt({}, leagueContextKey), { staleTime: 60_000, enabled: ready });
  const data: any = q.data;
  const gated = Boolean(data?.gated);

  const checkout = (trpc as any).billing.createCheckoutSession.useMutation({
    onSuccess: (r: any) => { if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer"); },
  });
  const log = (trpc as any).usageMonitor.logUIEvent.useMutation();
  const snap = useRef(false);
  const pay = useRef(false);
  useEffect(() => { if (!snap.current && data) { snap.current = true; log.mutate({ eventType: "feature_open", featureName: "dna_snapshot_viewed" }); } }, [data]);
  useEffect(() => { if (gated && !pay.current) { pay.current = true; log.mutate({ eventType: "feature_open", featureName: "dna_paywall_viewed" }); } }, [gated]);
  const startCheckout = () => { log.mutate({ eventType: "cta_click", featureName: "dna_unlock_clicked" }); checkout.mutate({}); };

  const loading = !ready || q.isLoading;

  return (
    <div style={PAGEBG} className="-m-4 md:-m-6 p-5 md:p-7 min-h-full">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-3xl md:text-4xl font-black tracking-tight leading-none">
            <Dna className="h-7 w-7" style={{ color: ACCENT }} /> Your League DNA
          </h2>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>
            Who you are as a manager - read from every season your league remembers.
          </p>
        </div>
      </div>

      <main className="space-y-3">
        {loading ? (
          <div style={PANEL}><div className="flex items-center justify-center gap-3 py-20 text-sm" style={{ color: MUTED }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Reading your DNA...
          </div></div>
        ) : !data ? (
          <div style={PANEL}><div className="px-6 py-16 text-center">
            <Dna className="mx-auto mb-3 h-8 w-8" style={{ color: MUTED }} />
            <div className="text-lg font-extrabold">We need your owner profile first</div>
            <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: MUTED }}>
              Your DNA is computed from your full league history. Set your owner profile (Settings - who are you in this league)
              and sync a few seasons to light it up.
            </p>
          </div></div>
        ) : (
          <>
            {/* ----- Archetype hero ----- */}
            <div style={PANEL} className="overflow-hidden">
              <div className="relative p-6 md:p-8">
                <div className="absolute right-5 top-5 opacity-[0.06]"><Dna className="h-28 w-28" /></div>
                <Eyebrow color={ACCENT}>Your Manager Archetype</Eyebrow>
                <h1 className="mt-3 text-4xl md:text-6xl font-black leading-[0.95]">{data.archetype}</h1>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: "#cfd2d8" }}>{data.archetypeDesc}</p>
                <p className="mt-3 text-xs" style={{ color: MUTED }}>{data.seasonsAnalyzed} seasons analyzed</p>
              </div>
            </div>

            {/* ----- Free signature cards ----- */}
            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <Eyebrow><span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Primary Trait</span></Eyebrow>
                <p className="mt-3 text-[17px] font-bold leading-snug">{data.primaryTrait}</p>
              </Card>
              <Card>
                <Eyebrow color={GOLD}><span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Blind Spot</span></Eyebrow>
                <p className="mt-3 text-[17px] font-bold leading-snug">{data.blindSpot}</p>
              </Card>
              <Card style={{ border: `1px solid ${ACCENT}55`, background: "rgba(163,230,53,.06)" }}>
                <Eyebrow color={ACCENT}><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Your League Twin</span></Eyebrow>
                {data.leagueTwin ? (
                  <>
                    <p className="mt-3 text-2xl font-black leading-tight">You manage most like {data.leagueTwin.ownerName}.</p>
                    <p className="mt-1 text-xs" style={{ color: MUTED }}>{data.leagueTwin.similarityPct}% DNA match - screenshot this and send it to them.</p>
                  </>
                ) : (
                  <p className="mt-3 text-sm" style={{ color: MUTED }}>Not enough league data to find your twin yet.</p>
                )}
              </Card>
            </div>

            {/* ----- DNA Scorecard ----- */}
            <div style={PANEL} className="p-5">
              <Eyebrow>DNA Scorecard</Eyebrow>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {([["Trading", data.scorecard.trading], ["Drafting", data.scorecard.drafting], ["Roster Construction", data.scorecard.roster]] as Array<[string, string]>).map(([label, grade]) => (
                  <div key={label} style={SUB} className="flex flex-col items-center px-3 py-5">
                    <div className="text-5xl font-black tabular-nums" style={{ color: gradeColor(grade) }}>{grade}</div>
                    <div className="mt-2 text-center text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>{label}</div>
                  </div>
                ))}
              </div>
              {data.draftBasis?.method === "draft-only" ? (
                <p className="mt-3 text-[11px] leading-relaxed" style={{ color: MUTED }}>
                  Drafting is your <b style={{ color: TEXT }}>draft-only record</b> - what your drafted roster would have done with zero moves after draft day - across {data.draftBasis.seasonsUsed} season{data.draftBasis.seasonsUsed === 1 ? "" : "s"} with full weekly data.
                </p>
              ) : (
                <p className="mt-3 text-[11px] leading-relaxed" style={{ color: MUTED }}>
                  Drafting is style-based for now - this league has no seasons with full weekly player data to run the no-move simulation.
                </p>
              )}
            </div>

            {/* ----- Paid dossier OR paywall ----- */}
            {gated ? (
              <div style={PANEL} className="p-6 md:p-8 text-center">
                <Dna className="mx-auto mb-3 h-8 w-8" style={{ color: ACCENT }} />
                <h3 className="text-2xl font-black">Unlock your full DNA dossier</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm" style={{ color: MUTED }}>
                  Your archetype, blind spot and League Twin are free. The full breakdown - Draft DNA, Trade DNA,
                  Roster DNA, how you differ from champions, and every blind spot - unlocks with Rivals Pro.
                </p>
                <button
                  onClick={startCheckout}
                  disabled={checkout.isPending}
                  className="mt-5 inline-flex items-center gap-2 rounded-[10px] px-6 py-3 text-sm font-extrabold disabled:opacity-60"
                  style={{ background: ACCENT, color: "#1e1623" }}
                >
                  {checkout.isPending ? "Opening..." : "Unlock Full DNA"} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  {data.draftDna && (
                    <Card>
                      <Eyebrow color={ACCENT}><span className="inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Draft DNA</span></Eyebrow>
                      <div className="mt-3 space-y-1.5 text-sm" style={{ color: "#cfd2d8" }}>
                        <p>Style: <b style={{ color: TEXT }}>{data.draftDna.draftStyleBadge}</b></p>
                        <p>Reaches on: <b style={{ color: TEXT }}>{data.draftDna.reachPositions.join(", ") || "none"}</b></p>
                        <p>Finds value at: <b style={{ color: TEXT }}>{data.draftDna.valuePositions.join(", ") || "none"}</b></p>
                        <p>Keeper usage: <b style={{ color: TEXT }}>{Math.round(data.draftDna.keeperRate)}%</b></p>
                      </div>
                    </Card>
                  )}
                  {data.tradeDna && (
                    <Card>
                      <Eyebrow color={ACCENT}><span className="inline-flex items-center gap-1.5"><Repeat2 className="h-3.5 w-3.5" /> Trade DNA</span></Eyebrow>
                      <div className="mt-3 space-y-1.5 text-sm" style={{ color: "#cfd2d8" }}>
                        <p>Trades / season: <b style={{ color: TEXT }}>{data.tradeDna.avgTradesPerSeason}</b></p>
                        <p>Frequency score: <b style={{ color: TEXT }}>{data.tradeDna.tradeFrequency}/100</b></p>
                        <p>Trades more when losing: <b style={{ color: TEXT }}>{data.tradeDna.lossTradeRatio > 1.1 ? "yes" : "no"}</b></p>
                      </div>
                    </Card>
                  )}
                  {data.rosterDna && (
                    <Card>
                      <Eyebrow color={ACCENT}><span className="inline-flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5" /> Roster DNA</span></Eyebrow>
                      <div className="mt-3 space-y-1.5 text-sm" style={{ color: "#cfd2d8" }}>
                        <p>Waiver aggression: <b style={{ color: TEXT }}>{data.rosterDna.waiver.waiverAggression}/100</b></p>
                        <p>Adds / season: <b style={{ color: TEXT }}>{data.rosterDna.waiver.avgAcquisitionsPerSeason}</b></p>
                        <p>Temperament: <b style={{ color: TEXT }}>{data.rosterDna.tilt.tiltLabel}</b></p>
                      </div>
                    </Card>
                  )}
                </div>

                {data.championComparison && (
                  <div style={PANEL} className="p-5">
                    <Eyebrow color={GOLD}><span className="inline-flex items-center gap-1.5"><Crown className="h-3.5 w-3.5" /> How You Differ From Champions</span></Eyebrow>
                    <div className="mt-4 space-y-2">
                      {data.championComparison.map((r: any, i: number) => (
                        <div key={i} style={SUB} className="flex items-center justify-between px-4 py-3 text-sm">
                          <span style={{ color: MUTED }}>{r.category}</span>
                          <span className="flex items-center gap-4">
                            <span>You <b style={{ color: r.edge === "you" ? ACCENT : TEXT }}>{r.you}</b></span>
                            <span>Champions <b style={{ color: r.edge === "champs" ? GOLD : TEXT }}>{r.champions}</b></span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.blindSpots && data.blindSpots.length > 0 && (
                  <div style={PANEL} className="p-5">
                    <Eyebrow color={RED}><span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Behavioral Blind Spots</span></Eyebrow>
                    <ul className="mt-3 space-y-2">
                      {data.blindSpots.map((b: string, i: number) => (
                        <li key={i} style={SUB} className="px-4 py-3 text-sm" >{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
