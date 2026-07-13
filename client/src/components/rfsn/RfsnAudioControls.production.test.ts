import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("RfsnAudioControls production unlock regression", () => {
  const controls = readFileSync(
    resolve(process.cwd(), "client/src/components/rfsn/RfsnAudioControls.tsx"),
    "utf8",
  );
  const hook = readFileSync(
    resolve(process.cwd(), "client/src/hooks/useRfsnAudioPlayback.ts"),
    "utf8",
  );

  it("shows Tap to Enable Sound when preference is on but session is locked", () => {
    expect(controls).toContain("Tap to Enable Sound");
    expect(controls).toContain("!audio.unlocked");
    expect(controls).toContain("unlockAudio");
  });

  it("replays on-air line immediately after unlock gesture", () => {
    expect(hook).toContain("autoPlayedOnUnlockRef");
    expect(hook).toContain("playForCardRef.current(card");
  });

  it("exposes replay availability without provider URLs", () => {
    expect(hook).toContain("replayAvailable");
    expect(hook).toContain("clearReplay");
    expect(hook).toContain("/api/rfsn/audio/");
    expect(hook).not.toMatch(/openai|elevenlabs|provider.*url/i);
  });

  it("disables replay after clearReplay", () => {
    expect(hook).toMatch(/lastPlayableRef\.current = null/);
    expect(hook).toContain("setLastPlayable(null)");
  });
});
