import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ShareCardModel } from "@shared/historicalShareCard";
import { HistoricalShareCardModal } from "./HistoricalShareCardModal";

export function HistoricalShareCardButton({
  model,
  label = "Share Card",
  className,
  children,
}: {
  model: ShareCardModel;
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-share-card-open
        data-share-card-type={model.type}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted/40",
          className,
        )}
      >
        {children ?? label}
      </button>
      <HistoricalShareCardModal open={open} onOpenChange={setOpen} model={model} />
    </>
  );
}
