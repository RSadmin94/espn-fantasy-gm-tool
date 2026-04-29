import { getCachedView } from './server/db';

async function main() {
  const row = await getCachedView(2025, 'combined');
  if (!row) return;
  const data = row.payload as any;

  const schedule = (data.schedule || []) as any[];
  // Show a completed matchup with scores
  const completed = schedule.filter((m: any) => m.winner && m.winner !== 'UNDECIDED');
  console.log('Completed matchups:', completed.length);
  if (completed.length > 0) {
    const m = completed[0];
    console.log('Winner:', m.winner);
    console.log('Home teamId:', m.home?.teamId, 'score:', m.home?.totalPoints);
    console.log('Away teamId:', m.away?.teamId, 'score:', m.away?.totalPoints);
    console.log('playoffTierType:', m.playoffTierType);
    console.log('matchupPeriodId:', m.matchupPeriodId);
  }

  // Show playoff matchups
  const playoffs = schedule.filter((m: any) => m.playoffTierType && m.playoffTierType !== 'NONE');
  console.log('\nPlayoff matchups:', playoffs.length);
  if (playoffs.length > 0) {
    playoffs.slice(0, 3).forEach((m: any) => {
      console.log(`  Period ${m.matchupPeriodId} tier=${m.playoffTierType} home=${m.home?.teamId}(${m.home?.totalPoints}) away=${m.away?.teamId}(${m.away?.totalPoints}) winner=${m.winner}`);
    });
  }

  // Check settings for playoff info
  const settings = data.settings || {};
  console.log('\nSettings keys:', Object.keys(settings));
  console.log('scheduleSettings:', JSON.stringify(settings.scheduleSettings, null, 2).slice(0, 500));

  // Show team record.overall
  const teams = (data.teams || []) as any[];
  teams.slice(0, 3).forEach((t: any) => {
    const overall = t.record?.overall || {};
    console.log(`\nTeam ${t.id} (${t.name || t.abbrev}): ${overall.wins}-${overall.losses} PF=${t.points}`);
    console.log('  owners:', t.owners);
    console.log('  primaryOwner:', t.primaryOwner);
    console.log('  playoffSeed:', t.playoffSeed, 'rankFinal:', t.rankFinal);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
