import { getCachedView, getAllCachedSeasons } from './server/db';

async function main() {
  const seasons = await getAllCachedSeasons();
  console.log('Cached seasons:', seasons);

  for (const season of seasons) {
    const row = await getCachedView(season, 'combined');
    if (!row) { console.log(`\n${season}: NO DATA`); continue; }
    const data = row.payload as any;

    const txns: any[] = data.transactions || [];
    console.log(`\n=== ${season} === transactions: ${txns.length}`);

    if (txns.length === 0) continue;

    // Sample first transaction
    const t = txns[0];
    console.log('  Keys:', Object.keys(t));
    console.log('  Sample:', JSON.stringify(t, null, 2).slice(0, 600));

    // Count by type
    const byType: Record<string, number> = {};
    for (const tx of txns) {
      const type = tx.type || tx.transactionType || 'UNKNOWN';
      byType[type] = (byType[type] || 0) + 1;
    }
    console.log('  By type:', byType);

    // Check if player names are embedded
    const withNames = txns.filter((tx: any) =>
      tx.items?.some((item: any) => item.playerName || item.player?.fullName)
    );
    console.log(`  Txns with player names: ${withNames.length}/${txns.length}`);

    // Sample an item
    if (txns[0]?.items?.length > 0) {
      console.log('  Sample item:', JSON.stringify(txns[0].items[0], null, 2).slice(0, 400));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
