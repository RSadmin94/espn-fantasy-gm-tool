/**
 * Persona-routing attribution — before/after seed distributions for live written floor+routing.
 * Not committed. PHASE=before|after SEED=persona-attrib
 */
import fs from "node:fs";
import path from "node:path";
import { LEGACY_MOMENT_CONFIG } from "../server/services/draftMoments/draftMomentTypes";
import { draftMomentToBroadcastMoment } from "../server/services/sofia/broadcastMomentBridge";
import {
  buildEditorialAssignment,
  resolveEditorialPlanId,
} from "../server/services/sofia/broadcastEditorialRouting";
import { SessionEditorialLedger } from "../server/services/sofia/editorialLedger";
import { applyEarlyRoundWrittenFloor } from "../server/services/sofia/liveDraftWrittenFloor";
import {
  buildBroadcastPaceDraftMoments,
  buildSimulatedDraftMoments,
} from "../server/services/sofia/shadowDraftSources";

const PHASE = (process.env.PHASE ?? "after").toLowerCase();
const OUT_DIR = path.join(process.cwd(), "cert-output", "persona-routing");

function isRivalryish(row: {
  signals: string[];
  claims: string[];
  planId: string;
}): boolean {
  if (/rivalry|championship|hall_of_fame|historic|playoff|breaking|keeper/i.test(row.planId)) {
    return true;
  }
  if (row.signals.some((s) => /RIVAL|DRAMA|CHAMPIONSHIP|HISTORIC/i.test(s))) return true;
  if (row.claims.some((c) => /rival|drama|championship|history|record|upset|trade/i.test(c))) {
    return true;
  }
  return false;
}

