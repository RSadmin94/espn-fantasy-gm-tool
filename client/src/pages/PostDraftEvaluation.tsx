import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronDown, Copy, GitCompare } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { buildFormatProfile } from "@/lib/liveDraftGrade";
import {
  evaluatePostDraft,
  buildNarrativeFacts,
  buildShareCardText,
  pdeMayEvaluate,
  pdeSeasonPolicy,
  pdeUnsupportedCopy,
  pdeLimitedRankingCopy,
  pdeLimitedRankingTitle,
  resolvePdeSeason,
  pdeLiveBoardForSeason,
  playerIdentityKeys,
  type GroundedNarrative,
} from "@/lib/postDraftEval";
import type {
  PostDraftEvaluation as EvalResult,
  RankedPlayer,
  RankingSource,
} from "@/lib/postDraftEval";
import type { RankingEvidenceQuality, SuperflexStatus } from "@/lib/postDraftEval/confidence";
import {
  CinematicPageHeader,
  EmptyState,
  IntelPageShell,
  IntelPanel,
  PageError,
  PageLoading,
} from "@/components/layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function gradeTone(letter: string): string {
  if (letter.startsWith("A")) return "text-lime-300 border-lime-400/30 bg-lime-500/10";
  if (letter.startsWith("B")) return "text-sky-300 border-sky-400/30 bg-sky-500/10";
  if (letter.startsWith("C")) return "text-amber-300 border-amber-400/30 bg-amber-500/10";
  if (letter.startsWith("D") || letter === "F") return "text-red-300 border-red-400/30 bg-red-500/10";
  return "text-white/60 border-white/15 bg-white/[0.04]";
}

function playerLabel(p: RankedPlayer | null | undefined, opts?: { keeper?: boolean }): string {
  if (!p) return "—";
  if (opts?.keeper) return `${p.name} · Keeper`;
  return `${p.name} · ${p.position}`;
}

function playerIsUserKeeper(evaled: EvalResult, player: RankedPlayer | null | undefined): boolean {
  if (!player) return false;
  return evaled.picks.some(
    (pick) =>
      pick.isKeeper &&
      playerIdentityKeys({ playerId: pick.actual.playerId, name: pick.actual.name, position: pick.actual.position }).some(
        (key) =>
          playerIdentityKeys({ playerId: player.playerId, name: player.name, position: player.position }).includes(key),
      ),
  );
}

function confidenceLabel(value: string | null | undefined): string {
  switch (value) {
    case "HIGH":
      return "High confidence";
    case "MEDIUM":
      return "Medium confidence";
    case "LOW":
      return "Low confidence";
    case "INSUFFICIENT":
      return "Not enough evidence";
    default:
      return value || "—";
  }
}

function asRankingSource(value: string): RankingSource {
  if (
    value === "fantasypros_current" ||
    value === "historical_draft_order_proxy" ||
    value === "mixed" ||
    value === "espn_season_adp"
  ) {
    return value;
  }
  return "mixed";
}

function asRankingEvidenceQuality(value: string | null | undefined): RankingEvidenceQuality | undefined {
  if (value === "archived" || value === "current_cache" || value === "season_cache" || value === "league_order" || value === "none") {
    return value;
  }
  return undefined;
}

function asSuperflexStatus(value: string | null | undefined): SuperflexStatus | undefined {
  if (value === "none" || value === "present" || value === "unknown") {
    return value;
  }
  return undefined;
}

