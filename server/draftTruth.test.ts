import { describe, it, expect } from "vitest";
import {
  classifyEspnDraftSlot,
  classifyDraftPickRawPick,
  SlotClass,
  CLASSIFICATION_REASON,
} from "./draftTruth";

describe("Phase 3A — Draft Truth slot classification (golden / regression)", () => {
  it("keeper=true, reservedForKeeper=true -> KEEPER + keeper=true;reservedForKeeper=true", () => {
    const r = classifyEspnDraftSlot(true, true);
    expect(r.slotClass).toBe(SlotClass.KEEPER);
    expect(r.classificationReason).toBe("keeper=true;reservedForKeeper=true");
    expect(r.keeperStrict).toBe(true);
    expect(r.retained).toBe(false);
    expect(r.keeperSlot).toBe(true);
    expect(r.draftedForAnalytics).toBe(false);
    expect(r.espnKeeper).toBe(true);
    expect(r.espnReservedForKeeper).toBe(true);
  });

  it("keeper=false, reservedForKeeper=true -> RETAINED + reservedForKeeper=true", () => {
    const r = classifyEspnDraftSlot(false, true);
    expect(r.slotClass).toBe(SlotClass.RETAINED);
    expect(r.classificationReason).toBe("reservedForKeeper=true");
    expect(r.keeperStrict).toBe(false);
    expect(r.retained).toBe(true);
    expect(r.keeperSlot).toBe(true);
    expect(r.draftedForAnalytics).toBe(false);
    expect(r.espnKeeper).toBe(false);
    expect(r.espnReservedForKeeper).toBe(true);
  });

  it("keeper=false, reservedForKeeper=false -> DRAFTED + keeper=false,reservedForKeeper=false", () => {
    const r = classifyEspnDraftSlot(false, false);
    expect(r.slotClass).toBe(SlotClass.DRAFTED);
    expect(r.classificationReason).toBe("keeper=false,reservedForKeeper=false");
    expect(r.keeperStrict).toBe(false);
    expect(r.retained).toBe(false);
    expect(r.keeperSlot).toBe(false);
    expect(r.draftedForAnalytics).toBe(true);
    expect(r.espnKeeper).toBe(false);
    expect(r.espnReservedForKeeper).toBe(false);
  });
});

describe("Phase 3A — additional classifier behavior", () => {
  it("keeper=true, reservedForKeeper=false -> KEEPER + keeper=true", () => {
    const r = classifyEspnDraftSlot(true, false);
    expect(r.slotClass).toBe(SlotClass.KEEPER);
    expect(r.classificationReason).toBe(CLASSIFICATION_REASON.KEEPER_TRUE);
  });

  it("does not treat truthy non-booleans as keeper (ESPN strict)", () => {
    const r = classifyEspnDraftSlot(1 as unknown, "yes" as unknown);
    expect(r.slotClass).toBe(SlotClass.DRAFTED);
    expect(r.classificationReason).toBe(CLASSIFICATION_REASON.DRAFTED);
  });

  it("classifyDraftPickRawPick parses rawPick object", () => {
    const r = classifyDraftPickRawPick({
      keeper: true,
      reservedForKeeper: true,
      overallPickNumber: 1,
    });
    expect(r.slotClass).toBe(SlotClass.KEEPER);
    expect(r.classificationReason).toBe("keeper=true;reservedForKeeper=true");
  });

  it("classifyDraftPickRawPick returns UNKNOWN for non-object", () => {
    expect(classifyDraftPickRawPick(null).slotClass).toBe(SlotClass.UNKNOWN);
    expect(classifyDraftPickRawPick(undefined).slotClass).toBe(SlotClass.UNKNOWN);
    expect(classifyDraftPickRawPick("[]").slotClass).toBe(SlotClass.UNKNOWN);
    expect(classifyDraftPickRawPick([1, 2]).slotClass).toBe(SlotClass.UNKNOWN);
    expect(classifyDraftPickRawPick(null).classificationReason).toBe(CLASSIFICATION_REASON.MALFORMED);
  });
});
