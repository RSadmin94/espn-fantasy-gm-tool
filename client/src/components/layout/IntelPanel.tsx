import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Canonical intel / cinematic panel surface.
 * Variants map 1:1 to duplicated PANEL / PROFILE_SURFACE / SUB constants in pages.
 */
const intelPanelVariants = cva("border", {
  variants: {
    variant: {
      /** ChampionshipPath, ChampionshipDiagnosis, AcquisitionImpact — rounded-2xl gradient */
      elevated:
        "rounded-2xl border-intel-elevated bg-intel-elevated shadow-intel-panel",
      /** HallOfFame PROFILE_SURFACE — rounded-xl, same gradient family */
      profile:
        "rounded-xl border-intel-profile bg-intel-elevated shadow-intel-panel",
      /** OwnerProfiles, DraftWarRoomDesk, RivalryDossier — rounded-[15px] warm gradient */
      warm: "rounded-intel border-intel-elevated bg-intel-warm shadow-intel-panel",
      /** Standings, Roster, RivalryCenter token-hybrid — flat card, 15px radius */
      card: "rounded-intel border-border bg-card",
      /** Nested SUB panels inside intel pages */
      sub: "rounded-intel-sub border-intel-sub bg-intel-sub",
      /** LandingPage marketing panels — slightly lighter gradient */
      marketing:
        "rounded-2xl border-intel-elevated bg-intel-marketing shadow-intel-marketing",
    },
    accent: {
      none: "",
      /** HallOfFame GoldGlowCard */
      gold: "border-brand-gold/20 shadow-intel-gold",
    },
  },
  defaultVariants: {
    variant: "elevated",
    accent: "none",
  },
});

export type IntelPanelVariant = NonNullable<
  VariantProps<typeof intelPanelVariants>["variant"]
>;
export type IntelPanelAccent = NonNullable<
  VariantProps<typeof intelPanelVariants>["accent"]
>;

export type IntelPanelProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof intelPanelVariants>;

export function IntelPanel({
  className,
  variant,
  accent,
  ...props
}: IntelPanelProps) {
  return (
    <div
      data-slot="intel-panel"
      data-variant={variant}
      className={cn(intelPanelVariants({ variant, accent }), className)}
      {...props}
    />
  );
}
