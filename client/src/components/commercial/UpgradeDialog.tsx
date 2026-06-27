import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { COMMERCIAL } from "@/lib/commercialCopy";
import { useRivalsProCheckout } from "@/hooks/useRivalsProCheckout";
import { RivalsProPricingFeatures } from "@/components/commercial/RivalsProPricingFeatures";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type UpgradeDialogProps = {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional headline override — defaults to Rivals Pro product name. */
  title?: string;
  description?: string;
};

export function UpgradeDialog({
  trigger,
  open,
  onOpenChange,
  title = COMMERCIAL.productName,
  description = COMMERCIAL.subscriptionRequiredMessage,
}: UpgradeDialogProps) {
  const { startCheckout, isPending } = useRivalsProCheckout();

  const body = (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <Lock className="h-5 w-5 text-primary" />
          {title}
        </DialogTitle>
        <DialogDescription className="text-left">{description}</DialogDescription>
      </DialogHeader>

      <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-4">
        <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {COMMERCIAL.launchPricingLine}
        </p>
        <RivalsProPricingFeatures variant="condensed" />
      </div>

      <Button
        type="button"
        className="mt-4 w-full font-extrabold"
        onClick={startCheckout}
        disabled={isPending}
      >
        {isPending ? COMMERCIAL.upgradeCtaPending : "Unlock Rivals Pro"}
      </Button>
    </>
  );

  if (open != null && onOpenChange) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">{body}</DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">{body}</DialogContent>
    </Dialog>
  );
}
