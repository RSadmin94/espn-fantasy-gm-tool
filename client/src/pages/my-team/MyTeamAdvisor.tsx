import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { Advisor } from "@/pages/Advisor";

export function MyTeamAdvisor() {
  return (
    <FeatureRouteGate route="/advisor">
      <Advisor />
    </FeatureRouteGate>
  );
}
