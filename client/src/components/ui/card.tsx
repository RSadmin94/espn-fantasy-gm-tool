import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Canonical affordance for clickable card/card-like surfaces. Compose this onto
 * any element that has an onClick/navigation so it reads as interactive:
 * pointer cursor, hover lift, active press, and a keyboard focus-visible ring.
 * Purely additive — safe to merge via `cn()` alongside existing styling.
 */
export const interactiveCardClasses =
  "cursor-pointer transition-all duration-150 hover:border-ring/60 hover:shadow-md active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Card({
  className,
  interactive,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  style,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  // A card is keyboard-activatable only when it is interactive AND has a click handler.
  const clickable = Boolean(interactive) && typeof onClick === "function";
  const baseStyle: React.CSSProperties = {
    background: "linear-gradient(145deg, oklch(0.155 0.022 300) 0%, oklch(0.135 0.018 300) 100%)",
    boxShadow: "0 0 0 1px color-mix(in oklch, oklch(0.96 0.006 300) 7%, transparent), 0 1px 4px oklch(0.04 0.010 300 / 0.50)",
  };
  return (
    <div
      data-slot="card"
      className={cn(
        "text-card-foreground flex flex-col gap-6 rounded-xl border py-6",
        interactive && interactiveCardClasses,
        className
      )}
      style={{ ...baseStyle, ...style }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.currentTarget.click();
        }
        onKeyDown?.(e);
      }}
      role={role ?? (clickable ? "button" : undefined)}
      tabIndex={tabIndex ?? (clickable ? 0 : undefined)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
