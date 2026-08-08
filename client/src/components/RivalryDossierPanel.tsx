import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { COMMERCIAL } from "@/lib/commercialCopy";
import { resolvePaywallCopy } from "@/lib/paywallCopy";
import { useUpgradeDialog } from "@/hooks/useUpgradeDialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { IntelPanel } from "@/components/layout";
import { RivalryShareButton } from "@/components/RivalryShareButton";
import {
  Loader2,
  Calendar,
  ChartLine,
  Lightbulb,
  Trophy,
  Crosshair,
  HeartCrack,
  ScrollText,
  Swords,
  ArrowLeftRight,
  ChevronDown,
  Receipt,
  Clapperboard,
  Activity,
  GitBranch,
  History,
  FolderOpen,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── theme (matches Command Dashboard / Rivalry Center) ───────────────────────
const TEXT = "#f3f8ff";
const MUTED = "var(--color-muted-foreground)";
const GOLD = "#f5c518";
const ACCENT = "#a3e635";
const GREEN = "#a3e635";
const RED = "#ef4444";
const BLUE = "#8b5cf6";
const LINE = "rgba(255,255,255,0.07)";
const PANEL: React.CSSProperties = { background: "linear-gradient(180deg,#1f1624,#18111c)", border: `1px solid ${LINE}`, borderRadius: 15 };
const SUB: React.CSSProperties = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10 };
const FIELD: React.CSSProperties = { background: "#1f1624", border: "1px solid rgba(255,255,255,.12)", color: TEXT };

const CHART_FOCAL = ACCENT;
const CHART_OPP = BLUE;

const getErrorMessage = (err: unknown) =>
  err && typeof err === "object" && "message" in err
    ? String((err as { message?: unknown }).message)
    : String(err ?? "Unknown error");

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[1]![0]).toUpperCase();
}

export type RivalryPickerOption = { ownerKey: string; label: string };

type Props = {
  focalOwnerKey: string;
  pickerOptions?: RivalryPickerOption[];
  /** Default rivalry filter: current season + recent alumni / champions (omit when historical toggle on). */
  rivalryEligibleOwnerKeys?: string[];
  activeSeason?: number;
  /** Preselect this opponent when the panel mounts (used by Rivalry Center popups). */
  initialOpponentKey?: string;
};

function formatSeasonRanges(years: number[]): string {
  const s = [...years].sort((a, b) => a - b);
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j]! + 1) j++;
    out.push(i === j ? String(s[i]) : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return out.join(", ");
}

function coverageNote(c: { seasonsWithData: number[]; missingSeasons: number[]; partial: boolean }): string {
  if (!c || !c.partial) return "";
  if (c.seasonsWithData.length === 1) {
    return `Only ${c.seasonsWithData[0]} matchup history available. Run historical matchup sync.`;
  }
  if (c.missingSeasons.length) {
    return `Partial matchup history: seasons ${formatSeasonRanges(c.missingSeasons)} not synced. Records reflect available seasons only.`;
  }
  return "Partial matchup history. Records reflect available seasons only.";
}

function formatTradeProcessedDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function tradeAssetLabels(side: { assetsReceived?: { displayLabel?: string }[] } | null | undefined): string[] {
  const assets = Array.isArray(side?.assetsReceived) ? side.assetsReceived : [];
  return assets.map((a) => String(a.displayLabel ?? "").trim()).filter(Boolean);
}

function focalTradeResult(
  winnerOwnerKey: string | null | undefined,
  focalOwnerKey: string,
  opponentOwnerKey: string,
): "win" | "loss" | "tie" {
  if (!winnerOwnerKey) return "tie";
  if (winnerOwnerKey === focalOwnerKey) return "win";
  if (winnerOwnerKey === opponentOwnerKey) return "loss";
  return "tie";
}

function tradeResultStyle(result: "win" | "loss" | "tie"): React.CSSProperties {
  if (result === "win") return { border: `1px solid ${GREEN}44`, background: "rgba(163,230,53,.08)", color: GREEN };
  if (result === "loss") return { border: `1px solid ${RED}44`, background: "rgba(239,68,68,.08)", color: RED };
  return { border: `1px solid rgba(255,255,255,.1)`, background: "rgba(255,255,255,.04)", color: MUTED };
}

function formatRecord(wins: number, losses: number, ties = 0): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

type TapeMeeting = {
  isPlayoff: boolean;
  result: "W" | "L" | "T";
  season: number;
  week: number;
  ownerScore: number;
  opponentScore: number;
};

function tallyFocalRecord(meetings: TapeMeeting[]): { wins: number; losses: number; ties: number } {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const m of meetings) {
    if (m.result === "W") wins++;
    else if (m.result === "L") losses++;
    else ties++;
  }
  return { wins, losses, ties };
}

function computeTapeStats(meetings: TapeMeeting[]) {
  const rs = meetings.filter((m) => !m.isPlayoff);
  const playoffs = meetings.filter((m) => m.isPlayoff);
  const career = tallyFocalRecord(rs);
  const playoffRec = tallyFocalRecord(playoffs);
  const recentFive = tallyFocalRecord(rs.slice(0, 5));
  let streak = "—";
  if (rs.length > 0 && rs[0]!.result !== "T") {
    const dir = rs[0]!.result;
    let count = 0;
    for (const m of rs) {
      if (m.result !== dir) break;
      count++;
    }
    streak = `${dir}${count}`;
  }
  return {
    career,
    playoffRec,
    recentFive,
    streak,
    meetings: meetings.length,
    rsMeetings: rs.length,
    playoffMeetings: playoffs.length,
  };
}

function formatLastMeeting(m: TapeMeeting | null | undefined): string {
  if (!m) return "—";
  const playoff = m.isPlayoff ? " (P)" : "";
  return `${m.season} W${m.week}${playoff} · ${m.result} ${m.ownerScore.toFixed(1)}–${m.opponentScore.toFixed(1)}`;
}

function TapeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-1.5 last:border-b-0" style={{ borderColor: "rgba(255,255,255,.06)" }}>
      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: TEXT }}>{value}</span>
    </div>
  );
}

type StoryPairPayload = {
  tier: string;
  headline: { key: string };
  availableBlocks: string[];
  documentaryFacts: Array<{ factKey: string; supportingGameIds: string[] }>;
};

type StoryReceiptPayload = {
  receiptId: string;
  type: string;
  season: number;
  week?: number;
  isPlayoff?: boolean;
  focalScore?: number;
  rivalScore?: number;
  margin?: number;
  factKeys: string[];
  source: string;
};

type StoryStatementPayload = {
  statementKey: string;
  block: string;
  priority: number;
  text: string;
  receiptIds: string[];
  factKeys: string[];
  confidence: number;
};

function topColdOpenStatement(statements: StoryStatementPayload[]): StoryStatementPayload | null {
  const cold = statements.filter((s) => s.block === "coldOpen");
  if (cold.length === 0) return null;
  return [...cold].sort((a, b) => b.priority - a.priority)[0] ?? null;
}

type DocumentaryTimelineEvent = {
  receiptId: string;
  season: number;
  week?: number;
  label: string;
  sortKey: number;
};

function buildDocumentaryTimelineEvents(receipts: StoryReceiptPayload[]): DocumentaryTimelineEvent[] {
  const events: DocumentaryTimelineEvent[] = [];
  for (const r of receipts) {
    const sortKey = r.season * 100 + (r.week ?? 0);
    if (r.type === "game") {
      const label =
        r.factKeys.find((f) =>
          ["PLAYOFF_ELIMINATION", "LEAD_FLIP", "PLAYOFF_WIN", "PLAYOFF_MEETING"].includes(f),
        ) ?? (r.isPlayoff ? "PLAYOFF_MEETING" : "GAME");
      if (
        r.factKeys.includes("PLAYOFF_ELIMINATION") ||
        r.factKeys.includes("LEAD_FLIP") ||
        r.factKeys.includes("PLAYOFF_WIN") ||
        r.isPlayoff
      ) {
        events.push({ receiptId: r.receiptId, season: r.season, week: r.week, label, sortKey });
      }
    } else if (r.type === "trade") {
      events.push({ receiptId: r.receiptId, season: r.season, label: "TRADE", sortKey });
    } else if (r.type === "championship") {
      events.push({ receiptId: r.receiptId, season: r.season, label: "CHAMPIONSHIP", sortKey });
    }
  }
  return events.sort((a, b) => a.sortKey - b.sortKey);
}

