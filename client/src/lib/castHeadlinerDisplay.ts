/**
 * Mirrors TheCast Headliner badge rendering (eyebrow = non-champion tiers, gold line = champion).
 * Used to verify displayed badge text without mounting the full page.
 */
export function headlinerDisplayedBadgeText(badges: Array<{ label: string; tier: string }>): {
  eyebrowText: string | null;
  championLabel: string | null;
  allLabels: string[];
} {
  const champ = badges.find((b) => b.tier === "champion") ?? null;
  const others = badges.filter((b) => b.tier !== "champion");
  return {
    eyebrowText: others.length > 0 ? others.map((b) => b.label).join(" · ") : null,
    championLabel: champ?.label ?? null,
    allLabels: badges.map((b) => b.label),
  };
}
