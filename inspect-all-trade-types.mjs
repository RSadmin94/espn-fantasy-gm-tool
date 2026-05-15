import { getCachedView, getAllCachedSeasons } from './server/db.ts';

async function main() {
  const seasons = await getAllCachedSeasons();
  for (const s of seasons) {
    const row = await getCachedView(s, 'combined');
    if (!row) continue;
    const txns = row.payload.transactions || [];
    const byTypeStatus = {};
    for (const t of txns) {
      const key = `${t.type}/${t.status}`;
      byTypeStatus[key] = (byTypeStatus[key] || 0) + 1;
    }
    const tradeLike = txns.filter(t => t.type?.includes('TRADE') || t.status === 'EXECUTED');
    console.log(`${s}: total=${txns.length} trade-like=${tradeLike.length}`, JSON.stringify(byTypeStatus));
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
