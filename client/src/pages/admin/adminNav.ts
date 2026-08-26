export type AdminNavItem = { to: string; label: string };
export type AdminNavGroup = { id: string; title: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: "overview",
    title: "Overview",
    items: [{ to: "/admin/overview", label: "System Overview" }],
  },
  {
    id: "users",
    title: "Users",
    items: [
      { to: "/admin/users", label: "Users" },
      { to: "/admin/auth", label: "Authentication" },
    ],
  },
  {
    id: "leagues",
    title: "Leagues",
    items: [
      { to: "/admin/leagues", label: "Leagues" },
      { to: "/admin/data-health", label: "Data Health" },
    ],
  },
  {
    id: "cost",
    title: "AI & Cost",
    items: [
      { to: "/admin/usage", label: "Usage & Cost" },
      { to: "/admin/providers", label: "Providers & Models" },
    ],
  },
  {
    id: "product",
    title: "Product",
    items: [
      { to: "/admin/features", label: "Features" },
      { to: "/admin/conversion-funnel", label: "Conversion Funnel" },
      { to: "/admin/analytics", label: "Product Analytics" },
    ],
  },
  {
    id: "ops",
    title: "Operations",
    items: [
      { to: "/admin/errors", label: "Errors" },
      { to: "/admin/jobs", label: "Jobs" },
      { to: "/admin/integrations", label: "Integrations" },
    ],
  },
  {
    id: "admin",
    title: "Administration",
    items: [
      { to: "/admin/settings", label: "Settings" },
      { to: "/admin/audit", label: "Audit Log" },
    ],
  },
];
