/**
 * Playoff Picture — reuses Standings final-rank mode (existing authority).
 * No separate playoff-bracket calculator is invented here.
 */
import { Standings } from "@/pages/Standings";

export function LeaguePlayoffs() {
  return (
    <div data-v2-league-playoffs>
      <Standings initialMode="final" context="playoffs" />
    </div>
  );
}
