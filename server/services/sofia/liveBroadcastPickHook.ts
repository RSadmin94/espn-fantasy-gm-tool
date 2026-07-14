/**
 * Non-blocking live broadcast side effect — draft must succeed if this fails.
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { isRfsnLiveBroadcastEnabled } from "./liveBroadcastFeature";
import { getOrCreateLiveSession } from "./liveBroadcastSession";
import { processDraftWrapUp, processLockedDraftMoment } from "./liveBroadcastService";

/** Keep each on-air written frame publishable for at least this long before overwrite. */
export const WRITTEN_FRAME_DWELL_MS = 6_000;

const inFlight = new Map<string, Promise<unknown>>();
const lastOnAirPublishedAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function scheduleLiveBroadcastForDraftMoment(
  draftMoment: DraftMoment,
  opts: {
    draftComplete?: boolean;
    useDeterministicProvider?: boolean;
    teamCount?: number;
  } = {},
): void {
  if (!isRfsnLiveBroadcastEnabled()) return;

  const sessionKey = `${draftMoment.leagueId}:${draftMoment.draftId}`;
  const session = getOrCreateLiveSession(draftMoment.leagueId, draftMoment.draftId);
  if (session.lastProcessedPickId === draftMoment.eventId && !opts.draftComplete) return;

  const prior = inFlight.get(sessionKey);
  const work = (async () => {
    if (prior) await prior.catch(() => null);

    const lastAt = lastOnAirPublishedAt.get(sessionKey) ?? 0;
    if (lastAt > 0) {
      const waitMs = Math.max(0, WRITTEN_FRAME_DWELL_MS - (Date.now() - lastAt));
      if (waitMs > 0) await sleep(waitMs);
    }

    const result = await processLockedDraftMoment(draftMoment, opts);
    if (
      result &&
      result.snapshot?.primary?.text?.trim() &&
      (result.sessionState === "commentary_active" || result.sessionState === "draft_complete")
    ) {
      lastOnAirPublishedAt.set(sessionKey, Date.now());
    }

    if (opts.draftComplete) {
      await processDraftWrapUp({
        leagueId: draftMoment.leagueId,
        draftId: draftMoment.draftId,
        finalDraftMoment: draftMoment,
        teamCount: opts.teamCount,
        useDeterministicProvider: opts.useDeterministicProvider,
      });
      lastOnAirPublishedAt.set(sessionKey, Date.now());
    }
    return result;
  })().catch(() => null);

  inFlight.set(sessionKey, work);
  void work.finally(() => {
    if (inFlight.get(sessionKey) === work) inFlight.delete(sessionKey);
  });
}

export function resetLiveBroadcastPickHookForTests(): void {
  inFlight.clear();
  lastOnAirPublishedAt.clear();
}

export async function awaitLiveBroadcastIdle(leagueId: string, draftId: string): Promise<void> {
  const key = `${leagueId}:${draftId}`;
  const pending = inFlight.get(key);
  if (pending) await pending.catch(() => null);
}
