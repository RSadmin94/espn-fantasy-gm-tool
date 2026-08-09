/**
 * RFSN-053F — Premium Historical Share Cards (model).
 *
 * One ShareCardModel + one renderer. Surfaces only adapt facts.
 * Themes are config. Layouts are renderer variants. No AI. No PNG here.
 * 053G snapshots `[data-share-card-root]` from this same model.
 */

import {
  STORY_COLLECTION_IDS,
  getStoryCollection,
  type StoryCollectionId,
  type StoryCollectionDefinition,
} from "./matchupStoryCollections";

export const SHARE_CARD_TYPES = ["matchup", "collection", "record"] as const;
export type ShareCardType = (typeof SHARE_CARD_TYPES)[number];

export const SHARE_CARD_LAYOUTS = ["landscape", "portrait", "square"] as const;
export type ShareCardLayout = (typeof SHARE_CARD_LAYOUTS)[number];

export const SHARE_CARD_THEME_IDS = [...STORY_COLLECTION_IDS, "neutral"] as const;
export type ShareCardThemeId = (typeof SHARE_CARD_THEME_IDS)[number];
export type ShareCardTheme = ShareCardThemeId;

export const SHARE_RECORD_BADGES = [
  "LARGEST MARGIN",
  "HIGHEST SCORE",
  "LEAGUE RECORD",
  "PLAYOFF",
  "CHAMPIONSHIP",
  "ONE POINT",
  "NO MERCY",
  "CLOSEST",
] as const;
export type ShareRecordBadge = (typeof SHARE_RECORD_BADGES)[number];

/** Pixel targets 053G can rasterize without layout changes. */
export const SHARE_CARD_LAYOUT_SIZE: Record<ShareCardLayout, { width: number; height: number; aspect: string }> = {
  landscape: { width: 1920, height: 1080, aspect: "16 / 9" },
  portrait: { width: 1080, height: 1920, aspect: "9 / 16" },
  square: { width: 1080, height: 1080, aspect: "1 / 1" },
};

export type ShareCardThemeTokens = {
  id: ShareCardThemeId;
  label: string;
  badge: string;
  background: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  line: string;
  treatment: "crimson" | "heartbreak" | "trophy" | "steel" | "photo-finish" | "electric" | "collapse" | "receipt" | "neutral";
};

export const SHARE_CARD_THEMES: Record<ShareCardThemeId, ShareCardThemeTokens> = {
  "no-mercy": {
    id: "no-mercy",
    label: "No Mercy Rule",
    badge: "NO MERCY",
    background: "#140306",
    accent: "#be123c",
    accentSoft: "#9f1239",
    text: "#ffe4e6",
    muted: "#fecdd3",
    line: "rgba(190,18,60,0.45)",
    treatment: "crimson",
  },
  heartbreak: {
    id: "heartbreak",
    label: "Heartbreak Kids",
    badge: "HEARTBREAK",
    background: "#06111f",
    accent: "#1d4ed8",
    accentSoft: "#1e3a8a",
    text: "#dbeafe",
    muted: "#93c5fd",
    line: "rgba(29,78,216,0.45)",
    treatment: "heartbreak",
  },
  championship: {
    id: "championship",
    label: "Championship Glory",
    badge: "CHAMPIONSHIP",
    background: "#161208",
    accent: "#d4af37",
    accentSoft: "#a16207",
    text: "#fef3c7",
    muted: "#fcd34d",
    line: "rgba(212,175,55,0.5)",
    treatment: "trophy",
  },
  "blood-rival": {
    id: "blood-rival",
    label: "Blood Rival",
    badge: "BLOOD RIVAL",
    background: "#0f1216",
    accent: "#94a3b8",
    accentSoft: "#64748b",
    text: "#e2e8f0",
    muted: "#94a3b8",
    line: "rgba(148,163,184,0.4)",
    treatment: "steel",
  },
  "closest-calls": {
    id: "closest-calls",
    label: "Closest Calls",
    badge: "CLOSEST CALL",
    background: "#1a0f05",
    accent: "#ea580c",
    accentSoft: "#c2410c",
    text: "#ffedd5",
    muted: "#fdba74",
    line: "rgba(234,88,12,0.45)",
    treatment: "photo-finish",
  },
  "statement-wins": {
    id: "statement-wins",
    label: "Statement Wins",
    badge: "STATEMENT",
    background: "#04111f",
    accent: "#2563eb",
    accentSoft: "#1d4ed8",
    text: "#dbeafe",
    muted: "#93c5fd",
    line: "rgba(37,99,235,0.5)",
    treatment: "electric",
  },
  "biggest-collapses": {
    id: "biggest-collapses",
    label: "Biggest Collapses",
    badge: "COLLAPSE",
    background: "#141414",
    accent: "#a3a3a3",
    accentSoft: "#525252",
    text: "#e5e5e5",
    muted: "#a3a3a3",
    line: "rgba(163,163,163,0.35)",
    treatment: "collapse",
  },
  cashier: {
    id: "cashier",
    label: "The Cashier",
    badge: "CASHIER",
    background: "#052e16",
    accent: "#22c55e",
    accentSoft: "#15803d",
    text: "#dcfce7",
    muted: "#86efac",
    line: "rgba(34,197,94,0.45)",
    treatment: "receipt",
  },
  neutral: {
    id: "neutral",
    label: "Fantasy Football Rivals",
    badge: "FFR",
    background: "#0b0f14",
    accent: "#eab308",
    accentSoft: "#a16207",
    text: "#f8fafc",
    muted: "#94a3b8",
    line: "rgba(234,179,8,0.35)",
    treatment: "neutral",
  },
};

