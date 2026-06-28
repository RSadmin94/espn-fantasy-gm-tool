import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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

  const startCheckout = (overrides: CheckoutOptions = {}) => {
    if (typeof window === "undefined") return;
    checkout.mutate({
      origin: window.location.origin,
      plan: overrides.plan ?? defaults.plan ?? "rivals",
      interval: overrides.interval ?? defaults.interval ?? "year",
      upgradeToLeagueAnnual: overrides.upgradeToLeagueAnnual ?? defaults.upgradeToLeagueAnnual,
    });
  };

  return { startCheckout, isPending: checkout.isPending };
}
