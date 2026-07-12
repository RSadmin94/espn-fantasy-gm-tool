/**
 * RFSN Live broadcast tRPC router — feature-flagged, internal access only.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { canAccessRfsnLiveBroadcast, isRfsnLiveBroadcastEnabled } from "./services/sofia/liveBroadcastFeature";
import { isRfsnTtsEnabled, isRfsnTtsConfigured } from "./services/rfsn/rfsnTtsConfig";
import { getLiveAudioStatus } from "./services/rfsn/rfsnVoiceAudioCache";
import {
  getOrCreateLiveSession,
  resetLiveSession,
  updateLiveSession,
  type PublicLiveBroadcastPayload,
} from "./services/sofia/liveBroadcastSession";
import {
  buildDraftMomentForLockedPick,
  resetLiveDraftMomentSession,
  type LockedPickInput,
} from "./services/sofia/liveDraftMomentSession";
import { scheduleLiveBroadcastForDraftMoment } from "./services/sofia/liveBroadcastPickHook";

const lockedPickSchema = z.object({
  overallPick: z.number().int().min(1),
  round: z.number().int().min(1),
  roundPick: z.number().int().min(1),
  teamId: z.string().min(1),
  ownerName: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  position: z.string().min(1),
  nflTeam: z.string().nullable().optional(),
});

function assertLiveAccess(user: Parameters<typeof canAccessRfsnLiveBroadcast>[0]): void {
  if (!canAccessRfsnLiveBroadcast(user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "RFSN Live broadcast is not available for this account.",
    });
  }
}

function publicPayloadOrStandby(
  leagueId: string,
  draftId: string,
): PublicLiveBroadcastPayload {
  const session = getOrCreateLiveSession(leagueId, draftId);
  return session.payload;
}

export const rfsnBroadcastRouter = router({
  /** Client nav + route gate — no sensitive configuration. */
  getAccess: protectedProcedure.query(({ ctx }) => ({
    enabled: isRfsnLiveBroadcastEnabled(),
    canAccess: canAccessRfsnLiveBroadcast(ctx.user),
    ttsEnabled: isRfsnTtsEnabled() && isRfsnTtsConfigured(),
  })),

  getLiveSnapshot: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1).max(64),
        draftId: z.string().min(1).max(128),
      }),
    )
    .query(({ ctx, input }) => {
      assertLiveAccess(ctx.user);
      return publicPayloadOrStandby(input.leagueId, input.draftId);
    }),

  getAudioStatus: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1).max(64),
        draftId: z.string().min(1).max(128),
      }),
    )
    .query(({ ctx, input }) => {
      assertLiveAccess(ctx.user);
      return getLiveAudioStatus(input.leagueId, input.draftId);
    }),

  /** Fire-and-forget after a pick is final — returns immediately. */
  notifyLockedPick: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1).max(64),
        draftId: z.string().min(1).max(128),
        pick: lockedPickSchema,
        draftComplete: z.boolean().optional(),
        /** Test-only — forces deterministic provider (no API calls). */
        useDeterministicProvider: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      assertLiveAccess(ctx.user);
      if (!isRfsnLiveBroadcastEnabled()) {
        return { accepted: false, reason: "disabled" as const };
      }

      updateLiveSession(input.leagueId, input.draftId, { state: "live" });

      let draftMoment;
      try {
        draftMoment = buildDraftMomentForLockedPick(input.leagueId, input.draftId, input.pick as LockedPickInput);
      } catch {
        return { accepted: false, reason: "moment_build_failed" as const };
      }

      scheduleLiveBroadcastForDraftMoment(draftMoment, {
        draftComplete: input.draftComplete,
        useDeterministicProvider: input.useDeterministicProvider ?? false,
      });

      return { accepted: true, pickId: draftMoment.eventId };
    }),

  resetLiveSession: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1).max(64),
        draftId: z.string().min(1).max(128),
      }),
    )
    .mutation(({ ctx, input }) => {
      assertLiveAccess(ctx.user);
      resetLiveDraftMomentSession(input.leagueId, input.draftId);
      resetLiveSession(input.leagueId, input.draftId);
      getOrCreateLiveSession(input.leagueId, input.draftId);
      return { ok: true };
    }),
});

export type RfsnBroadcastRouter = typeof rfsnBroadcastRouter;
