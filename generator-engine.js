const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const mean = values => values.length
  ? values.reduce((total, value) => total + value, 0) / values.length
  : 0;

function hitChance(attacker, defender) {
  const target = attacker.ap ? Math.min(defender.defense, 3) : defender.defense;
  return (7 - target) / 6;
}

function evasionModifier(attacker, defender) {
  return attacker.shooting && defender.speed >= 3 ? -2 : 0;
}

function expectedDamage(attacker, defender, attackerDice) {
  const finalPool = Math.max(0, attackerDice + evasionModifier(attacker, defender));
  const averageFirstStrikePool = finalPool + 0.5;
  return averageFirstStrikePool * hitChance(attacker, defender) * 1.2;
}

function matchupEstimate(a, b, bonusA, bonusB) {
  const diceA = Math.max(0, a.strike + bonusA);
  const diceB = Math.max(0, b.strike + bonusB);
  const damageA = Math.max(.001, expectedDamage(a, b, diceA));
  const damageB = Math.max(.001, expectedDamage(b, a, diceB));
  const roundsToKillA = b.hp / damageA;
  const roundsToKillB = a.hp / damageB;
  const advantage = Math.log(Math.max(.001, roundsToKillB) / Math.max(.001, roundsToKillA));
  const shareA = 100 / (1 + Math.exp(-advantage * 2.15));
  const power = -4;
  const engagementRounds = Math.pow(
    (Math.pow(roundsToKillA, power) + Math.pow(roundsToKillB, power)) / 2,
    1 / power
  );
  return { shareA, engagementRounds: clamp(engagementRounds, .5, 20) };
}

export function generatorShareMatrix(roster) {
  const matrix = Array.from({ length: roster.length }, () => new Float64Array(roster.length));
  for (let first = 0; first < roster.length; first += 1) {
    matrix[first][first] = 50;
    for (let second = first + 1; second < roster.length; second += 1) {
      const share = matchupEstimate(roster[first], roster[second], 0, 0).shareA;
      matrix[first][second] = share;
      matrix[second][first] = 100 - share;
    }
  }
  return matrix;
}

function unitAverages(matrix) {
  return matrix.map((row, index) => {
    const opponents = [...row].filter((_, opponent) => opponent !== index);
    return mean(opponents);
  });
}

function ranks(values) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const result = new Array(values.length);
  sorted.forEach((entry, rank) => { result[entry.index] = rank + 1; });
  return result;
}

function specializationMetrics(matrix, averages) {
  const unitTotal = matrix.length;
  if (unitTotal < 4) return { roleSeparation: 0, profileRange: 0 };
  const nearest = new Array(unitTotal).fill(Infinity);
  for (let first = 0; first < unitTotal; first += 1) {
    for (let second = first + 1; second < unitTotal; second += 1) {
      let squaredDifference = 0;
      let comparisons = 0;
      for (let opponent = 0; opponent < unitTotal; opponent += 1) {
        if (opponent === first || opponent === second) continue;
        const firstCentred = matrix[first][opponent] - averages[first];
        const secondCentred = matrix[second][opponent] - averages[second];
        squaredDifference += (firstCentred - secondCentred) ** 2;
        comparisons += 1;
      }
      const distance = comparisons ? Math.sqrt(squaredDifference / comparisons) : 0;
      nearest[first] = Math.min(nearest[first], distance);
      nearest[second] = Math.min(nearest[second], distance);
    }
  }
  const ranges = matrix.map((row, index) => {
    const results = [...row].filter((_, opponent) => opponent !== index);
    return results.length ? Math.max(...results) - Math.min(...results) : 0;
  });
  return {
    roleSeparation: mean(nearest.filter(Number.isFinite)),
    profileRange: mean(ranges)
  };
}

function advantageMetrics(roster, matrix, averages) {
  if (roster.length < 2) return { advantageRankGain: 0, advantageWinDelta: 0 };
  const baseRanks = ranks(averages);
  const rankGains = [];
  const winDeltas = [];
  roster.forEach((unit, index) => {
    const boostedResults = roster.map((opponent, opponentIndex) => opponentIndex === index
      ? 50
      : matchupEstimate(unit, opponent, 1, 0).shareA);
    const boostedAverage = mean(boostedResults.filter((_, opponent) => opponent !== index));
    winDeltas.push(boostedAverage - averages[index]);
    if (baseRanks[index] > 1) {
      const comparison = [...averages];
      comparison[index] = boostedAverage;
      rankGains.push(Math.max(0, baseRanks[index] - ranks(comparison)[index]));
    }
  });
  return {
    advantageRankGain: mean(rankGains),
    advantageWinDelta: mean(winDeltas)
  };
}