function groupReceiptsByEvidence(receipts: StoryReceiptPayload[]) {
  return {
    games: receipts.filter((r) => r.type === "game"),
    trades: receipts.filter((r) => r.type === "trade"),
    championships: receipts.filter((r) => r.type === "championship"),
    derived: receipts.filter((r) => r.type === "unknown" || r.source === "derived"),
  };
}

function receiptResultLabel(receipt: StoryReceiptPayload): string {
  if (receipt.focalScore == null || receipt.rivalScore == null) return "—";
  const margin = receipt.margin ?? receipt.focalScore - receipt.rivalScore;
  const dir = margin > 0 ? "W" : margin < 0 ? "L" : "T";
  return `${dir} ${receipt.focalScore.toFixed(1)}–${receipt.rivalScore.toFixed(1)}`;
}

function DocumentarySectionHeader({
  icon,
  title,
  accent = MUTED,
}: {
  icon: ReactNode;
  title: string;
  accent?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
      <span style={{ color: accent }}>{icon}</span>
      {title}
    </div>
  );
}

function StoryReceiptCard({ receipt }: { receipt: StoryReceiptPayload }) {
  return (
    <div
      className="rounded-[8px] px-3 py-2"
      style={{ border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-xs font-semibold" style={{ color: TEXT }}>
          {receipt.receiptId}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: receipt.isPlayoff ? GOLD : MUTED }}
        >
          {receipt.type === "trade"
            ? "Trade"
            : receipt.type === "championship"
              ? "Title"
              : receipt.isPlayoff
                ? "Playoff"
                : "Regular"}
        </span>
      </div>
      <div className="mt-1.5 grid gap-1 text-[11px] sm:grid-cols-2">
        <span style={{ color: MUTED }}>
          Season {receipt.season}
          {receipt.week != null ? ` · Wk ${receipt.week}` : ""}
        </span>
        <span className="font-mono tabular-nums" style={{ color: TEXT }}>
          {receipt.focalScore != null && receipt.rivalScore != null
            ? `${receipt.focalScore}–${receipt.rivalScore}`
            : "—"}
          {receipt.margin != null ? (
            <span style={{ color: receipt.margin < 0 ? RED : receipt.margin > 0 ? GREEN : MUTED }}>
              {" "}
              ({receipt.margin > 0 ? "+" : ""}
              {receipt.margin.toFixed(1)})
            </span>
          ) : null}
        </span>
      </div>
      {receipt.factKeys.length > 0 ? (
        <p className="mt-1 font-mono text-[10px]" style={{ color: MUTED }}>
          {receipt.factKeys.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function ReceiptDrawer({
  receiptIds,
  receipts,
  loading,
  open,
  onToggle,
}: {
  receiptIds: string[];
  receipts: StoryReceiptPayload[];
  loading: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  if (receiptIds.length === 0) return null;
  const idSet = new Set(receiptIds);
  const attached = receipts.filter((r) => idSet.has(r.receiptId));

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        className="rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-white/[0.06]"
        style={{ border: `1px solid ${GOLD}44`, color: GOLD }}
      >
        {open ? "Hide receipts" : "View receipts"}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading receipts…
            </div>
          ) : attached.length === 0 ? (
            <p className="text-[11px]" style={{ color: MUTED }}>Receipts unavailable.</p>
          ) : (
            attached.map((receipt) => <StoryReceiptCard key={receipt.receiptId} receipt={receipt} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

function useRivalryStoryStatementsQuery(
  focalOwnerKey: string,
  opponentOwnerKey: string,
  leagueContextKey: string,
  leagueKeyReady: boolean,
) {
  return (trpc as any).rivalryStory.statements.useQuery(
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        focalOwnerKey,
        rivalOwnerKey: opponentOwnerKey,
      },
      leagueContextKey,
    ),
    {
      enabled: leagueKeyReady && !!focalOwnerKey && !!opponentOwnerKey,
      staleTime: 60_000,
    },
  );
}

function useRivalryStoryPairQuery(
  focalOwnerKey: string,
  opponentOwnerKey: string,
  leagueContextKey: string,
  leagueKeyReady: boolean,
) {
  return (trpc as any).rivalryStory.pair.useQuery(
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        focalOwnerKey,
        rivalOwnerKey: opponentOwnerKey,
      },
      leagueContextKey,
    ),
    {
      enabled: leagueKeyReady && !!focalOwnerKey && !!opponentOwnerKey,
      staleTime: 60_000,
    },
  );
}

function useRivalryStoryReceiptsQuery(
  focalOwnerKey: string,
  opponentOwnerKey: string,
  leagueContextKey: string,
  leagueKeyReady: boolean,
) {
  return (trpc as any).rivalryStory.receipts.useQuery(
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        focalOwnerKey,
        rivalOwnerKey: opponentOwnerKey,
      },
      leagueContextKey,
    ),
    {
      enabled: leagueKeyReady && !!focalOwnerKey && !!opponentOwnerKey,
      staleTime: 60_000,
    },
  );
}

function formatReceiptField(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  return String(value);
}

function countReceiptSources(receipts: StoryReceiptPayload[]) {
  const counts = {
    gmMatchups: 0,
    completedTradeAuthority: 0,
    championshipAuthority: 0,
    derived: 0,
  };
  for (const r of receipts) {
    if (r.source in counts) counts[r.source as keyof typeof counts]++;
  }
  return counts;
}

function ReceiptKvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>{label}</span>
      <span className="break-all font-mono text-[11px] tabular-nums" style={{ color: TEXT }}>{value}</span>
    </div>
  );
}

function TapeStatCell({ label, value, accent, dense }: { label: string; value: string; accent?: string; dense?: boolean }) {
  return (
    <div className="rounded-[8px] px-3 py-2.5" style={{ ...SUB, borderRadius: 8 }}>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>{label}</div>
      <div
        className={cn("mt-1 font-extrabold tabular-nums", dense ? "text-sm leading-snug" : "text-lg")}
        style={{ color: accent ?? TEXT }}
      >
        {value}
      </div>
    </div>
  );
}

function RivalryColdOpenSection({
  statementsQ,
  receiptsQ,
}: {
  statementsQ: ReturnType<typeof useRivalryStoryStatementsQuery>;
  receiptsQ: ReturnType<typeof useRivalryStoryReceiptsQuery>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (statementsQ.isLoading) {
    return (
      <div className="p-4" style={{ ...SUB, borderTop: `3px solid ${GOLD}` }}>
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading cold open…
        </div>
      </div>
    );
  }

  if (statementsQ.isError) return null;

  const statements = (statementsQ.data?.statements ?? []) as StoryStatementPayload[];
  const coldOpen = topColdOpenStatement(statements);
  if (!coldOpen) return null;

  const allReceipts = (receiptsQ.data?.receipts ?? []) as StoryReceiptPayload[];

  return (
    <div className="border-b border-white/[0.06] p-4">
      <DocumentarySectionHeader icon={<Clapperboard className="h-4 w-4" />} title="Cold Open" accent={GOLD} />
      <p className="text-base font-semibold leading-snug md:text-lg" style={{ color: TEXT }}>
        {coldOpen.text}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: MUTED }}>
        <span>
          Confidence:{" "}
          <span className="font-mono font-semibold tabular-nums" style={{ color: TEXT }}>
            {coldOpen.confidence.toFixed(2)}
          </span>
        </span>
        <span>
          Receipts:{" "}
          <span className="font-mono font-semibold tabular-nums" style={{ color: TEXT }}>
            {coldOpen.receiptIds.length}
          </span>
        </span>
      </div>
      <ReceiptDrawer
        receiptIds={coldOpen.receiptIds}
        receipts={allReceipts}
        loading={receiptsQ.isLoading}
        open={drawerOpen}
        onToggle={() => setDrawerOpen((o) => !o)}
      />
    </div>
  );
}

