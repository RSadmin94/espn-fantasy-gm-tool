import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PRODUCT_TOUR_STEPS, type ProductTourStepId } from "@/lib/productOnboarding";
import { cn } from "@/lib/utils";

export function ProductTour({
  open,
  initialStepId,
  onOpenChange,
  onComplete,
  onSkip,
}: {
  open: boolean;
  initialStepId?: ProductTourStepId;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const navigate = useNavigate();
  const initialIndex = initialStepId
    ? Math.max(0, PRODUCT_TOUR_STEPS.findIndex((s) => s.id === initialStepId))
    : 0;
  const [stepIndex, setStepIndex] = useState(initialIndex);

  useEffect(() => {
    if (!open) return;
    const idx = initialStepId
      ? Math.max(0, PRODUCT_TOUR_STEPS.findIndex((s) => s.id === initialStepId))
      : 0;
    setStepIndex(idx);
  }, [open, initialStepId]);

  const step = PRODUCT_TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === PRODUCT_TOUR_STEPS.length - 1;

  const goTo = (next: number) => {
    setStepIndex(Math.min(PRODUCT_TOUR_STEPS.length - 1, Math.max(0, next)));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) onSkip();
    onOpenChange(next);
  };

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg border-border bg-card text-foreground">
        <DialogHeader>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Step {stepIndex + 1} of {PRODUCT_TOUR_STEPS.length}
          </p>
          <DialogTitle className="text-xl font-black">{step.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {step.lead}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Highlights</p>
          <ul className="mt-2 space-y-1.5">
            {step.highlights.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          {PRODUCT_TOUR_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === stepIndex ? "w-6 bg-lime-400" : "w-1.5 bg-muted-foreground/40",
              )}
              aria-hidden
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" disabled={isFirst} onClick={() => goTo(stepIndex - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigate(step.href);
              }}
            >
              Visit {step.title}
            </Button>
            {isLast ? (
              <Button
                type="button"
                size="sm"
                className="bg-lime-500 font-semibold text-black hover:bg-lime-400"
                onClick={() => {
                  onComplete();
                  onOpenChange(false);
                }}
              >
                Finish tour
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="bg-lime-500 font-semibold text-black hover:bg-lime-400"
                onClick={() => goTo(stepIndex + 1)}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
