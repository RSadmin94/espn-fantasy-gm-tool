import { describe, expect, it } from "vitest";
import {
  clusterIsExecuted,
  clusterMatchesStatusFilter,
  displayedClusterStatus,
  evaluateTradeCluster,
  normalizeTradeStatusToken,
  orphanExecutedProposalIds,
  summarizeTradePipeline,
  tradeClusterKey,
  tradePartyTeamIds,
  type TradeDisplayRow,
} from "./transactionDisplay";

const f273ProposalItems: TradeDisplayRow[] = [
  {
    type: "TRADE_PROPOSAL",
    status: "PENDING",
    executionType: "EXECUTE",
    transactionId: "f273e8dd-cc69-4b8d-8c34-37eb401924de",
    fromTeamId: 11,
    toTeamId: 23,
    itemType: "DRAFT_TRADE",
    overallPickNumber: 11,
  },
  {
    type: "TRADE_PROPOSAL",
    status: "PENDING",
    executionType: "EXECUTE",
    transactionId: "f273e8dd-cc69-4b8d-8c34-37eb401924de",
    fromTeamId: 23,
    toTeamId: 11,
    itemType: "DRAFT_TRADE",
    overallPickNumber: 23,
  },
];

const f273Cluster: TradeDisplayRow[] = [
  {
    type: "TRADE_UPHOLD",
    status: "EXECUTED",
    executionType: "EXECUTE",
    transactionId: "bbe6dbe8-c418-48c6-9829-dd77290ca247",
    relatedTransactionId: "f273e8dd-cc69-4b8d-8c34-37eb401924de",
    teamId: 1,
  },
  {
    type: "TRADE_UPHOLD",
    status: "EXECUTED",
    executionType: "EXECUTE",
    transactionId: "2727926c-c6d6-4bca-ab15-af7b7fb8f159",
    relatedTransactionId: "f273e8dd-cc69-4b8d-8c34-37eb401924de",
    teamId: 4,
  },
  {
    type: "TRADE_ACCEPT",
    status: null,
    executionType: "EXECUTE",
    transactionId: "410f69cb-9fa4-4031-b72e-12a524be5b64",
    relatedTransactionId: "f273e8dd-cc69-4b8d-8c34-37eb401924de",
    teamId: 23,
  },
  {
    type: "TRADE_ACCEPT",
    status: "EXECUTED",
    executionType: "PROCESS",
    transactionId: "f034d15b-be69-4525-ad3b-cd8fdf787fe4",
    relatedTransactionId: "f273e8dd-cc69-4b8d-8c34-37eb401924de",
    fromTeamId: 11,
    toTeamId: 23,
    itemType: "DRAFT_TRADE",
    overallPickNumber: 11,
  },
  ...f273ProposalItems,
];

const d373Cluster: TradeDisplayRow[] = [
  {
    type: "TRADE_UPHOLD",
    status: "EXECUTED",
    executionType: "EXECUTE",
    transactionId: "c1986f18-e750-4b7c-b18d-3e92db4da059",
    relatedTransactionId: "d3731d04-107d-415a-8c25-f5530b88dddf",
    teamId: 1,
  },
  {
    type: "TRADE_ACCEPT",
    status: null,
    executionType: "EXECUTE",
    transactionId: "7265648a-b1d2-41c4-8b3b-7071e022ed9c",
    relatedTransactionId: "d3731d04-107d-415a-8c25-f5530b88dddf",
    teamId: 18,
  },
];

describe("normalizeTradeStatusToken", () => {
  it("maps COMPLETED / PROCESSED / PROCESS to EXECUTED", () => {
    expect(normalizeTradeStatusToken("COMPLETED")).toBe("EXECUTED");
    expect(normalizeTradeStatusToken("PROCESSED")).toBe("EXECUTED");
    expect(normalizeTradeStatusToken(null, "TRADE_ACCEPT", "PROCESS")).toBe("EXECUTED");
  });

  it("treats null-status TRADE_ACCEPT / UPHOLD as EXECUTED", () => {
    expect(normalizeTradeStatusToken(null, "TRADE_ACCEPT", "EXECUTE")).toBe("EXECUTED");
    expect(normalizeTradeStatusToken("", "TRADE_UPHOLD", "EXECUTE")).toBe("EXECUTED");
  });

  it("does not treat pending proposals with executionType EXECUTE as executed", () => {
    expect(normalizeTradeStatusToken("PENDING", "TRADE_PROPOSAL", "EXECUTE")).toBe("PENDING");
  });

  it("maps TRADE_DECLINE to CANCELED even when ESPN status is EXECUTED", () => {
    expect(normalizeTradeStatusToken("EXECUTED", "TRADE_DECLINE", "EXECUTE")).toBe("CANCELED");
  });
});

