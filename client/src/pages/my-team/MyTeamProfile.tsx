/**
 * Canonical `/my-team/profile` — authenticated user's My GM view.
 * Bound to me.ownerHome only; never accepts another owner from the URL.
 */
import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { OwnerProfiles } from "@/pages/OwnerProfiles";

export function MyTeamProfile() {
  return (
    <FeatureRouteGate route="/owner-profiles">
      <OwnerProfiles
        authenticatedOwnerOnly
        pageEyebrow="My Team"
        pageTitle="My GM"
        pageSubtitle="Your personal GM identity, career, and behavioral profile — not the league scouting directory."
      />
    </FeatureRouteGate>
  );
}