function HeadlineCard({
  label,
  title,
  body,
  tone,
}: {
  label: string;
  title: string;
  body: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const border =
    tone === "good"
      ? "border-lime-400/20 bg-lime-500/[0.06]"
      : tone === "warn"
        ? "border-amber-400/20 bg-amber-500/[0.06]"
        : "border-white/[0.07] bg-white/[0.02]";
  return (
    <div className={cn("rounded-xl border p-4", border)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-1 text-[15px] font-bold text-white/90">{title}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-white/60">{body}</p>
    </div>
  );
}

export function PostDraftEvaluation() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const enabled = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const [searchParams, setSearchParams] = useSearchParams();
  const seasonsQ = trpc.postDraftEval.listSeasons.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled,
  });
  const seasons = seasonsQ.data ?? [];
  const urlSeason = Number(searchParams.get("season"));
  const [seasonOverride, setSeasonOverride] = useState<number | null>(null);
  const requested = seasonOverride ?? (Number.isFinite(urlSeason) && urlSeason > 0 ? urlSeason : null);
  const season = resolvePdeSeason(requested, seasons) ?? new Date().getFullYear();
  const policy = pdeSeasonPolicy(season);
  const unsupportedCopy = pdeUnsupportedCopy();
  const boardQ = trpc.postDraftEval.getBoard.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    { enabled: enabled && seasons.length > 0 },
  );

  function selectSeason(next: number) {
    setSeasonOverride(next);
    setSearchParams({ season: String(next) }, { replace: true });
  }

  const liveBoard = pdeLiveBoardForSeason(boardQ.data, season);
  const evaluation = useMemo((): EvalResult | null => {
    if (!pdeMayEvaluate(policy.support)) return null;
    const data = liveBoard;
    if (!data || data.picks.length === 0) return null;
    const hard = (data.hardCap ?? {}) as Record<string, number>;
    const soft = (data.softCap ?? {}) as Record<string, number>;
    const profile = buildFormatProfile({
      leagueId: data.leagueId,
      lineupReqs: data.lineupReqs,
      softCap: { ...soft, DEF: soft.DEF ?? soft.DST },
      hardCap: { ...hard, DEF: hard.DEF ?? hard.DST },
      benchSlots: data.benchSlots,
      superflexSlots: data.superflexSlots,
      allowSuperflexInference: false,
      receptionPoints: data.receptionPoints,
      tePremium: data.tePremium,
    });
    return evaluatePostDraft({
      leagueId: data.leagueId,
      season: data.season,
      userTeamId: data.userTeamId,
      picks: data.picks,
      board: data.board,
      profile,
      rankingSource: asRankingSource(data.rankingSource),
      rankingSourceNote: data.rankingSourceNote,
      rankingEvidenceQuality: asRankingEvidenceQuality(data.rankingEvidenceQuality),
      superflexStatus: asSuperflexStatus(data.superflexStatus),
      supportStatus: policy.support,
      recommendationCeiling: policy.recommendationCeiling,
    });
  }, [liveBoard, policy.recommendationCeiling, policy.support]);

  if (leagueContextKey === "__no_active_league__") {
    return (
      <IntelPageShell width="diagnosis" background="cinematic">
        <CinematicPageHeader
          eyebrow="Draft Intelligence"
          title="Post-Draft Evaluation"
          subtitle="Who you should have drafted at each pick — given the roster you had and the players still on the board."
          icon={GitCompare}
        />
        <EmptyState
          title="No league selected"
          description="Connect a league before running Post-Draft Evaluation. Rivals will not invent a draft to grade."
        />
      </IntelPageShell>
    );
  }
  if (!enabled || seasonsQ.isLoading) {
    return <PageLoading message="Reconstructing your draft…" />;
  }
  if (pdeMayEvaluate(policy.support) && seasons.length > 0 && boardQ.isLoading && !liveBoard) {
    return <PageLoading message="Reconstructing your draft…" />;
  }
  if (boardQ.isError) {
    return <PageError message={boardQ.error.message} />;
  }

  return (
    <IntelPageShell width="diagnosis" background="cinematic">
      <CinematicPageHeader
        eyebrow="Draft Intelligence"
        title="Post-Draft Evaluation"
        subtitle="Who you should have drafted at each pick — given the roster you had and the players still on the board."
        icon={GitCompare}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Select value={String(season)} onValueChange={(v) => selectSeason(Number(v))}>
          <SelectTrigger className="h-9 min-w-[14rem] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => {
              const itemPolicy = pdeSeasonPolicy(s);
              return (
                <SelectItem key={s} value={String(s)}>
                  {pdeMayEvaluate(itemPolicy.support) ? String(s) : `${s} — Evaluation unavailable`}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Link to="/draft-history" className="text-sm text-lime-300/80 hover:text-lime-200">
          Open Draft History
        </Link>
      </div>

      {!pdeMayEvaluate(policy.support) ? (
        <EmptyState title={unsupportedCopy.title} description={`${unsupportedCopy.body} ${unsupportedCopy.footnote}`} />
      ) : seasons.length === 0 || !liveBoard || liveBoard.picks.length === 0 ? (
        <EmptyState
          title="No historical draft to evaluate"
          description="We need a complete pick recap for this league and season before we can prove who was available at each pick."
        />
      ) : evaluation && evaluation.picks.length === 0 ? (
        <EmptyState
          title="No picks for this team"
          description="This season's recap has no picks assigned to your team. Rivals will not silently grade another owner's draft."
        />
      ) : evaluation && liveBoard ? (
        <EvaluationBody key={season} evaled={evaluation} teamName={liveBoard.userTeamName} limitedDisclosure={policy.limitedRankingDisclosure} />
      ) : null}
    </IntelPageShell>
  );
}

