/**
 * Canonical `/draft/keepers` — Keeper Center.
 * Manage = authoritative edits (gm_manual_keeper_selections).
 * Forecast / Advisor = outlook + recommendations (same saved keepers).
 */
import { useMemo, useState } from "react";
import { Crown, ListChecks, Brain, Wrench } from "lucide-react";
import { LeagueKeeperForecast } from "@/pages/LeagueKeeperForecast";
import { KeeperAdvisor } from "@/pages/KeeperAdvisor";
import { KeeperManagePanel } from "@/components/keepers/KeeperManagePanel";
import { CinematicPageHeader, IntelPageShell } from "@/components/layout";
import { cn } from "@/lib/utils";

type KeeperTab = "manage" | "forecast" | "advisor";

const TABS: { id: KeeperTab; label: string; hint: string; icon: typeof ListChecks }[] = [
  {
    id: "manage",
    label: "Manage",
    hint: "Add, remove, replace, and set costs for keepers across every team in your workspace.",
    icon: Wrench,
  },
  { id: "forecast", label: "Forecast", hint: "League-wide keeper outlook", icon: ListChecks },
  { id: "advisor", label: "Advisor", hint: "Valuation & recommendations", icon: Brain },
];

export function DraftKeepers() {
  const [tab, setTab] = useState<KeeperTab>("manage");
  const active = useMemo(() => TABS.find((t) => t.id === tab) ?? TABS[0], [tab]);

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-draft-keepers>
      <CinematicPageHeader
        eyebrowMono="Draft"
        icon={Crown}
        title="Keeper Center"
        subtitle="Official keeper management for your Fantasy Football Rivals workspace — shared with Draft War Room."
        className="mb-4"
        meta={
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {active.label}
          </span>
        }
      />

      <nav
        aria-label="Keeper Center sections"
        className="mb-4 flex flex-wrap gap-1 border-b border-border/60 pb-px"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                isActive
                  ? "border-lime-400 text-lime-400"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <p className="mb-4 text-xs text-muted-foreground">{active.hint}</p>

      {tab === "manage" ? (
        <KeeperManagePanel />
      ) : tab === "forecast" ? (
        <LeagueKeeperForecast embedded />
      ) : (
        <KeeperAdvisor embedded />
      )}
    </IntelPageShell>
  );
}
