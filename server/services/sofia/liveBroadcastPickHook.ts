/**
 * Non-blocking live broadcast side effect — draft must succeed if this fails.
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import { isRfsnLiveBroadcastEnabled } from "./liveBroadcastFeature";
import { getOrCreateLiveSession } from "./liveBroadcastSession";
import { processDraftWrapUp, processLockedDraftMoment } from "./liveBroadcastService";

const inFlight = new Map<string, Promise<unknown>>();

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
    const result = await processLockedDraftMoment(draftMoment, opts);
    if (opts.draftComplete) {
      await processDraftWrapUp({
        leagueId: draftMoment.leagueId,
        draftId: draftMoment.draftId,
        finalDraftMoment: draftMoment,
        teamCount: opts.teamCount,
        useDeterministicProvider: opts.useDeterministicProvider,
      });
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
}

export async function awaitLiveBroadcastIdle(leagueId: string, draftId: string): Promise<void> {
  const key = `${leagueId}:${draftId}`;
  const pending = inFlight.get(key);
  if (pending) await pending.catch(() => null);
}