function RivalryStoryReceiptsSection({
  focalOwnerKey,
  opponentOwnerKey,
  leagueContextKey,
  leagueKeyReady,
}: {
  focalOwnerKey: string;
  opponentOwnerKey: string;
  leagueContextKey: string;
  leagueKeyReady: boolean;
}) {
  const [listOpen, setListOpen] = useState(false);
  const receiptsQ = useRivalryStoryReceiptsQuery(
    focalOwnerKey,
    opponentOwnerKey,
    leagueContextKey,
    leagueKeyReady,
  );

  if (receiptsQ.isLoading) {
    return (
      <div className="p-3" style={SUB}>
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading story receipts…
        </div>
      </div>
    );
  }

  if (receiptsQ.isError) {
    return (
      <div className="p-3" style={SUB}>
        <p className="text-[11px]" style={{ color: MUTED }}>Story receipts unavailable.</p>
      </div>
    );
  }

  const receipts = (receiptsQ.data?.receipts ?? []) as StoryReceiptPayload[];
  if (receipts.length === 0) {
    return (
      <Collapsible defaultOpen={false} className="border-b border-white/[0.06] p-3">
        <CollapsibleTrigger
          className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: MUTED }}
        >
          <span className="flex items-center gap-2">
            <Receipt className="h-4 w-4" style={{ color: GOLD }} />
            Raw receipts
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <p className="text-[11px]" style={{ color: MUTED }}>No story receipts available.</p>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  const knownCount = receipts.filter((r) => r.type !== "unknown").length;
  const unknownCount = receipts.length - knownCount;
  const sourceCounts = countReceiptSources(receipts);

  return (
    <Collapsible defaultOpen={false} className="border-b border-white/[0.06] p-3">
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors hover:opacity-90"
        style={{ color: MUTED }}
      >
        <span className="flex items-center gap-2">
          <Receipt className="h-4 w-4" style={{ color: GOLD }} />
          Raw receipts
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal" style={{ border: "1px solid rgba(255,255,255,.1)", color: MUTED }}>
            debug
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
      <div className="rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
        <TapeRow label="Total" value={String(receipts.length)} />
        <TapeRow label="Known" value={String(knownCount)} />
        <TapeRow label="Unknown" value={String(unknownCount)} />
        <TapeRow label="gmMatchups" value={String(sourceCounts.gmMatchups)} />
        <TapeRow label="completedTradeAuthority" value={String(sourceCounts.completedTradeAuthority)} />
        <TapeRow label="championshipAuthority" value={String(sourceCounts.championshipAuthority)} />
        <TapeRow label="derived" value={String(sourceCounts.derived)} />
      </div>

      <Collapsible open={listOpen} onOpenChange={setListOpen} className="mt-2">
        <CollapsibleTrigger
          className="flex w-full items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-white/[0.03]"
          style={{ border: "1px solid rgba(255,255,255,.08)", color: MUTED }}
        >
          <span>Receipt list ({receipts.length})</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", listOpen && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {receipts.map((receipt) => (
            <div
              key={receipt.receiptId}
              className="rounded-[8px] px-3 py-2"
              style={{ ...SUB, borderRadius: 8 }}
            >
              <ReceiptKvRow label="receiptId" value={receipt.receiptId} />
              <ReceiptKvRow label="type" value={receipt.type} />
              <ReceiptKvRow label="source" value={receipt.source} />
              <ReceiptKvRow label="season" value={formatReceiptField(receipt.season)} />
              <ReceiptKvRow label="week" value={formatReceiptField(receipt.week)} />
              <ReceiptKvRow label="isPlayoff" value={formatReceiptField(receipt.isPlayoff)} />
              <ReceiptKvRow label="focalScore" value={formatReceiptField(receipt.focalScore)} />
              <ReceiptKvRow label="rivalScore" value={formatReceiptField(receipt.rivalScore)} />
              <ReceiptKvRow label="margin" value={formatReceiptField(receipt.margin)} />
              <ReceiptKvRow
                label="factKeys"
                value={receipt.factKeys.length > 0 ? receipt.factKeys.join(", ") : "—"}
              />
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RivalryTaleOfTheTapeSection({
  storyQ,
  meetings,
  lastMeeting,
}: {
  storyQ: ReturnType<typeof useRivalryStoryPairQuery>;
  meetings: TapeMeeting[];
  lastMeeting?: { season: number; week: number; result: string; ownerScore: number; opponentScore: number } | null;
}) {
  if (storyQ.isLoading) {
    return (
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading tale of the tape…
        </div>
      </div>
    );
  }

  const story = storyQ.data as StoryPairPayload | undefined;
  if (storyQ.isError || !story || !story.availableBlocks.includes("taleOfTape")) {
    return null;
  }

  const tape = computeTapeStats(meetings);
  const lastMeetingValue = lastMeeting
    ? `${lastMeeting.season} · Wk ${lastMeeting.week} · ${lastMeeting.result} ${lastMeeting.ownerScore.toFixed(1)}–${lastMeeting.opponentScore.toFixed(1)}`
    : formatLastMeeting(meetings[0]);

  return (
    <div className="border-b border-white/[0.06] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <DocumentarySectionHeader icon={<Swords className="h-4 w-4" />} title="Tale of the Tape" accent={GOLD} />
        <div className="flex flex-wrap gap-2">
          <span
            className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ border: `1px solid ${GOLD}44`, color: GOLD, background: "rgba(245,198,90,.08)" }}
          >
            {story.tier}
          </span>
          <span
            className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold"
            style={{ border: "1px solid rgba(255,255,255,.1)", color: ACCENT }}
          >
            {story.headline.key}
          </span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <TapeStatCell label="Career" value={formatRecord(tape.career.wins, tape.career.losses, tape.career.ties)} />
        {tape.playoffMeetings > 0 ? (
          <TapeStatCell
            label="Playoff record"
            value={formatRecord(tape.playoffRec.wins, tape.playoffRec.losses, tape.playoffRec.ties)}
          />
        ) : null}
        <TapeStatCell
          label="Current streak"
          value={tape.streak}
          accent={tape.streak.startsWith("W") ? GREEN : tape.streak.startsWith("L") ? RED : undefined}
        />
        {tape.rsMeetings >= 5 ? (
          <TapeStatCell
            label="Recent five"
            value={formatRecord(tape.recentFive.wins, tape.recentFive.losses, tape.recentFive.ties)}
          />
        ) : tape.rsMeetings > 0 ? (
          <TapeStatCell
            label="Recent five"
            value={formatRecord(tape.recentFive.wins, tape.recentFive.losses, tape.recentFive.ties)}
          />
        ) : null}
        <TapeStatCell label="Meetings" value={String(tape.meetings)} />
        <TapeStatCell label="Last meeting" value={lastMeetingValue} dense />
      </div>
    </div>
  );
}