export type ShareCardSide = {
  name: string;
  score: number;
  logoUrl?: string | null;
  personId?: string | null;
};

export type ShareCardModel = {
  type: ShareCardType;
  title: string;
  subtitle?: string;
  theme: ShareCardTheme;
  layout: ShareCardLayout;
  league: {
    name: string;
    season?: number;
  };
  href: string;
  matchup?: {
    matchupId?: number;
    week?: number;
    winner: ShareCardSide;
    loser: ShareCardSide;
    margin: number;
    phase?: string;
    isTie?: boolean;
    home?: ShareCardSide;
    away?: ShareCardSide;
  };
  collection?: {
    id: string;
    count: number;
    badge?: string;
    ownerName?: string | null;
    opponentName?: string | null;
  };
  record?: {
    label: string;
    value: string;
    owner?: string;
    detail?: string;
    week?: number;
  };
  badges: string[];
  provenance?: string[];
};

export type ShareMatchupInput = {
  matchupId: number;
  season: number;
  week: number;
  phase: "regular" | "playoffs";
  isChampionshipGame: boolean;
  homeDisplayName: string;
  awayDisplayName: string;
  homeScore: number;
  awayScore: number;
  margin: number;
  winnerPersonId: string | null;
  homePersonId: string | null;
  awayPersonId: string | null;
  winnerDisplayName: string | null;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  gameType?: string | null;
  viewerHref?: string | null;
};

export function isShareCardThemeId(raw: string | null | undefined): raw is ShareCardThemeId {
  return !!raw && (SHARE_CARD_THEME_IDS as readonly string[]).includes(raw);
}

export function getShareCardTheme(id: ShareCardTheme): ShareCardThemeTokens {
  return SHARE_CARD_THEMES[id];
}

export function withShareCardPresentation(
  model: ShareCardModel,
  over: { theme?: ShareCardTheme | null; layout?: ShareCardLayout | null },
): ShareCardModel {
  return {
    ...model,
    theme: over.theme && isShareCardThemeId(over.theme) ? over.theme : model.theme,
    layout: over.layout ?? model.layout,
  };
}

