import { describe, expect, it } from "vitest";
import {
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
});
