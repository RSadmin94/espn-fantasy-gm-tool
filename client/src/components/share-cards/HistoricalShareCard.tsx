/**
 * RFSN-053F — ShareCardRenderer.
 * One HTML engine for matchup / collection / record. Theme + layout live on ShareCardModel.
 * 053G snapshots `[data-share-card-root]` without rebuilding.
 */
import { cn } from "@/lib/utils";
import {
  SHARE_CARD_LAYOUT_SIZE,
  getShareCardTheme,
  shareCardCssVars,
  type ShareCardLayout,
  type ShareCardModel,
  type ShareCardSide,
} from "@shared/historicalShareCard";

function formatScore(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function ShareCardRenderer({ model }: { model: ShareCardModel }) {
  const theme = getShareCardTheme(model.theme);
  const layout = model.layout;
  const size = SHARE_CARD_LAYOUT_SIZE[layout];
  const vars = shareCardCssVars(theme);
  const badge = model.collection?.badge || theme.badge;

  return (
    <article
      data-rfsn-053f
      data-share-card
      data-share-card-root
      data-share-card-type={model.type}
      data-share-card-layout={layout}
      data-share-card-theme={model.theme}
      data-share-card-treatment={theme.treatment}
      data-share-provenance={(model.provenance ?? []).join("|")}
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border text-left shadow-[0_20px_60px_rgba(0,0,0,0.45)]",
        layout === "portrait" && "max-w-[320px]",
        layout === "square" && "max-w-[420px]",
        layout === "landscape" && "max-w-[720px]",
      )}
      style={{
        ...vars,
        background: "var(--ffr-share-bg)",
        color: "var(--ffr-share-text)",
        borderColor: "var(--ffr-share-line)",
        aspectRatio: size.aspect,
        fontFamily: theme.treatment === "receipt" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5"
        style={{ background: "var(--ffr-share-accent)" }}
        aria-hidden="true"
      />
      <div className={cn("flex h-full min-h-0 flex-col", layout === "portrait" ? "p-6" : "p-5 sm:p-6")}>
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: "var(--ffr-share-muted)" }}>
                Fantasy Football Rivals
              </p>
              {model.league.name ? (
                <p className="truncate text-xs font-semibold" style={{ color: "var(--ffr-share-muted)" }}>
                  {model.league.name}
                </p>
              ) : null}
            </div>
          </div>
          <span
            data-share-card-badge
            className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
            style={{ borderColor: "var(--ffr-share-line)", color: "var(--ffr-share-accent)" }}
          >
            {badge}
          </span>
        </header>

        <div className="mt-4 min-h-0 flex-1">
          {model.type === "matchup" && model.matchup ? <MatchupBody model={model} layout={layout} /> : null}
          {model.type === "collection" && model.collection ? <CollectionBody model={model} layout={layout} /> : null}
          {model.type === "record" && model.record ? <RecordBody model={model} layout={layout} /> : null}
        </div>
      </div>
    </article>
  );
}

/** @deprecated use ShareCardRenderer */
export const HistoricalShareCard = ShareCardRenderer;

function MatchupBody({ model, layout }: { model: ShareCardModel; layout: ShareCardLayout }) {
  const m = model.matchup!;
  const left = m.home ?? m.winner;
  const right = m.away ?? m.loser;
  const stacked = layout === "portrait";
  return (
    <div className="flex h-full flex-col">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--ffr-share-muted)" }}>
        {model.subtitle || model.title}
      </p>
      <div
        className={cn(
          "mt-4 grid flex-1 items-center gap-3",
          stacked ? "grid-cols-1" : "grid-cols-[1fr_auto_1fr]",
        )}
      >
        <OwnerBlock
          side={left}
          align={stacked ? "center" : "left"}
          winner={!m.isTie && left.name === m.winner.name}
        />
        <p
          className={cn("text-center text-xs font-black uppercase tracking-[0.3em]", stacked && "py-1")}
          style={{ color: "var(--ffr-share-muted)" }}
        >
          vs
        </p>
        <OwnerBlock
          side={right}
          align={stacked ? "center" : "right"}
          winner={!m.isTie && right.name === m.winner.name}
        />
      </div>
      <p className={cn("mt-3 font-black", layout === "landscape" ? "text-lg sm:text-xl" : "text-base")}>
        {m.isTie ? (
          <>Tie · margin {formatScore(m.margin)}</>
        ) : (
          <>
            <span>{m.winner.name}</span>
            <span style={{ color: "var(--ffr-share-muted)" }}> def. {m.loser.name}</span>
            <span> · {formatScore(m.margin)}</span>
          </>
        )}
      </p>
      <BadgeRow badges={model.badges} />
    </div>
  );
}

