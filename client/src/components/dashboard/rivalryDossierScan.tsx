import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

const SLOT = 8;

function padKeys(keys: string[]): string[] {
  const uniq = [...new Set(keys.filter(Boolean))];
  const out: string[] = [];
  for (let i = 0; i < SLOT; i++) out.push(uniq[i] ?? "");
  return out;
}

export type RivalryHeroResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | {
      status: "ready";
      focalKey: string;
      opponentKey: string;
      focalDisplay: string;
      opponentDisplay: string;
      wins: number;
      losses: number;
      ties: number;
      gamesPlayed: number;
      winPctFocal: number;
      heartbreakLosses: number;
      closestMarginLabel: string | null;
    };

function closestFromMeetings(
  meetings: Array<{ margin: number }> | undefined,
): string | null {
  if (!meetings?.length) return null;
  let best = meetings[0]!;
  let bestAbs = Math.abs(best.margin);
  for (const m of meetings) {
    const a = Math.abs(m.margin);
    if (a < bestAbs) {
      best = m;
      bestAbs = a;
    }
  }
  return `${bestAbs.toFixed(1)} pts`;
}

const dossierInput = (ownerKey: string, eligibleArg: string[] | undefined) => ({
  ownerKey,
  includeHistoricalOwners: false as const,
  rivalryEligibleOwnerKeys: eligibleArg,
});

/**
 * Fan-out up to eight `owners.rivalryDossier` queries (default rivalry-eligible owners only)
 * and pick the hottest eligible-vs-eligible pairing by heartbreak losses, then games played.
 */
export function useRivalryDossierScan(rivalryEligibleOwnerKeys: string[]): RivalryHeroResult {
  const k = useMemo(() => padKeys(rivalryEligibleOwnerKeys), [rivalryEligibleOwnerKeys.join("|")]);
  const activeSet = useMemo(() => new Set(rivalryEligibleOwnerKeys), [rivalryEligibleOwnerKeys.join("|")]);
  const eligibleArg = useMemo(
    () => (rivalryEligibleOwnerKeys.length > 0 ? rivalryEligibleOwnerKeys : undefined),
    [rivalryEligibleOwnerKeys.join("|")],
  );

  const q0 = trpc.owners.rivalryDossier.useQuery(dossierInput(k[0]!, eligibleArg), {
    enabled: Boolean(k[0]),
    staleTime: 120_000,
  });
  const q1 = trpc.owners.rivalryDossier.useQuery(dossierInput(k[1]!, eligibleArg), {
    enabled: Boolean(k[1]),
    staleTime: 120_000,
  });
  const q2 = trpc.owners.rivalryDossier.useQuery(dossierInput(k[2]!, eligibleArg), {
    enabled: Boolean(k[2]),
    staleTime: 120_000,
  });
  const q3 = trpc.owners.rivalryDossier.useQuery(dossierInput(k[3]!, eligibleArg), {
    enabled: Boolean(k[3]),
    staleTime: 120_000,
  });
  const q4 = trpc.owners.rivalryDossier.useQuery(dossierInput(k[4]!, eligibleArg), {
    enabled: Boolean(k[4]),
    staleTime: 120_000,
  });
  const q5 = trpc.owners.rivalryDossier.useQuery(dossierInput(k[5]!, eligibleArg), {
    enabled: Boolean(k[5]),
    staleTime: 120_000,
  });
  const q6 = trpc.owners.rivalryDossier.useQuery(dossierInput(k[6]!, eligibleArg), {
    enabled: Boolean(k[6]),
    staleTime: 120_000,
  });
  const q7 = trpc.owners.rivalryDossier.useQuery(dossierInput(k[7]!, eligibleArg), {
    enabled: Boolean(k[7]),
    staleTime: 120_000,
  });

  const queries = [q0, q1, q2, q3, q4, q5, q6, q7];

  return useMemo(() => {
    if (rivalryEligibleOwnerKeys.length === 0) return { status: "idle" } as const;
    if (queries.some((q) => q.isLoading || q.isFetching)) return { status: "loading" } as const;

    type Cand = {
      focalKey: string;
      opponentKey: string;
      focalDisplay: string;
      opponentDisplay: string;
      wins: number;
      losses: number;
      ties: number;
      gamesPlayed: number;
      winPctFocal: number;
      heartbreakLosses: number;
      closestMarginLabel: string | null;
      hbWins: number;
    };

    const cands: Cand[] = [];

    for (let i = 0; i < SLOT; i++) {
      const ownerKey = k[i];
      if (!ownerKey) continue;
      const data = queries[i]?.data;
      if (!data?.opponents?.length) continue;
      const focalDisplay = data.ownerDisplayName || ownerKey;
      for (const opp of data.opponents) {
        if (!activeSet.has(opp.opponentOwnerKey)) continue;
        if (opp.gamesPlayed <= 0) continue;
        const closestMarginLabel = closestFromMeetings(opp.lastFiveMeetings);
        cands.push({
          focalKey: ownerKey,
          opponentKey: opp.opponentOwnerKey,
          focalDisplay,
          opponentDisplay: opp.opponentDisplayName,
          wins: opp.wins,
          losses: opp.losses,
          ties: opp.ties,
          gamesPlayed: opp.gamesPlayed,
          winPctFocal: opp.winPct,
          heartbreakLosses: opp.heartbreakLosses,
          hbWins: opp.heartbreakWins,
          closestMarginLabel,
        });
      }
    }

    if (cands.length === 0) return { status: "empty" } as const;

    cands.sort((a, b) => {
      if (b.heartbreakLosses !== a.heartbreakLosses) return b.heartbreakLosses - a.heartbreakLosses;
      if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
      return b.hbWins - a.hbWins;
    });

    const best = cands[0]!;
    return {
      status: "ready",
      focalKey: best.focalKey,
      opponentKey: best.opponentKey,
      focalDisplay: best.focalDisplay,
      opponentDisplay: best.opponentDisplay,
      wins: best.wins,
      losses: best.losses,
      ties: best.ties,
      gamesPlayed: best.gamesPlayed,
      winPctFocal: best.winPctFocal,
      heartbreakLosses: best.heartbreakLosses,
      closestMarginLabel: best.closestMarginLabel,
    };
  }, [
    rivalryEligibleOwnerKeys.length,
    rivalryEligibleOwnerKeys.join("|"),
    activeSet,
    k,
    eligibleArg,
    q0.data,
    q1.data,
    q2.data,
    q3.data,
    q4.data,
    q5.data,
    q6.data,
    q7.data,
    q0.isLoading,
    q1.isLoading,
    q2.isLoading,
    q3.isLoading,
    q4.isLoading,
    q5.isLoading,
    q6.isLoading,
    q7.isLoading,
    q0.isFetching,
    q1.isFetching,
    q2.isFetching,
    q3.isFetching,
    q4.isFetching,
    q5.isFetching,
    q6.isFetching,
    q7.isFetching,
  ]);
}
