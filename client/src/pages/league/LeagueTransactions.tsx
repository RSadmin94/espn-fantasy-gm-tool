import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { Transactions } from "@/pages/Transactions";

export function LeagueTransactions() {
  return (
    <div data-v2-league-transactions>
      <FeatureRouteGate route="/transactions">
        <Transactions />
      </FeatureRouteGate>
    </div>
  );
}
