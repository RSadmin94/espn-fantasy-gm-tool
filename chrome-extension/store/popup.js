/**
 * Store-facing popup: ESPN session presence only.
 * League discovery and save happen on the Rivals site via GMWR_CONNECT_ESPN.
 */
const ESPN_COOKIE_BASE_URLS = ["https://fantasy.espn.com/", "https://www.espn.com/"];

async function getCookiePresence() {
  let hasSwid = false;
  let hasS2 = false;
  for (const url of ESPN_COOKIE_BASE_URLS) {
    const [swid, s2] = await Promise.all([
      chrome.cookies.get({ url, name: "SWID" }),
      chrome.cookies.get({ url, name: "espn_s2" }),
    ]);
    if (swid?.value) hasSwid = true;
    if (s2?.value) hasS2 = true;
    if (hasSwid && hasS2) break;
  }
  return { hasSwid, hasS2 };
}

document.addEventListener("DOMContentLoaded", async () => {
  const status = document.getElementById("status");
  const espnBtn = document.getElementById("openEspn");
  try {
    const { hasSwid, hasS2 } = await getCookiePresence();
    if (hasSwid && hasS2) {
      status.className = "status ok";
      status.textContent = "ESPN session detected. Continue on Fantasy Football Rivals to connect a league.";
      espnBtn.style.display = "none";
    } else {
      status.className = "status warn";
      status.textContent = "ESPN is not signed in in this browser. Sign in to ESPN, then return to Rivals.";
    }
  } catch {
    status.className = "status warn";
    status.textContent = "Could not read ESPN session status. Open Fantasy Football Rivals to continue.";
  }
});
