/**
 * Canonical `/rivals/owners` — structured Owner Dossier directory (scout lens).
 * Same underlying OwnerProfiles component as the dossier detail route;
 * Cast remains the narrative presentation at `/rivals/cast`.
 */
import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { OwnerProfiles } from "@/pages/OwnerProfiles";

export function RivalsOwners() {
  return (
    <FeatureRouteGate route="/owner-profiles">
      <OwnerProfiles
        mode="scout"
        syncSelectionToRoute
        pageEyebrow="Rivals"
        pageTitle="Owner Dossier"
        pageSubtitle="Structured directory of every resolved manager — open a dossier to scout career, tendencies, and rivalries."
      />
    </FeatureRouteGate>
  );
}
