/**
 * Draft War Room headshot — ESPN-first, Sleeper fallback, initials if neither.
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

type SizePreset = "xs" | "sm" | "md";

const SIZE_CLASS: Record<SizePreset, string> = {
  xs: "w-5 h-5 text-[8px]",
  sm: "w-7 h-7 text-[9px]",
  md: "w-9 h-9 text-[10px]",
};

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
  /** Visual box size for list/cell contexts (always uses CDN thumb URLs). */
  size?: SizePreset;
  className?: string;
};

export function PlayerHeadshot({ player, size = "sm", className }: Props) {
  const name = String(player.playerName ?? player.name ?? "").trim() || "?";
  const pos = String(player.position ?? "?").toUpperCase();
  const candidates = useMemo(
    () => getPlayerHeadshotCandidates(player, "thumb"),
    // Intentionally key on identity fields only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
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
  const box = SIZE_CLASS[size];
  const tone = POS_TONE[pos] ?? "text-zinc-400";

  if (!src) {
    return (
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold shrink-0 border border-zinc-700 bg-zinc-800/80",
          box,
          tone,
          className,
        )}
        aria-hidden
        data-player-headshot="initials"
        title={name}
      >
        {initialsFromName(name)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden shrink-0 bg-zinc-800 border border-zinc-700/60",
        box,
        className,
      )}
      data-player-headshot="img"
      title={name}
    >
      <img
        key={src}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover object-top"
        onError={() => setIdx((i) => i + 1)}
      />
    </div>
  );
}
