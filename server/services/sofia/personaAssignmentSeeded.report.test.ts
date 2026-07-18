/**
 * Seeded Phase 3 persona-assignment verification (assignment only — no LLM/TTS).
 * Run: npx vitest run server/services/sofia/personaAssignmentSeeded.report.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildEditorialAssignment } from "./broadcastEditorialRouting";
import { SessionEditorialLedger } from "./editorialLedger";
import type { BroadcastMoment } from "./broadcastMomentTypes";
import {
  disablePersonaAssignmentMetrics,
  enablePersonaAssignmentMetrics,
  getPersonaAssignmentMetrics,
  type PersonaAssignmentMetricsSnapshot,
} from "./personaRoleAssignment";

function bm(overrides: Partial<BroadcastMoment> = {}): BroadcastMoment {
  return {
    identity: { kind: "draft_pick", draftId: "seed", pickNumber: 1, pickId: "p1" },
    momentType: "draft_pick",
    significance: "notable",
    headline: null,
    context: { kind: "none" },
    factPacket: {
      subject: { ownerName: "Alice", playerName: "Player", position: "WR", overallPick: 1, round: 1 },
      verifiedFacts: ["Alice selected Player (WR) at pick 1."],
      entities: ["Alice", "Player"],
    },
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    signals: [],
    storylines: [],
    receipts: [],
    primaryStoryline: null,
    callbackKeys: [],
    ...overrides,
  };
}

/** Deterministic mix approximating live-draft commentary moments (speaking only). */
function seededSpeakingMoments(seed: number): BroadcastMoment[] {
  const out: BroadcastMoment[] = [];
  const owners = ["Alice", "Bob", "Carol", "Mike", "Rod"];
  for (let i = 0; i < 48; i++) {
    const n = (seed * 17 + i * 13) % 100;
    const owner = owners[i % owners.length]!;
    const pick = i + 1;
    const base = {
      identity: { kind: "draft_pick" as const, draftId: `seed-${seed}`, pickNumber: pick, pickId: `p${pick}` },
      factPacket: {
        subject: {
          ownerName: owner,
          playerName: `Player${pick}`,
          position: (["QB", "RB", "WR", "TE"] as const)[i % 4]!,
          overallPick: pick,
          round: Math.ceil(pick / 12),
        },
        verifiedFacts: [`${owner} selected Player${pick}.`],
        entities: [owner, `Player${pick}`],
      },
    };

    if (n < 8) {
      out.push(bm({ ...base, significance: "routine" })); // silence
    } else if (n < 38) {
      // Ordinary value / BPA → Sofia
      out.push(bm({ ...base, significance: "notable", signals: [] }));
    } else if (n < 55) {
      out.push(bm({ ...base, significance: "notable", signals: ["STEAL"] }));
    } else if (n < 70) {
      out.push(bm({ ...base, significance: "notable", signals: ["REACH"] }));
    } else if (n < 78) {
      out.push(bm({ ...base, significance: "major", signals: ["REACH:strong"] }));
    } else if (n < 86) {
      out.push(
        bm({
          ...base,
          significance: "major",
          context: { kind: "position_run", count: 3 + (i % 3), position: "RB" },
          signals: [],
        }),
      );
    } else if (n < 92) {
      // Half decorative rivalry-on-value (Sofia), half substantive rivalry (Roxanne)
      if (i % 2 === 0) {
        out.push(
          bm({
            ...base,
            significance: "notable",
            signals: [],
            receipts: [{ id: "rivalry", type: "rivalry" }],
            storylines: [`${owner} rivalry heat`],
          }),
        );
      } else {
        out.push(
          bm({
            ...base,
            significance: "major",
            receipts: [
              { id: "rivalry", type: "rivalry" },
              { id: "rivalryImpact", type: "rivalryImpact" },
            ],
            storylines: [`${owner} championship rematch`],
            factPacket: {
              ...base.factPacket,
              verifiedFacts: [`${owner} championship rematch vs rival.`],
            },
          }),
        );
      }
    } else if (n < 96) {
      out.push(bm({ ...base, significance: "historic", signals: ["REACH:strong"] }));
    } else {
      out.push(
        bm({
          ...base,
          momentType: "championship",
          significance: "historic",
          storylines: ["championship implication"],
        }),
      );
    }
  }
  return out;
}

function distribution(snap: PersonaAssignmentMetricsSnapshot) {
  const total = snap.sofia.assigned + snap.coach.assigned + snap.roxanne.assigned;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((1000 * n) / total) / 10);
  return {
    total,
    sofiaPct: pct(snap.sofia.assigned),
    coachPct: pct(snap.coach.assigned),
    roxannePct: pct(snap.roxanne.assigned),
  };
}

