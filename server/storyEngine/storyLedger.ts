/**
 * storyEngine/storyLedger.ts
 * ──────────────────────────
 * The pure lifecycle state machine. Given the stories already on record and the
 * freshly detected candidates, it decides what BEGINS, GROWS, COOLS OFF,
 * RESOLVES and RETIRES. Deterministic — no DB, no clock of its own (callers pass
 * `now`), so every transition is unit-testable.
 */
import {
  STORY_CONFIG,
  type DetectedStory,
  type Story,
  type StoryConfig,
} from "./storyTypes";

const clampPriority = (n: number, cfg: StoryConfig): number =>
  Math.max(cfg.minPriority, Math.min(cfg.maxPriority, Math.round(n)));

/** Stable, order-independent id → duplicate prevention across cycles. */
export function buildStoryId(
  leagueId: string,
  storyType: string,
  owners: string[],
): string {
  return `${leagueId}::${storyType}:${[...owners].sort().join("_")}`;
}

/** Collapse any same-id detections into one (max priority/confidence, merged facts). */
function dedupeDetected(
  leagueId: string,
  detected: DetectedStory[],
): Map<string, DetectedStory> {
  const byId = new Map<string, DetectedStory>();
  for (const d of detected) {
    const id = buildStoryId(leagueId, d.storyType, d.owners);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, d);
      continue;
    }
    byId.set(id, {
      ...prev,
      priority: Math.max(prev.priority, d.priority),
      confidence: Math.max(prev.confidence, d.confidence),
      resolution: prev.resolution ?? d.resolution ?? null,
      supportingFacts: [...prev.supportingFacts, ...d.supportingFacts],
    });
  }
  return byId;
}

/** BEGIN: a candidate we've never seen becomes a new story. */
function beginStory(
  id: string,
  leagueId: string,
  det: DetectedStory,
  now: number,
  cfg: StoryConfig,
): Story {
  const resolved = det.resolution != null && det.resolution !== "";
  return {
    storyId: id,
    storyType: det.storyType,
    leagueId,
    owners: [...det.owners].sort(),
    ownerDisplay: det.ownerDisplay,
    priority: clampPriority(det.priority, cfg),
    status: resolved ? "resolved" : "emerging",
    createdAt: now,
    lastMentioned: null,
    mentionCount: 0,
    confidence: Math.max(0, Math.min(1, det.confidence)),
    resolution: resolved ? (det.resolution as string) : null,
    expiry: now + (resolved ? cfg.resolvedTtlMs : cfg.emergingTtlMs),
    supportingFacts: det.supportingFacts,
    headline: det.headline,
    lastDetectedAt: now,
  };
}

/** GROW / RESOLVE: an existing story re-detected this cycle. */
function growStory(
  prev: Story,
  det: DetectedStory,
  now: number,
  cfg: StoryConfig,
): Story {
  const base: Story = {
    ...prev,
    lastDetectedAt: now,
    headline: det.headline,
    ownerDisplay: det.ownerDisplay,
    supportingFacts: det.supportingFacts,
    confidence: Math.max(prev.confidence, Math.min(1, det.confidence)),
  };

  // Resolved arcs stay resolved (sticky); a fresh resolution just refreshes it.
  if (prev.status === "resolved" || (det.resolution != null && det.resolution !== "")) {
    const resolution = det.resolution && det.resolution !== "" ? det.resolution : prev.resolution;
    return {
      ...base,
      status: "resolved",
      resolution: resolution ?? null,
      priority: clampPriority(prev.priority - cfg.coolStep, cfg),
      expiry: now + cfg.resolvedTtlMs,
    };
  }

  // Otherwise the story grows.
  const priority = clampPriority(Math.max(prev.priority, det.priority) + cfg.growthStep, cfg);
  const promoted =
    prev.status === "emerging"
      ? "active" // re-detection is the 2nd sighting → promote
      : priority >= cfg.backgroundPriorityFloor
        ? "active"
        : "background";
  return { ...base, status: promoted, priority, expiry: now + cfg.activeTtlMs };
}

/** COOL / RETIRE: an existing story NOT re-detected this cycle. null => retired. */
function carryForward(prev: Story, now: number, cfg: StoryConfig): Story | null {
  if (now > prev.expiry) return null; // natural expiry → retired

  if (prev.status === "resolved") return prev; // archived, untouched until expiry

  const priority = clampPriority(prev.priority - cfg.coolStep, cfg);
  const status = priority <= cfg.backgroundPriorityFloor ? "background" : "cooling";
  return { ...prev, priority, status };
}

/**
 * Reconcile detected candidates against the stories on record.
 * Returns the full next set of persisted stories (retired ones removed).
 */
export function reconcile(args: {
  leagueId: string;
  existing: Story[];
  detected: DetectedStory[];
  now: number;
  config?: StoryConfig;
}): Story[] {
  const cfg = args.config ?? STORY_CONFIG;
  const detectedById = dedupeDetected(args.leagueId, args.detected);
  const existingById = new Map(args.existing.map((s) => [s.storyId, s]));
  const next: Story[] = [];

  // detected: begin or grow/resolve
  for (const [id, det] of detectedById) {
    const prev = existingById.get(id);
    next.push(prev ? growStory(prev, det, args.now, cfg) : beginStory(id, args.leagueId, det, args.now, cfg));
  }

  // undetected existing: cool or retire
  for (const [id, prev] of existingById) {
    if (detectedById.has(id)) continue;
    const carried = carryForward(prev, args.now, cfg);
    if (carried) next.push(carried);
  }

  return next;
}

/**
 * Record that a story was surfaced in a broadcast. Updates lastMentioned,
 * mentionCount, confidence (reinforced) and priority (damped for rotation /
 * anti-nag), per the ledger contract. Pure — returns a new Story.
 */
export function applyMention(story: Story, now: number, config?: StoryConfig): Story {
  const cfg = config ?? STORY_CONFIG;
  return {
    ...story,
    lastMentioned: now,
    mentionCount: story.mentionCount + 1,
    confidence: Math.max(0, Math.min(1, story.confidence + 0.03)),
    priority: clampPriority(story.priority - cfg.mentionCooldown, cfg),
  };
}