function engagementLength(roster) {
  const rounds = [];
  roster.forEach(a => roster.forEach(b => {
    rounds.push(matchupEstimate(a, b, 0, 0).engagementRounds);
  }));
  return mean(rounds);
}

function mobilityMetrics(roster, averages) {
  const mobility = roster.map(unit => unit.speed + unit.drill);
  const mobilityMean = mean(mobility);
  const strengthMean = mean(averages);
  let covariance = 0;
  let variance = 0;
  let ordered = 0;
  let comparable = 0;
  mobility.forEach((value, index) => {
    covariance += (value - mobilityMean) * (averages[index] - strengthMean);
    variance += (value - mobilityMean) ** 2;
  });
  for (let first = 0; first < roster.length; first += 1) {
    for (let second = first + 1; second < roster.length; second += 1) {
      if (mobility[first] === mobility[second]) continue;
      comparable += 1;
      const faster = mobility[first] > mobility[second] ? first : second;
      const slower = faster === first ? second : first;
      if (averages[faster] < averages[slower]) ordered += 1;
    }
  }
  return {
    mobilitySlope: variance ? covariance / variance : 0,
    mobilityOrdering: comparable ? ordered / comparable : 0
  };
}

function apMetrics(roster) {
  const apUnits = roster.filter(unit => unit.ap);
  const regularUnits = roster.filter(unit => !unit.ap);
  if (!apUnits.length || !regularUnits.length) return { apDiceGap: null, apComparisons: 0 };
  const gaps = apUnits.map(apUnit => {
    const closest = [...regularUnits].sort((a, b) => {
      const distance = unit => (
        Math.abs(unit.defense - apUnit.defense) * 3
        + Math.abs(unit.speed - apUnit.speed)
        + Math.abs(unit.drill - apUnit.drill)
      );
      return distance(a) - distance(b) || a.strike - b.strike;
    })[0];
    return closest.strike - apUnit.strike;
  });
  return { apDiceGap: mean(gaps), apComparisons: gaps.length };
}

function scoreTowardsTarget(value, target, tolerance) {
  return Math.exp(-.5 * ((value - target) / Math.max(.01, tolerance)) ** 2);
}

export function generatorRosterMetrics(roster, settings, weights) {
  const matrix = generatorShareMatrix(roster);
  const averages = unitAverages(matrix);
  const specialization = specializationMetrics(matrix, averages);
  const advantage = advantageMetrics(roster, matrix, averages);
  const engagementRounds = engagementLength(roster);
  const mobility = mobilityMetrics(roster, averages);
  const ap = apMetrics(roster);

  const components = {
    diversity: .65 * Math.min(1, specialization.roleSeparation / settings.diversityTarget)
      + .35 * Math.min(1, specialization.profileRange / Math.max(1, settings.diversityTarget * 2.5)),
    advantageImpact: .7 * Math.min(1, advantage.advantageRankGain / settings.advantageRankTarget)
      + .3 * Math.min(1, advantage.advantageWinDelta / 6),
    engagementLength: scoreTowardsTarget(
      engagementRounds,
      settings.engagementTarget,
      settings.engagementTolerance
    ),
    mobilityTax: .7 * scoreTowardsTarget(
      mobility.mobilitySlope,
      -settings.mobilityTaxTarget,
      Math.max(.25, settings.mobilityTaxTarget * .65)
    ) + .3 * mobility.mobilityOrdering,
    apTax: ap.apDiceGap === null
      ? .2
      : scoreTowardsTarget(ap.apDiceGap, settings.apDiceGapTarget, .8)
  };

  const priorityWeight = [0, 1, 3, 6];
  let weightedScore = 0;
  let weightTotal = 0;
  Object.entries(components).forEach(([id, component]) => {
    const weight = priorityWeight[clamp(Math.round(weights[id] || 0), 0, 3)];
    weightedScore += component * weight;
    weightTotal += weight;
  });

  return {
    score: 100 * weightedScore / Math.max(1, weightTotal),
    ...specialization,
    ...advantage,
    engagementRounds,
    ...mobility,
    ...ap,
    averages,
    components
  };
}