function maxConsecutive(leads: readonly string[]): { voice: string; count: number } {
  let best = { voice: "", count: 0 };
  let cur = { voice: "", count: 0 };
  for (const v of leads) {
    if (v === cur.voice) cur = { voice: v, count: cur.count + 1 };
    else cur = { voice: v, count: 1 };
    if (cur.count > best.count) best = { ...cur };
  }
  return best;
}

describe("Phase 3 seeded persona assignment report", () => {
  const reports: {
    seed: number;
    dist: ReturnType<typeof distribution>;
    snap: PersonaAssignmentMetricsSnapshot;
    examples: { label: string; lead: string; reason?: string }[];
  }[] = [];

  beforeAll(() => {
    enablePersonaAssignmentMetrics();
  });

  afterAll(() => {
    disablePersonaAssignmentMetrics();
    // eslint-disable-next-line no-console
    console.log("\n========== PHASE 3 PERSONA ASSIGNMENT REPORT ==========");
    for (const r of reports) {
      // eslint-disable-next-line no-console
      console.log(
        `\nSeed ${r.seed}: speaking=${r.dist.total} | Sofia ${r.dist.sofiaPct}% | Coach ${r.dist.coachPct}% | Roxanne ${r.dist.roxannePct}%`,
      );
      // eslint-disable-next-line no-console
      console.log("  buckets:", {
        sofia: r.snap.sofia,
        coach: r.snap.coach,
        roxanne: r.snap.roxanne,
      });
      // eslint-disable-next-line no-console
      console.log("  max consecutive lead:", maxConsecutive(r.snap.recentLeads));
      // eslint-disable-next-line no-console
      console.log("  reason counts:", reasonCounts(r.snap));
      // eslint-disable-next-line no-console
      console.log("  examples:", r.examples);
    }
    // eslint-disable-next-line no-console
    console.log("=======================================================\n");
  });

  for (const seed of [1, 2, 3, 7, 11]) {
    it(`seeded draft ${seed} records assignment stats`, () => {
      const metrics = enablePersonaAssignmentMetrics();
      metrics.reset();
      const ledger = new SessionEditorialLedger();
      const moments = seededSpeakingMoments(seed);
      const examples: { label: string; lead: string; reason?: string }[] = [];

      for (const m of moments) {
        const a = buildEditorialAssignment(m, ledger);
        if (a.silence) continue;
        ledger.recordFrame({
          planId: a.planId,
          leadVoice: a.leadVoice,
          voicesOnAir: a.request,
          silenced: false,
          significance: m.significance,
          storylines: m.storylines,
          callbackKeys: m.callbackKeys ?? [],
          acceptedTexts: {},
          planEnergy: a.plan.energyLevel,
          decompressionTriggered: false,
        });

        if (m.signals.some((s) => s.startsWith("REACH")) && a.leadVoice === "coach" && examples.length < 6) {
          examples.push({ label: "Coach won over Roxanne (reach)", lead: a.leadVoice, reason: a.assignmentReason });
        }
        if (
          m.signals.length === 0 &&
          m.context.kind === "none" &&
          m.significance === "notable" &&
          a.leadVoice === "sofia" &&
          examples.length < 8
        ) {
          examples.push({ label: "Sofia won over Coach (value)", lead: a.leadVoice, reason: a.assignmentReason });
        }
        if (
          m.receipts.some((r) => r.id === "rivalry") &&
          a.leadVoice === "roxanne" &&
          (a.rotationOverrideReason || a.assignmentReason === "rotation_override_historic")
        ) {
          examples.push({
            label: "Roxanne rotation override",
            lead: a.leadVoice,
            reason: a.rotationOverrideReason ?? a.assignmentReason,
          });
        }
        if (m.momentType === "championship" && a.leadVoice === "roxanne") {
          examples.push({ label: "Roxanne championship", lead: a.leadVoice, reason: a.assignmentReason });
        }
      }

      const snap = metrics.snapshot();
      const dist = distribution(snap);
      reports.push({ seed, dist, snap, examples });

      expect(dist.total).toBeGreaterThan(20);
      // Soft targets — seeded mix, not production live mix
      expect(dist.sofiaPct).toBeGreaterThan(30);
      expect(dist.coachPct).toBeGreaterThan(15);
      expect(dist.roxannePct).toBeLessThan(35);
      expect(maxConsecutive(snap.recentLeads).count).toBeLessThanOrEqual(3);
    });
  }
});

function reasonCounts(snap: PersonaAssignmentMetricsSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of snap.decisions) {
    if (d.reason === "silence") continue;
    out[d.reason] = (out[d.reason] ?? 0) + 1;
  }
  return out;
}
