/** Canonical `/rivals/owners/:ownerId` — Owner Dossier detail (scout lens). */
import { useParams } from "react-router";
import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { OwnerProfiles } from "@/pages/OwnerProfiles";

export function RivalsOwnerDossier() {
  const { ownerId } = useParams();
  const decoded = ownerId ? decodeURIComponent(ownerId) : null;

  return (
    <FeatureRouteGate route="/owner-profiles">
      <OwnerProfiles
        mode="scout"
        routeOwnerId={decoded}
        syncSelectionToRoute
        pageEyebrow="Rivals"
        pageTitle="Owner Dossier"
        pageSubtitle="Opponent scout report — tendencies, matchup intel, and how to attack this manager."
      />
    </FeatureRouteGate>
  );
}
