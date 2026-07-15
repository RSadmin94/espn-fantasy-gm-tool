/**
 * demoLeague.ts
 *
 * Canned, fictional demo-league data for the public LandingPage. NOT tied to any
 * real ESPN league, owner, or leagueId. Used only to render the marketing teaser.
 * No backend. All ASCII.
 *
 * Funnel intent: the free teaser proves an insight EXISTS and is about you,
 * without resolving it - so a screenshot creates curiosity, not a spoiler.
 */

export interface DemoStat {
  label: string;
  value: string;
  hint?: string;
}

export interface DemoProofCard {
  id: "rival" | "heartbreak" | "trades" | "dynasty";
  kicker: string;
  headline: string;
  proof: string;
  unlock: string;
  tone: "rival" | "heartbreak" | "trades" | "dynasty";
}

export interface DemoShowcase {
  id: "rivalry" | "dna" | "draft" | "legacy";
  eyebrow: string;
  title: string;
  line: string;
  chips: { k: string; v: string }[];
}

export interface DemoLeague {
  leagueName: string;
  seasons: number;
  teams: number;
  you: string;
  snapshot: DemoStat[];
  dnaInsight: string;
  matchupInsight: string;
  cards: DemoProofCard[];
  showcase: DemoShowcase[];
}

export const DEMO_LEAGUE: DemoLeague = {
  leagueName: "The Sunday Money League",
  seasons: 11,
  teams: 12,
  you: "Thunderhawks",
  snapshot: [
    { label: "Legacy rank", value: "#4", hint: "of 12 all-time" },
    { label: "Championships", value: "0", hint: "in 11 seasons" },
    { label: "Playoff Trips", value: "6", hint: "more than half your seasons" },
    { label: "All-Time Record", value: "78-66", hint: ".542 - a contender, never a champion" },
  ],
  dnaInsight:
    "Your teams peak in October and fade in November - a roster-construction pattern, not bad luck.",
  matchupInsight:
    "You are 2-9 lifetime against the one manager who keeps ending your season.",
  cards: [
    { id: "rival", kicker: "Rivalry", headline: "We found your biggest rival.", proof: "17 meetings / 7 seasons / 2 playoff exits", unlock: "Unlock the rivalry report", tone: "rival" },
    { id: "heartbreak", kicker: "Heartbreak", headline: "We found why you've never won.", proof: "3 finals / 0 rings / one pattern repeats", unlock: "Unlock your title path", tone: "heartbreak" },
    { id: "trades", kicker: "Trades", headline: "We found who runs your trade table.", proof: "23 trades / 71% go their way", unlock: "Unlock the trade ledger", tone: "trades" },
    { id: "dynasty", kicker: "Dynasty", headline: "We found your league's dynasty.", proof: "4 titles / 9 years / one name", unlock: "Unlock League History", tone: "dynasty" },
  ],
  showcase: [
    {
      id: "rivalry",
      eyebrow: "Rivalries",
      title: "The grudge match you keep losing",
      line: "Fantasy Football Rivals maps every head-to-head in your league and surfaces the one rivalry that quietly defines your seasons - the owner who always seems to end your year.",
      chips: [
        { k: "Head-to-head", v: "8-17" },
        { k: "Playoff exits", v: "2" },
        { k: "Closest loss", v: "1.4" },
      ],
    },
    {
      id: "dna",
      eyebrow: "Owner DNA",
      title: "Every manager has a tell",
      line: "We profile how each owner actually behaves - the panic-trader, the waiver hawk, the draft-and-hold - so you know exactly who you are dealing with before you offer a deal.",
      chips: [
        { k: "Your type", v: "Draft Reliant" },
        { k: "Top hawk", v: "42 adds" },
        { k: "Never trade", v: "2 owners" },
      ],
    },
    {
      id: "draft",
      eyebrow: "Draft Tendencies",
      title: "The mistakes you make every August",
      line: "Your draft history reveals the patterns you repeat - the positions you reach for, the rounds you fade, the value you leave on the board year after year.",
      chips: [
        { k: "Avg reach", v: "+11" },
        { k: "RB-first", v: "7 of 11" },
        { k: "Best round", v: "6th" },
      ],
    },
    {
      id: "legacy",
      eyebrow: "Legacy",
      title: "Eleven seasons, written down at last",
      line: "Champions, chokers, dynasties, and one-year wonders - the full story of your league, with living League History and the storylines ESPN never bothered to keep.",
      chips: [
        { k: "Seasons", v: "11" },
        { k: "Champions", v: "5" },
        { k: "Dynasty", v: "4 titles" },
      ],
    },
  ],
};
