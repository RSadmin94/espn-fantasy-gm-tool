import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { COMMERCIAL } from "@/lib/commercialCopy";
import { cn } from "@/lib/utils";
import { useRivalsProCheckout, type CheckoutInterval } from "@/hooks/useRivalsProCheckout";
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

/** Monthly / annual selector. Annual is the default (primary conversion path). */
function IntervalChoice({
  value,
  onChange,
}: {
  value: CheckoutInterval;
  onChange: (next: CheckoutInterval) => void;
}) {
  const option = (
    interval: CheckoutInterval,
    label: string,
    price: string,
    suffix: string,
    badge?: string,
  ) => {
    const selected = value === interval;
    return (
      <button
        type="button"
        onClick={() => onChange(interval)}
        aria-pressed={selected}
        className={cn(
          "relative flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors",
          selected
            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
            : "border-border/60 bg-muted/20 hover:border-primary/40",
        )}
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 text-lg font-black text-foreground">
          {price}
          <span className="text-xs font-semibold text-muted-foreground">{suffix}</span>
        </span>
        {badge ? (
          <span className="mt-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            {badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {option("year", "Annual", COMMERCIAL.rivalsAnnualPrice, " / yr", "Best value")}
      {option("month", "Monthly", COMMERCIAL.rivalsMonthlyPrice, " / mo")}
    </div>
  );
}

export function UpgradeDialog({
  trigger,
  open,
  onOpenChange,
  title = COMMERCIAL.productName,
  description = COMMERCIAL.subscriptionRequiredMessage,
}: UpgradeDialogProps) {
  const { startCheckout, isPending } = useRivalsProCheckout();
  const [billingInterval, setBillingInterval] = useState<CheckoutInterval>("year");

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
          {COMMERCIAL.foundingOfferLabel}
        </p>
        <RivalsProPricingFeatures variant="condensed" />
      </div>

      <IntervalChoice value={billingInterval} onChange={setBillingInterval} />

      <Button
        type="button"
        className="mt-4 w-full font-extrabold"
        onClick={() => startCheckout({ interval: billingInterval })}
        disabled={isPending}
      >
        {isPending ? COMMERCIAL.upgradeCtaPending : COMMERCIAL.upgradeCta}
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
