import { describe, expect, it } from "vitest";
import {
  hasCompatibleEspnReaderHandshake,
  isEspnAutoInjectEnabled,
  isReaderCompatibleForArm,
  isStaleOrIncompatibleEspnReader,
  mapPublisherStatusToLifecycle,
  planEspnReaderInjection,
  ESPN_LIVE_READER_VERSION,
} from "./espnAutoInject.js";

describe("RFSN-031B espnAutoInject planning", () => {
  const liveHref =
    "https://fantasy.espn.com/football/draft?leagueId=457622&seasonId=2026";
  const compatible = {
    kind: "espn-live-reader",
    readerVersion: ESPN_LIVE_READER_VERSION,
    protocolVersion: 1,
  };

  it("does not inject when auto-inject disabled", () => {
    const plan = planEspnReaderInjection({
      href: liveHref,
      autoInjectEnabled: false,
      handshake: null,
      alreadyInjecting: false,
      injectedThisLoad: false,
    });
    expect(plan.action).toBe("skip");
    expect(plan.reason).toBe("auto_inject_disabled");
  });

  it("does not inject on unsupported ESPN URL", () => {
    const plan = planEspnReaderInjection({
      href: "https://fantasy.espn.com/football/league/draftrecap?leagueId=1",
      autoInjectEnabled: true,
      handshake: null,
      alreadyInjecting: false,
      injectedThisLoad: false,
    });
    expect(plan.action).toBe("unsupported");
  });

  it("injects once on supported live draft URL when enabled", () => {
    const plan = planEspnReaderInjection({
      href: liveHref,
      autoInjectEnabled: true,
      handshake: null,
      alreadyInjecting: false,
      injectedThisLoad: false,
    });
    expect(plan.action).toBe("inject");
    expect(plan.leagueId).toBe("457622");
  });

  it("prevents re-injection when compatible reader present", () => {
    const plan = planEspnReaderInjection({
      href: liveHref,
      autoInjectEnabled: true,
      handshake: compatible,
      alreadyInjecting: false,
      injectedThisLoad: false,
    });
    expect(plan.action).toBe("duplicate_prevented");
    expect(plan.reason).toBe("compatible_reader_present");
  });

  it("prevents duplicate on repeated polling / already injecting", () => {
    expect(
      planEspnReaderInjection({
        href: liveHref,
        autoInjectEnabled: true,
        handshake: null,
        alreadyInjecting: true,
        injectedThisLoad: false,
      }).action,
    ).toBe("duplicate_prevented");
    expect(
      planEspnReaderInjection({
        href: liveHref,
        autoInjectEnabled: true,
        handshake: null,
        alreadyInjecting: false,
        injectedThisLoad: true,
      }).action,
    ).toBe("duplicate_prevented");
  });

  it("flags stale/incompatible handshake for replacement", () => {
    expect(
      isStaleOrIncompatibleEspnReader({
        kind: "espn-live-reader",
        readerVersion: "0.0.1",
        protocolVersion: 1,
      }),
    ).toBe(true);
    expect(hasCompatibleEspnReaderHandshake(compatible)).toBe(true);
  });

  it("version gate blocks incompatible ARM", () => {
    expect(
      isReaderCompatibleForArm({
        readerVersion: "9.9.9",
        protocolVersion: 1,
      }),
    ).toBe(false);
    expect(
      isReaderCompatibleForArm({
        readerVersion: ESPN_LIVE_READER_VERSION,
        protocolVersion: 1,
      }),
    ).toBe(true);
  });

  it("feature flag helpers default off", () => {
    expect(isEspnAutoInjectEnabled(undefined, undefined)).toBe(false);
    expect(isEspnAutoInjectEnabled(true, false)).toBe(false);
    expect(isEspnAutoInjectEnabled(true, true)).toBe(true);
  });

  it("maps publisher status to lifecycle", () => {
    expect(mapPublisherStatusToLifecycle("ready")).toBe("reader_ready");
    expect(mapPublisherStatusToLifecycle("armed")).toBe("armed");
    expect(mapPublisherStatusToLifecycle("monitoring")).toBe("capturing");
    expect(mapPublisherStatusToLifecycle("disarmed")).toBe("disconnected");
  });
});
