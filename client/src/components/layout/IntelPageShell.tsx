import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Width tiers used across intel / admin pages.
 * narrow  → Settings, LeagueSettings (max-w-2xl)
 * standard → Trades, Commissioner, HoF (max-w-5xl / max-w-6xl)
 * wide    → Dashboard, Championship, Acquisition (max-w-[1400px])
 * diagnosis → Championship Diagnosis only (max-w-[1200px])
 */
const widthClasses = {
  narrow: "mx-auto max-w-2xl",
  medium: "mx-auto max-w-5xl",
  standard: "mx-auto max-w-6xl",
  wide: "mx-auto max-w-[1400px]",
  diagnosis: "mx-auto max-w-[1200px]",
  full: "w-full",
} as const;

export type IntelPageWidth = keyof typeof widthClasses;

/**
 * Background presets matching duplicated PAGEBG constants.
 * All use theme tokens — no hard-coded hex in the shell.
 */
const backgroundClasses = {
  /** Championship, HoF, Acquisition — purple radial + cinematic base */
  cinematic:
    "bg-intel-page-cinematic text-foreground",
  /** Rivalry, Standings, Dynasty — purple radial over theme background */
  "cinematic-token":
    "bg-intel-page-cinematic-token text-foreground",
  /** Commissioner — purple + green radial accents */
  "cinematic-commissioner":
    "bg-intel-page-cinematic-commissioner text-foreground",
  /** TheCast, Claim, ReceiptShare — gold + purple radial */
  "cinematic-gold": "bg-intel-page-cinematic-gold text-foreground",
  /** OwnerProfiles */
  "cinematic-owner": "bg-intel-page-cinematic-owner text-foreground",
  /** DraftWarRoom */
  "cinematic-draft": "bg-intel-page-cinematic-draft text-foreground",
  /** LeagueWire */
  "cinematic-wire": "bg-intel-page-cinematic-wire text-foreground",
  /** LandingPage marketing */
  landing: "bg-intel-page-landing text-foreground",
  /** Inherit AppShell background */
  none: "bg-background text-foreground",
} as const;

export type IntelPageBackground = keyof typeof backgroundClasses;

const shellVariants = cva("", {
  variants: {
    bleed: {
      true: "-m-4 md:-m-6",
      false: "",
    },
    padding: {
      default: "p-5 md:p-7",
      compact: "px-4 py-6 sm:px-6",
      diagnosis: "px-6 py-6",
      none: "",
    },
    minHeight: {
      full: "min-h-full",
      screen: "min-h-screen w-full",
      none: "",
    },
  },
  defaultVariants: {
    bleed: false,
    padding: "default",
    minHeight: "full",
  },
});

export type IntelPageShellProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof shellVariants> & {
    /** Inner content width constraint */
    width?: IntelPageWidth;
    /** Page background preset */
    background?: IntelPageBackground;
    /** Optional inline style merged onto the outer shell (escape hatch for migration) */
    style?: CSSProperties;
    children: ReactNode;
  };

/**
 * Shared page shell for intel / cinematic pages.
 * Owns bleed, padding, background, and inner width tier.
 */
export function IntelPageShell({
  className,
  bleed,
  padding,
  minHeight,
  width = "full",
  background = "none",
  style,
  children,
  ...props
}: IntelPageShellProps) {
  const innerWidth = width !== "full" ? widthClasses[width] : undefined;

  return (
    <div
      data-slot="intel-page-shell"
      data-background={background}
      className={cn(
        shellVariants({ bleed, padding, minHeight }),
        backgroundClasses[background],
        className,
      )}
      style={style}
      {...props}
    >
      {innerWidth ? (
        <div className={cn(innerWidth, "space-y-6")}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
