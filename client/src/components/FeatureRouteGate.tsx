import type { ReactNode } from "react";
import { getFeatureByRoute } from "@/lib/featureRegistry";
import { usePremiumAccess } from "@/hooks/usePremiumAccess";
import { FeatureLockedPage } from "@/components/FeatureLockedPage";
import { PageLoading } from "@/components/layout";

type FeatureRouteGateProps = {
  route: string;
  children: ReactNode;
};

/**
 * Presentation guard for pro routes — blocks child mount (and data fetches) until
 * entitlement is confirmed. Server-side gating remains authoritative.
 */
export function FeatureRouteGate({ route, children }: FeatureRouteGateProps) {
  const feature = getFeatureByRoute(route);
  const { hasAccess, isLoading } = usePremiumAccess();

  if (!feature || feature.requiredPlan === "free") {
    return <>{children}</>;
  }

  if (isLoading) {
    return <PageLoading message="Checking access…" />;
  }

  if (!hasAccess) {
    return <FeatureLockedPage feature={feature} />;
  }

  return <>{children}</>;
}
