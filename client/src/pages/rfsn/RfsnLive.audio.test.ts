import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("RfsnLive audio control ownership", () => {
  it("does not own booth audio on the Live page (booth lives in War Room panel)", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/rfsn/RfsnLive.tsx"), "utf8");
    expect(source).not.toContain("RfsnAudioControls");
    expect(source).not.toContain("useRfsnAudioPlayback");
    expect(source).toContain("DraftWarRoom");
  });

  it("hides RfsnAudioControls when tts is unavailable", () => {
    const controls = readFileSync(
      resolve(process.cwd(), "client/src/components/rfsn/RfsnAudioControls.tsx"),
      "utf8",
    );
    expect(controls).toContain("if (!ttsAvailable) return null");
    expect(controls).toContain("Enable Broadcast Audio");
  });

  it("booth audio remains available from RfsnBroadcastPanel", () => {
    const panel = readFileSync(
      resolve(process.cwd(), "client/src/components/rfsn/RfsnBroadcastPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("RfsnAudioControls");
  });
});
