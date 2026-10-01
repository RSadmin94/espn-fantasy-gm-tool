import { describe, expect, it } from "vitest";
import { resolveDeployIdentity, type BuildMeta } from "./deployIdentity";

const STALE_META: BuildMeta = {
  gitSha: "06b35ba363463669a9fbd5901b8d73e20e4d42a1",
  gitBranch: "release/promote-provider-expansion-dff6154",
  buildTime: "2026-09-23T10:50:49.807Z",
  source: "env",
};

const RAILWAY_SHA = "1a702981b8bacccdeab9becec010952b47b2e680";
const BUILD_GIT_SHA = "7525732c39bd50e2839372e6b4f0d916610cf235";

describe("resolveDeployIdentity", () => {
  it("A. uses Railway Git SHA when available", () => {
    const identity = resolveDeployIdentity(
      {
        RAILWAY_GIT_COMMIT_SHA: RAILWAY_SHA,
        RAILWAY_GIT_BRANCH: "release/promote-provider-expansion-dff6154",
      },
      null,
    );
    expect(identity.gitSha).toBe(RAILWAY_SHA);
    expect(identity.gitIdentitySource).toBe("railway");
    expect(identity.gitBranch).toBe("release/promote-provider-expansion-dff6154");
  });

  it("B. Railway SHA wins over stale build-meta and frozen GIT_COMMIT", () => {
    const identity = resolveDeployIdentity(
      {
        RAILWAY_GIT_COMMIT_SHA: RAILWAY_SHA,
        GIT_COMMIT: STALE_META.gitSha,
        BUILD_TIME: "2020-01-01T00:00:00.000Z",
      },
      STALE_META,
    );
    expect(identity.gitSha).toBe(RAILWAY_SHA);
    expect(identity.gitIdentitySource).toBe("railway");
    expect(identity.buildTime).toBe(STALE_META.buildTime);
  });

  it("C. falls back to git-discovered build-meta when Railway SHA is absent", () => {
    const identity = resolveDeployIdentity(
      { GIT_COMMIT: STALE_META.gitSha },
      {
        gitSha: BUILD_GIT_SHA,
        gitBranch: "fix/deploy-git-identity",
        buildTime: "2026-09-30T00:00:00.000Z",
        source: "git",
      },
    );
    expect(identity.gitSha).toBe(BUILD_GIT_SHA);
    expect(identity.gitIdentitySource).toBe("build-meta");
    expect(identity.gitBranch).toBe("fix/deploy-git-identity");
  });

  it("D. remains healthy with unknown identity when nothing is available", () => {
    const identity = resolveDeployIdentity({}, null);
    expect(identity.gitSha).toBe("unknown");
    expect(identity.gitIdentitySource).toBe("unknown");
    expect(identity.gitBranch).toBe("unknown");
    expect(identity.buildTime).toBe("unknown");
  });

  it("E. keeps buildTime and identity fields even when SHA source changes", () => {
    const identity = resolveDeployIdentity(
      { RAILWAY_GIT_COMMIT_SHA: RAILWAY_SHA },
      STALE_META,
    );
    expect(identity).toEqual(
      expect.objectContaining({
        gitSha: RAILWAY_SHA,
        gitBranch: STALE_META.gitBranch,
        buildTime: STALE_META.buildTime,
        gitIdentitySource: "railway",
      }),
    );
  });

  it("ignores non-sha Railway placeholders and does not let them block fallback", () => {
    const identity = resolveDeployIdentity(
      { RAILWAY_GIT_COMMIT_SHA: "unknown", GIT_COMMIT: BUILD_GIT_SHA },
      null,
    );
    expect(identity.gitSha).toBe(BUILD_GIT_SHA);
    expect(identity.gitIdentitySource).toBe("env");
  });

  it("uses explicit GIT_COMMIT only when no platform SHA or git-sourced meta exists", () => {
    const identity = resolveDeployIdentity(
      { GIT_COMMIT: BUILD_GIT_SHA },
      STALE_META,
    );
    expect(identity.gitSha).toBe(BUILD_GIT_SHA);
    expect(identity.gitIdentitySource).toBe("env");
  });

  it("uses env-baked build-meta only as last resort", () => {
    const identity = resolveDeployIdentity({}, STALE_META);
    expect(identity.gitSha).toBe(STALE_META.gitSha);
    expect(identity.gitIdentitySource).toBe("build-meta");
  });

  it("prefers live Railway branch over baked meta branch", () => {
    const identity = resolveDeployIdentity(
      {
        RAILWAY_GIT_COMMIT_SHA: RAILWAY_SHA,
        RAILWAY_GIT_BRANCH: "release/promote-provider-expansion-dff6154",
      },
      { ...STALE_META, gitBranch: "old-branch" },
    );
    expect(identity.gitBranch).toBe("release/promote-provider-expansion-dff6154");
  });
});
