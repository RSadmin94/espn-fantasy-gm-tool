import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("RfsnLive Live Draft control center", () => {
  const liveSource = readFileSync(
    resolve(process.cwd(), "client/src/pages/rfsn/RfsnLive.tsx"),
    "utf8",
  );
  const warRoom = readFileSync(
    resolve(process.cwd(), "client/src/pages/DraftWarRoom.tsx"),
    "utf8",
  );

  it("mounts DraftWarRoom as Live Draft ops center (not passive broadcast shell)", () => {
    expect(liveSource).toContain("DraftWarRoom");
    expect(liveSource).toContain("preferLiveDraft");
    expect(liveSource).toContain("liveOpsOnly");
    expect(liveSource).toContain("RfsnMediaShell");
    expect(liveSource).not.toContain("RfsnBroadcastShell");
    expect(liveSource).not.toContain("RfsnDraftBoard");
    expect(liveSource).not.toContain("RfsnLiveStandby");
  });

  it("liveOpsOnly hides War Room analytics chrome", () => {
    expect(warRoom).toContain("data-live-draft-ops-page");
    expect(warRoom).toContain("if (liveOpsOnly)");
    expect(warRoom).toContain("preferLiveDraft={forceLive}");
  });

  it("gates access via rfsnBroadcast.getAccess", () => {
    expect(liveSource).toContain("rfsnBroadcast.getAccess");
    expect(liveSource).toContain("RfsnLiveDisabled");
  });
});
