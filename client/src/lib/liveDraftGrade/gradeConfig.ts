/**
 * Single source of truth for Live Draft grade tuning.
 * Recalibrate after telemetry — do not scatter magic numbers in scoring logic.
 */

export type GradeLetter = "A" | "B" | "C" | "D" | "F" | "—";

export type PhaseWeights = {
  value: number;
  talent: number;
  construction: number;
  lineup: number;
};

export type GradeConfig = {
  pickValue: {
    neutral: number;
    scalePerAdpDelta: number;
    min: number;
    max: number;
    emptyDefault: number;
  };
  talent: {
    emptyDefault: number;
    min: number;
    max: number;
  };
  construction: {
    base: number;
    softPenPerOver: number;
    hardPenPerOver: number;
    balanceL1Scale: number;
    balancePenCap: number;
    min: number;
    max: number;
  };
  lineup: {
    starterWeight: number;
    benchWeight: number;
    vacancyGapScale: number;
    emptyBenchDepthDefault: number;
    min: number;
    max: number;
    bestBallStarterWeight: number;
    bestBallBenchWeight: number;
  };
  phases: {
    midAnchor: number;
    lateAnchor: number;
    early: PhaseWeights;
    mid: PhaseWeights;
    late: PhaseWeights;
  };
  opportunityCost: {
    maxPerPick: number;
    teamCap: number;
    wasteBase: number;
    softCapWasteBonus: number;
    hardCapWasteBonus: number;
    wasteScale: number;
    urgencyStartProgress: number;
    urgencyRampSpan: number;
    urgencyMin: number;
    urgencyMax: number;
    bestBallWasteRelief: number;
  };
  floors: {
    activateProgress: number;
    kDueProgress: number;
    dstDueProgress: number;
    oneCoreVacancyCeiling: number;
    twoPlusCoreVacancyCeiling: number;
    kVacancyCeiling: number;
    defenseVacancyCeiling: number;
    hardCapPlusOneCeiling: number;
    oneQbThreePlusQbCeiling: number;
  };
  smoothing: {
    emaPrevWeight: number;
    emaInstantWeight: number;
    maxLetterJump: number;
    hysteresisPoints: number;
    minScoredPicksForLetter: number;
  };
  peerCurve: {
    aMax: number;
    bMax: number;
    cMax: number;
    dMax: number;
  };
  reasons: {
    minScoreDeltaForEvent: number;
    constructionDropHighlight: number;
    ocSpikeHighlight: number;
  };
};

export const DEFAULT_GRADE_CONFIG: GradeConfig = {
  pickValue: {
    neutral: 50,
    scalePerAdpDelta: 2,
    min: 0,
    max: 100,
    emptyDefault: 50,
  },
  talent: {
    emptyDefault: 50,
    min: 0,
    max: 100,
  },
  construction: {
    base: 100,
    softPenPerOver: 10,
    hardPenPerOver: 22,
    balanceL1Scale: 4,
    balancePenCap: 24,
    min: 0,
    max: 100,
  },
  lineup: {
    starterWeight: 0.72,
    benchWeight: 0.28,
    vacancyGapScale: 40,
    emptyBenchDepthDefault: 0.5,
    min: 0,
    max: 100,
    bestBallStarterWeight: 0.6,
    bestBallBenchWeight: 0.4,
  },
  phases: {
    midAnchor: 0.25,
    lateAnchor: 0.75,
    early: { value: 55, talent: 30, construction: 10, lineup: 5 },
    mid: { value: 30, talent: 25, construction: 30, lineup: 15 },
    late: { value: 10, talent: 15, construction: 40, lineup: 35 },
  },
  opportunityCost: {
    maxPerPick: 18,
    teamCap: 35,
    wasteBase: 1,
    softCapWasteBonus: 2,
    hardCapWasteBonus: 3,
    wasteScale: 5.5,
    urgencyStartProgress: 0.15,
    urgencyRampSpan: 0.6,
    urgencyMin: 0.45,
    urgencyMax: 1,
    bestBallWasteRelief: 1,
  },
  floors: {
    activateProgress: 0.7,
    kDueProgress: 0.7,
    dstDueProgress: 0.7,
    oneCoreVacancyCeiling: 62,
    twoPlusCoreVacancyCeiling: 48,
    kVacancyCeiling: 70,
    defenseVacancyCeiling: 70,
    hardCapPlusOneCeiling: 55,
    oneQbThreePlusQbCeiling: 50,
  },
  smoothing: {
    emaPrevWeight: 0.6,
    emaInstantWeight: 0.4,
    maxLetterJump: 1,
    hysteresisPoints: 2,
    minScoredPicksForLetter: 3,
  },
  peerCurve: {
    aMax: 0.14,
    bMax: 0.36,
    cMax: 0.68,
    dMax: 0.9,
  },
  reasons: {
    minScoreDeltaForEvent: 3,
    constructionDropHighlight: 8,
    ocSpikeHighlight: 6,
  },
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Deep-clone defaults; merge overrides for tests / future remote tuning. */
export function createGradeConfig(overrides?: DeepPartial<GradeConfig>): GradeConfig {
  return mergeDeep(
    JSON.parse(JSON.stringify(DEFAULT_GRADE_CONFIG)) as GradeConfig,
    overrides ?? {},
  );
}

function mergeDeep<T extends Record<string, unknown>>(base: T, over: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(over) as (keyof T)[]) {
    const v = over[key];
    if (v == null) continue;
    const cur = out[key as string];
    if (
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof cur === "object" &&
      cur != null &&
      !Array.isArray(cur)
    ) {
      out[key as string] = mergeDeep(
        cur as Record<string, unknown>,
        v as DeepPartial<Record<string, unknown>>,
      );
    } else {
      out[key as string] = v;
    }
  }
  return out as T;
}
