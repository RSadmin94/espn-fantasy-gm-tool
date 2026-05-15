import { getCachedView } from './server/db.ts';

async function main() {
  const row = await getCachedView(2026, 'combined');
  if (!row) { console.log('No 2026 data'); process.exit(0); }
  const data = row.payload;
  const txns = data.transactions || [];
  
  // Find TRADE_PROPOSAL with EXECUTED status
  const executed = txns.filter(tx => 
    (tx.type === 'TRADE_PROPOSAL' || tx.type === 'TRADE') && 
    (tx.status === 'EXECUTED' || tx.status === 'ACCEPTED')
  );
  
  console.log(`Total txns: ${txns.length}`);
  console.log(`Executed trade proposals: ${executed.length}`);
  
  for (const tx of executed) {
    console.log('\n=== TRADE ===');
    console.log('type:', tx.type, 'status:', tx.status);
    console.log('id:', tx.id);
    console.log('proposedDate:', tx.proposedDate, '->', new Date(tx.proposedDate).toLocaleDateString());
    console.log('items count:', tx.items?.length);
    for (const item of (tx.items || [])) {
      console.log('  item:', JSON.stringify(item, null, 2));
    }
  }
  
  // Also check all statuses for TRADE_PROPOSAL
  const byStatus = {};
  for (const tx of txns.filter(t => t.type === 'TRADE_PROPOSAL')) {
    byStatus[tx.status] = (byStatus[tx.status] || 0) + 1;
  }
  console.log('\nTRADE_PROPOSAL by status:', byStatus);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
