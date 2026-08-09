import { cn } from "@/lib/utils";
import { SPACE_CHIP, SPACE_CHIP_GAP } from "@/lib/density";
import {
  GALLERY_PRESETS,
  type GalleryPresetId,
  type GalleryUiFilter,
  activeGalleryPreset,
} from "@/lib/matchupGalleryUi";

export function MatchupGalleryPresets({
  filter,
  isNoMercyRoute,
  onSelect,
}: {
  filter: GalleryUiFilter;
  isNoMercyRoute?: boolean;
  onSelect: (id: GalleryPresetId) => void;
}) {
  const active = activeGalleryPreset(filter, isNoMercyRoute);
  return (
    <section data-gallery-presets aria-label="Quick presets">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        Quick presets
      </h2>
      <div className={cn("flex flex-wrap", SPACE_CHIP_GAP)}>
        {GALLERY_PRESETS.map((preset) => {
          const isActive = active === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-preset={preset.id}
              aria-pressed={isActive}
              onClick={() => onSelect(preset.id)}
              className={cn(
                "inline-flex h-9 items-center rounded-md text-sm font-semibold",
                SPACE_CHIP,
                isActive
                  ? preset.id === "no-mercy"
                    ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/40"
                    : "bg-primary/15 text-primary ring-1 ring-primary/40"
                  : "border border-border text-foreground hover:bg-muted/40",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
