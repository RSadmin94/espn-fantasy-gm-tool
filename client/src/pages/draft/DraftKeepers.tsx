/**
 * Canonical `/draft/keepers` — Keeper Center.
 * Manage = primary keeper management (gm_manual_keeper_selections).
 * Forecast / Advisor = secondary analysis (same saved keepers).
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
    hint: "Change your keepers here — add, replace, set rounds, and edit any team in your workspace.",
    icon: Wrench,
  },
  {
    id: "forecast",
    label: "Forecast",
    hint: "Read-only league outlook. Editing lives on the Manage tab.",
    icon: ListChecks,
  },
  {
    id: "advisor",
    label: "Advisor",
    hint: "Valuation & recommendations — never silently overwrites saved keepers.",
    icon: Brain,
  },
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
        subtitle="Manage your keepers. Forecast and Advisor are secondary."
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
          const isManage = t.id === "manage";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-4 py-3 font-black uppercase tracking-wider transition-colors",
                isManage ? "text-sm" : "text-xs",
                isActive
                  ? "border-lime-400 text-lime-400"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className={cn(isManage ? "h-4 w-4" : "h-3.5 w-3.5")} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <p className="mb-5 text-sm text-muted-foreground">{active.hint}</p>

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
