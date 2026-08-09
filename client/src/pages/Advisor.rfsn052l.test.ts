/**
 * RFSN-052L — Advisor Clear UI is a true session reset (layout/wiring only).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const advisor = readFileSync(join(process.cwd(), "client/src/pages/Advisor.tsx"), "utf8");
const routers = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
const reset = readFileSync(join(process.cwd(), "server/advisorSessionReset.ts"), "utf8");

describe("RFSN-052L Advisor Clear wiring", () => {
  it("Clear resets UI conversation chrome without touching league/user/season", () => {
    expect(advisor).toContain("data-rfsn-052l");
    expect(advisor).toContain("resetAdvisorConversationUi");
    expect(advisor).toContain("advisorSessionGenRef");
    expect(advisor).toContain("chatMutation.reset()");
    expect(advisor).toContain('setInput("")');
    expect(advisor).toContain("messagesPaneRef.current.scrollTop = 0");
    expect(advisor).toContain("advisorSessionGenRef.current !== sessionGen");
    expect(advisor).not.toMatch(/resetAdvisorConversationUi[\s\S]{0,400}setSeason\(/);
    expect(advisor).toContain("useLeagueActiveGate");
  });

  it("server Clear wipes chat history and planner context", () => {
    expect(routers).toContain("resetAdvisorConversationSession");
    expect(reset).toContain("clearChatHistory");
    expect(reset).toContain("clearAdvisorConversationContext");
    expect(reset).not.toContain("setActiveLeague");
  });
});
