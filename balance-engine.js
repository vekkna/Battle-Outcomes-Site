// Metrics use distinct opponents with equal weight. No mirror matches.
export function rankRoster(roster, resolveMatchup) {
  const entries = roster.map(unit => {
    const matchups = roster.filter(other => other.id !== unit.id)
      .map(other => resolveMatchup(unit, other));
    return {
      unit,
      average: matchups.reduce((sum, m) => sum + m.shareA, 0) / matchups.length,
      rounds: matchups.reduce((sum, m) => sum + m.battleRounds, 0) / matchups.length
    };
  }).sort((a, b) => b.average - a.average || a.unit.name.localeCompare(b.unit.name));
  // Ties share a rank; a cosmetic reorder must never create a rank change.
  entries.forEach((entry, index) => {
    entry.rank = index && Math.abs(entry.average - entries[index - 1].average) < 1e-7
      ? entries[index - 1].rank : index + 1;
  });
  return entries;
}

export function compareProfiles(a, b, roster, resolveMatchup) {
  const opponents = roster.filter(unit => unit.id !== a.id && unit.id !== b.id);
  if (!opponents.length) return null;
  const rows = opponents.map(opponent => ({
    opponent, a: resolveMatchup(a, opponent).shareA, b: resolveMatchup(b, opponent).shareA
  }));
  const offset = rows.reduce((sum, row) => sum + row.a - row.b, 0) / rows.length;
  const raw = Math.sqrt(rows.reduce((sum, row) => sum + (row.a - row.b) ** 2, 0) / rows.length);
  const centred = rows.length < 2 ? null
    : Math.sqrt(rows.reduce((sum, row) => sum + (row.a - row.b - offset) ** 2, 0) / rows.length);
  return {
    a, b, rows, raw, centred, offset,
    differentCounters: rows.filter(row => (row.a >= 60 && row.b <= 40) || (row.b >= 60 && row.a <= 40)).length
  };
}

// The editor's card order is authoritative: first is intended strongest.
export function targetInversions(entries, intendedRoster) {
  const byId = new Map(entries.map(entry => [entry.unit.id, entry]));
  const inversions = [];
  intendedRoster.forEach((unit, index) => {
    const stronger = byId.get(unit.id);
    intendedRoster.slice(index + 1).forEach(other => {
      const weaker = byId.get(other.id);
      if (stronger && weaker && stronger.average <= weaker.average + 1e-7) {
        inversions.push({ stronger, weaker });
      }
    });
  });
  return inversions;
}

export function sameRoster(a, b) {
  return a.length === b.length && a.every(unit => b.some(other => other.id === unit.id));
}
