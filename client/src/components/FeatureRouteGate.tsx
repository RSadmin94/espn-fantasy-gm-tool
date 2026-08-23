import type { ReactNode } from "react";
import { getFeatureByRoute } from "@/lib/featureRegistry";
import { usePremiumAccess } from "@/hooks/usePremiumAccess";
import { FeatureLockedPage } from "@/components/FeatureLockedPage";
import { PageLoading } from "@/components/layout";
import { trpc } from "@/lib/trpc";

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
  const sessionQ = trpc.me.session.useQuery();
  const blockedReason = feature ? sessionQ.data?.blockedFeatures?.[feature.id] : undefined;

  if (!feature) return <>{children}</>;
  if (blockedReason) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-muted-foreground">
        {blockedReason}
      </div>
    );
  }
  if (feature.requiredPlan === "free") {
    return <>{children}</>;
  }

  if (isLoading) {
    return <PageLoading message="Checking access…" />;
  }

  if (blockedReason) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-muted-foreground">
        {blockedReason}
      </div>
    );
  }

  if (!hasAccess) {
    return <FeatureLockedPage feature={feature} />;
  }

  return <>{children}</>;
}
