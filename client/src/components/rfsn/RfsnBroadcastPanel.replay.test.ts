import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("RfsnBroadcastPanel replay reset wiring", () => {
  const panel = readFileSync(
    resolve(process.cwd(), "client/src/components/rfsn/RfsnBroadcastPanel.tsx"),
    "utf8",
  );
  const warRoom = readFileSync(
    resolve(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
    "utf8",
  );

  it("clears replay when draft or session identity changes", () => {
    expect(panel).toContain("sessionResetKey");
    expect(panel).toContain("audio.clearReplay()");
    expect(panel).toMatch(/\[draftId,\s*sessionResetKey,\s*audio\.clearReplay\]/);
  });

  it("renders the written commentary running log", () => {
    expect(panel).toContain("RfsnCommentaryLog");
    expect(panel).toContain("appendCommentaryLogEntry");
  });

  it("passes a composite session reset key from Live Draft reset and schedule identity", () => {
    expect(warRoom).toContain("sessionResetKey={`${draftId}:${scheduleSig}:${resetCounter}`}");
    expect(warRoom).toContain("setResetCounter((n) => n + 1)");
  });
});
