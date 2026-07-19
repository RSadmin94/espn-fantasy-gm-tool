/**
 * Pure helpers mirroring v1.13 FantasyPros observer emission accounting.
 * Used to lock: baseline silent, one emit per new pick, no per-poll inflation.
 */

/**
 * @param {Array<{ pick: number, id: string }>} drafted
 * @param {Set<string>} baselineKeys
 * @param {{ picksEmitted: number, duplicatesSuppressed: number }} session
 */
export function diffFantasyProsDraftedForEmit(drafted, baselineKeys, session) {
  const newRows = [];
  let rowsScanned = 0;
  let skippedKnown = 0;
  const nextBaseline = new Set(baselineKeys);
  for (const row of drafted) {
    if (!row || !row.id || !(row.pick >= 1)) continue;
    rowsScanned += 1;
    const key = `${row.pick}:${row.id}`;
    if (nextBaseline.has(key)) {
      skippedKnown += 1;
      continue;
    }
    nextBaseline.add(key);
    newRows.push(row);
  }
  return {
    newRows,
    nextBaseline,
    rowsScanned,
    picksEmitted: session.picksEmitted + newRows.length,
    duplicatesSuppressed: Math.max(session.duplicatesSuppressed, skippedKnown),
  };
}

/**
 * @param {Array<{ pick: number, id: string }>} drafted
 */
export function establishFantasyProsBaseline(drafted) {
  const baselineKeys = new Set();
  let rowsScanned = 0;
  for (const row of drafted) {
    if (!row || !row.id || !(row.pick >= 1)) continue;
    rowsScanned += 1;
    baselineKeys.add(`${row.pick}:${row.id}`);
  }
  return {
    baselineKeys,
    rowsScanned,
    picksEmitted: 0,
    duplicatesSuppressed: baselineKeys.size,
  };
}
