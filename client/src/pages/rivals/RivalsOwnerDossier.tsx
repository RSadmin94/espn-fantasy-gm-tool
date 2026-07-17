/** Canonical `/rivals/owners/:ownerId` — Owner Dossier detail. */
import { useParams } from "react-router";
import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { OwnerProfiles } from "@/pages/OwnerProfiles";

export function RivalsOwnerDossier() {
  const { ownerId } = useParams();
  const decoded = ownerId ? decodeURIComponent(ownerId) : null;

  return (
    <FeatureRouteGate route="/owner-profiles">
      <OwnerProfiles
        routeOwnerId={decoded}
        syncSelectionToRoute
        pageEyebrow="Rivals"
        pageTitle="Owner Dossier"
        pageSubtitle="Canonical manager dossier — identity, career, tendencies, and rivalry history."
      />
    </FeatureRouteGate>
  );
}
