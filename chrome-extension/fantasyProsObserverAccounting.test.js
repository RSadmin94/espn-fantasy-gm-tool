/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  diffFantasyProsDraftedForEmit,
  establishFantasyProsBaseline,
} from "./fantasyProsObserverAccounting.js";

describe("RFSN-030C v1.13 observer emission accounting", () => {
  it("baselines existing picks without emitting", () => {
    const drafted = [
      { pick: 1, id: "a" },
      { pick: 2, id: "b" },
    ];
    const base = establishFantasyProsBaseline(drafted);
    expect(base.picksEmitted).toBe(0);
    expect(base.duplicatesSuppressed).toBe(2);
    expect(base.baselineKeys.size).toBe(2);

    const again = diffFantasyProsDraftedForEmit(drafted, base.baselineKeys, base);
    expect(again.newRows).toEqual([]);
    expect(again.picksEmitted).toBe(0);
    expect(again.rowsScanned).toBe(2);
  });

  it("emits exactly once for one new pick; second poll does not re-emit", () => {
    const initial = [
      { pick: 1, id: "a" },
      { pick: 2, id: "b" },
    ];
    const base = establishFantasyProsBaseline(initial);
    const withNew = [...initial, { pick: 3, id: "c" }];
    const first = diffFantasyProsDraftedForEmit(withNew, base.baselineKeys, base);
    expect(first.newRows).toEqual([{ pick: 3, id: "c" }]);
    expect(first.picksEmitted).toBe(1);

    const second = diffFantasyProsDraftedForEmit(withNew, first.nextBaseline, {
      picksEmitted: first.picksEmitted,
      duplicatesSuppressed: first.duplicatesSuppressed,
    });
    expect(second.newRows).toEqual([]);
    expect(second.picksEmitted).toBe(1);
  });

  it("does not inflate picksEmitted across repeated identical polls", () => {
    const drafted = Array.from({ length: 162 }, (_, i) => ({
      pick: i + 1,
      id: `p${i + 1}`,
    }));
    const base = establishFantasyProsBaseline(drafted);
    let keys = base.baselineKeys;
    let session = { picksEmitted: 0, duplicatesSuppressed: base.duplicatesSuppressed };
    for (let poll = 0; poll < 50; poll++) {
      const r = diffFantasyProsDraftedForEmit(drafted, keys, session);
      keys = r.nextBaseline;
      session = {
        picksEmitted: r.picksEmitted,
        duplicatesSuppressed: r.duplicatesSuppressed,
      };
    }
    expect(session.picksEmitted).toBe(0);
    expect(session.picksEmitted).not.toBeGreaterThan(10);
  });
});
