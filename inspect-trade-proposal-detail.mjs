// Find the original TRADE_PROPOSAL that was accepted
import { getCachedView } from './server/db.ts';

async function main() {
  const row = await getCachedView(2026, 'combined');
  if (!row) { console.log('No 2026 data'); process.exit(0); }
  const txns = row.payload.transactions || [];
  
  // The relatedTransactionId from the TRADE_ACCEPT
  const relatedId = 'd3731d04-107d-415a-8c25-f5530b88dddf';
  
  // Find the original proposal
  const proposal = txns.find(t => t.id === relatedId);
  if (proposal) {
    console.log('Found in cache:', JSON.stringify(proposal, null, 2));
  } else {
    console.log('NOT in cache. Searching by type...');
    const proposals = txns.filter(t => t.type === 'TRADE_PROPOSAL');
    console.log('All proposals:', proposals.map(p => ({ id: p.id, status: p.status, items: p.items?.length })));
  }
  
  // Also show all TRADE_ACCEPT/UPHOLD with their relatedTransactionId
  const accepts = txns.filter(t => t.type === 'TRADE_ACCEPT' || t.type === 'TRADE_UPHOLD');
  console.log('\nAll TRADE_ACCEPT/UPHOLD:');
  for (const a of accepts) {
    console.log(`  ${a.type} team=${a.teamId} relatedId=${a.relatedTransactionId}`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
