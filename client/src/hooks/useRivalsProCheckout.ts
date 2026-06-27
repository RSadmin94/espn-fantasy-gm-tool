import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** Shared Rivals Pro checkout — used by pricing surfaces and upgrade dialog. */
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

  const startCheckout = () => {
    if (typeof window === "undefined") return;
    checkout.mutate({ origin: window.location.origin });
  };

  return { startCheckout, isPending: checkout.isPending };
}
