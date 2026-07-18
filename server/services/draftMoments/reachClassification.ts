/**
 * Re-export the authoritative P4 reach classifier from shared/.
 * Do not duplicate thresholds here — `shared/reachClassification.ts` is the single source of truth.
 */
export * from "../../../shared/reachClassification";
