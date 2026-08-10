import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPACE_CARD, SPACE_SECTION_Y } from "@/lib/density";
import { cn } from "@/lib/utils";
import type { GalleryUiFilter } from "@/lib/matchupGalleryUi";

export type GalleryOwnerOption = { value: string; label: string };

export function MatchupGalleryFilters({
  filter,
  owners,
  onChange,
}: {
  filter: GalleryUiFilter;
  owners: GalleryOwnerOption[];
  onChange: (next: GalleryUiFilter) => void;
}) {
  const set = (patch: Partial<GalleryUiFilter>) => onChange({ ...filter, ...patch });
  const numOrUndef = (raw: string): number | undefined => {
    const t = raw.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };
  const seasons = {
    from: filter.season != null ? filter.season : filter.seasonFrom,
    to: filter.season != null ? filter.season : filter.seasonTo,
  };
  const singleSeason = seasons.from != null && seasons.from === seasons.to ? seasons.from : undefined;

  return (
    <section data-gallery-filters className={cn("rounded-xl border border-border bg-card", SPACE_CARD, SPACE_SECTION_Y)}>
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">Filters</h2>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FilterField label="Owner">
          <Select
            value={filter.ownerName ?? "__any__"}
            onValueChange={(v) => set({ ownerName: v === "__any__" ? undefined : v })}
          >
            <SelectTrigger className="w-full" aria-label="Owner">
              <SelectValue placeholder="Any owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any owner</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Opponent">
          <Select
            value={filter.opponentName ?? "__any__"}
            onValueChange={(v) => set({ opponentName: v === "__any__" ? undefined : v })}
          >
            <SelectTrigger className="w-full" aria-label="Opponent">
              <SelectValue placeholder="Any opponent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any opponent</SelectItem>
              {owners.map((o) => (
                <SelectItem key={`opp-${o.value}`} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Season">
          <Input
            inputMode="numeric"
            aria-label="Season"
            value={singleSeason ?? ""}
            onChange={(e) => {
              const n = numOrUndef(e.target.value);
              set({ season: n, seasonFrom: n, seasonTo: n });
            }}
            placeholder="2018"
            className="text-sm"
          />
        </FilterField>

        <FilterField label="Week">
          <Input
            inputMode="numeric"
            aria-label="Week"
            value={filter.week ?? ""}
            onChange={(e) => set({ week: numOrUndef(e.target.value) })}
            placeholder="1"
            className="text-sm"
          />
        </FilterField>

        <FilterField label="Season from">
          <Input
            inputMode="numeric"
            aria-label="Season from"
            value={seasons.from ?? ""}
            onChange={(e) => {
              const n = numOrUndef(e.target.value);
              set({ season: undefined, seasonFrom: n, seasonTo: seasons.to });
            }}
            placeholder="2010"
            className="text-sm"
          />
        </FilterField>

        <FilterField label="Season to">
          <Input
            inputMode="numeric"
            aria-label="Season to"
            value={seasons.to ?? ""}
            onChange={(e) => {
              const n = numOrUndef(e.target.value);
              set({ season: undefined, seasonFrom: seasons.from, seasonTo: n });
            }}
            placeholder="2025"
            className="text-sm"
          />
        </FilterField>

        <FilterField label="Phase">
          <Select
            value={filter.phase ?? "all"}
            onValueChange={(v) => set({ phase: v as GalleryUiFilter["phase"] })}
          >
            <SelectTrigger className="w-full" aria-label="Phase">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All games</SelectItem>
              <SelectItem value="regular">Regular season</SelectItem>
              <SelectItem value="playoffs">Playoffs</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Championship only">
          <Select
            value={filter.championshipGames ? "yes" : "no"}
            onValueChange={(v) => set({ championshipGames: v === "yes" ? true : undefined })}
          >
            <SelectTrigger className="w-full" aria-label="Championship only">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no">All matchups</SelectItem>
              <SelectItem value="yes">Championship only</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Result">
          <Select
            value={filter.result ?? "any"}
            onValueChange={(v) => set({ result: v as GalleryUiFilter["result"] })}
          >
            <SelectTrigger className="w-full" aria-label="Result">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any result</SelectItem>
              <SelectItem value="win">Wins only</SelectItem>
              <SelectItem value="loss">Losses only</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Margin min">
          <Input
            inputMode="decimal"
            aria-label="Margin min"
            value={filter.marginMin ?? ""}
            onChange={(e) => set({ marginMin: numOrUndef(e.target.value), noMercy: undefined })}
            placeholder="50"
            className="text-sm"
          />
        </FilterField>

        <FilterField label="Margin max">
          <Input
            inputMode="decimal"
            aria-label="Margin max"
            value={filter.marginMax ?? ""}
            onChange={(e) => set({ marginMax: numOrUndef(e.target.value) })}
            placeholder="5"
            className="text-sm"
          />
        </FilterField>

        <FilterField label="Score min">
          <Input
            inputMode="decimal"
            aria-label="Score min"
            value={filter.scoreMin ?? ""}
            onChange={(e) => set({ scoreMin: numOrUndef(e.target.value) })}
            placeholder="200"
            className="text-sm"
          />
        </FilterField>

        <FilterField label="Score max">
          <Input
            inputMode="decimal"
            aria-label="Score max"
            value={filter.scoreMax ?? ""}
            onChange={(e) => set({ scoreMax: numOrUndef(e.target.value) })}
            placeholder="80"
            className="text-sm"
          />
        </FilterField>
      </div>
    </section>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-label font-semibold uppercase tracking-wide text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}
