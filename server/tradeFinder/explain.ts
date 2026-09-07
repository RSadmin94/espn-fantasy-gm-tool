import type {
  FairnessBand,
  PositionNeedSurplus,
  TradeFinderAsset,
  TradeFinderTeam,
} from "./types";

function weakestNeed(team: TradeFinderTeam): PositionNeedSurplus | undefined {
  return [...team.needs].sort((a, b) => b.needScore - a.needScore)[0];
}

function strongestSurplus(team: TradeFinderTeam): PositionNeedSurplus | undefined {
  return [...team.needs].sort((a, b) => b.surplusScore - a.surplusScore)[0];
}

export function deterministicWhy(args: {
  user: TradeFinderTeam;
  partner: TradeFinderTeam;
  give: TradeFinderAsset[];
  receive: TradeFinderAsset[];
  fairness: FairnessBand;
  userDelta: number;
  partnerDelta: number;
}): string {
  const uNeed = weakestNeed(args.user);
  const pNeed = weakestNeed(args.partner);
  const uSur = strongestSurplus(args.user);
  const recv = args.receive.filter((a) => a.kind === "player").map((a) => a.name).join(" and ");
  const give = args.give.filter((a) => a.kind === "player").map((a) => a.name).join(" and ");
  const recvPos = args.receive.filter((a) => a.kind === "player").map((a) => a.position).join("/");
  const givePos = args.give.filter((a) => a.kind === "player").map((a) => a.position).join("/");
  const bits = [
    `You move ${give || "assets"} (${givePos || "mix"}) for ${recv || "assets"} (${recvPos || "mix"}).`,
  ];
  if (uNeed && args.receive.some((a) => a.position === uNeed.position)) {
    bits.push(`That addresses your ${uNeed.position} need.`);
  }
  if (uSur && args.give.some((a) => a.position === uSur.position)) {
    bits.push(`You are dealing from ${uSur.position} depth.`);
  }
  if (pNeed && args.give.some((a) => a.position === pNeed.position)) {
    bits.push(`${args.partner.displayName} gets help at ${pNeed.position}.`);
  }
  bits.push(`Fairness: ${args.fairness}.`);
  return bits.join(" ");
}

export function deterministicRisk(args: {
  user: TradeFinderTeam;
  give: TradeFinderAsset[];
  userDepth: number;
  userDelta: number;
}): string {
  const startersGiven = args.give.filter((a) => a.starter && a.kind === "player");
  if (startersGiven.length) {
    return `You are moving starter ${startersGiven.map((a) => a.name).join(", ")} — remaining depth at ${startersGiven[0].position} is thinner if injuries hit.`;
  }
  if (args.userDepth >= 0.4) {
    const pos = args.give.find((a) => a.kind === "player")?.position;
    return pos
      ? `Your ${pos} depth becomes thinner after this deal.`
      : "Roster depth is thinner after this deal.";
  }
  if (args.userDelta < 0) {
    return "Starting-lineup projection dips slightly; the bet is positional fit over raw points.";
  }
  return "Watch injury news on the players you receive before sending.";
}

export function impactBlurb(
  who: "you" | "them",
  delta: number,
  usesRealPoints: boolean,
  incoming: TradeFinderAsset[],
  team: TradeFinderTeam,
): string {
  const pos = incoming.filter((a) => a.kind === "player").map((a) => a.position);
  const needHit = team.needs.find((n) => n.label === "NEED" && pos.includes(n.position));
  const deltaTxt = usesRealPoints
    ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} projected starter points / week`
    : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} starter quality`;
  const fit = needHit ? `${needHit.position} weakness addressed` : "roster mix changes without a new hole";
  return who === "you" ? `${deltaTxt}. ${fit}.` : `${deltaTxt}. ${fit}.`;
}

export function emptyExplanation(
  reason: string,
  userNeeds: { position: string; label: string; needScore: number; surplusScore: number }[],
): string {
  const needs = userNeeds.filter((n) => n.label === "NEED").map((n) => n.position);
  const surplus = userNeeds.filter((n) => n.label === "SURPLUS").map((n) => n.position);
  if (reason === "no_viable_partners") {
    const needTxt = needs.length ? `your ${needs.join("/")} need` : "a clear positional need";
    const surTxt = surplus.length ? `${surplus.join("/")} surplus` : "tradable surplus";
    return `No strong trade opportunities right now. Opportunities appear when another roster has ${needTxt} covered and wants your ${surTxt}.`;
  }
  if (reason === "insufficient_values") {
    return "No strong trade opportunities right now. Player values are too thin to rank realistic offers — sync a current roster with projections or in-season stats.";
  }
  if (reason === "no_roster") {
    return "No strong trade opportunities right now. This season has no rostered players to evaluate.";
  }
  if (reason === "preseason_empty") {
    return "No strong trade opportunities right now. Rosters are empty or not yet set for this season.";
  }
  if (reason === "injury_heavy") {
    return "No strong trade opportunities right now. Too many key players are unavailable to form a legal, mutually useful deal.";
  }
  if (reason === "team_mismatch") {
    return "No strong trade opportunities right now. Your team could not be matched to a roster in this league.";
  }
  if (reason === "unsupported_season") {
    return "No strong trade opportunities right now. This season is not synced.";
  }
  if (reason === "no_league") {
    return "Connect a league to find trades against real rosters.";
  }
  return "No strong trade opportunities right now.";
}
