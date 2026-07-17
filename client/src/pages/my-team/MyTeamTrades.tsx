import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { Trades } from "@/pages/Trades";

export function MyTeamTrades() {
  return (
    <FeatureRouteGate route="/trades">
      <Trades />
    </FeatureRouteGate>
  );
}
