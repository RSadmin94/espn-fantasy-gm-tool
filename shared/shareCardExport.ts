/**
 * RFSN-053G — Share Card PNG export contract.
 * Rasterizes ShareCardRenderer HTML. No second layout engine. No AI.
 */

import {
  SHARE_CARD_LAYOUTS,
  SHARE_CARD_LAYOUT_SIZE,
  SHARE_CARD_TYPES,
  isShareCardThemeId,
  type ShareCardLayout,
  type ShareCardModel,
} from "./historicalShareCard";

export const SHARE_CARD_RENDERER_VERSION = "rfsn-053g-1";

export const SHARE_CARD_SCALES = [1, 2, 4] as const;
export type ShareCardScale = (typeof SHARE_CARD_SCALES)[number];

export const SHARE_CARD_EXPORT_ERROR = "Unable to generate image.";

export function isShareCardScale(raw: unknown): raw is ShareCardScale {
  return raw === 1 || raw === 2 || raw === 4;
}

export function shareCardExportSize(layout: ShareCardLayout, scale: ShareCardScale = 2): {
  width: number;
  height: number;
  scale: ShareCardScale;
} {
  const base = SHARE_CARD_LAYOUT_SIZE[layout];
  return { width: base.width * scale, height: base.height * scale, scale };
}

function slug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function nameSlug(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  return slug(trimmed.split(/\s+/)[0] || trimmed);
}

/** Deterministic download filename. */
export function shareCardExportFilename(model: ShareCardModel): string {
  if (model.type === "matchup") {
    const theme = model.theme === "neutral" ? "matchup" : model.theme;
    const season = model.league.season;
    const week = model.matchup?.week;
    const home = nameSlug(model.matchup?.home?.name || model.matchup?.winner.name);
    const away = nameSlug(model.matchup?.away?.name || model.matchup?.loser.name);
    const parts = [theme];
    if (season) parts.push(String(season));
    if (week != null) parts.push(`week-${week}`);
    if (home && away) parts.push(`${home}-vs-${away}`);
    else if (home || away) parts.push(home || away);
    return `${parts.join("-")}.png`;
  }
  if (model.type === "collection") {
    const id = model.collection?.id || model.theme;
    const a = nameSlug(model.collection?.ownerName);
    const b = nameSlug(model.collection?.opponentName);
    if (a && b) return `${id}-${a}-vs-${b}.png`;
    return `${id}.png`;
  }
  const theme = model.theme === "neutral" ? "record" : model.theme;
  const label = slug(model.record?.label || model.title) || "record";
  return `${theme}-${label}.png`;
}

/** Visual-only hash input: href/provenance do not affect pixels. */
export function shareCardVisualHashInput(model: ShareCardModel): unknown {
  return {
    type: model.type,
    title: model.title,
    subtitle: model.subtitle ?? "",
    theme: model.theme,
    layout: model.layout,
    league: model.league,
    matchup: model.matchup ?? null,
    collection: model.collection ?? null,
    record: model.record ?? null,
    badges: model.badges,
  };
}

export function parseShareCardModel(raw: unknown): ShareCardModel | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as ShareCardModel;
  if (!(SHARE_CARD_TYPES as readonly string[]).includes(m.type)) return null;
  if (!isShareCardThemeId(m.theme)) return null;
  if (!(SHARE_CARD_LAYOUTS as readonly string[]).includes(m.layout)) return null;
  if (typeof m.title !== "string" || !m.title.trim()) return null;
  if (!m.league || typeof m.league !== "object" || typeof m.league.name !== "string") return null;
  if (!Array.isArray(m.badges)) return null;
  if (m.type === "matchup" && !m.matchup) return null;
  if (m.type === "collection" && !m.collection) return null;
  if (m.type === "record" && !m.record) return null;
  return m;
}
