import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { ChampionshipDiagnosis } from "@/pages/ChampionshipDiagnosis";

/** Canonical Championship Path — mounts the existing diagnosis authority. */
export function MyTeamChampionshipPath() {
  return (
    <FeatureRouteGate route="/championship-diagnosis">
      <ChampionshipDiagnosis />
    </FeatureRouteGate>
  );
}
