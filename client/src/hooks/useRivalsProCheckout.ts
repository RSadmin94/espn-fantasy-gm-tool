import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { setSessionUnlocked } from "@/lib/rivalsProSessionUnlock";
import type { CheckoutInterval } from "@/lib/billingInterval";

export type { CheckoutInterval };
export type CheckoutOptions = {
  interval: CheckoutInterval;
};

/** Shared Rivals checkout — interval must be chosen explicitly before Stripe opens. */
export function useRivalsProCheckout() {
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

  const startCheckout = async (opts: CheckoutOptions) => {
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
      interval: opts.interval,
    });
  };

  return { startCheckout, isPending: checkout.isPending || claimSession.isPending };
}
