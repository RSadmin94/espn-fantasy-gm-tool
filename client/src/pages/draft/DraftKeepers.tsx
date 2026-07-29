/**
 * Canonical `/draft/keepers` — Keeper Center.
 * Keeper Manager = existing KeeperAdvisor UI (valuation / keep toggles), renamed in display only.
 * Forecast = read-only outlook.
 * League Keepers = former Manage panel (KeeperManagePanel) — retained in code, hidden from nav.
 */
import { useMemo, useState } from "react";
import { Crown, ListChecks, Brain } from "lucide-react";
import { LeagueKeeperForecast } from "@/pages/LeagueKeeperForecast";
import { KeeperAdvisor } from "@/pages/KeeperAdvisor";
import { KeeperManagePanel } from "@/components/keepers/KeeperManagePanel";
import { CinematicPageHeader, IntelPageShell } from "@/components/layout";
import { cn } from "@/lib/utils";

type KeeperTab = "manager" | "forecast";

/** Visible Keeper Center tabs. */
const TABS: { id: KeeperTab; label: string; hint: string; icon: typeof ListChecks }[] = [
  {
    id: "manager",
    label: "Keeper Manager",
    hint: "Valuation & recommendations — never silently overwrites saved keepers.",
    icon: Brain,
  },
  {
    id: "forecast",
    label: "Forecast",
    hint: "Read-only league outlook.",
    icon: ListChecks,
  },
];

/** Internal name for the hidden former Manage experience (KeeperManagePanel). */
const LEAGUE_KEEPERS_INTERNAL_LABEL = "League Keepers";

export function DraftKeepers() {
  const [tab, setTab] = useState<KeeperTab>("manager");
  const active = useMemo(() => TABS.find((t) => t.id === tab) ?? TABS[0], [tab]);

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-draft-keepers>
      <CinematicPageHeader
        eyebrowMono="Draft"
        icon={Crown}
        title="Keeper Center"
        subtitle="Keeper Manager and Forecast for your draft workspace."
        className="mb-4"
        meta={
          <span className="rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-lime-300">
            {active.label}
          </span>
        }
      />

      <nav
        aria-label="Keeper Center sections"
        className="mb-5 flex flex-wrap gap-1 border-b border-border/60 pb-px"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          const isPrimary = t.id === "manager";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-4 py-3 font-black uppercase tracking-wider transition-colors",
                isPrimary ? "text-sm" : "text-xs",
                isActive
                  ? "border-lime-400 text-lime-400"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className={cn(isPrimary ? "h-4 w-4" : "h-3.5 w-3.5")} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <p className="mb-5 text-sm text-muted-foreground">{active.hint}</p>

      {tab === "manager" ? (
        <KeeperAdvisor embedded />
      ) : (
        <LeagueKeeperForecast embedded />
      )}

      {/* {LEAGUE_KEEPERS_INTERNAL_LABEL} — former Manage panel; hidden from nav, kept for future use. */}
      {false && (
        <div data-league-keepers-hidden aria-hidden="true">
          <span className="sr-only">{LEAGUE_KEEPERS_INTERNAL_LABEL}</span>
          <KeeperManagePanel />
        </div>
      )}
    </IntelPageShell>
  );
}
