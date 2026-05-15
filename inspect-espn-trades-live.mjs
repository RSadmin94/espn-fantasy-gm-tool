// Test what ESPN returns for trade transactions with different filter parameters
// Use env vars directly for quick inspection
import 'dotenv/config';

async function fetchEspn(url, creds) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    Accept: 'application/json,text/plain,*/*',
    Referer: 'https://fantasy.espn.com/football/league',
    Cookie: `espn_s2=${creds.s2}; SWID=${creds.swid}`,
  };
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  console.log(`  Status: ${res.status}`);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const creds = { swid: process.env.ESPN_SWID, s2: process.env.ESPN_S2, leagueId: process.env.ESPN_LEAGUE_ID };
  if (!creds.swid || !creds.s2) { console.log('No ESPN credentials in env (ESPN_SWID, ESPN_S2 required)'); process.exit(1); }
  
  const lid = creds.leagueId;
  const season = 2026;
  const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${lid}`;
  
  console.log('League ID:', lid);
  console.log('Season:', season);
  
  // Test 1: mTransactions2 with no filter (current approach)
  console.log('\n--- Test 1: mTransactions2 (current) ---');
  const d1 = await fetchEspn(`${base}?view=mTransactions2`, creds);
  if (d1) {
    const txns = d1.transactions || [];
    console.log('  Total txns:', txns.length);
    const byType = {};
    for (const t of txns) { byType[`${t.type}/${t.status}`] = (byType[`${t.type}/${t.status}`] || 0) + 1; }
    console.log('  By type/status:', JSON.stringify(byType));
  }
  
  // Test 2: Find TRADE_ACCEPT transactions
  console.log('\n--- Test 2: TRADE_ACCEPT transactions ---');
  const d2 = await fetchEspn(`${base}?view=mTransactions2`, creds);
  if (d2) {
    const txns = d2.transactions || [];
    const accepts = txns.filter(t => t.type === 'TRADE_ACCEPT' || t.type === 'TRADE_UPHOLD');
    console.log('  TRADE_ACCEPT/UPHOLD count:', accepts.length);
    for (const tx of accepts) {
      console.log('  TX:', JSON.stringify(tx, null, 2));
    }
  }
  
  // Test 3: mTransactions2 with filterStatus=EXECUTED
  console.log('\n--- Test 3: mTransactions2 + filterStatus=EXECUTED ---');
  const d3 = await fetchEspn(`${base}?view=mTransactions2&filterStatus=EXECUTED`, creds);
  if (d3) {
    const txns = d3.transactions || [];
    console.log('  Total txns:', txns.length);
    if (txns.length > 0) console.log('  Sample:', JSON.stringify(txns[0], null, 2).slice(0, 500));
  }
  
  // Test 4: mTransactions2 with scoringPeriodId=0 (all periods)
  console.log('\n--- Test 4: mTransactions2 + scoringPeriodId=0 ---');
  const d4 = await fetchEspn(`${base}?view=mTransactions2&scoringPeriodId=0`, creds);
  if (d4) {
    const txns = d4.transactions || [];
    console.log('  Total txns:', txns.length);
    const byType = {};
    for (const t of txns) { byType[`${t.type}/${t.status}`] = (byType[`${t.type}/${t.status}`] || 0) + 1; }
    console.log('  By type/status:', JSON.stringify(byType));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
