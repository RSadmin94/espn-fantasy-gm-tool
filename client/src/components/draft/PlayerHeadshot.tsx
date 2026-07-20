/**
 * Draft War Room headshot — circle thumbs (ESPN-first) or HD tiles (Sleeper-first full).
 * Presentation only; does not touch ingest/notify/identity cascade.
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getPlayerHeadshotCandidates } from "@shared/playerIdentityLookup";

const POS_TONE: Record<string, string> = {
  QB: "text-red-300",
  RB: "text-lime-300",
  WR: "text-violet-300",
  TE: "text-orange-300",
  K: "text-zinc-300",
  DEF: "text-violet-300",
  DST: "text-violet-300",
  DP: "text-fuchsia-300",
};

export type PlayerHeadshotPlayer = {
  espnPlayerId?: string | number | null;
  espnId?: string | number | null;
  playerId?: string | number | null;
  id?: string | number | null;
  sleeperPlayerId?: string | null;
  name?: string | null;
  playerName?: string | null;
  position?: string | null;
  nflTeam?: string | null;
};

type CircleSize = "xs" | "sm" | "md";

const CIRCLE_SIZE: Record<CircleSize, string> = {
  xs: "w-5 h-5 text-[8px]",
  sm: "w-7 h-7 text-[9px]",
  md: "w-9 h-9 text-[10px]",
};

/** Sleeper full cutout + helmet background (rectangular). */
const HD_SIZE = {
  /** List rows, recent picks, pool — matches Board Mirror ~88×66 */
  hd: "w-[88px] h-[66px] text-[11px]",
  /** Draft board grid cells, tight roster chips */
  hdCompact: "w-16 h-12 text-[9px]",
  /** Player Database rows */
  hdLg: "w-[110px] h-[84px] text-[12px]",
} as const;

function initialsFromName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

type Props = {
  player: PlayerHeadshotPlayer;
  /** circle = ESPN-first thumb (default); hd* = Sleeper-first full rectangular tile */
  variant?: "circle" | "hd" | "hdCompact" | "hdLg";
  /** circle variant box size */
  size?: CircleSize;
  className?: string;
};

export function PlayerHeadshot({
  player,
  variant = "circle",
  size = "sm",
  className,
}: Props) {
  const name = String(player.playerName ?? player.name ?? "").trim() || "?";
  const pos = String(player.position ?? "?").toUpperCase();
  const isHd = variant !== "circle";
  const candidates = useMemo(
    () =>
      isHd
        ? getPlayerHeadshotCandidates(player, "full", { prefer: "sleeper" })
        : getPlayerHeadshotCandidates(player, "thumb"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      variant,
      player.espnPlayerId,
      player.espnId,
      player.playerId,
      player.id,
      player.sleeperPlayerId,
      player.name,
      player.playerName,
      player.position,
      player.nflTeam,
    ],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
  }, [candidates]);

  const src = candidates[idx] ?? null;
  const tone = POS_TONE[pos] ?? "text-zinc-400";
  const box = isHd ? HD_SIZE[variant] : CIRCLE_SIZE[size];
  const shape = isHd ? "rounded-md" : "rounded-full";

  if (!src || idx >= candidates.length) {
    return (
      <div
        className={cn(
          "flex items-center justify-center font-bold shrink-0 border border-zinc-700 bg-zinc-800/80",
          shape,
          box,
          tone,
          className,
        )}
        aria-hidden
        data-player-headshot="initials"
        data-player-headshot-variant={variant}
        title={name}
      >
        {initialsFromName(name)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden shrink-0 bg-zinc-800 border border-zinc-700/60",
        shape,
        box,
        className,
      )}
      data-player-headshot="img"
      data-player-headshot-variant={variant}
      title={name}
    >
      <img
        key={src}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover object-[center_18%]"
        onError={() => setIdx((i) => i + 1)}
      />
    </div>
  );
}
