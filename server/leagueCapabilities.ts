/**
 * League Capability Framework — single resolver for ESPN league format flags.
 * Keeper detection: settings.draftSettings.keeperCount ?? settings.keeperCount (see README in code).
 */

import { getCachedView, resolveActiveLeagueId } from "./db";

export interface LeagueCapabilities {
  leagueId: string;
  season: number;
  keepers: boolean;
  keeperSlotsPerTeam: number | null;
  auctionDraft: boolean;
  draftPickTrading: boolean;
  dynasty: boolean | null;
  playoffData: boolean;
  confidence: "high" | "medium" | "low";
  confidenceReasons: string[];
}

function toFiniteInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Official keeper slot count from ESPN combined payload (authoritative for gating).
 */
export function readKeeperSlotsPerTeamFromPayload(
  data: Record<string, unknown> | null | undefined,
): number | null {
  if (!data) return null;
  const settings = (data.settings as Record<string, unknown>) || {};
  const draftSettings = (settings.draftSettings as Record<string, unknown>) || {};
  const fromDraft = toFiniteInt(draftSettings.keeperCount);
  if (fromDraft != null) return fromDraft;
  const fromTop = toFiniteInt(settings.keeperCount);
  return fromTop;
}

export function keepersEnabledFromSlots(slots: number | null | undefined): boolean {
  return Number(slots) > 0;
}

function readDraftOrderType(data: Record<string, unknown>): string | null {
  const settings = (data.settings as Record<string, unknown>) || {};
  const draftSettings = (settings.draftSettings as Record<string, unknown>) || {};
  const t = draftSettings.orderType ?? draftSettings.type;
  return t != null && String(t).trim() !== "" ? String(t).trim().toUpperCase() : null;
}

/**
 * ESPN trade settings vary by API version; try several known keys.
 * When unknown, default `true` so we do not hide pick-trade tools without evidence.
 */
function readDraftPickTrading(data: Record<string, unknown>): { value: boolean; known: boolean } {
  const settings = (data.settings as Record<string, unknown>) || {};
  const tradeSettings = (settings.tradeSettings as Record<string, unknown>) || {};
  const keys = [
    "allowDraftPickTrading",
    "allowDraftTrade",
    "revisionDraftTradeEnabled",
    "draftTradeEnabled",
  ] as const;
  for (const k of keys) {
    if (k in tradeSettings) {
      const v = tradeSettings[k];
      if (typeof v === "boolean") return { value: v, known: true };
      if (v === 1 || v === 0) return { value: Number(v) === 1, known: true };
    }
  }
  return { value: true, known: false };
}

/**
 * ESPN dynasty / keeper-league style flags — best-effort; null when not detected.
 */
function readDynastyFlag(data: Record<string, unknown>): boolean | null {
  const settings = (data.settings as Record<string, unknown>) || {};
  const t = settings.type;
  if (typeof t === "string" && t.toUpperCase().includes("DYNASTY")) return true;
  const st = settings.settingsType;
  if (typeof st === "string" && st.toUpperCase().includes("DYNASTY")) return true;
  const name = String(settings.name ?? "").toLowerCase();
  if (name.includes("dynasty")) return true;
  return null;
}

function readPlayoffData(data: Record<string, unknown>): boolean {
  const settings = (data.settings as Record<string, unknown>) || {};
  const sched = (settings.scheduleSettings as Record<string, unknown>) || {};
  const pc = toFiniteInt(sched.playoffTeamCount);
  if (pc != null && pc > 0) return true;
  const schedule = (data.schedule as unknown[]) || [];
  return Array.isArray(schedule) && schedule.some((row: any) => row?.playoffTierType);
}

/**
 * Pure: build capabilities from an ESPN **combined** payload already loaded for `leagueId` + `season`.
 */
export function buildLeagueCapabilities(
  leagueId: string,
  season: number,
  payload: Record<string, unknown> | null,
): LeagueCapabilities {
  const reasons: string[] = [];
  let confidence: LeagueCapabilities["confidence"] = "high";

  if (!payload) {
    return {
      leagueId,
      season,
      keepers: false,
      keeperSlotsPerTeam: null,
      auctionDraft: false,
      draftPickTrading: true,
      dynasty: null,
      playoffData: false,
      confidence: "low",
      confidenceReasons: ["No combined ESPN cache payload for this season — capabilities defaulted conservative (keepers off)."],
    };
  }

  const keeperSlotsPerTeam = readKeeperSlotsPerTeamFromPayload(payload);
  const keepers = keepersEnabledFromSlots(keeperSlotsPerTeam);

  const orderType = readDraftOrderType(payload);
  const auctionDraft = orderType === "AUCTION" || orderType === "LINEAR";

  const dpt = readDraftPickTrading(payload);
  if (!dpt.known) {
    reasons.push("Draft pick trading flag not found in tradeSettings — defaulting to allowed.");
    confidence = "medium";
  }

  const dynasty = readDynastyFlag(payload);
  if (dynasty === null) {
    reasons.push("Dynasty not inferred from payload (no reliable ESPN flag mapped yet).");
  }

  const playoffData = readPlayoffData(payload);
  if (!playoffData) reasons.push("No playoffTeamCount or playoff schedule rows detected.");

  if (keeperSlotsPerTeam == null) {
    reasons.push("keeperCount absent from draftSettings and settings — treating as 0 keepers (redraft).");
    confidence = "medium";
  }

  return {
    leagueId,
    season,
    keepers,
    keeperSlotsPerTeam,
    auctionDraft,
    draftPickTrading: dpt.value,
    dynasty,
    playoffData,
    confidence,
    confidenceReasons: reasons,
  };
}

/**
 * Resolve capabilities for the authenticated user's active league + season (reads combined cache).
 */
export async function resolveLeagueCapabilitiesForActiveUser(input: {
  userId: number;
  season: number;
}): Promise<LeagueCapabilities | null> {
  const { leagueId } = await resolveActiveLeagueId(
    { user: { id: input.userId } },
    null,
    input.season,
  );
  if (!leagueId || leagueId === "default") return null;
  const row = await getCachedView(input.season, "combined", leagueId, { userId: input.userId });
  const payload = row?.payload ? (row.payload as Record<string, unknown>) : null;
  return buildLeagueCapabilities(leagueId, input.season, payload);
}
