// Signature Reveal — the single immersive first-run experience.
// One continuous full-screen surface: Find leagues -> Select -> Extraction ->
// Story -> (optional discovery) -> Rival -> Rival Card -> hand off to the Briefing.
// Presentation layer only: it orchestrates existing intelligence, never fabricates.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";

const LIME = "#a3e635";
const INK = "#0a1403";
const BLACK = "#070708";
const FADE_MS = 420;

type Stage =
  | "connect"
  | "select"
  | "extraction"
  | "story"
  | "discovery"
  | "rival"
  | "card";

type LeagueRow = { leagueId: string; leagueName: string; isActive?: boolean; isSetupComplete?: boolean };

function firstName(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  if (!t) return "your rival";
  return t.split(/\s+/)[0] ?? t;
}

/** A single full-screen stage frame with a consistent fade-through-black. */
function Frame({ visible, onClick, children }: { visible: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "fixed",
        inset: 0,
        background: BLACK,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        cursor: onClick ? "pointer" : "default",
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
        zIndex: 60,
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 540 }}>{children}</div>
    </div>
  );
}

function LimeButton({ children, onClick, wide }: { children: React.ReactNode; onClick: () => void; wide?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        height: 48,
        padding: wide ? "0" : "0 26px",
        width: wide ? "100%" : undefined,
        background: LIME,
        color: INK,
        border: "none",
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function SignatureReveal() {
  const { isLoaded, isSignedIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const previewEnabled =
    params.get("preview") === "1" ||
    (typeof window !== "undefined" && window.localStorage.getItem("revealPreview") === "1");

  const { leagueContextKey, authLoaded, userLoaded } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  // ── Existing intelligence (read-only) ───────────────────────────────
  const ownerHomeQ = (trpc as any).me.ownerHome.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });
  const cachedQ = (trpc as any).espn.cachedSeasons.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });
  const hofQ = (trpc as any).espn.hallOfFame.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 60_000,
  });
  const leaguesQ = (trpc as any).league.getMyLeagues.useQuery(undefined, {
    enabled: ready,
    staleTime: 30_000,
  });
  const ownerKey: string | null = (ownerHomeQ.data?.owner?.ownerKey as string) ?? null;
  const dossierQ = (trpc as any).owners.rivalryDossier.useQuery(
    withLeagueSalt({ ownerKey: ownerKey ?? "" }, leagueContextKey),
    { enabled: ready && !!ownerKey, staleTime: 60_000 },
  );
  const createReceipt = (trpc as any).dna.createReceipt.useMutation();

  // ── Shape the real data into the reveal model ───────────────────────
  const model = useMemo(() => {
    const oh = ownerHomeQ.data;
    const seasons: number[] = Array.isArray(cachedQ.data) ? [...cachedQ.data].sort((a, b) => a - b) : [];
    const startYear = seasons[0];
    const endYear = seasons[seasons.length - 1];
    const career = oh?.careerRecord;
    const matchups = career ? (career.wins ?? 0) + (career.losses ?? 0) + (career.ties ?? 0) : 0;
    const leader = hofQ.data?.championships?.leaderboard?.[0];
    const championName: string | null = leader?.displayName?.trim() || null;
    const championTitles: number = leader?.titles ?? leader?.titleSeasons?.length ?? 0;

    const leagues: LeagueRow[] = Array.isArray(leaguesQ.data) ? (leaguesQ.data as LeagueRow[]) : [];
    const activeLeague = leagues.find((l) => l.isActive) ?? leagues[0];
    const leagueName = activeLeague?.leagueName ?? "your league";

    // Rival: combine ownerHome.rival (qualitative) + dossier opponent (all-time record)
    const rivalBase = oh?.rival ?? null;
    const rivalName: string | null = rivalBase?.rivalName?.trim() || null;
    let opp: any = null;
    if (rivalName && Array.isArray(dossierQ.data?.opponents)) {
      const target = rivalName.toLowerCase();
      opp =
        dossierQ.data.opponents.find((o: any) => (o.opponentDisplayName ?? "").toLowerCase() === target) ??
        dossierQ.data.opponents.find((o: any) => (o.opponentDisplayName ?? "").toLowerCase().includes(firstName(rivalName).toLowerCase())) ??
        null;
    }
    const rival = rivalName
      ? {
          name: rivalName,
          first: firstName(rivalName),
          heatLabel: (rivalBase?.heatLabel as string) ?? null,
          lore: (rivalBase?.loreSentence as string) ?? null,
          playoffEnded: (rivalBase?.playoffEliminations as number) ?? 0,
          // all-time record from Rod's point of view
          games: (opp?.gamesPlayed as number) ?? ((rivalBase?.h2hWins ?? 0) + (rivalBase?.h2hLosses ?? 0)),
          youWins: (opp?.wins as number) ?? (rivalBase?.h2hWins ?? 0),
          youLosses: (opp?.losses as number) ?? (rivalBase?.h2hLosses ?? 0),
          playoffEncounters: (opp?.playoffEncounters as number) ?? 0,
          largestWin: (opp?.largestWin as number) ?? null,
          worstLoss: (opp?.worstLoss as number) ?? null,
        }
      : null;

    // Stage 3 (optional). No statistically-validated "unwritten rule" authority
    // exists yet, so we never fabricate one — the stage stays off until a real
    // insight source is wired. hasInsight is intentionally false today.
    const hasInsight = false;
    const insightText: string | null = null;

    const dataReady =
      ownerHomeQ.isSuccess && cachedQ.isSuccess && (!ownerKey || dossierQ.isSuccess || dossierQ.isError);

    return {
      seasons,
      startYear,
      endYear,
      seasonCount: seasons.length,
      matchups,
      championName,
      championTitles,
      leagueName,
      leagues,
      rival,
      hasInsight,
      insightText,
      dataReady,
    };
  }, [
    ownerHomeQ.data,
    ownerHomeQ.isSuccess,
    cachedQ.data,
    cachedQ.isSuccess,
    hofQ.data,
    leaguesQ.data,
    dossierQ.data,
    dossierQ.isSuccess,
    dossierQ.isError,
    ownerKey,
  ]);

  // ── Stage machine + fade choreography ───────────────────────────────
  const [stage, setStage] = useState<Stage>("connect");
  const [visible, setVisible] = useState(true);
  const fadingRef = useRef(false);

  const go = useCallback((next: Stage) => {
    if (fadingRef.current) return;
    fadingRef.current = true;
    setVisible(false);
    window.setTimeout(() => {
      setStage(next);
      setVisible(true);
      fadingRef.current = false;
    }, FADE_MS);
  }, []);

  // Selection state
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (model.leagues.length && Object.keys(selected).length === 0) {
      const init: Record<string, boolean> = {};
      model.leagues.forEach((l) => (init[l.leagueId] = true));
      setSelected(init);
    }
  }, [model.leagues, selected]);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  // Extraction ticker
  const [yearIdx, setYearIdx] = useState(0);
  const [milestone, setMilestone] = useState(0);
  const [extractionDone, setExtractionDone] = useState(false);

  useEffect(() => {
    if (stage !== "extraction") return;
    setYearIdx(0);
    setMilestone(0);
    setExtractionDone(false);
    const years = model.seasons.length ? model.seasons : [new Date().getFullYear()];
    let i = 0;
    const yearTimer = window.setInterval(() => {
      i += 1;
      if (i >= years.length) {
        window.clearInterval(yearTimer);
        setYearIdx(years.length - 1);
        // reveal milestones
        let m = 0;
        const mTimer = window.setInterval(() => {
          m += 1;
          setMilestone(m);
          if (m >= 4) {
            window.clearInterval(mTimer);
            window.setTimeout(() => setExtractionDone(true), 900);
          }
        }, 520);
      } else {
        setYearIdx(i);
      }
    }, 360);
    return () => window.clearInterval(yearTimer);
  }, [stage, model.seasons]);

  // When extraction has finished AND the real data is ready, melt into the story.
  useEffect(() => {
    if (stage === "extraction" && extractionDone && model.dataReady) {
      const t = window.setTimeout(() => go("story"), 1500);
      return () => window.clearTimeout(t);
    }
  }, [stage, extractionDone, model.dataReady, go]);

  // Story auto-advances (buttonless) — tap also advances.
  useEffect(() => {
    if (stage !== "story") return;
    const next: Stage = model.hasInsight ? "discovery" : "rival";
    const t = window.setTimeout(() => go(next), 6200);
    return () => window.clearTimeout(t);
  }, [stage, model.hasInsight, go]);

  useEffect(() => {
    if (stage !== "discovery") return;
    const t = window.setTimeout(() => go("rival"), 5200);
    return () => window.clearTimeout(t);
  }, [stage, go]);

  // Rival layered reveal
  const [rivalLayer, setRivalLayer] = useState(0);
  useEffect(() => {
    if (stage !== "rival") {
      setRivalLayer(0);
      return;
    }
    const timers: number[] = [];
    [1, 2, 3, 4].forEach((n, idx) => {
      timers.push(window.setTimeout(() => setRivalLayer(n), 1400 + idx * 1500));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [stage]);

  // Share
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");
  const onShare = useCallback(async () => {
    try {
      const res = await createReceipt.mutateAsync({});
      const link = res?.code
        ? `${window.location.origin}/r/${res.code}`
        : res?.token
          ? `${window.location.origin}/p/${res.token}`
          : window.location.origin;
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        /* clipboard may be unavailable; link still created */
      }
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2600);
    } catch {
      setShareState("error");
      window.setTimeout(() => setShareState("idle"), 2600);
    }
  }, [createReceipt]);

  const enterBriefing = useCallback(() => navigate("/dashboard"), [navigate]);

  // ── Gating ──────────────────────────────────────────────────────────
  if (!isLoaded) return <div style={{ position: "fixed", inset: 0, background: BLACK }} />;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;
  if (!previewEnabled) return <Navigate to="/dashboard" replace />;

  const r = model.rival;

  // ── Stage rendering ─────────────────────────────────────────────────
  if (stage === "connect") {
    return (
      <Frame visible={visible}>
        <div style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a8a90", marginBottom: 14 }}>
          Fantasy Football Rivals
        </div>
        <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.15, marginBottom: 12 }}>
          Let's find your leagues
        </div>
        <p style={{ fontSize: 16, color: "#b8b8bd", lineHeight: 1.6, margin: "0 auto 26px", maxWidth: 420 }}>
          We uncover your league history — the rivalries, trades, and managers behind it.
        </p>
        <LimeButton onClick={() => go("select")}>Find my leagues</LimeButton>
      </Frame>
    );
  }

  if (stage === "select") {
    const leagues = model.leagues;
    return (
      <Frame visible={visible}>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
          {leagues.length > 0 ? `We found ${leagues.length} league${leagues.length === 1 ? "" : "s"}` : "Finding your leagues…"}
        </div>
        <p style={{ fontSize: 14, color: "#b8b8bd", margin: "0 0 18px" }}>Choose which to discover.</p>
        <div style={{ textAlign: "left", margin: "0 auto", maxWidth: 420 }}>
          {leagues.map((l) => (
            <label
              key={l.leagueId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 14px",
                marginBottom: 8,
                background: "#121317",
                border: "1px solid #26272c",
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selected[l.leagueId] ?? true}
                onChange={(e) => setSelected((s) => ({ ...s, [l.leagueId]: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: LIME }}
              />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                {l.leagueName}
                {l.isActive ? <span style={{ fontSize: 11, color: LIME }}> · active</span> : null}
              </span>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <LimeButton wide onClick={() => go("extraction")}>
            {selectedCount > 0 ? `Discover ${selectedCount} league${selectedCount === 1 ? "" : "s"}` : "Discover"}
          </LimeButton>
        </div>
        <p style={{ fontSize: 11, color: "#5a5a62", marginTop: 14 }}>
          Preview reveals your active league: {model.leagueName}
        </p>
      </Frame>
    );
  }

  if (stage === "extraction") {
    const years = model.seasons.length ? model.seasons : [new Date().getFullYear()];
    const shownYear = years[Math.min(yearIdx, years.length - 1)];
    const milestones = [
      "Read every season",
      "Identified every manager",
      "Connected franchise history",
      "Found every rivalry",
    ];
    return (
      <Frame visible={visible}>
        <div style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7a7a82", marginBottom: 18 }}>
          Reconstructing your league history
        </div>
        <div style={{ fontSize: 46, fontWeight: 600, color: LIME, lineHeight: 1, minHeight: 50 }}>
          {extractionDone ? "✓" : shownYear}
        </div>
        <div style={{ maxWidth: 300, margin: "24px auto 0", textAlign: "left" }}>
          {milestones.map((m, i) => (
            <div
              key={m}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 0",
                fontSize: 14,
                color: "#e8e8ea",
                opacity: milestone > i ? 1 : 0,
                transition: "opacity .5s ease",
              }}
            >
              <span style={{ color: LIME }}>✓</span>
              <span>{m}</span>
            </div>
          ))}
        </div>
        {extractionDone ? (
          <div style={{ marginTop: 26, opacity: extractionDone ? 1 : 0, transition: "opacity .8s ease" }}>
            <div style={{ fontSize: 15, color: "#b8b8bd", lineHeight: 1.7 }}>
              {model.seasonCount} seasons{model.startYear ? ` · ${model.startYear}–${model.endYear}` : ""}.{" "}
              {model.matchups > 0 ? `${model.matchups} matchups.` : ""}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "#fff", marginTop: 8 }}>
              One story you've never seen before.
            </div>
          </div>
        ) : null}
      </Frame>
    );
  }

  if (stage === "story") {
    const next: Stage = model.hasInsight ? "discovery" : "rival";
    return (
      <Frame visible={visible} onClick={() => go(next)}>
        <div style={{ fontSize: 22, lineHeight: 2, fontWeight: 400 }}>
          <div>Your league has a story.</div>
          <div>Most leagues never discover theirs.</div>
          <div style={{ color: LIME, fontWeight: 500 }}>Yours just did.</div>
        </div>
      </Frame>
    );
  }

  if (stage === "discovery") {
    // Only reached when model.hasInsight is true (currently never — see model).
    return (
      <Frame visible={visible} onClick={() => go("rival")}>
        <div style={{ fontSize: 14, color: "#7a7a82", marginBottom: 14 }}>For {model.seasonCount} seasons…</div>
        <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.4, maxWidth: 420, margin: "0 auto" }}>
          {model.insightText}
        </div>
      </Frame>
    );
  }

  if (stage === "rival") {
    if (!r) {
      // Graceful: no rival computed yet (thin history) — skip straight to the card-less handoff.
      return (
        <Frame visible={visible} onClick={enterBriefing}>
          <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 10 }}>Your story is just beginning.</div>
          <p style={{ fontSize: 14, color: "#b8b8bd", marginBottom: 22 }}>
            As more history syncs, your rivalries will surface here.
          </p>
          <LimeButton onClick={enterBriefing}>Read today's briefing</LimeButton>
        </Frame>
      );
    }
    const leads = r.youLosses > r.youWins;
    return (
      <Frame visible={visible} onClick={rivalLayer >= 4 ? () => go("card") : undefined}>
        <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7a7a82", marginBottom: 10 }}>
          Meet your rival
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, color: LIME, lineHeight: 1.1, textTransform: "uppercase" }}>
          {r.name}
        </div>
        <div style={{ maxWidth: 360, margin: "26px auto 0" }}>
          <div style={{ opacity: rivalLayer >= 1 ? 1 : 0, transition: "opacity .7s", fontSize: 16, padding: "9px 0", color: "#e8e8ea" }}>
            You've faced each other <b style={{ color: "#fff" }}>{r.games} times</b>.
          </div>
          <div style={{ opacity: rivalLayer >= 2 ? 1 : 0, transition: "opacity .7s", fontSize: 16, padding: "9px 0", color: "#e8e8ea" }}>
            {leads ? (
              <>
                {r.first} leads the series <b style={{ color: "#fff" }}>{r.youLosses}–{r.youWins}</b>.
              </>
            ) : (
              <>
                You lead the series <b style={{ color: "#fff" }}>{r.youWins}–{r.youLosses}</b>.
              </>
            )}
          </div>
          <div style={{ opacity: rivalLayer >= 3 ? 1 : 0, transition: "opacity .7s", fontSize: 16, fontWeight: 500, padding: "9px 0", color: "#fff" }}>
            {r.playoffEnded > 0
              ? `They've ended your season ${r.playoffEnded === 1 ? "once" : r.playoffEnded === 2 ? "twice" : `${r.playoffEnded} times`}.`
              : r.playoffEncounters > 0
                ? `You've met ${r.playoffEncounters} times in the playoffs.`
                : "The rivalry isn't over."}
          </div>
        </div>
        <div style={{ opacity: rivalLayer >= 4 ? 1 : 0, transition: "opacity .7s", marginTop: 22 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go("card");
            }}
            style={{ background: "none", border: "none", color: "#8a8a90", fontSize: 12, cursor: "pointer" }}
          >
            tap to see your rival card
          </button>
        </div>
      </Frame>
    );
  }

  // stage === "card"
  if (!r) return <Navigate to="/dashboard" replace />;
  const leads = r.youLosses > r.youWins;
  const documentary =
    r.lore ||
    `Some rivalries begin with trash talk. Yours has spanned ${r.games} meetings — and it still isn't settled.`;
  return (
    <Frame visible={visible}>
      <div
        style={{
          maxWidth: 360,
          margin: "0 auto",
          background: "linear-gradient(160deg,#15161a,#0e0f12)",
          border: "1px solid #2a2b30",
          borderRadius: 16,
          padding: 20,
          textAlign: "left",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: "#7a7a82", letterSpacing: "0.08em", textTransform: "uppercase" }}>Rivalry</span>
          {r.heatLabel ? (
            <span style={{ fontSize: 11, color: INK, background: LIME, padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>
              {r.heatLabel}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, margin: "6px 0 16px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#26272c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, margin: "0 auto 6px" }}>
              YOU
            </div>
            <div style={{ fontSize: 12, color: "#e8e8ea" }}>You</div>
          </div>
          <div style={{ fontSize: 13, color: "#7a7a82", fontWeight: 500 }}>vs</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#3a2a10", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, color: LIME, margin: "0 auto 6px" }}>
              {r.first.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: "#e8e8ea" }}>{r.first}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "12px 0", borderTop: "1px solid #2a2b30", borderBottom: "1px solid #2a2b30", marginBottom: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>{leads ? `${r.youLosses}–${r.youWins}` : `${r.youWins}–${r.youLosses}`}</div>
            <div style={{ fontSize: 10, color: "#7a7a82" }}>head to head</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>{r.games}</div>
            <div style={{ fontSize: 10, color: "#7a7a82" }}>meetings</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#d85a30" }}>{r.playoffEnded || r.playoffEncounters}</div>
            <div style={{ fontSize: 10, color: "#7a7a82" }}>{r.playoffEnded ? "seasons ended" : "playoff meetings"}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#b8b8bd", fontStyle: "italic", lineHeight: 1.5, margin: "0 0 6px", textAlign: "center" }}>
          "{documentary}"
        </p>
        <div style={{ fontSize: 10, color: "#5a5a62", textAlign: "center", marginTop: 8 }}>
          {model.leagueName} · gmwarroom.online
        </div>
      </div>

      <div style={{ maxWidth: 360, margin: "16px auto 0" }}>
        <LimeButton wide onClick={onShare}>
          {shareState === "copied" ? "Link copied — share it" : createReceipt.isPending ? "Preparing…" : "Share with my league"}
        </LimeButton>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button onClick={enterBriefing} style={{ background: "none", border: "none", color: "#8a8a90", fontSize: 13, cursor: "pointer" }}>
            Continue to the Briefing
          </button>
        </div>
        <p style={{ textAlign: "center", fontSize: 12, color: "#5a5a62", marginTop: 16, lineHeight: 1.6 }}>
          Everyone in your league has a story.
          <br />
          <span style={{ color: "#b8b8bd" }}>This is yours.</span>
        </p>
      </div>
    </Frame>
  );
}

export default SignatureReveal;
