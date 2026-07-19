import { describe, expect, it } from "vitest";
import { isFfrTabUrlForTests } from "./fpFfrOrigins.js";

describe("RFSN-030C FFR tab URL allowlist", () => {
  it("accepts production and www", () => {
    expect(isFfrTabUrlForTests("https://www.fantasyfootballrivals.com/draft/mock")).toBe(true);
    expect(isFfrTabUrlForTests("https://fantasyfootballrivals.com/draft/mock")).toBe(true);
  });

  it("accepts preview subdomains (bridge must reach sprint-8-preview)", () => {
    expect(
      isFfrTabUrlForTests("https://sprint-8-preview.fantasyfootballrivals.com/draft/mock"),
    ).toBe(true);
  });

  it("rejects unrelated hosts", () => {
    expect(isFfrTabUrlForTests("https://draftwizard.fantasypros.com/football/mock-draft-simulator/live/")).toBe(
      false,
    );
    expect(isFfrTabUrlForTests("https://example.com")).toBe(false);
  });
});
