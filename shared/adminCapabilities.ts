/**
 * Admin Console capabilities.
 * OWNER receives every capability. Limited admins receive the VIEW_* subset.
 */
export const ADMIN_CAPABILITIES = [
  "VIEW_ADMIN",
  "VIEW_USERS",
  "MANAGE_USERS",
  "VIEW_USAGE",
  "MANAGE_USAGE_LIMITS",
  "VIEW_SYSTEM_HEALTH",
  "MANAGE_FEATURES",
  "VIEW_ERRORS",
  "MANAGE_SETTINGS",
  "VIEW_AUDIT",
  "OWNER_ACCESS",
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

/** Non-owner admins: inspect, do not mutate operational controls. */
export const ADMIN_VIEW_CAPABILITIES: readonly AdminCapability[] = [
  "VIEW_ADMIN",
  "VIEW_USERS",
  "VIEW_USAGE",
  "VIEW_SYSTEM_HEALTH",
  "VIEW_ERRORS",
  "VIEW_AUDIT",
];