export function inferShareCardTheme(input: {
  type: ShareCardType;
  collectionId?: string | null;
  badges?: readonly string[];
  theme?: ShareCardTheme | null;
}): ShareCardTheme {
  if (input.theme && isShareCardThemeId(input.theme)) return input.theme;
  if (input.collectionId && isShareCardThemeId(input.collectionId)) return input.collectionId;
  const badges = input.badges ?? [];
  if (badges.includes("NO MERCY")) return "no-mercy";
  if (badges.includes("ONE POINT")) return "heartbreak";
  if (badges.includes("CHAMPIONSHIP")) return "championship";
  if (badges.includes("CLOSEST")) return "closest-calls";
  if (badges.includes("HIGHEST SCORE") && input.type === "matchup") return "cashier";
  if (badges.includes("LARGEST MARGIN")) return "no-mercy";
  return "neutral";
}

function side(
  name: string,
  score: number,
  extra: Pick<ShareCardSide, "logoUrl" | "personId"> = {},
): ShareCardSide {
  return { name, score, logoUrl: extra.logoUrl ?? null, personId: extra.personId ?? null };
}

export function shareCardWinnerLoser(matchup: ShareMatchupInput): {
  winner: ShareCardSide;
  loser: ShareCardSide;
  isTie: boolean;
} {
  const home = side(matchup.homeDisplayName, matchup.homeScore, {
    logoUrl: matchup.homeLogoUrl,
    personId: matchup.homePersonId,
  });
  const away = side(matchup.awayDisplayName, matchup.awayScore, {
    logoUrl: matchup.awayLogoUrl,
    personId: matchup.awayPersonId,
  });
  if (!matchup.winnerPersonId || matchup.homeScore === matchup.awayScore) {
    const homeHigher = matchup.homeScore >= matchup.awayScore;
    return { winner: homeHigher ? home : away, loser: homeHigher ? away : home, isTie: true };
  }
  if (matchup.winnerPersonId === matchup.homePersonId) return { winner: home, loser: away, isTie: false };
  if (matchup.winnerPersonId === matchup.awayPersonId) return { winner: away, loser: home, isTie: false };
  const named = matchup.winnerDisplayName?.trim();
  if (named && named === matchup.awayDisplayName) return { winner: away, loser: home, isTie: false };
  return { winner: home, loser: away, isTie: false };
}

export function shareBadgesFromMatchup(
  matchup: Pick<ShareMatchupInput, "phase" | "isChampionshipGame" | "margin" | "gameType">,
  extra: ShareRecordBadge[] = [],
): ShareRecordBadge[] {
  const badges: ShareRecordBadge[] = [];
  if (matchup.isChampionshipGame) badges.push("CHAMPIONSHIP");
  if (matchup.phase === "playoffs") badges.push("PLAYOFF");
  if (matchup.gameType === "blowout" || matchup.margin >= 50 - 1e-9) badges.push("NO MERCY");
  if (matchup.margin >= 0.5 - 1e-9 && matchup.margin <= 1.49 + 1e-9) badges.push("ONE POINT");
  for (const b of extra) {
    if (!badges.includes(b)) badges.push(b);
  }
  return badges;
}

export function matchupToShareCard(
  matchup: ShareMatchupInput,
  opts: {
    collectionId?: StoryCollectionId | null;
    leagueName?: string | null;
    extraBadges?: ShareRecordBadge[];
    href?: string | null;
    layout?: ShareCardLayout;
    theme?: ShareCardTheme | null;
    provenance?: string[];
  } = {},
): ShareCardModel {
  const wl = shareCardWinnerLoser(matchup);
  const badges = shareBadgesFromMatchup(matchup, opts.extraBadges);
  const href =
    opts.href?.trim() ||
    matchup.viewerHref ||
    `/league/history/matchups/${matchup.matchupId}?season=${matchup.season}&week=${matchup.week}`;
  const theme = inferShareCardTheme({
    type: "matchup",
    collectionId: opts.collectionId,
    badges,
    theme: opts.theme,
  });
  const phaseLabel = matchup.phase === "playoffs" ? "Playoffs" : "Regular season";
  const title = wl.isTie ? `${matchup.homeDisplayName} vs ${matchup.awayDisplayName}` : `${wl.winner.name} def. ${wl.loser.name}`;
  const provenance = [
    "queryMatchupGallery",
    `matchupId:${matchup.matchupId}`,
    ...(opts.collectionId ? [`storyCollection:${opts.collectionId}`] : []),
    ...(opts.provenance ?? []),
  ];
  return {
    type: "matchup",
    title,
    subtitle: `${matchup.season} · Week ${matchup.week} · ${phaseLabel}`,
    theme,
    layout: opts.layout ?? "landscape",
    league: { name: opts.leagueName?.trim() || "", season: matchup.season },
    href,
    matchup: {
      matchupId: matchup.matchupId,
      week: matchup.week,
      winner: wl.winner,
      loser: wl.loser,
      margin: matchup.margin,
      phase: matchup.phase,
      isTie: wl.isTie,
      home: side(matchup.homeDisplayName, matchup.homeScore, {
        logoUrl: matchup.homeLogoUrl,
        personId: matchup.homePersonId,
      }),
      away: side(matchup.awayDisplayName, matchup.awayScore, {
        logoUrl: matchup.awayLogoUrl,
        personId: matchup.awayPersonId,
      }),
    },
    badges,
    provenance,
  };
}