function CollectionBody({ model, layout }: { model: ShareCardModel; layout: ShareCardLayout }) {
  const c = model.collection!;
  return (
    <div className={cn("flex h-full flex-col justify-center", layout === "portrait" ? "text-center" : "")}>
      <h2 className={cn("font-black leading-tight", layout === "landscape" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl")}>
        {model.title}
      </h2>
      {model.subtitle ? (
        <p className="mt-2 text-sm font-semibold" style={{ color: "var(--ffr-share-muted)" }}>
          {model.subtitle}
        </p>
      ) : null}
      <p className="mt-5 text-4xl font-black tabular-nums sm:text-5xl" data-share-card-count>
        {c.count}
        <span className="ml-2 text-base font-bold uppercase tracking-[0.16em]" style={{ color: "var(--ffr-share-muted)" }}>
          games
        </span>
      </p>
      {c.ownerName || c.opponentName ? (
        <p className="mt-3 text-sm font-semibold">
          {[c.ownerName, c.opponentName].filter(Boolean).join(" vs ")}
        </p>
      ) : null}
      <BadgeRow badges={model.badges} />
    </div>
  );
}

function RecordBody({ model, layout }: { model: ShareCardModel; layout: ShareCardLayout }) {
  const r = model.record!;
  return (
    <div className={cn("flex h-full flex-col justify-center", layout === "portrait" ? "text-center" : "")}>
      <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--ffr-share-accent)" }}>
        {r.label}
      </p>
      <h2 className={cn("mt-2 font-black leading-tight", layout === "landscape" ? "text-2xl sm:text-3xl" : "text-xl")}>
        {model.title}
      </h2>
      <p className="mt-4 text-4xl font-black tabular-nums sm:text-5xl" data-share-card-metric>
        {r.value}
      </p>
      {r.owner ? <p className="mt-3 text-base font-bold">{r.owner}</p> : null}
      {r.detail ? (
        <p className="mt-1 text-sm" style={{ color: "var(--ffr-share-muted)" }}>
          {r.detail}
        </p>
      ) : null}
      {model.league.season != null ? (
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "var(--ffr-share-muted)" }}>
          {model.league.season}
          {r.week != null ? ` · Week ${r.week}` : ""}
        </p>
      ) : null}
      <BadgeRow badges={model.badges} />
    </div>
  );
}

function OwnerBlock({
  side,
  align,
  winner,
}: {
  side: ShareCardSide;
  align: "left" | "right" | "center";
  winner: boolean;
}) {
  return (
    <div className={cn(align === "right" && "text-right", align === "center" && "text-center")}>
      <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse", align === "center" && "justify-center")}>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--ffr-share-line)", background: "var(--ffr-share-accent-soft)" }}
        >
          {side.logoUrl ? (
            <img src={side.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-black">{side.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <p className={cn("truncate text-sm font-bold sm:text-base", winner && "underline decoration-[var(--ffr-share-accent)] underline-offset-4")}>
          {side.name}
        </p>
      </div>
      <p
        data-share-card-score
        className="mt-2 text-3xl font-black tabular-nums sm:text-4xl"
        style={{ color: winner ? "var(--ffr-share-accent)" : "var(--ffr-share-text)" }}
      >
        {formatScore(side.score)}
      </p>
    </div>
  );
}

function BadgeRow({ badges }: { badges: string[] }) {
  if (!badges.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Record badges">
      {badges.map((badge) => (
        <li
          key={badge}
          data-share-record-badge={badge}
          className="rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]"
          style={{ borderColor: "var(--ffr-share-line)", color: "var(--ffr-share-accent)" }}
        >
          {badge}
        </li>
      ))}
    </ul>
  );
}
