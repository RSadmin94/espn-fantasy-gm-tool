import { useState, type ReactNode } from "react";
import { UpgradeDialog } from "@/components/commercial/UpgradeDialog";

/**
 * Opens the Monthly/Annual picker before Stripe Checkout.
 * Use this instead of calling createCheckoutSession with a hardcoded annual interval.
 */
export function useUpgradeDialog(opts?: { title?: string; description?: string }) {
  const [open, setOpen] = useState(false);
  const dialog: ReactNode = (
    <UpgradeDialog
      open={open}
      onOpenChange={setOpen}
      title={opts?.title}
      description={opts?.description}
    />
  );
  return {
    openUpgrade: () => setOpen(true),
    upgradeDialog: dialog,
  };
}
