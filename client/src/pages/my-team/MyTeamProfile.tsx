/**
 * Canonical `/my-team/profile` — authenticated user's My GM view (self lens).
 * Bound to me.ownerHome only; never accepts another owner from the URL.
 */
import { FeatureRouteGate } from "@/components/FeatureRouteGate";
import { OwnerProfiles } from "@/pages/OwnerProfiles";

export function MyTeamProfile() {
  return (
    <FeatureRouteGate route="/owner-profiles">
      <OwnerProfiles
        mode="self"
        pageEyebrow="My Team"
        pageTitle="My GM"
        pageSubtitle="Who you are as a fantasy GM — identity, draft DNA, legacy, and rivalries."
      />
    </FeatureRouteGate>
  );
}
