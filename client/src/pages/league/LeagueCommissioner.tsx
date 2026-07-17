import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { CommissionerCommandCenter } from "@/pages/CommissionerCommandCenter";

export function LeagueCommissioner() {
  return (
    <div data-v2-league-commissioner>
      <FeatureRouteGate route="/commissioner-command-center">
        <CommissionerCommandCenter />
      </FeatureRouteGate>
    </div>
  );
}
