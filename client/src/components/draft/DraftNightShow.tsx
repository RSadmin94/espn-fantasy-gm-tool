/**
 * Draft Night Show — consumer presentation for League Context awards.
 * Renders explainable awards; booth audio stays on the existing wrap-up pipeline.
 */
import { cn } from "@/lib/utils";
import type {
  DraftNightAward,
  DraftNightAwardType,
  DraftNightShowPayload,
} from "@/lib/draftNightShowTypes";

const AWARD_META: Record<
  DraftNightAwardType,
  { emoji: string; label: string; accent: string }
> = {
  winner_of_the_night: {
    emoji: "🏆",
    label: "Winner of the Night",
    accent: "border-amber-500/35 bg-amber-500/5",
  },
  biggest_mistake: {
    emoji: "💀",
    label: "Biggest Mistake",
    accent: "border-rose-500/35 bg-rose-500/5",
  },
  sleeper_value: {
    emoji: "💎",
    label: "Sleeper Value",
    accent: "border-cyan-500/35 bg-cyan-500/5",
  },
  under_intense_pressure: {
    emoji: "⚠️",
    label: "Under Intense Pressure",
    accent: "border-orange-500/35 bg-orange-500/5",
  },
};

const ORDER: DraftNightAwardType[] = [
  "winner_of_the_night",
  "biggest_mistake",
  "sleeper_value",
  "under_intense_pressure",
];

export type DraftNightShowProps = {
  show: DraftNightShowPayload | null | undefined;
  /** Optional booth primary line for Final RFSN Summary. */
  analystRecap?: string | null;
  className?: string;
};

function AwardBlock({ award }: { award: DraftNightAward }) {
  const meta = AWARD_META[award.awardType];
  return (
    <article
      className={cn("rounded-lg border p-3 space-y-1.5", meta.accent)}
      data-draft-night-award={award.awardType}
    >
      <h4 className="text-xs font-black uppercase tracking-wider text-zinc-100">
        {meta.emoji} {meta.label}
      </h4>
      <dl className="grid gap-1 text-label text-zinc-300">
        <div>
          <dt className="text-ink-secondary inline">Owner: </dt>
          <dd className="inline font-bold text-zinc-100">{award.ownerName}</dd>
        </div>
        {award.awardType === "winner_of_the_night" && (
          <div>
            <dt className="text-ink-secondary inline">Grade: </dt>
            <dd className="inline font-bold text-zinc-100">{award.metrics.draftGrade}</dd>
          </div>
        )}
        {award.awardType === "biggest_mistake" && (
          <>
            <div>
              <dt className="text-ink-secondary inline">Decision: </dt>
              <dd className="inline">{award.decision ?? award.fact}</dd>
            </div>
            <div>
              <dt className="text-ink-secondary inline">Impact: </dt>
              <dd className="inline">{award.impact ?? "—"}</dd>
            </div>
          </>
        )}
        {award.awardType === "sleeper_value" && (
          <>
            <div>
              <dt className="text-ink-secondary inline">Player: </dt>
              <dd className="inline font-bold text-zinc-100">{award.playerName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-secondary inline">Value: </dt>
              <dd className="inline">{award.fact}</dd>
            </div>
          </>
        )}
        {award.awardType === "under_intense_pressure" && (
          <div>
            <dt className="text-ink-secondary inline">Reason: </dt>
            <dd className="inline">{award.fact}</dd>
          </div>
        )}
        {(award.awardType === "winner_of_the_night" ||
          award.awardType === "sleeper_value") && (
          <div>
            <dt className="text-ink-secondary inline">Why: </dt>
            <dd className="inline">{award.fact}</dd>
          </div>
        )}
        {award.evidence.length > 0 && (
          <div>
            <dt className="text-ink-secondary">Evidence:</dt>
            <dd className="mt-0.5 space-y-0.5">
              {award.evidence.slice(0, 3).map((e, i) => (
                <p key={i} className="text-zinc-400">
                  · {e.fact}
                </p>
              ))}
            </dd>
          </div>
        )}
        <p className="text-label text-ink-tertiary pt-0.5">
          Persona lead: {award.persona} · conf {(award.confidence * 100).toFixed(0)}% · heat{" "}
          {Math.round(award.narrativeHeat)}
        </p>
      </dl>
    </article>
  );
}

function SuppressedBlock({
  awardType,
  reason,
}: {
  awardType: DraftNightAwardType;
  reason: string;
}) {
  const meta = AWARD_META[awardType];
  return (
    <article
      className={cn("rounded-lg border border-dashed border-zinc-700/80 bg-zinc-900/40 p-3")}
      data-draft-night-suppressed={awardType}
    >
      <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400">
        {meta.emoji} {meta.label}
      </h4>
      <p className="mt-1 text-label text-ink-secondary">{reason}</p>
    </article>
  );
}

export function DraftNightShow({ show, analystRecap, className }: DraftNightShowProps) {
  if (!show) return null;

  const byType = new Map(show.awards.map((a) => [a.awardType, a]));
  const suppressedByType = new Map(show.suppressed.map((s) => [s.awardType, s.reason]));

  const recap =
    analystRecap?.trim() ||
    show.summaryFacts.slice(0, 3).join(" ") ||
    "Draft Night Show facts locked — booth recap follows when on air.";

  return (
    <section
      className={cn(
        "rounded-xl border border-violet-500/25 bg-gradient-to-b from-violet-500/8 to-transparent p-4 space-y-3",
        className,
      )}
      data-draft-night-show
    >
      <header className="space-y-0.5">
        <h3 className="text-sm font-black uppercase tracking-wider text-violet-200">
          Draft Night Show
        </h3>
        <p className="text-label text-ink-secondary">
          {show.totalPicks} picks · {show.teamCount} teams · evidence-gated awards
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ORDER.map((type) => {
          const award = byType.get(type);
          if (award) return <AwardBlock key={type} award={award} />;
          const reason = suppressedByType.get(type) ?? "Not awarded.";
          return <SuppressedBlock key={type} awardType={type} reason={reason} />;
        })}
      </div>

      <footer className="rounded-lg border border-white/[0.06] bg-black/20 p-3 space-y-1">
        <h4 className="text-xs font-black uppercase tracking-wider text-zinc-200">
          Final RFSN Summary
        </h4>
        <p className="text-label text-zinc-300 leading-relaxed">{recap}</p>
        <p className="text-label text-ink-tertiary">Top analyst recap — booth audio uses the existing wrap-up pipeline.</p>
      </footer>
    </section>
  );
}
