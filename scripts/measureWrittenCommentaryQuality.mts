/**
 * Measure written commentary quality across a full simulated draft.
 *   pnpm exec tsx scripts/measureWrittenCommentaryQuality.mts
 */
import { SessionEditorialLedger } from "../server/services/sofia/editorialLedger";
import { BroadcastOrchestrator } from "../server/services/sofia/broadcastOrchestrator";
import { COACH, ROXANNE, SOFIA } from "../server/services/sofia/voicePersonalities";
import { buildPlayerRegistryOracle } from "../server/services/sofia/playerRegistryOracle";
import { createShadowGroundedVoiceProvider } from "../server/services/sofia/shadowGroundedVoiceProvider";
import { draftMomentToBroadcastMoment } from "../server/services/sofia/broadcastMomentBridge";
import { buildSimulatedDraftMoments } from "../server/services/sofia/shadowDraftSources";
import { applyEarlyRoundWrittenFloor } from "../server/services/sofia/liveDraftWrittenFloor";
import { resolveEditorialPlanId } from "../server/services/sofia/broadcastEditorialRouting";

const HOLE_MAIL_MERGE = /just closed a starting .+ hole/i;
const TXN_LOG = /selected .+ at pick \d+, round \d+/i;
const RECEIPT_CUES = /\b(ADP|ahead|fell|past ADP|earliest|latest|tracked|still needed|rival|receipt|consensus|of \d+ tracked)\b/i;
const LEAGUE_CUES = /\b(league|rival|tracked|history|franchise|ADP|consensus|board tape|run|starter|build)\b/i;

function fingerprint(line: string): string {
  return line
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\b/g, "N")
    .replace(/\b[a-z]'?[a-z]+\b/g, (w) => {
      // keep structure words, blank proper-looking tokens heuristically
      if (w.length >= 5 && /^[A-Z]/.test(line)) return "NAME";
      return w;
    })
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function structureKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\b/g, "N")
    .replace(/\b(rb|wr|qb|te|dst|k|idp)\b/g, "pos")
    .replace(/\b[a-z]{3,}(?:\s+[a-z]{3,}){0,3}\b/g, (w) => {
      const keep = /^(the|a|an|and|or|to|for|with|on|in|at|of|is|are|was|just|that|this|from|into|still|needed|starting|past|ahead|fell|picks|pick|round|board|roster|build|receipt|run|lands|takes|draft|room|story|does|dont|doesn't|watch|shore|avalanche|continues|hop|pile|opinions|not|applause|reply|thread|starter|documented|fill|open|closes|fact|books|amid|scramble|owned|refused|roll|tax|shows|value|slide|upgrades|capitalizes|gift|opens|present|noise|now|consequences|later|expect|became|reaction|speed|temperature|shifts|fuel|age|loudly|activated|set|rival|tracked|league|chat|file|tuesday|forget|will|room|card|logged|joins|has|after|as|first|did|do|you|before|ends|piece|puts|foundation|place|spend|about|slots|vibes|complete|changes|lineup|math|construction|move|secure|leave|flier|later|fits|pattern|year|tendency|into|this|years|disciplined|take|discount|keep|future|flexible|ballast|without|early|burn|fixes|depth|warping|plan|react|risks|worse|leftovers|grabs|cliff|when|floods|answer|insurance|mid|reshape|remaining|needs|watch|how|thin|spot|gets|impact|room|got|spent|addition|chase|next)$/;
      return keep.test(w) ? w : "name";
    })
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
}

async function main(): Promise<void> {
  const ledger = new SessionEditorialLedger();
  const orch = new BroadcastOrchestrator({
    voices: { sofia: SOFIA, coach: COACH, roxanne: ROXANNE },
    checker: { async check() { return "entail" as const; } },
    playerOracle: buildPlayerRegistryOracle([]),
    ledger,
    generate: createShadowGroundedVoiceProvider(),
  });

  const moments = buildSimulatedDraftMoments().map(applyEarlyRoundWrittenFloor);
  const lines: { pick: number; voice: string; text: string; plan: string }[] = [];

  for (const m of moments) {
    const bm = draftMomentToBroadcastMoment(m);
    const frame = await orch.buildFrame(bm);
    const primary = frame.public.primaryVoice;
    if (!primary?.accepted || !primary.text) continue;
    lines.push({
      pick: m.overallPick,
      voice: primary.voice,
      text: primary.text,
      plan: resolveEditorialPlanId(bm),
    });
  }

  let consecutiveTemplateHits = 0;
  let maxConsecutiveSameStructure = 1;
  let run = 1;
  for (let i = 1; i < lines.length; i++) {
    const a = structureKey(lines[i - 1]!.text);
    const b = structureKey(lines[i]!.text);
    if (a === b) {
      consecutiveTemplateHits++;
      run++;
      maxConsecutiveSameStructure = Math.max(maxConsecutiveSameStructure, run);
    } else {
      run = 1;
    }
  }

  const byVoice = { sofia: 0, coach: 0, roxanne: 0 };
  for (const l of lines) {
    if (l.voice in byVoice) byVoice[l.voice as keyof typeof byVoice]++;
  }

  const holeHits = lines.filter((l) => HOLE_MAIL_MERGE.test(l.text)).length;
  const txnHits = lines.filter((l) => TXN_LOG.test(l.text)).length;
  const receiptHits = lines.filter((l) => l.voice === "sofia" && RECEIPT_CUES.test(l.text)).length;
  const sofiaTotal = byVoice.sofia;
  const leagueHits = lines.filter((l) => LEAGUE_CUES.test(l.text)).length;
  const uniqueStructures = new Set(lines.map((l) => structureKey(l.text))).size;

  const sample = lines.filter((_, i) => i < 12 || i % 20 === 0).slice(0, 18);

  const report = {
    totalSpoken: lines.length,
    totalMoments: moments.length,
    consecutiveSameStructurePairs: consecutiveTemplateHits,
    maxConsecutiveSameStructure,
    uniqueStructures,
    holeMailMergeHits: holeHits,
    transactionLogHits: txnHits,
    analystDistribution: byVoice,
    sofiaReceiptVisibility: sofiaTotal === 0 ? 0 : Number((receiptHits / sofiaTotal).toFixed(3)),
    leagueSpecificShare: Number((leagueHits / Math.max(1, lines.length)).toFixed(3)),
    voicesPresent: Object.entries(byVoice).filter(([, n]) => n > 0).map(([v]) => v),
    sample,
  };

  console.log(JSON.stringify(report, null, 2));

  const ready =
    holeHits === 0 &&
    maxConsecutiveSameStructure <= 2 &&
    byVoice.sofia > 0 &&
    byVoice.coach > 0 &&
    byVoice.roxanne > 0 &&
    (sofiaTotal === 0 || receiptHits / sofiaTotal >= 0.35) &&
    leagueHits / lines.length >= 0.28 &&
    uniqueStructures >= Math.min(12, Math.floor(lines.length * 0.4));

  console.log(ready ? "\nQUALITY GATE: PASS" : "\nQUALITY GATE: FAIL");
  if (!ready) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
