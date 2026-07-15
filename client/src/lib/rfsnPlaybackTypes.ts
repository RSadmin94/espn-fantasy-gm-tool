import type { RfsnBroadcastSnapshot } from "./rfsnPresentation";

export type RfsnPlaybackDiagnostic = {
  pickIdentity: string;
  sourceLevel: string;
  sourceSignals: string;
  commentaryBudgetEnabled: boolean;
  resolvedEditorialPlan: string;
  voicesRequested: string;
  frameStatus: string;
  frameLeadVoice: string | null;
  snapshotPrimary: string | null;
  snapshotSecondary: string | null;
  commentedOrSilent: "commented" | "silent";
  reason: string;
};

export type RfsnPlaybackBundle = {
  source: string;
  generatedAt: string;
  moments: Array<{
    pickNumber: number;
    pickId: string;
    editorialPlanId: string;
    diagnostic: RfsnPlaybackDiagnostic;
    snapshot: RfsnBroadcastSnapshot;
  }>;
};

export type RfsnPlaybackSource = "simulated" | "mock" | "scenario";

export const RFSN_PLAYBACK_SOURCES: readonly RfsnPlaybackSource[] = [
  "simulated",
  "mock",
  "scenario",
] as const;

export function playbackBundleUrl(source: RfsnPlaybackSource): string {
  return `/dev-shadow/rfsn-playback/${source}.json`;
}

export function parsePlaybackBundle(raw: unknown): RfsnPlaybackBundle {
  const bundle = raw as RfsnPlaybackBundle;
  if (!bundle?.moments || !Array.isArray(bundle.moments)) {
    throw new Error("Invalid playback bundle");
  }
  return bundle;
}

export function isDevPlaybackEnabled(): boolean {
  return import.meta.env.DEV;
}
