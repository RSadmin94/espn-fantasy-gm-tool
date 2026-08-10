/**
 * RFSN-053H — Advisor narration from a HistoricalStoryPackage.
 * Does not replace gallery/query/leaderboard tools. Facts stay deterministic.
 */
import {
  inferStoryCollection,
  isStoryCollectionId,
  STORY_COLLECTION_IDS,
  type StoryCollectionId,
} from "@shared/matchupStoryCollections";
import { inferNarrationVoice, formatNarrationMessage, NARRATION_EXPORT_ERROR } from "@shared/historicalNarration";
import { collectionToStoryPackage, matchupToStoryPackage } from "@shared/historicalStoryPackage";
import type { NarrationVoice } from "@shared/historicalStoryPackage";
import type { AdvisorOwnerAlias } from "./advisorQuestionClassify";
import { findMentionedOwners } from "./advisorQuestionClassify";
import { queryStoryCollection } from "./matchupStoryCollections";
import { queryMatchupGallery, type GalleryFilter, type GalleryGameRecord } from "./matchupGalleryQuery";
import { narrateHistoricalStory } from "./historicalNarration";
import type { AdvisorHistoricalNarrationVisual } from "./advisorVisual";

export const HISTORICAL_NARRATION_TOOL_NAME = "narrate_historical_story" as const;