describe("tradeClusterKey", () => {
  it("clusters UPHOLD/ACCEPT on relatedTransactionId", () => {
    expect(tradeClusterKey(d373Cluster[0]!)).toBe("d3731d04-107d-415a-8c25-f5530b88dddf");
    expect(tradeClusterKey(d373Cluster[1]!)).toBe("d3731d04-107d-415a-8c25-f5530b88dddf");
  });

  it("clusters proposals on their own id", () => {
    expect(tradeClusterKey(f273ProposalItems[0]!)).toBe("f273e8dd-cc69-4b8d-8c34-37eb401924de");
  });
});

describe("tradePartyTeamIds", () => {
  it("excludes TRADE_UPHOLD voters when assets already identify two parties", () => {
    expect(tradePartyTeamIds(f273Cluster)).toEqual([11, 23]);
  });

  it("includes UPHOLD team when executed headers have no assets", () => {
    expect(tradePartyTeamIds(d373Cluster)).toEqual([1, 18]);
  });
});

describe("cluster execution + meaningful filter", () => {
  it("marks PENDING proposal + UPHOLD/ACCEPT as executed", () => {
    expect(clusterIsExecuted(f273Cluster)).toBe(true);
    expect(displayedClusterStatus(f273Cluster)).toBe("EXECUTED");
    expect(clusterMatchesStatusFilter(f273Cluster, "EXECUTED")).toBe(true);
    expect(clusterMatchesStatusFilter(f273Cluster, "PROPOSED")).toBe(false);
  });

  it("does not mark a lone PENDING proposal with executionType EXECUTE as executed", () => {
    expect(clusterIsExecuted(f273ProposalItems)).toBe(false);
    expect(clusterMatchesStatusFilter(f273ProposalItems, "EXECUTED")).toBe(false);
    expect(clusterMatchesStatusFilter(f273ProposalItems, "PROPOSED")).toBe(true);
  });

  it("keeps the 11↔23 executed recap and does not drop it as a 4-team blob", () => {
    const evald = evaluateTradeCluster("f273e8dd-cc69-4b8d-8c34-37eb401924de", f273Cluster);
    expect(evald.ok).toBe(true);
    expect(evald.teams).toEqual([11, 23]);
    expect(evald.assetCount).toBeGreaterThan(0);
  });

  it("keeps executed UPHOLD+ACCEPT with no proposal items (assets unavailable)", () => {
    const evald = evaluateTradeCluster("d3731d04-107d-415a-8c25-f5530b88dddf", d373Cluster);
    expect(evald.ok).toBe(true);
    expect(evald.reason).toContain("kept_executed_headers");
    expect(evald.teams).toEqual([1, 18]);
    expect(clusterMatchesStatusFilter(d373Cluster, "EXECUTED")).toBe(true);
  });

  it("drops TRADE_DECLINE EXECUTED as not a completed trade", () => {
    const decline: TradeDisplayRow[] = [
      {
        type: "TRADE_DECLINE",
        status: "EXECUTED",
        executionType: "EXECUTE",
        transactionId: "abcadc78-d39b-4cec-82e2-55ca5636791e",
        relatedTransactionId: "4d87f929-7363-406c-9697-c1bc44043bd8",
        teamId: 17,
      },
    ];
    const evald = evaluateTradeCluster("abcadc78", decline);
    expect(evald.ok).toBe(false);
    expect(evald.reason).toContain("trade_decline");
    expect(clusterMatchesStatusFilter(decline, "EXECUTED")).toBe(false);
    expect(clusterMatchesStatusFilter(decline, "CANCELED")).toBe(true);
  });
});

describe("orphanExecutedProposalIds", () => {
  it("flags d3731d04 when proposal items are missing", () => {
    expect(orphanExecutedProposalIds([...d373Cluster, ...f273Cluster])).toEqual([
      "d3731d04-107d-415a-8c25-f5530b88dddf",
    ]);
  });
});

describe("summarizeTradePipeline EXECUTED filter", () => {
  it("shows both executed trades (not just the one with proposal items)", () => {
    const pending: TradeDisplayRow = {
      type: "TRADE_PROPOSAL",
      status: "PENDING",
      executionType: "EXECUTE",
      transactionId: "pending-only",
      fromTeamId: 11,
      toTeamId: 22,
      itemType: "DRAFT_TRADE",
      overallPickNumber: 7,
    };
    const summary = summarizeTradePipeline([...f273Cluster, ...d373Cluster, pending], "EXECUTED");
    expect(summary.executedClusters).toBe(2);
    expect(summary.displayedTrades).toBe(2);
    expect(summary.displayedExecuted).toBe(2);
    expect(summary.kept.map((k) => k.key).sort()).toEqual([
      "d3731d04-107d-415a-8c25-f5530b88dddf",
      "f273e8dd-cc69-4b8d-8c34-37eb401924de",
    ]);
  });
});
