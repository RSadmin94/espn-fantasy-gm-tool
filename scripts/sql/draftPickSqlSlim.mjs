/**
 * Shared: slim rawPick JSON inside generated draft_picks INSERT SQL text.
 * Parses each value row's trailing JSON (after isKeeper,bidAmount) and keeps only:
 *   source, teamName, nflTeam (from nflTeam or legacy proTeam), ownerName
 * Also strips duplicate SQL-column keys from legacy dumps and fixes common legacy typos.
 */

/** @returns exclusive end index (slice end) of JSON object starting at jsonStart */
function findBalancedJsonEnd(line, jsonStart) {
  if (line[jsonStart] !== "{") return -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = jsonStart; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') {
        inStr = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * @param {string} line one INSERT value line (trimmed or not)
 * @returns {{ jsonStart: number, jsonEnd: number, jsonStr: string } | null}
 */
function extractRawPickJsonSegment(line) {
  const patterns = [/,[01],0\.00,'/g, /,[01],0,'/g];
  let last = null;
  for (const re of patterns) {
    let m;
    while ((m = re.exec(line)) !== null) last = m;
  }
  if (!last) return null;
  const jsonStart = last.index + last[0].length;
  if (line[jsonStart] !== "{") return null;
  const jsonEnd = findBalancedJsonEnd(line, jsonStart);
  if (jsonEnd === -1) return null;
  return { jsonStart, jsonEnd, jsonStr: line.slice(jsonStart, jsonEnd) };
}

function slimRawPickObject(obj) {
  const nfl = obj.nflTeam ?? obj.proTeam;
  const slim = {};
  if (obj.source !== undefined) slim.source = obj.source;
  if (obj.teamName !== undefined) slim.teamName = obj.teamName;
  if (nfl !== undefined) slim.nflTeam = nfl;
  if (obj.ownerName !== undefined) slim.ownerName = obj.ownerName;
  return slim;
}

function slimInsertValueLine(line) {
  const trimRight = line.trimEnd();
  const trimmed = trimRight.trimStart();
  const okEnd =
    trimmed.endsWith("),") ||
    trimmed.endsWith(");") ||
    trimmed.endsWith("')") ||
    trimmed.endsWith("');");
  if (!trimmed.startsWith("('") || !okEnd) {
    return line;
  }
  const seg = extractRawPickJsonSegment(line);
  if (!seg) return line;
  let obj;
  try {
    obj = JSON.parse(seg.jsonStr);
  } catch {
    return line;
  }
  const newJson = JSON.stringify(slimRawPickObject(obj));
  return line.slice(0, seg.jsonStart) + newJson + line.slice(seg.jsonEnd);
}

export function slimRawPickJsonInSqlString(body) {
  let s = body.replace(/,NOW\(\)\)/g, ")");
  s = s.replace(/,0,0,'\{"source":"verified_manual"/g, `,0,0.00,'{"source":"verified_manual"`);
  return s
    .split(/\r?\n/)
    .map((line) => slimInsertValueLine(line))
    .join("\n");
}
