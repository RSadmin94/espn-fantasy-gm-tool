import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

async function getPayload(season) {
  const [rows] = await conn.execute(
    'SELECT payload FROM espn_season_cache WHERE viewName = ? AND season = ? ORDER BY fetchedAt DESC LIMIT 1',
    ['combined', season]
  );
  if (!rows.length) return null;
  const raw = rows[0].payload;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const p2026 = await getPayload(2026);
const p2025 = await getPayload(2025);

const txs2026 = p2026?.transactions || [];
const txs2025 = p2025?.transactions || [];

const count = (txs) => {
  const m = {};
  for (const t of txs) {
    const k = (t.type || 'null') + '|' + (t.status || 'null');
    m[k] = (m[k] || 0) + 1;
  }
  return m;
};

console.log('=== 2026 transaction types ===');
console.log(JSON.stringify(count(txs2026), null, 2));
console.log('=== 2025 transaction types ===');
console.log(JSON.stringify(count(txs2025), null, 2));

// Show one TRADE_UPHOLD/ACCEPT and linked TRADE_PROPOSAL
const uphold = txs2026.find(t => t.type === 'TRADE_UPHOLD' || t.type === 'TRADE_ACCEPT');
if (uphold) {
  console.log('\n=== 2026 TRADE_UPHOLD/ACCEPT sample ===');
  console.log(JSON.stringify(uphold, null, 2));
  const linked = txs2026.find(t => t.id === uphold.relatedTransactionId);
  if (linked) {
    console.log('\n=== Linked TRADE_PROPOSAL ===');
    console.log(JSON.stringify(linked, null, 2));
  } else {
    console.log('Linked proposal NOT in cache. relatedTransactionId:', uphold.relatedTransactionId);
    const proposals = txs2026.filter(t => t.type === 'TRADE_PROPOSAL');
    console.log('All TRADE_PROPOSAL ids:', JSON.stringify(proposals.map(p => ({ id: p.id, status: p.status, relatedId: p.relatedTransactionId }))));
  }
}

// Show one 2025 TRADE
const trade2025 = txs2025.find(t => t.type === 'TRADE' && t.status === 'EXECUTED');
if (trade2025) {
  console.log('\n=== 2025 TRADE sample ===');
  console.log(JSON.stringify(trade2025, null, 2));
} else {
  console.log('\nNo 2025 TRADE+EXECUTED found. All 2025 types:', JSON.stringify(count(txs2025)));
}

await conn.end();
