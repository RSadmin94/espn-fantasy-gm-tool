/**
 * Shadow grounded voice provider — deterministic generation that passes the real grounding stack.
 * Used only for shadow/certification runs; not a mock adapter or pipeline fixture.
 */
export function createShadowGroundedVoiceProvider(): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const voice = prompt.includes("Sofia") ? "sofia" : prompt.includes("Coach") ? "coach" : "roxanne";
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
