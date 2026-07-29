import type { CSSProperties } from "react";
import {
  Award,
  Crown,
  Flame,
  Ghost,
  Handshake,
  Medal,
  Skull,
  Swords,
  ThumbsDown,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { OwnerAwardIconName, OwnerAwardRarity } from "@shared/ownerAwardMeta";

export const OWNER_AWARD_ICON_MAP: Record<OwnerAwardIconName, LucideIcon> = {
  trophy: Trophy,
  medal: Medal,
  sword: Swords,
  drafting: Award,
  "thumbs-down": ThumbsDown,
  crown: Crown,
  zap: Zap,
  handshake: Handshake,
  flame: Flame,
  ghost: Ghost,
  skull: Skull,
};

export function ownerAwardIcon(name: OwnerAwardIconName): LucideIcon {
  return OWNER_AWARD_ICON_MAP[name] ?? Award;
}

export const RARITY_COLORS: Record<
  OwnerAwardRarity,
  { fg: string; bg: string; border: string; chip: string }
> = {
  Legendary: {
    fg: "#f5c518",
    bg: "rgba(245,197,24,0.12)",
    border: "rgba(245,197,24,0.35)",
    chip: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  },
  Epic: {
    fg: "#c084fc",
    bg: "rgba(192,132,252,0.12)",
    border: "rgba(192,132,252,0.35)",
    chip: "text-purple-300 border-purple-400/40 bg-purple-400/10",
  },
  Rare: {
    fg: "#38bdf8",
    bg: "rgba(56,189,248,0.12)",
    border: "rgba(56,189,248,0.35)",
    chip: "text-sky-300 border-sky-400/40 bg-sky-400/10",
  },
  Common: {
    fg: "#a3e635",
    bg: "rgba(163,230,53,0.10)",
    border: "rgba(163,230,53,0.30)",
    chip: "text-lime-300 border-lime-400/40 bg-lime-400/10",
  },
};

export function rarityCardStyle(rarity: OwnerAwardRarity): CSSProperties {
  const c = RARITY_COLORS[rarity];
  return {
    borderColor: c.border,
    background: `linear-gradient(165deg, ${c.bg}, rgba(255,255,255,0.02))`,
  };
}
