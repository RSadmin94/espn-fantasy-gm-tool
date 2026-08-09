/**
 * RFSN-052L — GM Advisor Clear = true session reset.
 *
 * Wipes conversational state only: chat history, planner continuity,
 * follow-up/clarification context. Does not touch active league, user, or page.
 */
import { clearAdvisorConversationContext } from "./advisorConversationContext";
import { clearChatHistory, sanitizeAdvisorChatLeagueId } from "./db";

export async function resetAdvisorConversationSession(
  userId: number,
  leagueId: string,
): Promise<{ leagueId: string }> {
  const lid = sanitizeAdvisorChatLeagueId(String(leagueId ?? ""));
  await clearChatHistory(userId, lid);
  clearAdvisorConversationContext(userId, lid);
  if (String(leagueId ?? "") !== lid) {
    clearAdvisorConversationContext(userId, String(leagueId ?? ""));
  }
  return { leagueId: lid };
}