function run(label: string, moments: ReturnType<typeof buildSimulatedDraftMoments>) {
  const ledger = new SessionEditorialLedger();
  const rows: Array<Record<string, unknown>> = [];
  let silent = 0;
  let commented = 0;
  const personas: Record<string, number> = { sofia: 0, coach: 0, roxanne: 0 };
  const plans: Record<string, number> = {};

  for (const raw of moments) {
    const m = applyEarlyRoundWrittenFloor(raw);
    const bm = draftMomentToBroadcastMoment(m);
    const planId = resolveEditorialPlanId(bm);
    const a = buildEditorialAssignment(bm, ledger);
    plans[planId] = (plans[planId] ?? 0) + 1;

    const eligible = !a.silence && m.commentaryBudget.enabled && m.level !== "routine";
    if (a.silence || !eligible) silent += 1;
    else {
      commented += 1;
      personas[a.leadVoice] = (personas[a.leadVoice] ?? 0) + 1;
    }

    const row = {
      pick: m.overallPick,
      round: m.round,
      classifierLevel: raw.level,
      adjustedLevel: m.level,
      planId,
      silence: a.silence,
      silenceReason: a.silenceReason ?? null,
      lead: a.leadVoice,
      request: a.request,
      signals: m.signals,
      claims: m.permittedClaims.slice(0, 4),
      eligible,
      commentaryBudgetEnabled: m.commentaryBudget.enabled,
      emittedClaimPreview: m.permittedClaims.find((c) => !/selected .+ at pick/i.test(c)) ?? m.permittedClaims[0] ?? null,
    };
    rows.push(row);

    ledger.recordFrame({
      planId,
      leadVoice: a.leadVoice,
      voicesOnAir: a.request.filter((v) => v !== "silence"),
      silenced: a.silence,
      significance: m.level,
      storylines: [],
      callbackKeys: [],
      acceptedTexts: {},
      planEnergy: "low",
      decompressionTriggered: false,
    });
  }

  const NEW_EDITORIAL = new Set([
    "POSITION_RUN",
    "STARTER_NEED",
    "NFL_STACK",
    "ZERO_RB",
    "HERO_RB",
    "LATE_PATTERN",
    "SPECIALIST_EARLY",
    "QB_WAITING",
    "TE_WAITING",
  ]);

  const commentedRows = rows.filter((r) => r.eligible && !r.silence) as Array<{
    pick: number;
    round: number;
    planId: string;
    lead: string;
    signals: string[];
    claims: string[];
    emittedClaimPreview: string | null;
    classifierLevel: string;
    adjustedLevel: string;
  }>;

  const triggerCounts: Record<string, number> = {};
  for (const r of commentedRows) {
    for (const s of r.signals) {
      const name = String(s).replace(/\(strong\)$/i, "").replace(/:strong$/i, "");
      triggerCounts[name] = (triggerCounts[name] ?? 0) + 1;
    }
  }

  const newTriggerEvents = commentedRows
    .filter((r) => r.signals.some((s) => NEW_EDITORIAL.has(String(s).replace(/\(strong\)$/i, "").replace(/:strong$/i, ""))))
    .map((r) => {
      const idx = rows.findIndex((x) => x.pick === r.pick);
      const neighbors = [rows[idx - 1], rows[idx + 1]].filter(Boolean).map((n) => ({
        pick: n!.pick,
        silent: !(n!.eligible && !n!.silence),
        level: n!.classifierLevel,
        signals: n!.signals,
        whySilent:
          n!.eligible && !n!.silence
            ? null
            : (n!.silenceReason as string | null) ??
              ((n!.classifierLevel as string) === "routine"
                ? "classifier routine — no editorial signal"
                : "ledger/floor silenced"),
      }));
      return {
        pick: r.pick,
        round: r.round,
        persona: r.lead,
        planId: r.planId,
        signals: r.signals,
        newSignals: r.signals
          .map((s) => String(s).replace(/\(strong\)$/i, "").replace(/:strong$/i, ""))
          .filter((s) => NEW_EDITORIAL.has(s)),
        evidenceClaims: r.claims.filter((c) => !/selected .+ at pick/i.test(c)),
        text: r.emittedClaimPreview,
        neighborSilence: neighbors,
      };
    });

  return {
    label,
    total: moments.length,
    silent,
    commented,
    silencePct: Math.round((1000 * silent) / moments.length) / 10,
    commentPct: Math.round((1000 * commented) / moments.length) / 10,
    personas,
    plans,
    triggerCounts,
    newTriggerEvents,
    earlyRoundCommented: commentedRows.filter((r) => r.round <= 3).length,
    roxanneWithoutDrama: commentedRows.filter(
      (r) => r.lead === "roxanne" && !isRivalryish(r),
    ).length,
    bareTxnLike: commentedRows.filter((r) => {
      const t = r.emittedClaimPreview ?? "";
      return /^[^.]+ selected [^.]+ at pick \d+/i.test(t) && !/[—–-]/.test(t) && t.split(".").length <= 2;
    }).length,
    transcript: commentedRows.map((r) => ({
      pick: r.pick,
      round: r.round,
      classifierLevel: r.classifierLevel,
      adjustedLevel: r.adjustedLevel,
      planId: r.planId,
      persona: r.lead,
      signals: r.signals,
      text: r.emittedClaimPreview,
    })),
    routingAll: rows,
  };
}

const turbo = buildBroadcastPaceDraftMoments("persona-attrib", LEGACY_MOMENT_CONFIG);
const sim = buildSimulatedDraftMoments();

const out = {
  at: new Date().toISOString(),
  phase: PHASE,
  turbo168: run("turbo-broadcast-pace+floor", turbo),
  simulated: run("simulated+floor", sim),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, `${PHASE}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      wrote: outPath,
      phase: PHASE,
      turbo168: {
        total: out.turbo168.total,
        silent: out.turbo168.silent,
        commented: out.turbo168.commented,
        silencePct: out.turbo168.silencePct,
        commentPct: out.turbo168.commentPct,
        personas: out.turbo168.personas,
        plans: out.turbo168.plans,
        triggerCounts: out.turbo168.triggerCounts,
        newTriggerEvents: out.turbo168.newTriggerEvents.length,
        earlyRoundCommented: out.turbo168.earlyRoundCommented,
        roxanneWithoutDrama: out.turbo168.roxanneWithoutDrama,
        bareTxnLike: out.turbo168.bareTxnLike,
      },
      simulated: {
        total: out.simulated.total,
        silent: out.simulated.silent,
        commented: out.simulated.commented,
        silencePct: out.simulated.silencePct,
        personas: out.simulated.personas,
        plans: out.simulated.plans,
        earlyRoundCommented: out.simulated.earlyRoundCommented,
        roxanneWithoutDrama: out.simulated.roxanneWithoutDrama,
      },
    },
    null,
    2,
  ),
);
