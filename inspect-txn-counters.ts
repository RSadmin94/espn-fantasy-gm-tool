import { getCachedView, getAllCachedSeasons } from './server/db';

async function main() {
  const seasons = await getAllCachedSeasons();

  for (const season of seasons) {
    const row = await getCachedView(season, 'combined');
    if (!row) continue;
    const data = row.payload as any;
    const teams: any[] = data.teams || [];

    console.log(`\n=== ${season} ===`);
    for (const t of teams) {
      const tc = t.transactionCounter || {};
      console.log(`  Team ${t.id} (${t.name || t.abbrev}): acquisitions=${tc.acquisitions ?? '?'} drops=${tc.drops ?? '?'} trades=${tc.trades ?? '?'} moveToActive=${tc.moveToActive ?? '?'} moveToIR=${tc.moveToIR ?? '?'}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
