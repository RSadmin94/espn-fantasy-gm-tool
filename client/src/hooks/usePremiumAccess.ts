import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";

/** Client-side mirror of billing entitlement — presentation gating only. */
export function usePremiumAccess() {
  const { authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const enabled = Boolean(authLoaded && userLoaded && isSignedIn);
  const subQ = trpc.billing.getSubscriptionStatus.useQuery(undefined, { enabled });
  const sub = subQ.data;
  return {
    hasAccess: sub?.hasAccess ?? false,
    isLoading: enabled && subQ.isLoading,
    status: sub?.status ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  };
}
