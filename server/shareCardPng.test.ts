import { afterEach, describe, expect, it } from "vitest";
import {
  collectionToShareCard,
  matchupToShareCard,
  recordToShareCard,
  withShareCardPresentation,
  type ShareMatchupInput,
} from "@shared/historicalShareCard";
import {
  clearShareCardPngCacheForTests,
  exportShareCardPng,
  isPngBuffer,
  readPngSize,
  setShareCardRasterizeForTests,
  shareCardCacheKey,
} from "./shareCardPng";

function matchup(): ShareMatchupInput {
  return {
    matchupId: 11,
    season: 2025,
    week: 12,
    phase: "regular",
    isChampionshipGame: false,
    homeDisplayName: "Rod Sellers",
    awayDisplayName: "Bruce Edwards",
    homeScore: 180,
    awayScore: 120,
    margin: 60,
    winnerPersonId: "id:rod",
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    winnerDisplayName: "Rod Sellers",
    homeLogoUrl: null,
    awayLogoUrl: null,
    gameType: "blowout",
    viewerHref: "/league/history/matchups/11",
  };
}

/** Minimal valid PNG with IHDR width/height. */
function fakePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const crc = crc32(Buffer.concat([Buffer.from("IHDR"), ihdrData]));
  const ihdr = Buffer.alloc(12 + 13);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, 4, "ascii");
  ihdrData.copy(ihdr, 8);
  ihdr.writeUInt32BE(crc, 21);
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([sig, ihdr, iend]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (~c >>> 0);
}

afterEach(() => {
  setShareCardRasterizeForTests(null);
  clearShareCardPngCacheForTests();
});

describe("RFSN-053G PNG cache + integrity", () => {
  it("caches identical cards and does not regenerate", async () => {
    let calls = 0;
    setShareCardRasterizeForTests(async (_html, size) => {
      calls += 1;
      return fakePng(size.width, size.height);
    });
    const model = matchupToShareCard(matchup(), { collectionId: "no-mercy" });
    const first = await exportShareCardPng(model, 2);
    const second = await exportShareCardPng(model, 2);
    expect(calls).toBe(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(first.png.equals(second.png)).toBe(true);
    expect(first.filename).toBe("no-mercy-2025-week-12-rod-vs-bruce.png");
    expect(isPngBuffer(first.png)).toBe(true);
    expect(readPngSize(first.png)).toEqual({ width: 3840, height: 2160 });
  });

  it("uses different cache keys for layout, theme, and scale", async () => {
    setShareCardRasterizeForTests(async (_html, size) => fakePng(size.width, size.height));
    const base = matchupToShareCard(matchup(), { collectionId: "no-mercy" });
    const landscape = shareCardCacheKey(base, 2);
    const portrait = shareCardCacheKey(withShareCardPresentation(base, { layout: "portrait" }), 2);
    const square = shareCardCacheKey(withShareCardPresentation(base, { layout: "square" }), 2);
    const heartbreak = shareCardCacheKey(withShareCardPresentation(base, { theme: "heartbreak" }), 2);
    const x1 = shareCardCacheKey(base, 1);
    expect(new Set([landscape, portrait, square, heartbreak, x1]).size).toBe(5);
  });

  it("exports collection and record types at requested dimensions", async () => {
    setShareCardRasterizeForTests(async (_html, size) => fakePng(size.width, size.height));
    const collection = await exportShareCardPng(collectionToShareCard("blood-rival", { count: 19 }), 1);
    const record = await exportShareCardPng(
      recordToShareCard({
        title: "Largest blowout",
        label: "Largest Margin",
        value: "88",
        theme: "cashier",
      }),
      4,
    );
    expect(collection.filename).toBe("blood-rival.png");
    expect(readPngSize(collection.png)).toEqual({ width: 1920, height: 1080 });
    expect(record.filename).toBe("cashier-largest-margin.png");
    expect(readPngSize(record.png)).toEqual({ width: 7680, height: 4320 });
  });

  it("never returns a partial/non-png buffer", async () => {
    setShareCardRasterizeForTests(async () => Buffer.from("not-a-png"));
    await expect(exportShareCardPng(matchupToShareCard(matchup(), { collectionId: "no-mercy" }), 1)).rejects.toThrow(
      /Unable to generate image/,
    );
  });
});
