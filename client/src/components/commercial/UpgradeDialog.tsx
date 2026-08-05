import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { COMMERCIAL } from "@/lib/commercialCopy";
import { BILLING_COPY, type CheckoutInterval } from "@/lib/billingInterval";
import { cn } from "@/lib/utils";
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

/**
 * Monthly vs Annual choice. Selection is visual only until the matching CTA fires —
 * each CTA opens Stripe Checkout with exactly one Price (never both).
 */
function IntervalChoice({
  value,
  onChange,
  onCheckout,
  pending,
}: {
  value: CheckoutInterval;
  onChange: (next: CheckoutInterval) => void;
  onCheckout: (interval: CheckoutInterval) => void;
  pending: boolean;
}) {
  const card = (
    interval: CheckoutInterval,
    title: string,
    priceLine: string,
    detail?: string,
    badge?: string,
  ) => {
    const selected = value === interval;
    return (
      <button
        type="button"
        onClick={() => onChange(interval)}
        aria-pressed={selected}
        className={cn(
          "relative flex flex-col items-start rounded-lg border px-3 py-3 text-left transition-colors",
          selected
            ? "border-primary bg-primary/10 ring-2 ring-primary/40"
            : "border-border/60 bg-muted/20 hover:border-primary/40",
        )}
      >
        {badge ? (
          <span className="absolute right-2 top-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            {badge}
          </span>
        ) : null}
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </span>
        <span className="mt-1 text-lg font-black text-foreground">{priceLine}</span>
        {detail ? (
          <span className="mt-1 text-[11px] font-semibold text-muted-foreground">{detail}</span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {card(
          "monthly",
          BILLING_COPY.monthlyLabel,
          BILLING_COPY.monthlyPriceLabel,
        )}
        {card(
          "annual",
          BILLING_COPY.annualLabel,
          BILLING_COPY.annualPriceLabel,
          `${BILLING_COPY.annualEquivalentLabel} · ${BILLING_COPY.annualSavingsLabel}`,
          "Best value",
        )}
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          variant={value === "annual" ? "default" : "outline"}
          className="w-full font-extrabold"
          disabled={pending}
          onClick={() => onCheckout("annual")}
        >
          {pending && value === "annual"
            ? COMMERCIAL.upgradeCtaPending
            : BILLING_COPY.annualCta}
        </Button>
        <Button
          type="button"
          variant={value === "monthly" ? "default" : "outline"}
          className="w-full font-extrabold"
          disabled={pending}
          onClick={() => onCheckout("monthly")}
        >
          {pending && value === "monthly"
            ? COMMERCIAL.upgradeCtaPending
            : BILLING_COPY.monthlyCta}
        </Button>
      </div>
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
  const [billingInterval, setBillingInterval] = useState<CheckoutInterval>("annual");

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

      <IntervalChoice
        value={billingInterval}
        onChange={setBillingInterval}
        pending={isPending}
        onCheckout={(interval) => {
          setBillingInterval(interval);
          void startCheckout({ interval });
        }}
      />
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