export function collectionToShareCard(
  collection: StoryCollectionDefinition | StoryCollectionId,
  opts: {
    count?: number | null;
    summary?: string | null;
    href?: string | null;
    leagueName?: string | null;
    ownerName?: string | null;
    opponentName?: string | null;
    layout?: ShareCardLayout;
    theme?: ShareCardTheme | null;
    provenance?: string[];
  } = {},
): ShareCardModel {
  const def = typeof collection === "string" ? getStoryCollection(collection) : collection;
  const count = opts.count ?? 0;
  return {
    type: "collection",
    title: def.title,
    subtitle: opts.summary?.trim() || def.subtitle,
    theme: inferShareCardTheme({ type: "collection", collectionId: def.id, theme: opts.theme }),
    layout: opts.layout ?? "landscape",
    league: { name: opts.leagueName?.trim() || "" },
    href: opts.href?.trim() || `/league/history/matchups/c/${def.id}`,
    collection: {
      id: def.id,
      count,
      badge: def.badge,
      ownerName: opts.ownerName ?? null,
      opponentName: opts.opponentName ?? null,
    },
    badges: [def.badge.toUpperCase()],
    provenance: ["storyCollection", `storyCollection:${def.id}`, ...(opts.provenance ?? [])],
  };
}

export function recordToShareCard(input: {
  title: string;
  label: string;
  value: string;
  owner?: string | null;
  detail?: string | null;
  season?: number | null;
  week?: number | null;
  badges?: ShareRecordBadge[];
  href?: string | null;
  leagueName?: string | null;
  theme?: ShareCardTheme | null;
  layout?: ShareCardLayout;
  provenance?: string[];
}): ShareCardModel {
  const badges = [...(input.badges ?? ["LEAGUE RECORD"])];
  const subtitleParts = [
    input.season != null ? String(input.season) : null,
    input.week != null ? `Week ${input.week}` : null,
    input.detail?.trim() || null,
  ].filter(Boolean);
  return {
    type: "record",
    title: input.title,
    subtitle: subtitleParts.join(" · ") || undefined,
    theme: inferShareCardTheme({ type: "record", badges, theme: input.theme }),
    layout: input.layout ?? "landscape",
    league: { name: input.leagueName?.trim() || "", season: input.season ?? undefined },
    href: input.href?.trim() || "/league/history/records",
    record: {
      label: input.label,
      value: input.value,
      owner: input.owner?.trim() || undefined,
      detail: input.detail?.trim() || undefined,
      week: input.week ?? undefined,
    },
    badges,
    provenance: ["leagueRecords", ...(input.provenance ?? [])],
  };
}

export function shareCardCssVars(theme: ShareCardThemeTokens): Record<string, string> {
  return {
    "--ffr-share-bg": theme.background,
    "--ffr-share-accent": theme.accent,
    "--ffr-share-accent-soft": theme.accentSoft,
    "--ffr-share-text": theme.text,
    "--ffr-share-muted": theme.muted,
    "--ffr-share-line": theme.line,
  };
}
