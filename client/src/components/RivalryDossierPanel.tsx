import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
const MUTED = "#8b97a8";
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
  documentaryFacts: Array<{ factKey: string }>;
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
      <div className="p-3" style={SUB}>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
          <Receipt className="h-4 w-4" style={{ color: GOLD }} />
          Story Receipts
        </div>
        <p className="text-[11px]" style={{ color: MUTED }}>No story receipts available.</p>
      </div>
    );
  }

  const knownCount = receipts.filter((r) => r.type !== "unknown").length;
  const unknownCount = receipts.length - knownCount;
  const sourceCounts = countReceiptSources(receipts);

  return (
    <div className="p-3" style={SUB}>
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
        <Receipt className="h-4 w-4" style={{ color: GOLD }} />
        Story Receipts
        <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal" style={{ border: "1px solid rgba(255,255,255,.1)", color: MUTED }}>
          internal
        </span>
      </div>

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
    </div>
  );
}

function RivalryTaleOfTheTapeSection({
  storyQ,
  meetings,
  lastMeeting,
}: {
  storyQ: ReturnType<typeof useRivalryStoryPairQuery>;
  meetings: TapeMeeting[];
  lastMeeting: TapeMeeting | null;
}) {
  if (storyQ.isLoading) {
    return (
      <div className="p-3" style={SUB}>
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
  const factCount = story.documentaryFacts.length;
  const blockCount = story.availableBlocks.length;

  return (
    <div className="p-3" style={SUB}>
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
        <Swords className="h-4 w-4" style={{ color: GOLD }} />
        Tale of the Tape
      </div>
      <div className="rounded-[8px] px-3 py-1" style={{ ...SUB, borderRadius: 8 }}>
        <TapeRow label="Tier" value={story.tier} />
        <TapeRow label="Headline" value={story.headline.key} />
        <TapeRow label="Career" value={formatRecord(tape.career.wins, tape.career.losses, tape.career.ties)} />
        {tape.playoffMeetings > 0 ? (
          <TapeRow label="Playoffs" value={formatRecord(tape.playoffRec.wins, tape.playoffRec.losses, tape.playoffRec.ties)} />
        ) : null}
        {tape.rsMeetings >= 5 ? (
          <TapeRow label="Recent five" value={formatRecord(tape.recentFive.wins, tape.recentFive.losses, tape.recentFive.ties)} />
        ) : null}
        <TapeRow label="Current streak" value={tape.streak} />
        <TapeRow label="Meetings" value={String(tape.meetings)} />
        <TapeRow label="Last meeting" value={formatLastMeeting(lastMeeting)} />
        <TapeRow label="Facts" value={String(factCount)} />
        <TapeRow label="Blocks" value={String(blockCount)} />
      </div>
    </div>
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
    <div className="p-3" style={SUB}>
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
        <ScrollText className="h-4 w-4" style={{ color: ACCENT }} />
        Story Metadata
        <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal" style={{ border: "1px solid rgba(255,255,255,.1)", color: MUTED }}>
          internal
        </span>
      </div>
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
    </div>
  );
}

function RivalryStoryPairBlocks({
  focalOwnerKey,
  opponentOwnerKey,
  leagueContextKey,
  leagueKeyReady,
  meetings,
  lastMeeting,
}: {
  focalOwnerKey: string;
  opponentOwnerKey: string;
  leagueContextKey: string;
  leagueKeyReady: boolean;
  meetings: TapeMeeting[];
  lastMeeting: TapeMeeting | null;
}) {
  const storyQ = useRivalryStoryPairQuery(focalOwnerKey, opponentOwnerKey, leagueContextKey, leagueKeyReady);
  return (
    <>
      <RivalryTaleOfTheTapeSection storyQ={storyQ} meetings={meetings} lastMeeting={lastMeeting} />
      <RivalryStoryMetadataSection storyQ={storyQ} />
      <RivalryStoryReceiptsSection
        focalOwnerKey={focalOwnerKey}
        opponentOwnerKey={opponentOwnerKey}
        leagueContextKey={leagueContextKey}
        leagueKeyReady={leagueKeyReady}
      />
    </>
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
}: {
  focalOwnerKey: string;
  opponentOwnerKey: string;
  focalDisplayName: string;
  opponentDisplayName: string;
  leagueContextKey: string;
  leagueKeyReady: boolean;
  activeSeason?: number;
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

  return (
    <div className="p-3" style={SUB}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
          <ArrowLeftRight className="h-4 w-4" style={{ color: ACCENT }} />
          Trade Ledger
        </div>
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

  const dossierCheckout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (res) => {
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer");
      else toast.error("Checkout did not return a link. Try again or contact support.");
    },
    onError: (err) => {
      toast.error(err.message || "Could not start checkout. Please try again.");
    },
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
    return (
      <div className="space-y-4 p-4" style={{ ...PANEL, boxShadow: "0 0 40px rgba(0,0,0,0.45)" }}>
        <div className="flex items-center gap-2" style={{ color: ACCENT }}>
          <Swords className="h-4 w-4" />
          <h3 className="text-sm font-extrabold uppercase tracking-[0.18em]">Rivalry Records Locked</h3>
        </div>
        <p className="text-sm" style={{ color: MUTED }}>
          The full head-to-head record, heartbreak losses, playoff scars, points for and against, and
          the meeting-by-meeting timeline are part of the paid Rivalry Center.
        </p>
        <button
          onClick={() => {
            if (typeof window === "undefined") return;
            dossierLog.mutate({ eventType: "cta_click", featureName: "rivalry_dossier_unlock_clicked" });
            dossierCheckout.mutate({ origin: window.location.origin });
          }}
          disabled={dossierCheckout.isPending}
          className="inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-extrabold"
          style={{ background: ACCENT, color: "#1e1623" }}
        >
          {dossierCheckout.isPending ? "Opening..." : "Unlock Rivalry Records"}
        </button>
      </div>
    );
  }

  const pd = data.pairDetail;
  const oppRow = data.opponents.find((o) => o.opponentOwnerKey === opponentKey);

  return (
    <div className="space-y-5 p-4" style={{ ...PANEL, boxShadow: "0 0 40px rgba(0,0,0,0.45)" }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2" style={{ color: TEXT }}>
            <ScrollText className="h-4 w-4" style={{ color: ACCENT }} />
            <h3 className="text-base font-extrabold uppercase tracking-[0.18em]">Rivalry Dossier</h3>
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

          <RivalryStoryPairBlocks
            focalOwnerKey={queryKey}
            opponentOwnerKey={opponentKey}
            leagueContextKey={leagueContextKey}
            leagueKeyReady={leagueKeyReady}
            meetings={pd.headToHeadHistory}
            lastMeeting={pd.lastMeeting}
          />

          <RivalryTradeLedgerSection
            focalOwnerKey={queryKey}
            opponentOwnerKey={opponentKey}
            focalDisplayName={pd.focalDisplayName}
            opponentDisplayName={pd.opponentDisplayName}
            leagueContextKey={leagueContextKey}
            leagueKeyReady={leagueKeyReady}
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

          {/* Rivalry Timeline (from head-to-head history) */}
          {pd.headToHeadHistory.length > 0 && (
            <div className="p-3" style={SUB}>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                <Calendar className="h-4 w-4" style={{ color: ACCENT }} />
                Rivalry Timeline
              </div>
              {(() => {
                const hist = pd.headToHeadHistory;
                const bySeasonAsc = [...hist].sort((a, b) => a.season - b.season || a.week - b.week);
                const firstPlayoff = bySeasonAsc.find((m) => m.isPlayoff) || null;
                const closest = [...hist].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0] || null;
                const blowout = [...hist].sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin))[0] || null;
                const fmt = (m: any) => `${m.ownerScore.toFixed(1)}-${m.opponentScore.toFixed(1)} ${m.result}`;
                type Ev = { season: number; title: string; detail: string };
                const evs: Ev[] = [];
                if (pd.firstMeetingSeason != null && bySeasonAsc[0])
                  evs.push({ season: pd.firstMeetingSeason, title: "First Meeting", detail: fmt(bySeasonAsc[0]) });
                if (firstPlayoff)
                  evs.push({ season: firstPlayoff.season, title: "First Playoff Meeting", detail: fmt(firstPlayoff) });
                if (closest)
                  evs.push({ season: closest.season, title: "Closest Game", detail: `${Math.abs(closest.margin).toFixed(1)} pt margin · ${fmt(closest)}` });
                if (blowout && Math.abs(blowout.margin) > 0)
                  evs.push({ season: blowout.season, title: "Biggest Blowout", detail: `${Math.abs(blowout.margin).toFixed(1)} pt margin · ${fmt(blowout)}` });
                if (pd.lastMeeting)
                  evs.push({ season: pd.lastMeeting.season, title: "Latest Showdown", detail: fmt(pd.lastMeeting) });
                const seen = new Set<string>();
                const items = evs
                  .filter((e) => { const k = e.season + e.title; if (seen.has(k)) return false; seen.add(k); return true; })
                  .sort((a, b) => a.season - b.season);
                if (items.length === 0) return null;
                return (
                  <ol className="relative ml-2 border-l pl-4" style={{ borderColor: "rgba(255,255,255,.15)" }}>
                    {items.map((e, i) => (
                      <li key={i} className="mb-3 last:mb-0">
                        <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full" style={{ background: ACCENT }} />
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-black" style={{ color: TEXT }}>{e.season}</span>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>{e.title}</span>
                        </div>
                        <div className="text-xs" style={{ color: MUTED }}>{e.detail}</div>
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </div>
          )}

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