export function isHistoricalNarrationAsk(message: string): boolean {
  const t = String(message ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\btell me about (?:our |the )?league\b/.test(t)) return false;
  if (/\bwho has (the )?most\b/.test(t) || /\bbest record\b/.test(t)) return false;
  if (/\bwho reaches\b/.test(t) || /\breaches the most\b/.test(t)) return false;
  if (/\bbest career record\b/.test(t) || /\bbiggest blowout\b/.test(t)) return false;
  if (/\bshow me\b/.test(t) || /\blist (all|every|my)\b/.test(t) || /\bevery game\b/.test(t)) return false;
  if (/\btell me about this\b/.test(t)) return true;
  if (/\bwhy was this important\b/.test(t)) return true;
  if (/\bwhy is this no mercy\b/.test(t)) return true;
  if (/\bexplain this rivalry\b/.test(t)) return true;
  if (/\bnarrate\b/.test(t) || /\bbroadcast intro\b/.test(t)) return true;
  if (/\btell (me )?the story\b/.test(t) || /\bwhat(?:'s| is) the story\b/.test(t)) return true;
  if (/\bwhy (?:was|is) this (game|matchup|one|heartbreak|cashier|collapse|statement)\b/.test(t)) return true;
  return false;
}

export function inferNarrationCollection(message: string): StoryCollectionId | null {
  const t = String(message ?? "").toLowerCase();
  if (/\bno mercy\b/.test(t)) return "no-mercy";
  if (/\bheartbreak\b/.test(t)) return "heartbreak";
  if (/\bblood rival\b|\bexplain this rivalry\b|\bthis rivalry\b/.test(t)) return "blood-rival";
  if (/\bclosest calls?\b/.test(t)) return "closest-calls";
  if (/\bstatement wins?\b/.test(t)) return "statement-wins";
  if (/\bbiggest collapses?\b|\bcollapse\b/.test(t)) return "biggest-collapses";
  if (/\bcashier\b/.test(t)) return "cashier";
  if (/\bchampionship\b/.test(t) && !/\brivalry\b/.test(t)) return "championship";
  for (const id of STORY_COLLECTION_IDS) {
    if (t.includes(id.replace(/-/g, " "))) return id;
  }
  return null;
}

function isThisGameAsk(message: string): boolean {
  const t = String(message ?? "").toLowerCase();
  return /\bthis (game|matchup|one)\b/.test(t) || /\bwhy was this important\b/.test(t);
}

export type HistoricalNarrationToolAnswer = {
  selected: true;
  toolName: typeof HISTORICAL_NARRATION_TOOL_NAME;
  answer: string;
  visual?: AdvisorHistoricalNarrationVisual;
  galleryFilter?: GalleryFilter | null;
  collection?: StoryCollectionId | null;
};

export async function tryHistoricalNarrationToolAnswer(args: {
  leagueId: string;
  message: string;
  currentOwnerName?: string | null;
  leagueName?: string | null;
  ownerAliases?: AdvisorOwnerAlias[];
  priorFilter?: GalleryFilter | null;
  loadGames?: (leagueId: string) => Promise<GalleryGameRecord[]>;
  narrate?: typeof narrateHistoricalStory;
}): Promise<HistoricalNarrationToolAnswer | null> {
  if (!isHistoricalNarrationAsk(args.message)) return null;
  const voice: NarrationVoice = inferNarrationVoice(args.message);
  const load =
    args.loadGames ??
    (await import("./matchupGalleryRouter")).loadGalleryGames;
  const games = await load(args.leagueId);
  const mentioned = findMentionedOwners(args.message, args.ownerAliases ?? []).map((o) => o.displayName);
  const opponentName =
    mentioned.find((n) => n !== args.currentOwnerName) ||
    args.priorFilter?.opponentName ||
    null;
  const collectionId = inferNarrationCollection(args.message);

  const narrate = args.narrate ?? narrateHistoricalStory;

  try {
    if (isThisGameAsk(args.message) && args.priorFilter) {
      const result = queryMatchupGallery(games, { ...args.priorFilter, limit: Math.min(args.priorFilter.limit ?? 5, 5) });
      const game = result.matchups[0];
      if (!game) {
        return {
          selected: true,
          toolName: HISTORICAL_NARRATION_TOOL_NAME,
          answer: "No recorded game is in context to narrate.",
          galleryFilter: args.priorFilter,
        };
      }
      const pkg = matchupToStoryPackage({
        ...game,
        leagueName: args.leagueName,
        collectionId: inferStoryCollection(result.filter) ?? collectionId,
        coverageYears: { from: result.coverage.seasonFrom, to: result.coverage.seasonTo },
        coverageNote: result.summary,
        provenance: ["advisorNarration", "thisGame"],
      });
      const out = await narrate(pkg, voice);
      return {
        selected: true,
        toolName: HISTORICAL_NARRATION_TOOL_NAME,
        answer: formatNarrationMessage(out.narration),
        visual: {
          type: "historical_narration",
          voice: out.narration.voice,
          narration: out.narration,
          href: game.viewerHref,
          collection: pkg.collection,
        },
        galleryFilter: result.filter,
        collection: pkg.collection,
      };
    }

    const id = collectionId ?? (isStoryCollectionId(inferStoryCollection(args.priorFilter ?? {})) ? inferStoryCollection(args.priorFilter ?? {}) : null);
    if (id) {
      const result = queryStoryCollection(games, id, {
        ownerName: args.currentOwnerName,
        opponentName,
      });
      if (id === "blood-rival" && result.emptyReason === "unresolved_opponent") {
        return {
          selected: true,
          toolName: HISTORICAL_NARRATION_TOOL_NAME,
          answer: result.summary,
          galleryFilter: result.filter,
          collection: id,
        };
      }
      const pkg = collectionToStoryPackage(id, {
        count: result.total,
        summary: result.summary,
        emptyReason: result.emptyReason,
        coverageYears: { from: result.coverage.seasonFrom, to: result.coverage.seasonTo },
        coverageNote: result.coverage.championshipNote,
        ownerName: args.currentOwnerName,
        opponentName,
        leagueName: args.leagueName,
        featured: result.matchups.slice(0, 5),
        provenance: ["advisorNarration"],
      });
      const out = await narrate(pkg, voice);
      return {
        selected: true,
        toolName: HISTORICAL_NARRATION_TOOL_NAME,
        answer: formatNarrationMessage(out.narration),
        visual: {
          type: "historical_narration",
          voice: out.narration.voice,
          narration: out.narration,
          href: result.seeAllHref,
          collection: id,
        },
        galleryFilter: result.filter,
        collection: id,
      };
    }

    if (args.priorFilter) {
      const result = queryMatchupGallery(games, { ...args.priorFilter, limit: 1 });
      const game = result.matchups[0];
      if (game) {
        const pkg = matchupToStoryPackage({
          ...game,
          leagueName: args.leagueName,
          collectionId: inferStoryCollection(result.filter),
          coverageYears: { from: result.coverage.seasonFrom, to: result.coverage.seasonTo },
          coverageNote: result.summary,
          provenance: ["advisorNarration", "priorGallery"],
        });
        const out = await narrate(pkg, voice);
        return {
          selected: true,
          toolName: HISTORICAL_NARRATION_TOOL_NAME,
          answer: formatNarrationMessage(out.narration),
          visual: {
            type: "historical_narration",
            voice: out.narration.voice,
            narration: out.narration,
            href: game.viewerHref,
            collection: pkg.collection,
          },
          galleryFilter: result.filter,
          collection: pkg.collection,
        };
      }
    }
  } catch {
    return {
      selected: true,
      toolName: HISTORICAL_NARRATION_TOOL_NAME,
      answer: NARRATION_EXPORT_ERROR,
    };
  }

  return {
    selected: true,
    toolName: HISTORICAL_NARRATION_TOOL_NAME,
    answer:
      "I can narrate a recorded game or Story Collection. Open a matchup or name No Mercy, Heartbreak, Cashier, or a rivalry first.",
  };
}