function RivalryCurrentStateSection({
  storyQ,
  statementsQ,
  meetings,
  lastMeeting,
}: {
  storyQ: ReturnType<typeof useRivalryStoryPairQuery>;
  statementsQ: ReturnType<typeof useRivalryStoryStatementsQuery>;
  meetings: TapeMeeting[];
  lastMeeting?: { season: number; week: number; result: string; ownerScore: number; opponentScore: number } | null;
}) {
  const story = storyQ.data as StoryPairPayload | undefined;
  if (storyQ.isLoading || statementsQ.isLoading) {
    return (
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading current state…
        </div>
      </div>
    );
  }
  if (storyQ.isError || statementsQ.isError || !story || !story.availableBlocks.includes("currentState")) {
    return null;
  }

  const statements = (statementsQ.data?.statements ?? []) as StoryStatementPayload[];
  const stateStatements = statements.filter((s) =>
    ["RECENT_FORM", "PLAYOFF_RECORD", "CAREER_RECORD"].includes(s.statementKey),
  );
  const tape = computeTapeStats(meetings);
  const rows: { label: string; value: string }[] = [];

  if (tape.streak !== "—") rows.push({ label: "Current streak", value: tape.streak });
  if (tape.rsMeetings > 0) {
    rows.push({
      label: "Recent five",
      value: formatRecord(tape.recentFive.wins, tape.recentFive.losses, tape.recentFive.ties),
    });
  }
  if (tape.playoffMeetings > 0) {
    rows.push({
      label: "Playoff edge",
      value: formatRecord(tape.playoffRec.wins, tape.playoffRec.losses, tape.playoffRec.ties),
    });
  }
  if (lastMeeting) {
    rows.push({
      label: "Last meeting",
      value: `${lastMeeting.season} · Wk ${lastMeeting.week} · ${lastMeeting.result} ${lastMeeting.ownerScore.toFixed(1)}–${lastMeeting.opponentScore.toFixed(1)}`,
    });
  } else if (meetings[0]) {
    rows.push({ label: "Last meeting", value: formatLastMeeting(meetings[0]) });
  }

  if (stateStatements.length === 0 && rows.length === 0) return null;

  return (
    <div className="border-b border-white/[0.06] p-4">
      <DocumentarySectionHeader icon={<Activity className="h-4 w-4" />} title="Current State" accent={ACCENT} />
      {stateStatements.length > 0 ? (
        <ul className="space-y-2">
          {stateStatements.map((s) => (
            <li key={s.statementKey} className="text-sm leading-relaxed" style={{ color: TEXT }}>
              {s.text}
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length > 0 ? (
        <div className={cn("grid gap-2 sm:grid-cols-2", stateStatements.length > 0 && "mt-3")}>
          {rows.map((row) => (
            <div key={row.label} className="rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                {row.label}
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums" style={{ color: TEXT }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RivalryTurningPointSection({
  storyQ,
  receiptsQ,
}: {
  storyQ: ReturnType<typeof useRivalryStoryPairQuery>;
  receiptsQ: ReturnType<typeof useRivalryStoryReceiptsQuery>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const story = storyQ.data as StoryPairPayload | undefined;
  if (storyQ.isLoading) {
    return (
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading turning point…
        </div>
      </div>
    );
  }
  if (storyQ.isError || !story || !story.availableBlocks.includes("turningPoint")) return null;

  const flipFact = story.documentaryFacts.find((f) => f.factKey === "LEAD_FLIP");
  const flipReceiptId = flipFact?.supportingGameIds?.[0];
  if (!flipReceiptId) return null;

  const receipts = (receiptsQ.data?.receipts ?? []) as StoryReceiptPayload[];
  const receipt = receipts.find((r) => r.receiptId === flipReceiptId);
  if (!receipt) {
    if (receiptsQ.isLoading) {
      return (
        <div className="border-b border-white/[0.06] p-4">
          <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading turning point…
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="border-b border-white/[0.06] p-4">
      <DocumentarySectionHeader icon={<GitBranch className="h-4 w-4" />} title="Turning Point" accent={GOLD} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <TapeStatCell label="Season" value={String(receipt.season)} />
        <TapeStatCell label="Week" value={receipt.week != null ? String(receipt.week) : "—"} />
        <TapeStatCell label="Result" value={receiptResultLabel(receipt)} />
        <TapeStatCell
          label="Margin"
          value={receipt.margin != null ? `${receipt.margin > 0 ? "+" : ""}${receipt.margin.toFixed(1)}` : "—"}
          accent={receipt.margin != null ? (receipt.margin > 0 ? GREEN : receipt.margin < 0 ? RED : undefined) : undefined}
        />
      </div>
      <ReceiptDrawer
        receiptIds={[flipReceiptId]}
        receipts={receipts}
        loading={receiptsQ.isLoading}
        open={drawerOpen}
        onToggle={() => setDrawerOpen((o) => !o)}
      />
    </div>
  );
}

function RivalryDocumentaryTimelineSection({
  receiptsQ,
}: {
  receiptsQ: ReturnType<typeof useRivalryStoryReceiptsQuery>;
}) {
  const receipts = (receiptsQ.data?.receipts ?? []) as StoryReceiptPayload[];
  const events = buildDocumentaryTimelineEvents(receipts);
  if (receiptsQ.isLoading) {
    return (
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading timeline…
        </div>
      </div>
    );
  }
  if (receiptsQ.isError || events.length === 0) return null;

  const receiptById = new Map(receipts.map((r) => [r.receiptId, r]));

  return (
    <div className="border-b border-white/[0.06] p-4">
      <DocumentarySectionHeader icon={<History className="h-4 w-4" />} title="Rivalry Timeline" accent={GOLD} />
      <ol className="relative space-y-0 border-l border-white/10 pl-4">
        {events.map((event) => {
          const receipt = receiptById.get(event.receiptId);
          return (
            <li key={event.receiptId} className="relative pb-4 last:pb-0">
              <span
                className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full"
                style={{ background: GOLD, boxShadow: `0 0 0 3px ${GOLD}33` }}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-bold tabular-nums" style={{ color: TEXT }}>
                  {event.season}
                  {event.week != null ? ` · Wk ${event.week}` : ""}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase"
                  style={{ border: "1px solid rgba(255,255,255,.1)", color: ACCENT }}
                >
                  {event.label}
                </span>
              </div>
              {receipt ? (
                <p className="mt-1 text-[11px] font-mono tabular-nums" style={{ color: MUTED }}>
                  {receipt.receiptId}
                  {receipt.focalScore != null && receipt.rivalScore != null
                    ? ` · ${receipt.focalScore}–${receipt.rivalScore}`
                    : ""}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RivalryDocumentaryEvidenceSection({
  receiptsQ,
}: {
  receiptsQ: ReturnType<typeof useRivalryStoryReceiptsQuery>;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const receipts = (receiptsQ.data?.receipts ?? []) as StoryReceiptPayload[];
  const groups = groupReceiptsByEvidence(receipts);

  if (receiptsQ.isLoading) {
    return (
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading evidence…
        </div>
      </div>
    );
  }
  if (receiptsQ.isError || receipts.length === 0) return null;

  const sections: { key: string; label: string; items: StoryReceiptPayload[] }[] = [
    { key: "games", label: "Games", items: groups.games },
    { key: "trades", label: "Trades", items: groups.trades },
    { key: "championships", label: "Championships", items: groups.championships },
    { key: "derived", label: "Derived", items: groups.derived },
  ].filter((s) => s.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="border-b border-white/[0.06] p-4">
      <DocumentarySectionHeader icon={<FolderOpen className="h-4 w-4" />} title="Rivalry Evidence" accent={ACCENT} />
      <div className="space-y-2">
        {sections.map((section) => (
          <Collapsible
            key={section.key}
            open={openGroup === section.key}
            onOpenChange={(open) => setOpenGroup(open ? section.key : null)}
          >
            <CollapsibleTrigger
              className="flex w-full items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-white/[0.03]"
              style={{ border: "1px solid rgba(255,255,255,.08)", color: MUTED }}
            >
              <span>
                {section.label} ({section.items.length})
              </span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 transition-transform", openGroup === section.key && "rotate-180")}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {section.items.map((receipt) => (
                <StoryReceiptCard key={receipt.receiptId} receipt={receipt} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

function RivalryControlledStatementsSection({
  statementsQ,
}: {
  statementsQ: ReturnType<typeof useRivalryStoryStatementsQuery>;
}) {
  const [open, setOpen] = useState(false);
  if (statementsQ.isLoading || statementsQ.isError) return null;
  const statements = (statementsQ.data?.statements ?? []) as StoryStatementPayload[];
  if (statements.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-white/[0.06] p-3">
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: MUTED }}
      >
        <span className="flex items-center gap-2">
          <ScrollText className="h-3.5 w-3.5" />
          Controlled Statements ({statements.length})
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-2">
        {statements.map((s) => (
          <div key={`${s.block}-${s.statementKey}`} className="rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
              <span>{s.block}</span>
              <span className="font-mono" style={{ color: ACCENT }}>{s.statementKey}</span>
              <span className="font-mono tabular-nums">p{s.priority}</span>
              <span className="font-mono tabular-nums">c{s.confidence.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: TEXT }}>{s.text}</p>
            <p className="mt-1 font-mono text-[10px]" style={{ color: MUTED }}>
              receipts: {s.receiptIds.length > 0 ? s.receiptIds.join(", ") : "—"}
            </p>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function RivalryStoryMetadataSection({
  storyQ,
}: {
  storyQ: ReturnType<typeof useRivalryStoryPairQuery>;
}) {
  if (storyQ.isLoading) {
    return (
      <div className="p-3" style={SUB}>
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading story metadata…
        </div>
      </div>
    );
  }

  if (storyQ.isError || !storyQ.data) {
    return (
      <div className="p-3" style={SUB}>
        <p className="text-[11px]" style={{ color: MUTED }}>Story metadata unavailable.</p>
      </div>
    );
  }

  const story = storyQ.data as StoryPairPayload;
  const factKeys = [...new Set(story.documentaryFacts.map((f) => f.factKey))];

  return (
    <Collapsible defaultOpen={false} className="border-b border-white/[0.06] p-3">
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors hover:opacity-90"
        style={{ color: MUTED }}
      >
        <span className="flex items-center gap-2">
          <ScrollText className="h-4 w-4" style={{ color: ACCENT }} />
          Developer metadata
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Tier</div>
          <div className="mt-1 font-mono text-sm font-semibold" style={{ color: TEXT }}>{story.tier}</div>
        </div>
        <div className="rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Headline Key</div>
          <div className="mt-1 break-all font-mono text-sm font-semibold" style={{ color: ACCENT }}>{story.headline.key}</div>
        </div>
      </div>
      <div className="mt-2 rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Blocks</div>
        <p className="mt-1 font-mono text-xs leading-relaxed" style={{ color: TEXT }}>
          {story.availableBlocks.length > 0 ? story.availableBlocks.join(", ") : "—"}
        </p>
      </div>
      <div className="mt-2 rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Facts</div>
        <p className="mt-1 font-mono text-xs leading-relaxed" style={{ color: TEXT }}>
          {factKeys.length > 0 ? factKeys.join(", ") : "—"}
        </p>
      </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RivalryDocumentaryExperience({
  focalOwnerKey,
  opponentOwnerKey,
  focalDisplayName,
  opponentDisplayName,
  leagueContextKey,
  leagueKeyReady,
  meetings,
  lastMeeting,
  activeSeason,
}: {
  focalOwnerKey: string;
  opponentOwnerKey: string;
  focalDisplayName: string;
  opponentDisplayName: string;
  leagueContextKey: string;
  leagueKeyReady: boolean;
  meetings: TapeMeeting[];
  lastMeeting?: { season: number; week: number; result: string; ownerScore: number; opponentScore: number } | null;
  activeSeason?: number;
}) {
  const [developerOpen, setDeveloperOpen] = useState(false);
  const storyQ = useRivalryStoryPairQuery(focalOwnerKey, opponentOwnerKey, leagueContextKey, leagueKeyReady);
  const statementsQ = useRivalryStoryStatementsQuery(focalOwnerKey, opponentOwnerKey, leagueContextKey, leagueKeyReady);
  const receiptsQ = useRivalryStoryReceiptsQuery(focalOwnerKey, opponentOwnerKey, leagueContextKey, leagueKeyReady);

  const hasColdOpen =
    !statementsQ.isLoading &&
    !statementsQ.isError &&
    topColdOpenStatement((statementsQ.data?.statements ?? []) as StoryStatementPayload[]) != null;
  const story = storyQ.data as StoryPairPayload | undefined;
  const hasTape = !!story?.availableBlocks.includes("taleOfTape");
  const hasAnyDocumentary =
    hasColdOpen ||
    hasTape ||
    story?.availableBlocks.includes("currentState") ||
    story?.availableBlocks.includes("turningPoint") ||
    (receiptsQ.data?.receipts?.length ?? 0) > 0;

  if (!hasAnyDocumentary && storyQ.isLoading) {
    return (
      <IntelPanel variant="warm" className="overflow-hidden p-4">
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading rivalry story…
        </div>
      </IntelPanel>
    );
  }

  if (!hasAnyDocumentary && !storyQ.isLoading) return null;

  return (
    <IntelPanel variant="warm" className="overflow-hidden">
      <div
        className="border-b border-white/[0.06] px-4 py-3"
        style={{ borderTop: `3px solid ${GOLD}` }}
      >
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
          <Clapperboard className="h-4 w-4" style={{ color: GOLD }} />
          Rivalries
        </div>
      </div>

      <RivalryColdOpenSection statementsQ={statementsQ} receiptsQ={receiptsQ} />
      <RivalryTaleOfTheTapeSection storyQ={storyQ} meetings={meetings} lastMeeting={lastMeeting} />
      <RivalryCurrentStateSection
        storyQ={storyQ}
        statementsQ={statementsQ}
        meetings={meetings}
        lastMeeting={lastMeeting}
      />
      <RivalryTurningPointSection storyQ={storyQ} receiptsQ={receiptsQ} />
      <RivalryTradeLedgerSection
        focalOwnerKey={focalOwnerKey}
        opponentOwnerKey={opponentOwnerKey}
        focalDisplayName={focalDisplayName}
        opponentDisplayName={opponentDisplayName}
        leagueContextKey={leagueContextKey}
        leagueKeyReady={leagueKeyReady}
        activeSeason={activeSeason}
        documentary
        sectionTitle="Trade Chapter"
      />
      <RivalryDocumentaryTimelineSection receiptsQ={receiptsQ} />
      <RivalryDocumentaryEvidenceSection receiptsQ={receiptsQ} />

      <Collapsible open={developerOpen} onOpenChange={setDeveloperOpen}>
        <div className="border-t border-white/[0.06] bg-black/10">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:bg-white/[0.03]">
            <span>Documentary debug</span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", developerOpen && "rotate-180")}
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <RivalryStoryMetadataSection storyQ={storyQ} />
            <RivalryStoryReceiptsSection
              focalOwnerKey={focalOwnerKey}
              opponentOwnerKey={opponentOwnerKey}
              leagueContextKey={leagueContextKey}
              leagueKeyReady={leagueKeyReady}
            />
            <RivalryControlledStatementsSection statementsQ={statementsQ} />
          </CollapsibleContent>
        </div>
      </Collapsible>
    </IntelPanel>
  );
}

function RivalryTradeLedgerSection({
  focalOwnerKey,
  opponentOwnerKey,
  focalDisplayName,
  opponentDisplayName,
  leagueContextKey,
  leagueKeyReady,
  activeSeason,
  documentary = false,
  sectionTitle = "Trade Ledger",
}: {
  focalOwnerKey: string;
  opponentOwnerKey: string;
  focalDisplayName: string;
  opponentDisplayName: string;
  leagueContextKey: string;
  leagueKeyReady: boolean;
  activeSeason?: number;
  documentary?: boolean;
  sectionTitle?: string;
}) {
  const season = activeSeason ?? new Date().getFullYear();
  const tradeQ = (trpc as any).completedTradeIntel.rivalryTradeLedger.useQuery(
    withLeagueSalt(
      {
        leagueId: leagueContextKey,
        season,
        ownerAKey: focalOwnerKey,
        ownerBKey: opponentOwnerKey,
      },
      leagueContextKey,
    ),
    {
      enabled: leagueKeyReady && !!focalOwnerKey && !!opponentOwnerKey,
      staleTime: 60_000,
    },
  );

  const ledger = tradeQ.data;

  if (documentary && !tradeQ.isLoading && !tradeQ.isError && (!ledger || ledger.tradeCount === 0)) {
    return null;
  }

  const wrapperClass = documentary ? "border-b border-white/[0.06] p-4" : "p-3";
  const wrapperStyle = documentary ? undefined : SUB;

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <DocumentarySectionHeader
          icon={<ArrowLeftRight className="h-4 w-4" />}
          title={sectionTitle}
          accent={ACCENT}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
          {season} season
        </span>
      </div>

      {tradeQ.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm" style={{ color: MUTED }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading trade ledger…
        </div>
      ) : tradeQ.isError ? (
        <p className="text-sm" style={{ color: RED }}>Could not load trade ledger.</p>
      ) : !ledger || ledger.tradeCount === 0 ? (
        <div className="rounded-[8px] border border-dashed px-4 py-6 text-center" style={{ borderColor: "rgba(255,255,255,.12)" }}>
          <p className="text-sm font-medium" style={{ color: TEXT }}>No completed trades found between these owners.</p>
          <p className="mt-1 text-xs" style={{ color: MUTED }}>Completed ESPN trades will appear here after league sync.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Trade record</div>
              <div className="mt-1 text-lg font-extrabold tabular-nums" style={{ color: TEXT }}>
                {ledger.recordA}–{ledger.recordB}
                {ledger.ties > 0 ? `–${ledger.ties}` : ""}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug" style={{ color: MUTED }}>
                {focalDisplayName} vs {opponentDisplayName} · {ledger.tradeCount} trade{ledger.tradeCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Ledger winner</div>
              <div className="mt-1 text-sm font-bold" style={{ color: ledger.ledgerWinnerKey ? ACCENT : MUTED }}>
                {ledger.ledgerWinnerName ?? "Even"}
              </div>
            </div>
            <div className="rounded-[8px] px-3 py-2" style={{ ...SUB, borderRadius: 8 }}>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Trade count</div>
              <div className="mt-1 text-lg font-extrabold tabular-nums" style={{ color: TEXT }}>{ledger.tradeCount}</div>
            </div>
          </div>

          {(ledger.biggestFleece || ledger.mostBalanced) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {ledger.biggestFleece && (
                <div className="rounded-[8px] px-3 py-2" style={{ border: `1px solid ${ACCENT}33`, background: "rgba(163,230,53,.06)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ACCENT }}>Biggest trade win</div>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: TEXT }}>
                    {ledger.biggestFleece.winnerOwnerKey === focalOwnerKey
                      ? focalDisplayName
                      : ledger.biggestFleece.winnerOwnerKey === opponentOwnerKey
                        ? opponentDisplayName
                        : "Even"}{" "}
                    · +{Math.round(ledger.biggestFleece.margin)} value
                  </p>
                  <p className="mt-1 text-[10px]" style={{ color: MUTED }}>{ledger.biggestFleece.verdictLabel}</p>
                </div>
              )}
              {ledger.mostBalanced && (
                <div className="rounded-[8px] px-3 py-2" style={{ border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Most balanced trade</div>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: TEXT }}>
                    Margin {Math.round(ledger.mostBalanced.margin)} · {ledger.mostBalanced.verdictLabel}
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Recent trades</p>
            <div className="space-y-2">
              {(ledger.recentTrades ?? ledger.trades ?? []).map((entry: any) => {
                const trade = entry.trade;
                const focalSide = trade.sideA.ownerKey === focalOwnerKey ? trade.sideA : trade.sideB;
                const oppSide = trade.sideA.ownerKey === focalOwnerKey ? trade.sideB : trade.sideA;
                const focalReceived = tradeAssetLabels(focalSide);
                const oppReceived = tradeAssetLabels(oppSide);
                const result = focalTradeResult(entry.winnerOwnerKey, focalOwnerKey, opponentOwnerKey);
                const focalValue = focalSide.valueReceived ?? 0;
                const oppValue = oppSide.valueReceived ?? 0;
                const netFocal = focalValue - oppValue;
                return (
                  <div
                    key={trade.clusterId ?? trade.tradeId}
                    className="rounded-[8px] px-3 py-2.5 text-xs"
                    style={{ border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold" style={{ color: TEXT }}>
                        {trade.season} · {formatTradeProcessedDate(trade.processedDate)}
                      </div>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={tradeResultStyle(result)}
                      >
                        {result === "win" ? "Win" : result === "loss" ? "Loss" : "Even"}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1" style={{ color: TEXT }}>
                      <div>
                        <span className="font-semibold" style={{ color: ACCENT }}>{focalDisplayName} received:</span>{" "}
                        {focalReceived.length ? focalReceived.join(", ") : "—"}
                      </div>
                      <div>
                        <span className="font-semibold" style={{ color: BLUE }}>{opponentDisplayName} received:</span>{" "}
                        {oppReceived.length ? oppReceived.join(", ") : "—"}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: MUTED }}>
                      <span>
                        Margin:{" "}
                        <span className="font-semibold tabular-nums" style={{ color: TEXT }}>
                          {netFocal > 0 ? "+" : ""}
                          {Math.round(netFocal)}
                        </span>
                      </span>
                      {trade.verdictLabel ? (
                        <span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "rgba(255,255,255,.1)", color: MUTED }}>
                          {trade.verdictLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GatedRivalryDossierTeaser({
  focalOwnerKey,
  opponentOwnerKey,
  leagueContextKey,
  leagueKeyReady,
  onUnlock,
  checkoutPending,
}: {
  focalOwnerKey: string;
  opponentOwnerKey: string;
  leagueContextKey: string;
  leagueKeyReady: boolean;
  onUnlock: () => void;
  checkoutPending: boolean;
}) {
  const lockedCopy = resolvePaywallCopy(
    "This rivalry has a story worth telling — unlock the complete story.",
    "Receipts, timeline, turning points, trade chapters, and evidence stay locked. Rivals Pro unlocks the complete why behind this feud.",
  );
  const statementsQ = useRivalryStoryStatementsQuery(
    focalOwnerKey,
    opponentOwnerKey,
    leagueContextKey,
    leagueKeyReady && opponentOwnerKey.length > 0,
  );

  const coldOpen = topColdOpenStatement(
    (statementsQ.data?.statements ?? []) as StoryStatementPayload[],
  );

  return (
    <div className="space-y-4 p-4" style={{ ...PANEL, boxShadow: "0 0 40px rgba(0,0,0,0.45)" }}>
      <div className="flex items-center gap-2" style={{ color: ACCENT }}>
        <Swords className="h-4 w-4" />
        <h3 className="text-sm font-extrabold uppercase tracking-[0.18em]">Rivalry Documentary</h3>
      </div>

      {opponentOwnerKey && statementsQ.isLoading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading documentary preview…
        </div>
      ) : coldOpen ? (
        <div className="p-4" style={{ ...SUB, borderTop: `3px solid ${GOLD}` }}>
          <DocumentarySectionHeader icon={<Clapperboard className="h-4 w-4" />} title="Cold Open" accent={GOLD} />
          <p className="text-base font-semibold leading-snug md:text-lg" style={{ color: TEXT }}>
            {coldOpen.text}
          </p>
        </div>
      ) : (
        <p className="text-sm" style={{ color: MUTED }}>
          {opponentOwnerKey ? lockedCopy.heading : "Select a rival to preview one line from their documentary."}
        </p>
      )}

      {coldOpen ? (
        <p className="text-sm" style={{ color: MUTED }}>
          {lockedCopy.description}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onUnlock}
        disabled={checkoutPending}
        className="inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-extrabold"
        style={{ background: ACCENT, color: "#1e1623" }}
      >
        {checkoutPending ? COMMERCIAL.upgradeCtaPending : COMMERCIAL.upgradeCtaUnderstandWhy}
      </button>
    </div>
  );
}

export function RivalryDossierPanel({
  focalOwnerKey,
  pickerOptions,
  rivalryEligibleOwnerKeys,
  activeSeason,
  initialOpponentKey,
}: Props) {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const [queryKey, setQueryKey] = useState(focalOwnerKey.trim());
  const [includeHistoricalOwners, setIncludeHistoricalOwners] = useState(false);
  const [opponentKey, setOpponentKey] = useState<string>(initialOpponentKey ?? "");

  const prevLeagueContextKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevLeagueContextKeyRef.current != null && prevLeagueContextKeyRef.current !== leagueContextKey) {
      setOpponentKey("");
    }
    prevLeagueContextKeyRef.current = leagueContextKey;
  }, [leagueContextKey]);

  useEffect(() => {
    setQueryKey(focalOwnerKey.trim());
  }, [focalOwnerKey]);

  const rosterSet = useMemo(() => {
    if (!rivalryEligibleOwnerKeys?.length) return null;
    return new Set(rivalryEligibleOwnerKeys);
  }, [rivalryEligibleOwnerKeys?.join("|")]);

  const filteredPickers = useMemo(() => {
    if (!pickerOptions?.length) return [];
    const sorted = [...pickerOptions].sort((a, b) => a.label.localeCompare(b.label));
    if (includeHistoricalOwners || !rosterSet) return sorted;
    const f = sorted.filter((o) => rosterSet.has(o.ownerKey));
    if (queryKey && !rosterSet.has(queryKey)) {
      const cur = sorted.find((x) => x.ownerKey === queryKey);
      if (cur) return [cur, ...f.filter((x) => x.ownerKey !== queryKey)];
    }
    return f;
  }, [pickerOptions, rosterSet, includeHistoricalOwners, queryKey]);

  const eligibleForQuery = useMemo(() => {
    if (includeHistoricalOwners) return undefined;
    if (!rivalryEligibleOwnerKeys?.length) return undefined;
    return [...rivalryEligibleOwnerKeys];
  }, [includeHistoricalOwners, rivalryEligibleOwnerKeys?.join("|")]);

  const q = trpc.owners.rivalryDossier.useQuery(
    withLeagueSalt(
      {
        ownerKey: queryKey,
        includeHistoricalOwners,
        rivalryEligibleOwnerKeys: eligibleForQuery,
        opponentOwnerKeyForPair: opponentKey || undefined,
      },
      leagueContextKey,
    ),
    { enabled: leagueKeyReady && queryKey.length > 0, staleTime: 60_000 },
  );

  const { openUpgrade, upgradeDialog } = useUpgradeDialog({
    title: COMMERCIAL.upgradeCtaUnderstandWhy,
    description: "Unlock the full rivalry dossier — head-to-head receipts, streaks, and every scar between these two owners.",
  });
  const dossierLog = (trpc as any).usageMonitor.logUIEvent.useMutation();

  useEffect(() => {
    const opps = q.data?.opponents;
    // React #185 fix: opponentKey is part of the query key, so changing it makes
    // q.data briefly undefined during the refetch. Never clear the selection here —
    // clearing flipped opponentKey ""<->opps[0] forever. Preserve the current pick
    // across query transitions; auto-select only once, when nothing is selected yet.
    if (!opps?.length) return;
    setOpponentKey((cur) => (cur ? cur : opps[0]!.opponentOwnerKey));
  }, [q.data?.opponents]);

  if (!queryKey) {
    return <p className="text-sm" style={{ color: MUTED }}>Select an owner to load the dossier.</p>;
  }

  if (q.isPending || q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm" style={{ color: MUTED }}>
        <Loader2 className="h-5 w-5 animate-spin" /> Loading rivalry dossier…
      </div>
    );
  }

  if (q.isError) {
    return (
      <p className="text-sm" style={{ color: RED }}>
        Could not load dossier: {getErrorMessage(q.error)}
      </p>
    );
  }

  const data = q.data;
  if (!data) {
    return (
      <p className="text-sm" style={{ color: MUTED }}>
        No dossier for this owner — they may not resolve against gmTeams / gmMatchups yet.
      </p>
    );
  }

  if ((data as any).gated) {
    const teaserOpponentKey = opponentKey || initialOpponentKey || "";
    const startDossierCheckout = () => {
      if (typeof window === "undefined") return;
      dossierLog.mutate({ eventType: "cta_click", featureName: "rivalry_dossier_unlock_clicked" });
      openUpgrade();
    };
    return (
      <>
      {upgradeDialog}
      <GatedRivalryDossierTeaser
        focalOwnerKey={queryKey}
        opponentOwnerKey={teaserOpponentKey}
        leagueContextKey={leagueContextKey}
        leagueKeyReady={leagueKeyReady}
        onUnlock={startDossierCheckout}
        checkoutPending={false}
      />
      </>
    );
  }

  const pd = data.pairDetail;
  const oppRow = data.opponents.find((o) => o.opponentOwnerKey === opponentKey);
  const focalLabel =
    filteredPickers.find((o) => o.ownerKey === queryKey)?.label ??
    pickerOptions?.find((o) => o.ownerKey === queryKey)?.label;

  return (
    <div className="space-y-5 p-4" style={{ ...PANEL, boxShadow: "0 0 40px rgba(0,0,0,0.45)" }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2" style={{ color: TEXT }}>
            <ScrollText className="h-4 w-4" style={{ color: ACCENT }} />
            <h3 className="text-base font-extrabold uppercase tracking-[0.18em]">Rivalry Dossier</h3>
            {opponentKey && (
              <RivalryShareButton
                leagueId={leagueContextKey}
                focalOwnerKey={queryKey}
                rivalOwnerKey={opponentKey}
                ownerAName={focalLabel}
                ownerBName={oppRow?.opponentDisplayName}
              />
            )}
          </div>
          <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
            Completed games (RS + playoffs) · {data.matchupRowsUsed} deduped rows · season {activeSeason ?? "—"}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex items-center gap-2 rounded-[10px] px-3 py-2" style={SUB}>
            <Switch id="hist-own" checked={includeHistoricalOwners} onCheckedChange={(v) => setIncludeHistoricalOwners(Boolean(v))} />
            <Label htmlFor="hist-own" className="cursor-pointer text-xs" style={{ color: TEXT }}>Include Historical Owners</Label>
          </div>
          {filteredPickers.length > 0 && (
            <label className="flex flex-col gap-1 text-xs" style={{ color: MUTED }}>
              <span>Focal owner</span>
              <select className="rounded-md px-2 py-1.5 text-sm min-w-[200px] max-w-full" style={FIELD} value={queryKey} onChange={(e) => setQueryKey(e.target.value)}>
                {filteredPickers.map((o) => (<option key={o.ownerKey} value={o.ownerKey}>{o.label}</option>))}
              </select>
            </label>
          )}
          {data.opponents.length > 0 && (
            <label className="flex flex-col gap-1 text-xs" style={{ color: MUTED }}>
              <span>Rival</span>
              <select className="rounded-md px-2 py-1.5 text-sm min-w-[200px] max-w-full" style={FIELD} value={opponentKey} onChange={(e) => setOpponentKey(e.target.value)}>
                {data.opponents.map((o) => (
                  <option key={o.opponentOwnerKey} value={o.opponentOwnerKey}>
                    {o.opponentDisplayName} ({o.wins}–{o.losses}{o.ties ? `–${o.ties}` : ""})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {data.coverage?.partial && (
        <div
          className="rounded-[10px] px-3 py-2 text-xs"
          style={{ border: `1px solid ${GOLD}40`, background: "rgba(245,198,90,.08)", color: GOLD }}
        >
          {coverageNote(data.coverage)}
        </div>
      )}

      {!pd || !oppRow ? (
        <p className="rounded-[10px] border border-dashed py-10 text-center text-sm" style={{ borderColor: "rgba(255,255,255,.12)", color: MUTED }}>
          {data.opponents.length === 0
            ? "No head-to-head opponents match the current filters."
            : "Select a rival with recorded games to view the dossier."}
        </p>
      ) : (
        <>
          {/* Hero: focal vs opponent */}
          <div className="relative grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
            <div className="relative overflow-hidden p-4" style={{ ...SUB, borderTop: `3px solid ${ACCENT}` }}>
              <div className="relative flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-black" style={{ border: `2px solid ${ACCENT}66`, background: "rgba(139,92,246,.10)", color: ACCENT }}>
                  {initials(pd.focalDisplayName)}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-lg font-bold" style={{ color: TEXT }}>{pd.focalDisplayName}</div>
                  <div className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ border: `1px solid ${ACCENT}55`, background: "rgba(139,92,246,.10)", color: ACCENT }}>
                    {pd.focalTag}
                  </div>
                  <p className="text-[11px]" style={{ color: MUTED }}>Active since {pd.firstMeetingSeason ?? "—"}</p>
                  <p className="text-sm font-medium tabular-nums" style={{ color: TEXT }}>
                    Record vs {pd.opponentDisplayName}: {pd.recordFocalVs.wins}–{pd.recordFocalVs.losses}{pd.recordFocalVs.ties ? `–${pd.recordFocalVs.ties}` : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center py-2 lg:py-0">
              <div className="flex h-20 w-20 items-center justify-center rounded-xl text-xl font-black italic tracking-tight" style={{ border: `2px solid ${GOLD}55`, background: "rgba(245,198,90,.10)", color: GOLD }}>
                VS
              </div>
            </div>

            <div className="relative overflow-hidden p-4" style={{ ...SUB, borderTop: `3px solid ${BLUE}` }}>
              <div className="relative flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-black" style={{ border: `2px solid ${BLUE}66`, background: "rgba(139,92,246,.10)", color: BLUE }}>
                  {initials(pd.opponentDisplayName)}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-lg font-bold" style={{ color: TEXT }}>{pd.opponentDisplayName}</div>
                  <div className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ border: `1px solid ${BLUE}55`, background: "rgba(139,92,246,.10)", color: BLUE }}>
                    {pd.opponentTag}
                  </div>
                  <p className="text-[11px]" style={{ color: MUTED }}>Active since {pd.firstMeetingSeason ?? "—"}</p>
                  <p className="text-sm font-medium tabular-nums" style={{ color: TEXT }}>
                    Record vs {pd.focalDisplayName}: {pd.recordFocalVs.losses}–{pd.recordFocalVs.wins}{pd.recordFocalVs.ties ? `–${pd.recordFocalVs.ties}` : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stat strip */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard icon={<Swords className="h-4 w-4" style={{ color: MUTED }} />} label="All-Time Record" value={`${pd.recordFocalVs.wins}–${pd.recordFocalVs.losses}${pd.recordFocalVs.ties ? `–${pd.recordFocalVs.ties}` : ""}`} sub="Head-to-head (RS + playoffs)" />
            <StatCard icon={<HeartCrack className="h-4 w-4" style={{ color: RED }} />} label="Heartbreak Index" value={String(pd.heartbreakLossesFocal)} sub="Losses by ≤3 pts" valueColor={RED} />
            <StatCard icon={<Calendar className="h-4 w-4" style={{ color: MUTED }} />} label="Last Meeting" value={pd.lastMeeting ? `${pd.lastMeeting.season} · Wk ${pd.lastMeeting.week}` : "—"} sub={pd.lastMeeting ? `${pd.lastMeeting.result} ${pd.lastMeeting.ownerScore.toFixed(1)}–${pd.lastMeeting.opponentScore.toFixed(1)}` : "—"} />
            <StatCard icon={<Trophy className="h-4 w-4" style={{ color: GOLD }} />} label="Playoff Encounters" value={String(pd.playoffEncounters)} sub="From playoff gmMatchups" />
            <StatCard icon={<Crosshair className="h-4 w-4" style={{ color: ACCENT }} />} label="Waiver Snipes" value={pd.waiverSnipes.available ? String(pd.waiverSnipes.count) : "—"} sub={pd.waiverSnipes.available ? "Detected from transactions" : pd.waiverSnipes.label} />
          </div>

          <RivalryDocumentaryExperience
            focalOwnerKey={queryKey}
            opponentOwnerKey={opponentKey}
            focalDisplayName={pd.focalDisplayName}
            opponentDisplayName={pd.opponentDisplayName}
            leagueContextKey={leagueContextKey}
            leagueKeyReady={leagueKeyReady}
            meetings={pd.headToHeadHistory}
            lastMeeting={pd.lastMeeting}
            activeSeason={activeSeason}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {/* H2H table */}
            <div className="p-3" style={SUB}>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                <ChartLine className="h-4 w-4" style={{ color: ACCENT }} />
                Head-to-Head History
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-[11px]">
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-wide" style={{ borderColor: LINE, color: MUTED }}>
                      <th className="py-2 pr-2">Season</th>
                      <th className="py-2 pr-2">Week</th>
                      <th className="py-2 pr-2 text-right" style={{ color: ACCENT }}>{pd.focalDisplayName}</th>
                      <th className="py-2 pr-2 text-right" style={{ color: BLUE }}>{pd.opponentDisplayName}</th>
                      <th className="py-2 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pd.headToHeadHistory.map((g, i) => (
                      <tr key={`${g.season}-${g.matchupPeriodId}-${i}`} className="border-b" style={{ borderColor: "rgba(255,255,255,.04)", color: TEXT }}>
                        <td className="py-1.5 pr-2 tabular-nums">{g.season}</td>
                        <td className="py-1.5 pr-2">{g.week}{g.isPlayoff ? <span style={{ color: GOLD }}> (P)</span> : null}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums" style={{ color: ACCENT }}>{g.ownerScore.toFixed(1)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums" style={{ color: BLUE }}>{g.opponentScore.toFixed(1)}</td>
                        <td className="py-1.5 text-center font-bold" style={{ color: g.result === "W" ? GREEN : g.result === "L" ? RED : MUTED }}>{g.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Insights */}
            <div className="p-3" style={SUB}>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                <Lightbulb className="h-4 w-4" />
                Rivalry Insights
              </div>
              {pd.insights.length === 0 ? (
                <p className="text-sm" style={{ color: MUTED }}>Not enough data for rivalry insights yet.</p>
              ) : (
                <ul className="space-y-2">
                  {pd.insights.map((line, i) => (
                    <li key={i} className="rounded-[8px] px-3 py-2 text-sm leading-snug" style={{ border: `1px solid ${GOLD}26`, background: "rgba(245,198,90,.06)", color: TEXT }}>
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="p-3" style={SUB}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
              <ChartLine className="h-4 w-4" style={{ color: ACCENT }} />
              Matchup History Chart
            </div>
            {pd.chartSeries.length >= 2 ? (
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pd.chartSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: MUTED, fontSize: 10 }} width={36} />
                    <Tooltip contentStyle={{ background: "#1f1624", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }} labelStyle={{ color: MUTED }} />
                    <Line type="monotone" dataKey="ownerScore" name={pd.focalDisplayName} stroke={CHART_FOCAL} dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="opponentScore" name={pd.opponentDisplayName} stroke={CHART_OPP} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap gap-3 text-[10px]" style={{ color: MUTED }}>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm" style={{ background: CHART_FOCAL }} />{pd.focalDisplayName}</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm" style={{ background: CHART_OPP }} />{pd.opponentDisplayName}</span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[140px] items-center justify-center rounded-[8px] border border-dashed text-sm" style={{ borderColor: "rgba(255,255,255,.08)", color: MUTED }}>
                Matchup History Chart — Coming Soon
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div className="px-3 py-2.5" style={SUB}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold tabular-nums" style={{ color: valueColor ?? TEXT }}>{value}</div>
      <div className="mt-0.5 text-[10px] leading-snug" style={{ color: MUTED }}>{sub}</div>
    </div>
  );
}
