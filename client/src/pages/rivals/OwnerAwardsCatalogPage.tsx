/**
 * Browsable Award Catalog — /rivals/awards
 */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Award, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import {
  buildAwardCatalog,
  filterAndSortCatalog,
  OWNER_AWARD_CATEGORIES,
  OWNER_AWARD_RARITIES,
  type CatalogSort,
  type OwnerAwardCategory,
  type OwnerAwardRarity,
} from "@/lib/ownerAwardsDisplay";
import { CinematicPageHeader, IntelPageShell, IntelPanel, SectionLoading } from "@/components/layout";
import { ownerAwardIcon, rarityCardStyle, RARITY_COLORS } from "@/components/ownerAwards/ownerAwardVisuals";
import { OwnerAwardTooltip } from "@/components/ownerAwards/OwnerAwardTooltip";
import { cn } from "@/lib/utils";

export function OwnerAwardsCatalogPage() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const listQ = (trpc as any).owners.ownerList.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<OwnerAwardCategory | "all">("all");
  const [rarity, setRarity] = useState<OwnerAwardRarity | "all">("all");
  const [sort, setSort] = useState<CatalogSort>("catalog_order");

  const catalog = useMemo(
    () => buildAwardCatalog((listQ.data?.ownerAwards ?? []) as any[]),
    [listQ.data?.ownerAwards],
  );
  const rows = useMemo(
    () => filterAndSortCatalog(catalog, { search, category, rarity, sort }),
    [catalog, search, category, rarity, sort],
  );
  const filtersDirty =
    search.trim() !== "" || category !== "all" || rarity !== "all" || sort !== "catalog_order";

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setRarity("all");
    setSort("catalog_order");
  }

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default">
      <CinematicPageHeader
        eyebrowMono="Rivals · Awards"
        icon={Award}
        title="Award Catalog"
        subtitle="Every Owner Award — what it means, who holds it, and how rare it is."
        className="mb-5"
      />

      <IntelPanel variant="warm" className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search awards</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search awards or holders…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#a3e635]/40 focus:outline-none"
            />
          </label>
          <FilterSelect
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as OwnerAwardCategory | "all")}
            options={[{ value: "all", label: "All categories" }, ...OWNER_AWARD_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
          <FilterSelect
            label="Rarity"
            value={rarity}
            onChange={(v) => setRarity(v as OwnerAwardRarity | "all")}
            options={[{ value: "all", label: "All rarities" }, ...OWNER_AWARD_RARITIES.map((r) => ({ value: r, label: r }))]}
          />
          <FilterSelect
            label="Sort"
            value={sort}
            onChange={(v) => setSort(v as CatalogSort)}
            options={[
              { value: "catalog_order", label: "Catalog order" },
              { value: "alphabetical", label: "Alphabetical" },
              { value: "most_earned", label: "Most earned" },
              { value: "rarest", label: "Rarest" },
            ]}
          />
          {filtersDirty ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-white/10 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-300 transition hover:bg-white/[0.06]"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </IntelPanel>

      {!ready || listQ.isLoading ? (
        <SectionLoading message="Loading awards…" />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No awards match these filters.</p>
      ) : (
        <ul className="space-y-2" role="list">
          {rows.map((row) => {
            const Icon = ownerAwardIcon(row.meta.icon);
            const colors = RARITY_COLORS[row.meta.rarity];
            return (
              <li key={row.meta.id}>
                <OwnerAwardTooltip
                  awardName={row.meta.awardName}
                  timesEarned={row.holdersCount}
                >
                  <Link
                    to={`/rivals/awards/${row.meta.id}`}
                    className="flex items-start gap-3 rounded-xl border p-4 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635]/70"
                    style={rarityCardStyle(row.meta.rarity)}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                      style={{ borderColor: colors.border, background: colors.bg, color: colors.fg }}
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-zinc-50">{row.meta.displayName}</span>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", colors.chip)}>
                          {row.meta.rarity}
                        </span>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
                          {row.meta.category}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-zinc-400">
                        {row.meta.shortDescription}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-500">
                        <span>
                          Holders:{" "}
                          <strong className="text-zinc-300">{row.holdersCount}</strong>
                        </span>
                        <span>
                          Current:{" "}
                          <strong className="text-zinc-300">
                            {row.currentHolderName ?? "—"}
                          </strong>
                        </span>
                      </span>
                    </span>
                  </Link>
                </OwnerAwardTooltip>
              </li>
            );
          })}
        </ul>
      )}
    </IntelPageShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block min-w-[9rem]">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-zinc-100 focus:border-[#a3e635]/40 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
