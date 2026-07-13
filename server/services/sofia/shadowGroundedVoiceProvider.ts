/**
 * Deterministic shadow voice provider — vitest and offline pipeline checks only.
 * Real shadow certification uses createRealShadowBroadcastOrchestrator (DeepSeek).
 */
export function createShadowGroundedVoiceProvider(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const voice = prompt.includes("Sofia") ? "sofia" : prompt.includes("Coach") ? "coach" : "roxanne";

    if (prompt.includes("DRAFT_WRAP_UP") || prompt.includes("Draft complete:")) {
      const factLine =
        prompt.match(/1\.\s*(Draft complete:[^\n]+)/i)?.[1] ?? "Draft complete: 168 picks across 14 teams.";
      const lines: Record<string, string> = {
        sofia: factLine,
        coach: "Several rosters still look thin at receiver after this draft.",
        roxanne: "This draft will be talked about all season.",
      };
      return JSON.stringify({ line: lines[voice], premise: factLine });
    }

    const momentMatch = prompt.match(/MOMENT:\s*(.+?)\s+selected\s+(.+?)\s+\((\w+)\)\s+at pick (\d+), round (\d+)/i);
    const owner = momentMatch?.[1] ?? "Owner";
    const player = momentMatch?.[2] ?? "Player";
    const position = momentMatch?.[3] ?? "WR";
    const pick = momentMatch?.[4] ?? "1";
    const round = momentMatch?.[5] ?? "1";

    const fact = `${owner} selected ${player} (${position}) at pick ${pick}, round ${round}.`;
    const lines: Record<string, string> = {
      sofia: fact,
      coach: "Here's what worries me about the roster balance after this pick.",
      roxanne: `Did ${owner} just change the whole draft?`,
    };
    return JSON.stringify({ line: lines[voice], premise: fact });
  };
}
