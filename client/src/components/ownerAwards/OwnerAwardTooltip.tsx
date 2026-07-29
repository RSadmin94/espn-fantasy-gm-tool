import { Link } from "react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getOwnerAwardMetaByName, ownerAwardShortDescription } from "@/lib/ownerAwardsDisplay";
import { ownerAwardIcon, RARITY_COLORS } from "./ownerAwardVisuals";
import { cn } from "@/lib/utils";

export type OwnerAwardTooltipProps = {
  awardName: string;
  timesEarned?: number;
  children: React.ReactNode;
  className?: string;
};

/**
 * Consistent award hover: name, short description, times earned, click-for-details.
 */
export function OwnerAwardTooltip({
  awardName,
  timesEarned = 1,
  children,
  className,
}: OwnerAwardTooltipProps) {
  const meta = getOwnerAwardMetaByName(awardName);
  const href = meta ? `/rivals/awards/${meta.id}` : "/rivals/awards";
  const Icon = meta ? ownerAwardIcon(meta.icon) : null;
  const rarity = meta?.rarity;
  const color = rarity ? RARITY_COLORS[rarity].fg : "#f5c518";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", className)}>{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1.5 p-3 text-xs leading-relaxed">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden /> : null}
          <p className="font-bold text-zinc-100">{meta?.displayName ?? awardName}</p>
        </div>
        <p className="text-zinc-300">{ownerAwardShortDescription(awardName)}</p>
        {timesEarned > 0 ? (
          <p className="text-zinc-400">
            Current holders: <span className="font-semibold text-zinc-200">{timesEarned}</span>
          </p>
        ) : null}
        <Link to={href} className="block font-semibold text-[#a3e635] hover:underline">
          Click for details →
        </Link>
      </TooltipContent>
    </Tooltip>
  );
}
