import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { setSessionUnlocked } from "@/lib/rivalsProSessionUnlock";

export type CheckoutPlan = "rivals" | "league";
export type CheckoutInterval = "month" | "year";

export type CheckoutOptions = {
  plan?: CheckoutPlan;
  interval?: CheckoutInterval;
  upgradeToLeagueAnnual?: boolean;
};

/** Shared tier checkout — defaults to Rivals annual (primary free conversion path). */
export function useRivalsProCheckout(defaults: CheckoutOptions = {}) {
  const checkout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (r) => {
      if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else toast.error("Checkout did not return a link. Try again or contact support.");
    },
    onError: (err) => {
      toast.error(err.message || "Could not start checkout. Please try again.");
    },
  });

  // Already-entitled accounts (founder whitelist / claimed founder owner) get a
  // server-verified session unlock instead of being sent to Stripe.
  const claimSession = trpc.billing.claimSessionAccess.useMutation();

  const startCheckout = async (overrides: CheckoutOptions = {}) => {
    if (typeof window === "undefined") return;
    try {
      const res = await claimSession.mutateAsync();
      if (res?.granted) {
        setSessionUnlocked(true);
        toast.success("Rivals Pro unlocked for this session.");
        return;
      }
    } catch {
      // Entitlement check failed — fall through to normal checkout.
    }
    checkout.mutate({
      origin: window.location.origin,
      plan: overrides.plan ?? defaults.plan ?? "rivals",
      interval: overrides.interval ?? defaults.interval ?? "year",
      upgradeToLeagueAnnual: overrides.upgradeToLeagueAnnual ?? defaults.upgradeToLeagueAnnual,
    });
  };

  return { startCheckout, isPending: checkout.isPending || claimSession.isPending };
}
