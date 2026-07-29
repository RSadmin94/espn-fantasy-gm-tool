import { describe, expect, it } from "vitest";
import {
  signOwnerAwardShare,
  verifyOwnerAwardShare,
  payloadToPublicAward,
} from "./ownerAwardShareToken";

describe("ownerAwardShareToken", () => {
  it("round-trips a public award payload without private fields", () => {
    const code = signOwnerAwardShare({
      v: 1,
      id: "best_drafter",
      dn: "Best Drafter",
      lg: "Test League",
      sd: "The sharpest early-round drafter in league history.",
      ry: "Epic",
      cat: "Drafting",
      hn: "Alice",
      st: "12 early RB/WR",
    });
    const p = verifyOwnerAwardShare(code);
    expect(p?.id).toBe("best_drafter");
    const pub = payloadToPublicAward(p!);
    expect(pub.displayName).toBe("Best Drafter");
    expect(pub.currentHolderName).toBe("Alice");
    expect(JSON.stringify(pub)).not.toMatch(/userId|email|swid|espn_s2|password/i);
  });

  it("rejects unknown award ids and tampered tokens", () => {
    expect(
      verifyOwnerAwardShare(
        signOwnerAwardShare({
          v: 1,
          id: "not_real",
          dn: "Nope",
          lg: "L",
          sd: "x",
          ry: "Common",
          cat: "Legacy",
          hn: null,
          st: null,
        }),
      ),
    ).toBeNull();
    const good = signOwnerAwardShare({
      v: 1,
      id: "trade_shark",
      dn: "Trade Shark",
      lg: "L",
      sd: "Trades",
      ry: "Epic",
      cat: "Trading",
      hn: null,
      st: null,
    });
    expect(verifyOwnerAwardShare(good.slice(0, -2) + "xx")).toBeNull();
  });
});
