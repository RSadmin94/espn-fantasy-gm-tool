import { describe, expect, it } from "vitest";
import { isFfrTabUrlForTests } from "./fpFfrOrigins.js";

describe("RFSN-030C FFR tab URL allowlist", () => {
  it("accepts canonical Production www and apex", () => {
    expect(isFfrTabUrlForTests("https://www.fantasyfootballrivals.com/draft/mock")).toBe(true);
    expect(isFfrTabUrlForTests("https://fantasyfootballrivals.com/draft/mock")).toBe(true);
  });

  it("rejects Preview, retired hosts, and loopback in the Store build", () => {
    expect(
      isFfrTabUrlForTests("https://sprint-8-preview.fantasyfootballrivals.com/draft/mock"),
    ).toBe(false);
    expect(isFfrTabUrlForTests("https://gmwarroom.online/dashboard")).toBe(false);
    expect(isFfrTabUrlForTests("http://localhost:3000/connect")).toBe(false);
    expect(isFfrTabUrlForTests("http://127.0.0.1:5173/connect")).toBe(false);
  });

  it("rejects unrelated hosts", () => {
    expect(isFfrTabUrlForTests("https://draftwizard.fantasypros.com/football/mock-draft-simulator/live/")).toBe(
      false,
    );
    expect(isFfrTabUrlForTests("https://example.com")).toBe(false);
  });
});
