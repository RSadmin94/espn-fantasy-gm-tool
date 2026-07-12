/**
 * Non-blocking live broadcast side effect — draft must succeed if this fails.
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { isRfsnLiveBroadcastEnabled } from "./liveBroadcastFeature";
import { getOrCreateLiveSession } from "./liveBroadcastSession";
import { processLockedDraftMoment } from "./liveBroadcastService";

const inFlight = new Map<string, Promise<unknown>>();

export function scheduleLiveBroadcastForDraftMoment(
  draftMoment: DraftMoment,
  opts: { draftComplete?: boolean; useDeterministicProvider?: boolean } = {},
): void {
  if (!isRfsnLiveBroadcastEnabled()) return;

  const sessionKey = `${draftMoment.leagueId}:${draftMoment.draftId}`;
  const session = getOrCreateLiveSession(draftMoment.leagueId, draftMoment.draftId);
  if (session.lastProcessedPickId === draftMoment.eventId) return;

  const work = processLockedDraftMoment(draftMoment, opts).catch(() => null);
  inFlight.set(sessionKey, work);
  void work.finally(() => {
    if (inFlight.get(sessionKey) === work) inFlight.delete(sessionKey);
  });
}

export function resetLiveBroadcastPickHookForTests(): void {
  inFlight.clear();
}
