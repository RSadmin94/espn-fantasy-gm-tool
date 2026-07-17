import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { AcquisitionImpact } from "@/pages/AcquisitionImpact";

export function LeagueAcquisitionImpact() {
  return (
    <div data-v2-league-acquisition-impact>
      <FeatureRouteGate route="/acquisition-impact">
        <AcquisitionImpact />
      </FeatureRouteGate>
    </div>
  );
}
