// scripts/testOddsApiKey.mjs
// Validates THE_ODDS_API_KEY by calling the free /sports endpoint (no quota cost)
const key = process.env.THE_ODDS_API_KEY;
if (!key) {
  console.error("THE_ODDS_API_KEY not set");
  process.exit(1);
}
const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${key}`);
console.log("HTTP status:", res.status);
if (res.status === 401) {
  console.error("Invalid API key");
  process.exit(1);
}
const data = await res.json();
const nfl = data.find((s) => s.key === "americanfootball_nfl");
console.log("NFL sport found:", !!nfl, "active:", nfl?.active);
console.log("Remaining credits:", res.headers.get("x-requests-remaining"));
console.log("API key validated successfully.");
