import { getCachedView, getAllCachedSeasons } from './server/db';

async function main() {
  const seasons = await getAllCachedSeasons();
  console.log('Cached seasons:', seasons);

  const row = await getCachedView(2025, 'combined');
  if (!row) { console.log('No 2025 data'); return; }

  const data = row.payload as any;
  console.log('Top-level keys:', Object.keys(data));

  const schedule = (data.schedule || []) as any[];
  console.log('Schedule entries:', schedule.length);
  if (schedule.length > 0) {
    const m = schedule[0];
    console.log('Matchup keys:', Object.keys(m));
    console.log('Sample matchup:', JSON.stringify(m, null, 2).slice(0, 1000));
  }

  const teams = (data.teams || []) as any[];
  console.log('\nTeams:', teams.length);
  if (teams.length > 0) {
    const t = teams[0];
    console.log('Team keys:', Object.keys(t));
    console.log('record:', JSON.stringify(t.record, null, 2).slice(0, 400));
    console.log('owners:', JSON.stringify(t.owners));
    console.log('location:', t.location, 'nickname:', t.nickname);
  }

  // Check members for owner name mapping
  const members = (data.members || []) as any[];
  console.log('\nMembers:', members.length);
  if (members.length > 0) {
    console.log('Member sample:', JSON.stringify(members[0], null, 2));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
