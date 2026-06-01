import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  RivalryDossierPanel,
  type RivalryPickerOption,
} from "@/components/RivalryDossierPanel";
import { buildDefaultRivalryEligibleOwnerKeys } from "@/lib/rivalryOwnerEligibility";
import {
  Swords,
  Flame,
  Skull,
  HeartCrack,
  Trophy,
  Crosshair,
  Crown,
  ScrollText,
  X,
  ChevronRight,
} from "lucide-react";

// ── theme (editorial: ESPN / NFL Films / The Athletic — not neon) ───────────
const INK = "#0c0d10";
const PAPER = "#15161b";
const PAPER2 = "#1b1d24";
const LINE = "rgba(255,255,255,0.10)";
const TEXT = "#f4f1ea";
const MUTED = "#8b8f98";
const CRIMSON = "#e23b3b";
const GOLD = "#f5c518";

const ROD_NAMES = ["rod sellers", "rodzilla", "str8frmhell", "rod s"];

const HEAT: Record<string, { c: string; label: string }> = {
  Cold: { c: "#6b7280", label: "Cold" },
  Simmering: { c: "#d8a23a", label: "Simmering" },
  Heated: { c: "#f0883e", label: "Heated" },
  Burning: { c: "#e8552e", label: "Burning" },
  Inferno: { c: "#d62828", label: "Inferno" },
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const n = (v: unknown) => Number(v ?? 0);

type Pair = {
  rivalId?: string;
  rivalName?: string;
  rivalryScore?: number;
  h2hWins?: number;
  h2hLosses?: number;
  h2hTies?: number;
  playoffEliminations?: number;
  closeLossCount?: number;
  recentLosses?: number;
  heatLabel?: string;
  painfulLossSeason?: number | null;
  painfulLossMargin?: number | null;
  painfulLossOpponentScore?: number | null;
  revengeAchieved?: boolean;
  lastMatchupSeason?: number | null;
  loreSentence?: string | null;
  rivalPlayoffWins?: number;
  rivalPlayoffLosses?: number;
};

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-bold uppercase tracking-[0.32em]"
      style={{ color: MUTED }}
    >
      {children}
    </div>
  );
}

function HeatBadge({ label }: { label?: string }) {
  const h = HEAT[label ?? "Cold"] ?? HEAT.Cold;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ color: h.c, border: `1px solid ${h.c}55`, background: `${h.c}14` }}
    >
      <Flame className="h-3 w-3" /> {h.label}
    </span>
  );
}

