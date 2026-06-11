/**
 * demoLeague.ts
 *
 * Canned demo-league data for the public LandingPage ("holy crap" moment
 * for cold visitors). Entirely fictional — NOT tied to any real ESPN league,
 * owner, or leagueId. Used only to render the marketing teaser; no backend.
 *
 * Design intent (agreed pricing/funnel strategy):
 *   - Free tier proves the answer EXISTS and is about you — without resolving it.
 *   - Tease cards hide the resolution behind an "Unlock" so screenshots create
 *     curiosity instead of giving the answer away in the league chat.
 */

export interface DemoSnapshotStat {
  label: string;
  value: string;
  hint?: string;
}

export interface DemoTeaseCard {
  /** stable key */
  id: "rival" | "why" | "trades" | "dynasty";
  /** small uppercase kicker */
  kicker: string;
  /** the hook headline ("We found ...") */
  headline: string;
  /** 2–3 concrete stat fragments that prove it's real + specific */
  proof: string[];
  /** the locked payoff label (resolution hidden) */
  unlock: string;
  /** accent tone */
  tone: "rival" | "why" | "trades" | "dynasty";
}

export interface DemoLeague {
  leagueName: string;
  seasons: number;
  teams: number;
  /** the fictional "you" whose snapshot the demo renders */
  you: string;
  /** free-tier snapshot stats (existence of the wow, not the resolution) */
  snapshot: DemoSnapshotStat[];
  /** one DNA insight teased on the free tier */
  dnaInsight: string;
  /** one matchup insight teased on the free tier */
  matchupInsight: string;
  /** the four locked tease cards */
  cards: DemoTeaseCard[];
}

export const DEMO_LEAGUE: DemoLeague = {
  leagueName: "The Sunday Money League",
  seasons: 11,
  teams: 12,
  you: "Thunderhawks",
  snapshot: [
    { label: "Hall of Fame Rank", value: "#4", hint: "of 12 all-time" },
    { label: "Championships", value: "0", hint: "in 11 seasons" },
    { label: "Playoff Trips", value: "6", hint: "more than half your seasons" },
    { label: "All-Time Record", value: "78–66", hint: ".542 — a contender, never a champion" },
  ],
  dnaInsight:
    "Your teams peak in October and fade in November — a roster-construction pattern, not bad luck.",
  matchupInsight:
    "You are 2–9 lifetime against the one manager who keeps ending your season.",
  cards: [
    {
      id: "rival",
      kicker: "Rivalry Report",
      headline: "We found your biggest rival.",
      proof: ["17 head-to-head meetings", "7 seasons of bad blood", "2 playoff eliminations"],
      unlock: "Unlock the full rivalry report",
      tone: "rival",
    },
    {
      id: "why",
      kicker: "Championship Path",
      headline: "We found why you've never won.",
      proof: ["3 trips to the final", "0 rings", "one pattern repeats every time"],
      unlock: "Unlock your championship path",
      tone: "why",
    },
    {
      id: "trades",
      kicker: "Trade Ledger",
      headline: "We found who runs your trade table.",
      proof: ["23 trades tracked", "71% go their way", "you're on the wrong side of 4"],
      unlock: "Unlock the trade ledger",
      tone: "trades",
    },
    {
      id: "dynasty",
      kicker: "League Dynasty",
      headline: "We found your league's dynasty.",
      proof: ["4 titles in 9 years", "one name keeps winning", "everyone else is fighting for 2nd"],
      unlock: "Unlock the Hall of Fame",
      tone: "dynasty",
    },
  ],
};