function RivalsTakeBlock({
  loading,
  unavailable,
  headline,
  explanation,
}: {
  loading: boolean;
  unavailable: boolean;
  headline?: string;
  explanation?: string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-lime-400/20 bg-lime-500/[0.05] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lime-300/90">Rivals Take</div>
      {loading ? (
        <p className="mt-2 text-[13px] text-white/45">Writing Rivals Take…</p>
      ) : unavailable ? (
        <p className="mt-2 text-[13px] text-white/45">Rivals analysis unavailable.</p>
      ) : (
        <>
          {headline ? <p className="mt-2 text-[15px] font-semibold leading-snug text-white">{headline}</p> : null}
          {explanation ? <p className="mt-1 text-[13px] leading-relaxed text-white/70">{explanation}</p> : null}
        </>
      )}
    </div>
  );
}

function EvaluationBody({
  evaled,
  teamName,
  limitedDisclosure,
}: {
  evaled: EvalResult;
  teamName: string;
  limitedDisclosure: boolean;
}) {
  const [openPick, setOpenPick] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [remote, setRemote] = useState<GroundedNarrative | null>(null);
  const [storyFailed, setStoryFailed] = useState(false);
  const facts = useMemo(() => buildNarrativeFacts(evaled, { teamName }), [evaled, teamName]);
  const getNarrative = trpc.postDraftEval.getNarrative.useMutation();
  const factsKey = `${facts.leagueId}:${facts.season}:${facts.teamId}:${facts.overallGrade}:${facts.narrativeVersion}`;

  useEffect(() => {
    let cancelled = false;
    setRemote(null);
    setStoryFailed(false);
    void getNarrative
      .mutateAsync({ season: facts.season, facts })
      .then((n) => {
        if (!cancelled) setRemote(n);
      })
      .catch(() => {
        if (!cancelled) setStoryFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // One batched request per completed evaluation. Mutation identity is not part of the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsKey]);

  const storyLoading = !remote && !storyFailed;
  const storyUnavailable = storyFailed || remote?.source === "unavailable" || remote?.source === "fallback";
  const storyReady = remote?.source === "llm";
  const takeByPick = useMemo(() => {
    const map = new Map<number, { headline: string; explanation: string }>();
    for (const row of remote?.pickTakes ?? []) map.set(row.overallPick, row);
    return map;
  }, [remote]);

  async function copyShareCard() {
    const text = buildShareCardText(facts, remote ?? { rivalsSays: "", source: "unavailable", cached: false } as GroundedNarrative);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-6 pb-16">
      {!evaled.integrity.canProveAvailability ? (
        <IntelPanel className="border-amber-400/30 p-4 text-sm text-amber-200">
          Availability is incomplete. {evaled.integrity.warnings[0] ?? "Some picks are missing player identity."}
        </IntelPanel>
      ) : null}

      {limitedDisclosure ? (
        <IntelPanel className="border-amber-400/25 p-4 text-sm text-amber-100/90">
          <div className="font-semibold text-amber-50">{pdeLimitedRankingTitle()}</div>
          <p className="mt-1">{pdeLimitedRankingCopy()}</p>
        </IntelPanel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <HeadlineCard
          label="Availability"
          title={evaled.picks[0]?.availabilityConfidence ?? "HIGH"}
          body="Who was on the board is reconstructed from this league's overall pick order."
        />
        <HeadlineCard
          label="Recommendation confidence"
          title={evaled.overallConfidence}
          body="Separate from availability. No current season has proven draft-week ranking evidence, so this never rises just because availability is high."
        />
      </div>

      {evaled.superflexStatus === "unknown" ? (
        <IntelPanel className="border-amber-400/25 p-4 text-sm text-amber-100/90">
          Superflex could not be verified from this league's lineup slots, so this evaluation does not assume Superflex scoring. Confidence is reduced.
        </IntelPanel>
      ) : null}

      <IntelPanel className="p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Draft Report Card</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeadlineCard
            label="Overall Grade"
            title={`${evaled.overallLetter} · ${confidenceLabel(evaled.overallConfidence)}`}
            body={`${teamName} · ${evaled.season} · decision quality at the time, not later injuries or breakouts. ${evaled.evidenceDisclosure}`}
            tone="good"
          />
          <HeadlineCard
            label="Rivals Redraft"
            title={evaled.redraftLetter}
            body="Sequential redo of your slots only. Other teams' historical picks stay fixed."
          />
          <HeadlineCard
            label="Best Pick"
            title={evaled.bestPick ? `${evaled.bestPick.actualName} · ${evaled.bestPick.round}.${evaled.bestPick.overallPick}` : "No standout best pick identified"}
            body={evaled.bestPick?.why ?? "No standout best pick identified"}
            tone="good"
          />
          <HeadlineCard
            label="Biggest Miss"
            title={evaled.biggestMiss ? `Rd ${evaled.biggestMiss.round} · ${evaled.biggestMiss.actualName}` : "No major draft miss identified"}
            body={
              evaled.biggestMiss
                ? `Could have taken ${evaled.biggestMiss.altName}. ${evaled.biggestMiss.why}`
                : "Gaps were small. We do not manufacture drama for a one-spot ranking difference."
            }
            tone={evaled.biggestMiss ? "warn" : "neutral"}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeadlineCard
            label="Turning Point"
            title={evaled.turningPoint ? `Rd ${evaled.turningPoint.round} · ${evaled.turningPoint.actualName}` : "No major turning point identified"}
            body={evaled.turningPoint?.why ?? "No pick uniquely bent the rest of the roster."}
          />
          <HeadlineCard label="Strongest Position" title={evaled.strongestPosition ?? "—"} body="Relative to starter requirements." />
          <HeadlineCard label="Weakest Position" title={evaled.weakestPosition ?? "—"} body="Still short of a starting-lineup need." />
          <HeadlineCard
            label="Value Captured"
            title={evaled.valueCaptured == null ? "—" : `${evaled.valueCaptured > 0 ? "+" : ""}${evaled.valueCaptured.toFixed(1)} ADP`}
            body={
              evaled.valueLeftOnBoard == null
                ? evaled.integrity.rankingSourceNote
                : `Missed-opportunity gap ${evaled.valueLeftOnBoard.toFixed(0)}. ${evaled.integrity.rankingSourceNote}`
            }
          />
        </div>
      </IntelPanel>

      <IntelPanel className="border-lime-400/20 bg-lime-500/[0.05] p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lime-300/90">Your Draft Story</div>
        {storyLoading ? (
          <p className="mt-3 text-[15px] leading-relaxed text-white/45">Writing your draft story…</p>
        ) : storyUnavailable || !storyReady ? (
          <p className="mt-3 text-[15px] leading-relaxed text-white/45">Rivals analysis unavailable.</p>
        ) : (
          <>
            {remote.openingHeadline ? (
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white">{remote.openingHeadline}</h2>
            ) : null}
            <p className="mt-3 text-[15px] leading-relaxed text-white/75">{remote.draftStory}</p>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lime-300/90">Rivals Says</div>
              <p className="mt-2 text-[16px] font-semibold leading-snug text-white">{remote.rivalsSays}</p>
            </div>
          </>
        )}
      </IntelPanel>

      <IntelPanel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Shareable Draft Report</h2>
            <p className="mt-1 text-sm text-white/55">A clean recap you can copy. No social posting from this screen.</p>
          </div>
          <button
            type="button"
            onClick={() => void copyShareCard()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 hover:bg-white/[0.08]"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy recap"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <HeadlineCard label="Draft Grade" title={evaled.overallLetter} body="Decision quality at the time." tone="good" />
          <HeadlineCard label="Rivals Redraft Grade" title={evaled.redraftLetter} body="Your slots only. Everyone else stays put." />
          <HeadlineCard
            label="One-line verdict"
            title={storyReady ? remote.rivalsSays.replace(/^rivals says:\s*/i, "") : storyLoading ? "Writing…" : "Rivals analysis unavailable."}
            body={
              storyReady
                ? remote.cached
                  ? "Cached historical recap."
                  : "Rivals voice, grounded to the engine."
                : "Deterministic grades stay visible even when storytelling is unavailable."
            }
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <HeadlineCard
            label="Best Pick"
            title={evaled.bestPick ? evaled.bestPick.actualName : "No standout best pick identified"}
            body={storyReady ? remote.bestPickStory ?? evaled.bestPick?.why ?? "No standout best pick identified" : evaled.bestPick?.why ?? "No standout best pick identified"}
            tone="good"
          />
          <HeadlineCard
            label="Biggest Miss"
            title={evaled.biggestMiss ? evaled.biggestMiss.actualName : "No major miss identified"}
            body={storyReady ? remote.biggestMissStory ?? (evaled.biggestMiss ? evaled.biggestMiss.why : "We do not manufacture a miss.") : evaled.biggestMiss ? evaled.biggestMiss.why : "We do not manufacture a miss."}
            tone={evaled.biggestMiss ? "warn" : "neutral"}
          />
          <HeadlineCard
            label="Turning Point"
            title={evaled.turningPoint ? evaled.turningPoint.actualName : "No major turning point identified"}
            body={storyReady ? remote.turningPointStory ?? evaled.turningPoint?.why ?? "No pick uniquely bent the rest of the roster." : evaled.turningPoint?.why ?? "No pick uniquely bent the rest of the roster."}
          />
        </div>
      </IntelPanel>

      <IntelPanel className="p-5">
        <h2 className="mb-3 text-lg font-extrabold">What You Should Have Drafted</h2>
        <p className="mb-4 text-sm text-white/55">
          Pick cards grade each decision using the board you actually faced. The Rivals Redraft
          rebuilds your draft sequentially, so earlier changes can alter later selections.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-white/40">
              <tr>
                <th className="py-2 pr-3">Position</th>
                <th className="py-2 pr-3">Actual Draft</th>
                <th className="py-2">Rivals Redraft</th>
              </tr>
            </thead>
            <tbody>
              {evaled.starterRows.map((row) => (
                <tr key={row.slot} className="border-t border-white/8">
                  <td className="py-2 pr-3 font-semibold text-white/70">{row.slot}</td>
                  <td className="py-2 pr-3">{playerLabel(row.actual, { keeper: playerIsUserKeeper(evaled, row.actual) })}</td>
                  <td className="py-2 text-lime-200">{playerLabel(row.redraft, { keeper: playerIsUserKeeper(evaled, row.redraft) })}</td>
                </tr>
              ))}
              {evaled.benchActual.slice(0, 6).map((p, i) => (
                <tr key={`bench-${p.name}-${i}`} className="border-t border-white/8 text-white/70">
                  <td className="py-2 pr-3 font-semibold text-white/45">Bench</td>
                  <td className="py-2 pr-3">{playerLabel(p, { keeper: playerIsUserKeeper(evaled, p) })}</td>
                  <td className="py-2">{playerLabel(evaled.benchRedraft[i] ?? null, { keeper: playerIsUserKeeper(evaled, evaled.benchRedraft[i] ?? null) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {storyReady ? (
          <p className="mt-4 text-[13px] leading-relaxed text-white/70">{remote.actualVsRivals}</p>
        ) : (
          <p className="mt-4 text-[13px] leading-relaxed text-white/45">
            {storyLoading ? "Writing why the Rivals team is different…" : "Rivals analysis unavailable."}
          </p>
        )}
      </IntelPanel>

      <div className="space-y-3">
        <h2 className="text-lg font-extrabold">Pick-by-pick</h2>
        <p className="text-sm text-white/55">
          Each card is the decision on the board you faced. It can differ from the sequential Rivals Redraft above.
        </p>
        {evaled.picks.map((p) => {
          const open = openPick === p.overallPick;
          return (
            <IntelPanel key={p.overallPick} className="p-4 sm:p-5">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() => setOpenPick(open ? null : p.overallPick)}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white/50">
                      Round {p.round} · Pick {p.overallPick}
                    </span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", gradeTone(p.decisionGrade))}>
                      {p.decisionGrade}
                    </span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/60">
                      {confidenceLabel(p.recommendationConfidence)}
                    </span>
                    {p.isKeeper ? (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                        Keeper — not graded
                      </span>
                    ) : p.sameAsRivals || p.recommendationKind === "same" ? (
                      <span className="rounded-full border border-lime-400/25 px-2 py-0.5 text-[11px] font-semibold text-lime-300">
                        Rivals pick: same as yours
                      </span>
                    ) : p.recommendationKind === "none" ? (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-semibold text-white/60">
                        No definitive Rivals replacement
                      </span>
                    ) : (
                      <span className="rounded-full border border-lime-400/20 px-2 py-0.5 text-[11px] font-semibold text-lime-200/90">
                        {p.rivalsLabel}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-white/40">You drafted</div>
                      <div className="font-bold">{playerLabel(p.actual)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-white/40">
                        {p.isKeeper ? "Roster impact" : p.rivalsLabel}
                      </div>
                      <div className="font-bold text-lime-200">
                        {p.isKeeper ? "Locked before live selections." : playerLabel(p.rivals)}
                      </div>
                    </div>
                  </div>
                </div>
                <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-white/40 transition", open && "rotate-180")} />
              </button>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">{p.why}</p>
              <RivalsTakeBlock
                loading={storyLoading}
                unavailable={storyUnavailable || !storyReady}
                headline={takeByPick.get(p.overallPick)?.headline}
                explanation={takeByPick.get(p.overallPick)?.explanation}
              />
              {p.impact.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.impact.map((tag) => (
                    <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/55">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {p.otherOptions.length > 0 ? (
                <div className="mt-2 text-[12px] text-white/45">
                  Other options: {p.otherOptions.map((o) => `${o.name} · ${o.position}`).join("  ·  ")}
                </div>
              ) : null}
              {open ? (
                <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-[13px] text-white/60">
                  <div>
                    <span className="font-semibold text-white/80">Roster before pick: </span>
                    {p.rosterBefore.length === 0
                      ? "empty"
                      : p.rosterBefore.map((r) => `${r.name} (${r.position})`).join(", ")}
                  </div>
                  <div>
                    <span className="font-semibold text-white/80">Availability evidence: </span>
                    {p.availableTop.map((r) => r.name).join(", ") || "none ranked"}
                    {" "}(reconstructed from this league's historical pick recap)
                  </div>
                  <div>
                    <span className="font-semibold text-white/80">Ranking evidence: </span>
                    {p.rankingTier === "TIER_1_CONTEMPORANEOUS"
                      ? "contemporaneous draft-period rankings"
                      : p.rankingTier === "TIER_2_SEASON_CACHE"
                        ? "current-season cache — not a proven draft-week archive"
                        : p.rankingTier === "TIER_3_LEAGUE_ORDER"
                          ? "league draft order only — availability and market behavior, not an external ranking"
                          : "insufficient ranking evidence"}
                  </div>
                </div>
              ) : null}
            </IntelPanel>
          );
        })}
      </div>
    </div>
  );
}