export function RivalryCenter() {
  const scoresQ = (trpc as any).rivalry.getScores.useQuery(undefined, {
    staleTime: 300_000,
  });
  const listQ = (trpc as any).owners.ownerList.useQuery(undefined, {
    staleTime: 300_000,
  });
  const cachedQ = (trpc as any).espn.cachedSeasons.useQuery(undefined, {
    staleTime: 60_000,
  });

  const allOwners: Array<{ ownerKey: string; ownerName?: string; seasons?: number[]; championships?: number }> =
    listQ.data?.allOwners ?? [];

  const pickerOptions = useMemo<RivalryPickerOption[]>(
    () => allOwners.map((o) => ({ ownerKey: o.ownerKey, label: String(o.ownerName ?? o.ownerKey) })),
    [allOwners],
  );

  const eligible = useMemo(
    () =>
      buildDefaultRivalryEligibleOwnerKeys(
        allOwners.map((o) => ({
          ownerKey: o.ownerKey,
          seasons: Array.isArray(o.seasons) ? o.seasons : [],
          championships: n(o.championships),
        })),
      ),
    [allOwners],
  );

  const activeSeason = useMemo(() => {
    const c: number[] = cachedQ.data ?? [];
    return c.length ? Math.max(...c) : new Date().getFullYear();
  }, [cachedQ.data]);

  const nameToKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of allOwners) m[norm(o.ownerName ?? o.ownerKey)] = o.ownerKey;
    return m;
  }, [allOwners]);

  const rodKey = useMemo(() => {
    for (const o of allOwners) {
      const nm = norm(o.ownerName);
      if (ROD_NAMES.some((r) => nm.includes(r))) return o.ownerKey;
    }
    return pickerOptions[0]?.ownerKey ?? "";
  }, [allOwners, pickerOptions]);

  const pairs = useMemo<Pair[]>(() => {
    const arr: Pair[] = Array.isArray(scoresQ.data) ? scoresQ.data : [];
    return [...arr].sort((a, b) => n(b.rivalryScore) - n(a.rivalryScore));
  }, [scoresQ.data]);

  const keyForRival = (p: Pair) => nameToKey[norm(p.rivalName)] ?? undefined;

  const [open, setOpen] = useState<{ rivalKey?: string; rivalName: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openDossier = (p: Pair) =>
    setOpen({ rivalKey: keyForRival(p), rivalName: String(p.rivalName ?? "Rival") });

  const loading = scoresQ.isLoading || listQ.isLoading;
  const hero = pairs[0];
  const ranked = pairs.slice(0, 10);

  return (
    <div
      className="-m-4 min-h-full p-5 md:-m-6 md:p-8"
      style={{ background: INK, color: TEXT }}
    >
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="mx-auto max-w-6xl border-b pb-6" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2" style={{ color: CRIMSON }}>
          <Swords className="h-4 w-4" />
          <span className="text-[11px] font-bold uppercase tracking-[0.4em]">GM War Room</span>
        </div>
        <h1
          className="mt-2 text-5xl font-black uppercase leading-[0.95] tracking-tight md:text-7xl"
          style={{ color: TEXT }}
        >
          Rivalry Center
        </h1>
        <p className="mt-2 text-lg italic" style={{ color: MUTED }}>
          Every feud has a history.
        </p>
      </header>

      <main className="mx-auto max-w-6xl">
        {loading ? (
          <div className="py-24 text-center text-sm" style={{ color: MUTED }}>
            Loading league rivalries…
          </div>
        ) : pairs.length === 0 ? (
          <div
            className="my-10 rounded-lg border p-10 text-center"
            style={{ borderColor: LINE, background: PAPER }}
          >
            <Swords className="mx-auto mb-3 h-8 w-8" style={{ color: MUTED }} />
            <div className="text-lg font-bold">No rivalry data yet</div>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              Rivalry scores are computed from synced matchups, playoffs and trades. Sync more
              seasons to light up the board.
            </p>
          </div>
        ) : (
          <>
            {/* ── SECTION 1 — Rivalry of the Year ──────────────────── */}
            {hero && (
              <section className="mt-8">
                <Kicker>Rivalry of the Year</Kicker>
                <div
                  className="mt-3 overflow-hidden rounded-xl border"
                  style={{
                    borderColor: `${CRIMSON}66`,
                    background: `linear-gradient(135deg, ${PAPER2} 0%, ${INK} 70%)`,
                    boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.03)`,
                  }}
                >
                  <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <HeatBadge label={hero.heatLabel} />
                        {hero.revengeAchieved === false && n(hero.playoffEliminations) > 0 && (
                          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: CRIMSON }}>
                            Revenge pending
                          </span>
                        )}
                      </div>
                      <h2 className="text-4xl font-black leading-tight md:text-5xl">
                        Rod <span style={{ color: MUTED }}>vs</span>{" "}
                        <span style={{ color: CRIMSON }}>{String(hero.rivalName ?? "Rival")}</span>
                      </h2>
                      {hero.loreSentence && (
                        <p className="mt-3 max-w-xl text-[15px] leading-relaxed" style={{ color: "#cfd2d8" }}>
                          {hero.loreSentence}
                        </p>
                      )}
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          onClick={() => openDossier(hero)}
                          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold"
                          style={{ background: CRIMSON, color: "#fff" }}
                        >
                          View Full Rivalry <ChevronRight className="h-4 w-4" />
                        </button>
                        <a
                          href="#receipts"
                          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-bold"
                          style={{ borderColor: LINE, color: TEXT }}
                        >
                          View Receipts
                        </a>
                      </div>
                    </div>
                    <div
                      className="flex shrink-0 flex-col items-center justify-center rounded-lg border px-8 py-6"
                      style={{ borderColor: LINE, background: "rgba(0,0,0,0.25)" }}
                    >
                      <div className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
                        Rivalry Score
                      </div>
                      <div className="text-6xl font-black" style={{ color: GOLD }}>
                        {n(hero.rivalryScore)}
                      </div>
                    </div>
                  </div>
                  <HeroStrip p={hero} />
                </div>
              </section>
            )}

            {/* ── SECTION 2 — Power Rankings ───────────────────────── */}
            <section className="mt-12">
              <div className="flex items-end justify-between border-b pb-2" style={{ borderColor: LINE }}>
                <div>
                  <Kicker>League Rivalry Power Rankings</Kicker>
                  <h3 className="mt-1 text-2xl font-black uppercase tracking-tight">The Ledger</h3>
                </div>
                <span className="text-xs" style={{ color: MUTED }}>
                  Tap any rivalry for the full dossier
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {ranked.map((p, i) => {
                  const h = HEAT[p.heatLabel ?? "Cold"] ?? HEAT.Cold;
                  return (
                    <button
                      key={`${p.rivalId ?? p.rivalName ?? i}`}
                      onClick={() => openDossier(p)}
                      className="group flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors"
                      style={{ borderColor: LINE, background: PAPER }}
                    >
                      <div
                        className="w-9 shrink-0 text-center text-2xl font-black"
                        style={{ color: i === 0 ? GOLD : MUTED }}
                      >
                        {i + 1}
                      </div>
                      <div
                        className="h-10 w-1 shrink-0 rounded-full"
                        style={{ background: h.c }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-lg font-bold">
                            Rod <span style={{ color: MUTED }}>vs</span> {String(p.rivalName ?? "Rival")}
                          </span>
                          <HeatBadge label={p.heatLabel} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: MUTED }}>
                          <span>
                            Series <b style={{ color: TEXT }}>{n(p.h2hWins)}–{n(p.h2hLosses)}{n(p.h2hTies) ? `–${n(p.h2hTies)}` : ""}</b>
                          </span>
                          <span>
                            Playoff elims <b style={{ color: TEXT }}>{n(p.playoffEliminations)}</b>
                          </span>
                          <span>
                            Heartbreak losses <b style={{ color: TEXT }}>{n(p.closeLossCount)}</b>
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-3xl font-black" style={{ color: GOLD }}>{n(p.rivalryScore)}</div>
                        <div className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>score</div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-90" />
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── SECTION 4 — Historical Receipts ──────────────────── */}
            <section id="receipts" className="mt-12 scroll-mt-6">
              <div className="border-b pb-2" style={{ borderColor: LINE }}>
                <Kicker>The Evidence Locker</Kicker>
                <h3 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
                  <ScrollText className="h-5 w-5" style={{ color: CRIMSON }} /> Historical Receipts
                </h3>
              </div>
              {(() => {
                type R = { season: number | null; evidence: string; impact: string; tone: "bad" | "good" };
                const out: R[] = [];
                for (const p of pairs) {
                  const name = String(p.rivalName ?? "Rival");
                  if (n(p.playoffEliminations) > 0) {
                    out.push({
                      season: p.lastMatchupSeason ?? null,
                      evidence: `${name} eliminated Rod from the playoffs ${n(p.playoffEliminations) > 1 ? `${n(p.playoffEliminations)} times` : "once"}.`,
                      impact: "Season ended by rival",
                      tone: "bad",
                    });
                  }
                  if (p.painfulLossMargin != null) {
                    out.push({
                      season: p.painfulLossSeason ?? null,
                      evidence: `Lost to ${name} by ${Number(p.painfulLossMargin).toFixed(1)} pts${p.painfulLossOpponentScore != null ? ` (${Number(p.painfulLossOpponentScore).toFixed(1)} against)` : ""}.`,
                      impact: "Closest defeat in the series",
                      tone: "bad",
                    });
                  }
                  if (p.revengeAchieved && n(p.playoffEliminations) > 0) {
                    out.push({
                      season: p.lastMatchupSeason ?? null,
                      evidence: `Revenge served — Rod struck back against ${name}.`,
                      impact: "Receipt collected",
                      tone: "good",
                    });
                  }
                }
                out.sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
                if (out.length === 0)
                  return <p className="py-6 text-sm" style={{ color: MUTED }}>No receipts on file yet — the data hasn't surfaced a defining moment.</p>;
                return (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {out.slice(0, 8).map((r, i) => (
                      <div key={i} className="rounded-lg border p-4" style={{ borderColor: LINE, background: PAPER }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>
                            {r.season ?? "—"}
                          </span>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: r.tone === "good" ? GOLD : CRIMSON }}
                          >
                            {r.impact}
                          </span>
                        </div>
                        <p className="mt-2 text-[15px] leading-snug">{r.evidence}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>

            {/* ── SECTIONS 6 + 10 — Revenge Watch & Trophies ───────── */}
            <section className="mt-12 grid gap-6 md:grid-cols-2">
              <div>
                <div className="border-b pb-2" style={{ borderColor: LINE }}>
                  <Kicker>Unfinished Business</Kicker>
                  <h3 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
                    <Crosshair className="h-5 w-5" style={{ color: CRIMSON }} /> Revenge Watch
                  </h3>
                </div>
                {(() => {
                  const rev = pairs.filter((p) => n(p.playoffEliminations) > 0 && !p.revengeAchieved);
                  if (rev.length === 0)
                    return <p className="py-6 text-sm" style={{ color: MUTED }}>No outstanding playoff debts. The ledger is clean.</p>;
                  return (
                    <div className="mt-4 space-y-2">
                      {rev.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => openDossier(p)}
                          className="flex w-full items-center justify-between rounded-lg border p-3 text-left"
                          style={{ borderColor: LINE, background: PAPER }}
                        >
                          <div>
                            <div className="font-bold">{String(p.rivalName)}</div>
                            <div className="text-xs" style={{ color: MUTED }}>
                              Eliminated Rod {n(p.playoffEliminations)}× · revenge pending
                            </div>
                          </div>
                          <Skull className="h-5 w-5" style={{ color: CRIMSON }} />
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div>
                <div className="border-b pb-2" style={{ borderColor: LINE }}>
                  <Kicker>Rivalry Hardware</Kicker>
                  <h3 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
                    <Trophy className="h-5 w-5" style={{ color: GOLD }} /> Trophies
                  </h3>
                </div>
                {(() => {
                  if (pairs.length === 0) return null;
                  const by = (f: (p: Pair) => number) => [...pairs].sort((a, b) => f(b) - f(a))[0];
                  const nemesis = by((p) => n(p.rivalryScore));
                  const dealer = by((p) => n(p.playoffEliminations));
                  const pain = by((p) => n(p.closeLossCount));
                  const king = by((p) => n(p.h2hWins) - n(p.h2hLosses));
                  const items = [
                    { icon: <Skull className="h-4 w-4" />, t: "The Nemesis", who: nemesis?.rivalName, d: `Highest rivalry score (${n(nemesis?.rivalryScore)})` },
                    { icon: <HeartCrack className="h-4 w-4" />, t: "Heartbreak Dealer", who: dealer?.rivalName, d: `${n(dealer?.playoffEliminations)} playoff eliminations of Rod` },
                    { icon: <Flame className="h-4 w-4" />, t: "House of Pain", who: pain?.rivalName, d: `${n(pain?.closeLossCount)} heartbreak losses` },
                    { icon: <Crown className="h-4 w-4" />, t: "Rod Owns Them", who: king?.rivalName, d: `Best series margin (${n(king?.h2hWins)}–${n(king?.h2hLosses)})` },
                  ].filter((x) => x.who);
                  return (
                    <div className="mt-4 grid gap-2">
                      {items.map((x, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: LINE, background: PAPER }}>
                          <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${GOLD}1a`, color: GOLD }}>
                            {x.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>{x.t}</div>
                            <div className="truncate font-bold">{String(x.who)}</div>
                            <div className="text-xs" style={{ color: MUTED }}>{x.d}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </section>
          </>
        )}
      </main>

      {/* ── POPUP — Rivalry Dossier ──────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 md:p-8"
          style={{ background: "rgba(4,5,8,0.82)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(null)}
        >
          <div
            className="relative w-full max-w-5xl rounded-2xl border"
            style={{ borderColor: `${CRIMSON}55`, background: INK, boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b px-5 py-3"
              style={{ borderColor: LINE, background: INK }}
            >
              <div className="flex items-center gap-2" style={{ color: CRIMSON }}>
                <Swords className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.35em]">Rivalry Dossier</span>
                <span className="text-sm font-bold" style={{ color: TEXT }}>· Rod vs {open.rivalName}</span>
              </div>
              <button
                onClick={() => setOpen(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border"
                style={{ borderColor: LINE, color: TEXT }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 md:p-5">
              <RivalryDossierPanel
                key={open.rivalKey ?? "default"}
                focalOwnerKey={rodKey}
                initialOpponentKey={open.rivalKey}
                pickerOptions={pickerOptions}
                rivalryEligibleOwnerKeys={eligible}
                activeSeason={activeSeason}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hero stat strip ─────────────────────────────────────────────────────────
function HeroStrip({ p }: { p: Pair }) {
  const series = `${n(p.h2hWins)}–${n(p.h2hLosses)}${n(p.h2hTies) ? `–${n(p.h2hTies)}` : ""}`;
  const playoff =
    p.rivalPlayoffWins != null || p.rivalPlayoffLosses != null
      ? `${n(p.rivalPlayoffWins)}–${n(p.rivalPlayoffLosses)}`
      : `${n(p.playoffEliminations)} elim`;
  const heartbreak = p.painfulLossMargin != null ? `${Number(p.painfulLossMargin).toFixed(1)} pts` : "—";
  const last = p.lastMatchupSeason != null ? String(p.lastMatchupSeason) : "—";
  const cells: Array<[string, string]> = [
    ["Series Record", series],
    ["Playoff Record", playoff],
    ["Closest Loss", heartbreak],
    ["Last Meeting", last],
    ["Recent Losses", String(n(p.recentLosses))],
  ];
  return (
    <div className="grid grid-cols-2 border-t md:grid-cols-5" style={{ borderColor: LINE }}>
      {cells.map(([k, v], i) => (
        <div
          key={i}
          className="border-b border-r px-4 py-4 md:border-b-0"
          style={{ borderColor: LINE }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: MUTED }}>{k}</div>
          <div className="mt-1 text-2xl font-black" style={{ color: TEXT }}>{v}</div>
        </div>
      ))}
    </div>
  );
}
