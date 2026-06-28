import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { useSessionUnlock } from "@/lib/rivalsProSessionUnlock";

/** Client-side mirror of billing entitlement — presentation gating only. */
export function usePremiumAccess() {
  const { authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const enabled = Boolean(authLoaded && userLoaded && isSignedIn);
  const subQ = trpc.billing.getSubscriptionStatus.useQuery(undefined, { enabled });
  const sub = subQ.data;
  // Founder/owner session unlock: an entitled account that clicked "Unlock
  // Rivals Pro" is treated as full access for the session (until sign-out).
  const sessionUnlocked = useSessionUnlock();
  return {
    hasAccess: (sub?.hasAccess ?? false) || (isSignedIn && sessionUnlocked),
    isLoading: enabled && subQ.isLoading,
    status: sub?.status ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  };
}
