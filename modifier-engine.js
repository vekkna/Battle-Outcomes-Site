import { rankRoster } from "./balance-engine.js";

const direction = value => [-1, 0, 1].includes(Number(value)) ? Number(value) : 0;
const favourite = share => share > 50 + 1e-7 ? 1 : share < 50 - 1e-7 ? -1 : 0;

export function normaliseSituation(value = {}) {
  return {
    height: direction(value?.height),
    flank: direction(value?.flank),
    order: direction(value?.order)
  };
}

// Situations describe relative conditions, not extra points added to Melee.
// Equal settings cancel; the same advantage is never counted twice.
export function pairingSituation(a, b, situations = {}) {
  const first = normaliseSituation(situations[a.id]);
  const second = normaliseSituation(situations[b.id]);
  const flank = Math.sign(first.flank - second.flank);
  return {
    id: "unit-modifiers",
    heightAdvantage: Math.sign(first.height - second.height),
    outflanker: flank > 0 ? "a" : flank < 0 ? "b" : null,
    firstProbabilityA: first.order > second.order ? 1 : first.order < second.order ? 0 : .5
  };
}

export function modifierImpact(roster, neutralResolver, modifiedResolver) {
  const neutral = rankRoster(roster, neutralResolver);
  const modified = rankRoster(roster, modifiedResolver);
  const byId = new Map(neutral.map(entry => [entry.unit.id, entry]));
  const pairs = [];
  roster.forEach((a, index) => roster.slice(index + 1).forEach(b => {
    const before = neutralResolver(a, b);
    const after = modifiedResolver(a, b);
    pairs.push({
      a, b, before, after,
      delta: after.shareA - before.shareA,
      roundsDelta: after.battleRounds - before.battleRounds,
      reversed: favourite(before.shareA) * favourite(after.shareA) === -1,
      tieBroken: favourite(before.shareA) === 0 && favourite(after.shareA) !== 0
    });
  }));
  const entries = modified.map(entry => {
    const before = byId.get(entry.unit.id);
    const matchups = pairs.filter(pair => pair.a.id === entry.unit.id || pair.b.id === entry.unit.id);
    return {
      ...entry, before,
      rankDelta: before.rank - entry.rank,
      winDelta: entry.average - before.average,
      roundsDelta: entry.rounds - before.rounds,
      reversals: matchups.filter(pair => pair.reversed).length
    };
  });
  return {
    entries, pairs,
    meanAbsoluteDelta: pairs.reduce((sum, pair) => sum + Math.abs(pair.delta), 0) / Math.max(1, pairs.length),
    meanRoundsDelta: pairs.reduce((sum, pair) => sum + pair.roundsDelta, 0) / Math.max(1, pairs.length),
    reversals: pairs.filter(pair => pair.reversed).length,
    tiesBroken: pairs.filter(pair => pair.tieBroken).length,
    affected: pairs.filter(pair => Math.abs(pair.delta) > 1e-7 || Math.abs(pair.roundsDelta) > 1e-7).length
  };
}
