import { describe, expect, it } from "vitest";
import {
  isEspnMirrorPublisherHandshake,
  resolveEspnBmTransportPresence,
  shouldEnableLegacyEspnLeagueFetch,
  shouldPreferEspnBookmarkletStatus,
} from "./espnBookmarkletLivePath";

describe("espnBookmarkletLivePath", () => {
  it("does not enable legacy league fetch while bookmarklet mode is active", () => {
    expect(
      shouldEnableLegacyEspnLeagueFetch({
        connectedLeagueLive: true,
        bookmarkletConnectorStatus: "waiting_for_espn_mirror",
      }),
    ).toBe(false);
    expect(
      shouldEnableLegacyEspnLeagueFetch({
        connectedLeagueLive: true,
        bookmarkletConnectorStatus: "monitoring",
      }),
    ).toBe(false);
    expect(
      shouldEnableLegacyEspnLeagueFetch({
        connectedLeagueLive: true,
        bookmarkletConnectorStatus: "idle",
      }),
    ).toBe(false);
  });

  it("enables legacy league fetch only when extension is missing", () => {
    expect(
      shouldEnableLegacyEspnLeagueFetch({
        connectedLeagueLive: true,
        bookmarkletConnectorStatus: "extension_missing",
      }),
    ).toBe(true);
    expect(
      shouldEnableLegacyEspnLeagueFetch({
        connectedLeagueLive: false,
        bookmarkletConnectorStatus: "extension_missing",
      }),
    ).toBe(false);
  });

  it("prefers bookmarklet status for reconnect UI whenever extension is present/arming", () => {
    expect(
      shouldPreferEspnBookmarkletStatus({
        connectedLeagueLive: true,
        bookmarkletConnectorStatus: "waiting_for_espn_tab",
      }),
    ).toBe(true);
    expect(
      shouldPreferEspnBookmarkletStatus({
        connectedLeagueLive: true,
        bookmarkletConnectorStatus: "extension_missing",
      }),
    ).toBe(false);
  });

  it("STATUS ready alone is not publisher handshake (Waiting, not Connected)", () => {
    expect(
      isEspnMirrorPublisherHandshake({
        status: "ready",
        sessionNonce: null,
        leagueId: null,
        draftId: null,
      }),
    ).toBe(false);
  });

  it("background waiting_for_espn_mirror / tab-reach armed without identity is not Connected", () => {
    expect(
      isEspnMirrorPublisherHandshake({
        status: "waiting_for_espn_mirror",
        sessionNonce: "n1",
      }),
    ).toBe(false);
    expect(
      isEspnMirrorPublisherHandshake({
        status: "armed",
        sessionNonce: "n1",
        // no leagueId / draftId — extension tab-reach signal
      }),
    ).toBe(false);
  });

  it("publisher STATUS armed with league identity is Connected confirmation", () => {
    expect(
      isEspnMirrorPublisherHandshake({
        status: "armed",
        sessionNonce: "n1",
        leagueId: "457622",
        draftId: "espn-live-457622-2026",
      }),
    ).toBe(true);
    expect(
      isEspnMirrorPublisherHandshake({
        status: "monitoring",
        sessionNonce: "n1",
        leagueId: "457622",
      }),
    ).toBe(true);
  });

  it("connected → espnTabs:0 / waiting_for_espn_tab clears mirrorHandshake", () => {
    const cleared = resolveEspnBmTransportPresence({
      prevMirrorHandshake: true,
      prevTransportActive: true,
      prevConnectorStatus: "monitoring",
      prevEspnTabs: 1,
      status: "waiting_for_espn_tab",
      espnTabs: 0,
      publisherConfirmed: false,
    });
    expect(cleared.mirrorHandshake).toBe(false);
    expect(cleared.liveConnected).toBe(false);
    expect(cleared.connectorStatus).toBe("waiting_for_espn_tab");
    expect(cleared.espnTabs).toBe(0);
  });

  it("multiple tabs: closing one (espnTabs still >0) keeps connected when publisher confirmed", () => {
    const still = resolveEspnBmTransportPresence({
      prevMirrorHandshake: true,
      prevTransportActive: true,
      prevConnectorStatus: "monitoring",
      prevEspnTabs: 2,
      status: "waiting_for_espn_mirror",
      espnTabs: 1,
      publisherConfirmed: false,
    });
    expect(still.mirrorHandshake).toBe(true);
    expect(still.liveConnected).toBe(true);
    expect(still.espnTabs).toBe(1);
  });

  it("stale STATUS without live tab is not connected", () => {
    const stale = resolveEspnBmTransportPresence({
      prevMirrorHandshake: true,
      prevTransportActive: true,
      prevConnectorStatus: "monitoring",
      prevEspnTabs: 1,
      status: "monitoring",
      espnTabs: 0,
      publisherConfirmed: true,
    });
    expect(stale.liveConnected).toBe(false);
    expect(stale.mirrorHandshake).toBe(false);
  });

  it("publisher confirmed with tabs present sets connected", () => {
    const live = resolveEspnBmTransportPresence({
      prevMirrorHandshake: false,
      prevTransportActive: true,
      prevConnectorStatus: "waiting_for_espn_mirror",
      prevEspnTabs: 1,
      status: "monitoring",
      espnTabs: 1,
      publisherConfirmed: true,
    });
    expect(live.mirrorHandshake).toBe(true);
    expect(live.liveConnected).toBe(true);
    expect(live.connectorStatus).toBe("monitoring");
  });
});
