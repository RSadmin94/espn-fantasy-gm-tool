/**
 * Keeper player picker dialog — search / position filter / select / round / save.
 * Persistence remains espn.setManualKeeperSelection (caller supplies onSave).
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlayerHeadshot } from "@/components/draft/PlayerHeadshot";
import { cn } from "@/lib/utils";

export type KeeperPickerCandidate = {
  ownerKey: string;
  ownerName: string;
  playerId: number;
  playerName: string;
  position: string;
  keeperRoundCost?: number;
};

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF", "D/ST", "DP"] as const;

const POS_TONE: Record<string, string> = {
  QB: "text-red-300",
  RB: "text-lime-300",
  WR: "text-violet-300",
  TE: "text-orange-300",
  K: "text-zinc-400",
  DEF: "text-violet-300",
  "D/ST": "text-violet-300",
  DP: "text-sky-300",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  ownerName: string;
  candidates: KeeperPickerCandidate[];
  initialRoundPick?: number;
  excludePlayerIds?: number[];
  saving?: boolean;
  onSave: (args: { player: KeeperPickerCandidate; keeperRoundPick: number }) => void;
};

export function KeeperPlayerPickerDialog({
  open,
  onOpenChange,
  title,
  ownerName,
  candidates,
  initialRoundPick = 0,
  excludePlayerIds = [],
  saving = false,
  onSave,
}: Props) {
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>("ALL");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [roundPick, setRoundPick] = useState(initialRoundPick);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setPos("ALL");
    setSelectedId(null);
    setRoundPick(initialRoundPick);
  }, [open, initialRoundPick]);

  const excluded = useMemo(() => new Set(excludePlayerIds), [excludePlayerIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (excluded.has(c.playerId)) return false;
      if (pos !== "ALL" && c.position.toUpperCase() !== pos) return false;
      if (!q) return true;
      return (
        c.playerName.toLowerCase().includes(q) ||
        c.position.toLowerCase().includes(q)
      );
    });
  }, [candidates, excluded, pos, search]);

  const selected = filtered.find((c) => c.playerId === selectedId) ??
    candidates.find((c) => c.playerId === selectedId) ??
    null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0"
        data-keeper-player-picker
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-lg font-black tracking-tight">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Pick a player for <span className="text-foreground font-semibold">{ownerName}</span>, choose
            the pick in their cost round, then save.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 space-y-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player…"
              className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm text-foreground"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPos(p)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide border transition-colors",
                  pos === p
                    ? "border-lime-500/50 bg-lime-500/15 text-lime-300"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {p === "ALL" ? "All" : p}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span className="font-bold uppercase tracking-wider text-[11px]">Pick in cost round</span>
            <select
              value={roundPick}
              onChange={(e) => setRoundPick(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
            >
              <option value={0}>Auto (later / less valuable pick)</option>
              <option value={1}>1st pick in round</option>
              <option value={2}>2nd pick in round</option>
              <option value={3}>3rd pick in round</option>
            </select>
          </label>
          {selected ? (
            <div className="rounded-lg border border-lime-500/30 bg-lime-500/10 px-3 py-2.5 flex items-center gap-3">
              <PlayerHeadshot
                variant="hdCompact"
                player={{ id: selected.playerId, name: selected.playerName, position: selected.position }}
              />
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground truncate">{selected.playerName}</p>
                <p className="text-xs text-muted-foreground">
                  <span className={cn("font-bold uppercase", POS_TONE[selected.position] ?? "")}>
                    {selected.position}
                  </span>
                  {selected.keeperRoundCost != null ? ` · Cost Rd ${selected.keeperRoundCost}` : ""}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[40vh] divide-y divide-border/60">
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground text-center italic">
              No matching players on this roster.
            </p>
          ) : (
            filtered.map((c) => {
              const active = selectedId === c.playerId;
              return (
                <button
                  key={c.playerId}
                  type="button"
                  onClick={() => setSelectedId(c.playerId)}
                  className={cn(
                    "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                    active ? "bg-lime-500/10" : "hover:bg-white/[0.03]",
                  )}
                >
                  <PlayerHeadshot
                    variant="hdCompact"
                    player={{ id: c.playerId, name: c.playerName, position: c.position }}
                  />
                  <span className="font-bold text-sm text-foreground truncate flex-1">{c.playerName}</span>
                  <span className={cn("text-xs font-bold uppercase", POS_TONE[c.position] ?? "text-zinc-400")}>
                    {c.position}
                  </span>
                  {c.keeperRoundCost != null ? (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      Rd {c.keeperRoundCost}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter className="px-5 py-4 border-t border-border shrink-0 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || saving}
            onClick={() => {
              if (!selected) return;
              onSave({ player: selected, keeperRoundPick: roundPick });
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-lime-500/50 bg-lime-500/20 px-5 py-2.5 text-sm font-black text-lime-200 hover:bg-lime-500/30 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Keeper
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
