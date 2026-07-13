import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBoothCommentarySequence } from "../../../client/src/lib/rfsnBoothPresentation";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { buildBroadcastPaceDraftMoments } from "./shadowDraftSources";
import {
  buildLiveBroadcastFrame,
  resetLiveBroadcastServiceForTests,
} from "./liveBroadcastService";
import { resetLiveSessionsForTests } from "./liveBroadcastSession";
import { resetLiveBroadcastPickHookForTests } from "./liveBroadcastPickHook";
import {
  buildDraftMomentForLockedPick,
  getLockedPicksForSession,
  resetLiveDraftMomentSessionsForTests,
} from "./liveDraftMomentSession";
import {
  buildDraftWrapUpBroadcastMoment,
  summarizeDraftWrapUp,
} from "./liveDraftWrapUp";
import { loadShadowCertEnvFromDotenv } from "./realBroadcastShadowDeps";

const ENV_KEY = "RFSN_LIVE_BROADCAST_ENABLED";
const LEAGUE = "WRAP-REAL";
const DRAFT = "draft-wrap-real";

loadShadowCertEnvFromDotenv();
const HAS_DEEPSEEK = Boolean(process.env.DEEPSEEK_API_KEY?.trim());

function seedAllPicks(): DraftMoment {
  const moments = buildBroadcastPaceDraftMoments("wrap-up-real");
  let last = moments[0]!;
  for (const m of moments) {
    last = buildDraftMomentForLockedPick(
      LEAGUE,
      DRAFT,
      {
        overallPick: m.overallPick,
        round: m.round,
        roundPick: m.roundPick,
        teamId: m.owner.teamId,
        ownerName: m.owner.ownerName,
        playerId: m.player.playerId,
        playerName: m.player.playerName,
        position: m.player.position,
        nflTeam: m.player.nflTeam,
      },
      { reset: m.overallPick === 1, draftPace: "broadcast" },
    );
  }
  return last;
}

function onAirVoices(result: NonNullable<Awaited<ReturnType<typeof buildLiveBroadcastFrame>>>) {
  return [
    result.frame.public.primaryVoice,
    result.frame.public.secondaryVoice,
    ...result.frame.public.deferredVoices,
  ].filter((v) => v?.accepted && v.text);
}

describe.skipIf(!HAS_DEEPSEEK)("live draft wrap-up — real DeepSeek provider", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = "true";
    resetLiveBroadcastServiceForTests();
    resetLiveSessionsForTests();
    resetLiveBroadcastPickHookForTests();
    resetLiveDraftMomentSessionsForTests();
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it(
    "generates Sofia, Coach, and Roxanne with grounded separation and booth order",
    async () => {
      const finalPick = seedAllPicks();
      const picks = getLockedPicksForSession(LEAGUE, DRAFT);
      const summary = summarizeDraftWrapUp(picks, 14);
      const wrapMoment = buildDraftWrapUpBroadcastMoment(LEAGUE, DRAFT, summary);

      const result = await buildLiveBroadcastFrame({
        moment: wrapMoment,
        leagueId: LEAGUE,
        draftId: DRAFT,
        draftMoment: finalPick,
        useDeterministicProvider: false,
        markDraftComplete: true,
      });

      expect(result).not.toBeNull();
      const attempts = result!.frame.diagnostics.voiceAttempts;
      expect(attempts.map((a) => a.voice)).toEqual(
        expect.arrayContaining(["sofia", "coach", "roxanne"]),
      );

      const accepted = onAirVoices(result!);
      if (accepted.length < 2) {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify(
            attempts.map((a) => ({
              voice: a.voice,
              accepted: a.accepted,
              rejection: a.rejectionCategory,
              reason: a.suppressReason,
            })),
          ),
        );
      }
      expect(accepted.length).toBeGreaterThanOrEqual(1);

      const sofia =
        accepted.find((v) => v!.voice === "sofia") ??
        attempts.find((a) => a.voice === "sofia" && a.text);
      const coach =
        accepted.find((v) => v!.voice === "coach") ??
        attempts.find((a) => a.voice === "coach" && a.text);
      const roxanne =
        accepted.find((v) => v!.voice === "roxanne") ??
        attempts.find((a) => a.voice === "roxanne" && a.text);

      const sofiaText = sofia && "text" in sofia ? sofia.text : null;
      expect(sofiaText).toMatch(/168|draft complete|selections across 14 teams/i);

      const coachText = coach && "text" in coach ? coach.text : null;
      if (coachText && sofiaText) {
        expect(coachText.toLowerCase()).not.toBe(sofiaText.toLowerCase());
        expect(coachText).not.toContain(sofiaText.slice(0, 20));
      }

      const roxanneText = roxanne && "text" in roxanne ? roxanne.text : null;
      if (roxanneText) {
        expect(roxanneText).not.toMatch(
          /because (he|she|they) wanted|panick|desperate|obviously wanted/i,
        );
      }

      const order = [
        result!.frame.public.primaryVoice,
        result!.frame.public.secondaryVoice,
        ...result!.frame.public.deferredVoices,
      ]
        .filter((v) => v?.accepted)
        .map((v) => v!.voice);

      expect(order.length).toBeGreaterThanOrEqual(1);
      expect(order[0]).toBe("sofia");
      if (order.length >= 3) {
        expect(order.slice(0, 3)).toEqual(["sofia", "coach", "roxanne"]);
      }

      const sequence = buildBoothCommentarySequence(result!.snapshot);
      if (sequence.length > 0) {
        expect(sequence[0]!.commentator).toBe("sofia");
      }
    },
    180_000,
  );
});
