/**
 * Live-draft written commentary floor — early rounds must not stay fully silent.
 * Classifier can still mark routine; live broadcast elevates rounds 1–3 to a short written line.
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";

export const EARLY_ROUND_WRITTEN_FLOOR = 3;

export function applyEarlyRoundWrittenFloor(moment: DraftMoment): DraftMoment {
  if (moment.round < 1 || moment.round > EARLY_ROUND_WRITTEN_FLOOR) return moment;
  if (moment.commentaryBudget.enabled && moment.level !== "routine") return moment;

  const selection =
    moment.permittedClaims[0] ??
    `${moment.owner.ownerName} selected ${moment.player.playerName} (${moment.player.position}) at pick ${moment.overallPick}, round ${moment.round}.`;

  return {
    ...moment,
    level: "notable",
    signals: moment.signals.length > 0 ? moment.signals : ["EARLY_ROUND_FLOOR"],
    permittedClaims: moment.permittedClaims.length > 0 ? moment.permittedClaims : [selection],
    commentaryBudget: { enabled: true, maxSentences: 1, maxWords: 22 },
  };
}
