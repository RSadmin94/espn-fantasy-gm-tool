/**
 * Confirmed active-owner roster for league 457622 (2026 season).
 * steven hibbard: DEPARTED — board context only (merged steve→steven history).
 */

export type PersonalityFitTier = "full" | "shrinkage_cold";

export type ActiveOwnerEntry = {
  profileOwnerKey: string;
  displayName: string;
  memberGuid: string | null;
  lastSeenSeason: number;
  personalityFitTier: PersonalityFitTier;
};

/** Commissioner-confirmed: 14 active managers. */
export const CONFIRMED_ACTIVE_OWNERS: readonly ActiveOwnerEntry[] = [
  { profileOwnerKey: "id:{34381793-095A-4099-B91E-04FB92B016A7}", displayName: "Bruce Edwards", memberGuid: "{34381793-095A-4099-B91E-04FB92B016A7}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{0C4B6DC7-265E-4A23-99DE-2B67369E9141}", displayName: "Christian Graham", memberGuid: "{0C4B6DC7-265E-4A23-99DE-2B67369E9141}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}", displayName: "Demetri Clark", memberGuid: "{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{DE1D22CC-4F17-4463-B090-E06E460C5F1F}", displayName: "Jan Graham", memberGuid: "{DE1D22CC-4F17-4463-B090-E06E460C5F1F}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{AE295BDF-FC02-479E-969E-0E712690503C}", displayName: "LOZELL STYLES", memberGuid: "{AE295BDF-FC02-479E-969E-0E712690503C}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{718A25B0-C7E5-48B3-A27B-D0C23359C3C3}", displayName: "Marcus Reese", memberGuid: "{718A25B0-C7E5-48B3-A27B-D0C23359C3C3}", lastSeenSeason: 2026, personalityFitTier: "shrinkage_cold" },
  { profileOwnerKey: "id:{1130450A-E524-475A-96E2-F45C79CDBE21}", displayName: "Mark Deroux", memberGuid: "{1130450A-E524-475A-96E2-F45C79CDBE21}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{EE3AD8B7-4239-40B0-BAD8-B7423960B094}", displayName: "Marlon Moore", memberGuid: "{EE3AD8B7-4239-40B0-BAD8-B7423960B094}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{F468B611-D262-466C-992F-23D7360C5CC0}", displayName: "Nate West", memberGuid: "{F468B611-D262-466C-992F-23D7360C5CC0}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{B7DED29D-BF48-441C-91B8-34CCFBB09271}", displayName: "Randy Broner Jr", memberGuid: "{B7DED29D-BF48-441C-91B8-34CCFBB09271}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{6042EE3C-4B54-42BE-A2A7-52E939D2C706}", displayName: "Rod Sellers", memberGuid: "{6042EE3C-4B54-42BE-A2A7-52E939D2C706}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{54D64361-5249-472A-9643-615249A72AD3}", displayName: "Sheldon deRoux", memberGuid: "{54D64361-5249-472A-9643-615249A72AD3}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{C300FD29-76C4-4FF0-8C91-A4F7BC17ADF2}", displayName: "Steffon Bizzell", memberGuid: "{C300FD29-76C4-4FF0-8C91-A4F7BC17ADF2}", lastSeenSeason: 2026, personalityFitTier: "full" },
  { profileOwnerKey: "id:{8D9B45D1-BA89-4DF4-A8E1-32855305A6A4}", displayName: "Tony Dorsey", memberGuid: "{8D9B45D1-BA89-4DF4-A8E1-32855305A6A4}", lastSeenSeason: 2026, personalityFitTier: "shrinkage_cold" },
] as const;

/** Departed — ledger context only; no personality fit or sim seat. */
export const DEPARTED_BOARD_CONTEXT_OWNERS = [
  {
    profileOwnerKey: "id:{82E515D1-73FF-466C-A7A8-099B050278B5}",
    displayName: "steven hibbard",
    memberGuid: "{82E515D1-73FF-466C-A7A8-099B050278B5}",
    lastSeenSeason: 2024,
  },
] as const;

export const BRUCE_PROFILE_OWNER_KEY = "id:{34381793-095A-4099-B91E-04FB92B016A7}";

export function confirmedActiveProfileKeySet(): Set<string> {
  return new Set(CONFIRMED_ACTIVE_OWNERS.map((o) => o.profileOwnerKey));
}

/** @deprecated */
export function proposedActiveProfileKeySet(): Set<string> {
  return confirmedActiveProfileKeySet();
}

export function personalityFitTierFor(profileOwnerKey: string): PersonalityFitTier | "departed_context" {
  const active = CONFIRMED_ACTIVE_OWNERS.find((o) => o.profileOwnerKey === profileOwnerKey);
  if (active) return active.personalityFitTier;
  return "departed_context";
}

export function shrinkageColdOwners(): ActiveOwnerEntry[] {
  return CONFIRMED_ACTIVE_OWNERS.filter((o) => o.personalityFitTier === "shrinkage_cold");
}
