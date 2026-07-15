import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("RfsnLive audio control visibility", () => {
  it("renders Enable Broadcast Audio whenever ttsEnabled on live page", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/rfsn/RfsnLive.tsx"), "utf8");
    expect(source).toContain("RfsnAudioControls");
    expect(source).toContain("ttsAvailable &&");
    expect(source).not.toMatch(/snapshot \? \([\s\S]*RfsnAudioControls/);
  });

  it("hides controls when tts is unavailable", () => {
    const controls = readFileSync(
      resolve(process.cwd(), "client/src/components/rfsn/RfsnAudioControls.tsx"),
      "utf8",
    );
    expect(controls).toContain('if (!ttsAvailable) return null');
    expect(controls).toContain("Enable Broadcast Audio");
  });
});
