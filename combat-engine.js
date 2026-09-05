import { DEFAULT_MODIFIERS, normaliseModifiers } from "./combat-rules.js";

export const INITIATIVE_BONUS = DEFAULT_MODIFIERS.initiative;
// Compatibility with saved integrations using the former name.
export const FIRST_STRIKE_BONUS = INITIATIVE_BONUS;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function attackTargetNumber(attacker, defender) {
  const defense = clamp(Math.round(Number(defender.defense) || 1), 1, 6);
  return attacker.ap ? Math.min(defense, 3) : defense;
}

export function hitChance(attacker, defender) {
  return (7 - attackTargetNumber(attacker, defender)) / 6;
}

/**
 * Exact strain distribution for an attack pool. The last bucket groups all
 * results that meet or exceed lethalHits, which makes the infinite Critical
 * Hit chain finite without changing any combat branch.
 */
export function explodingHitDistribution(dice, chance, lethalHits) {
  const pool = Math.max(0, Math.round(Number(dice) || 0));
  const cap = Math.max(1, Math.round(Number(lethalHits) || 1));
  const explodeChance = 1 / 6;
  const missChance = 1 - chance;
  const nonExplodingHitChance = chance - explodeChance;
  const singleDie = new Float64Array(cap + 1);
  singleDie[0] = missChance;

  let representedChance = missChance;
  for (let hits = 1; hits < cap; hits += 1) {
    singleDie[hits] = explodeChance ** (hits - 1)
      * (nonExplodingHitChance + explodeChance * missChance);
    representedChance += singleDie[hits];
  }
  singleDie[cap] = Math.max(0, 1 - representedChance);

  let distribution = new Float64Array(cap + 1);
  distribution[0] = 1;
  for (let die = 0; die < pool; die += 1) {
    const combined = new Float64Array(cap + 1);
    for (let currentHits = 0; currentHits <= cap; currentHits += 1) {
      if (!distribution[currentHits]) continue;
      for (let addedHits = 0; addedHits <= cap; addedHits += 1) {
        const totalHits = Math.min(cap, currentHits + addedHits);
        combined[totalHits] += distribution[currentHits] * singleDie[addedHits];
      }
    }
    distribution = combined;
  }
  return distribution;
}

export function effectiveStrikes(a, b, combatModifier = 0) {
  const adjustmentA = Math.round(Number(combatModifier) || 0);
  const adjustmentB = -adjustmentA;
  return {
    strikeA: Math.max(1, a.strike + adjustmentA),
    strikeB: Math.max(1, b.strike + adjustmentB),
    adjustmentA,
    adjustmentB
  };
}

function emptyMetrics() {
  return {
    chanceA: 0,
    battleTurns: 0,
    battleRounds: 0,
    weightedTurnsA: 0,
    weightedHpA: 0,
    weightedTurnsB: 0,
    weightedHpB: 0,
    aActivations: 0,
    bActivations: 0
  };
}

function combineMetrics(target, source, probability) {
  Object.keys(target).forEach(key => {
    target[key] += source[key] * probability;
  });
}

function terminalMetrics(winner, hpA, hpB, current) {
  const result = emptyMetrics();
  const aWins = winner === "a";
  result.chanceA = aWins ? 1 : 0;
  result.weightedTurnsA = aWins ? current.aActivations : 0;
  result.weightedHpA = aWins ? hpA : 0;
  result.weightedTurnsB = aWins ? 0 : current.bActivations;
  result.weightedHpB = aWins ? 0 : hpB;
  result.battleTurns = current.battleTurns;
  result.battleRounds = 1;
  result.aActivations = current.aActivations;
  result.bActivations = current.bActivations;
  return result;
}

function prependRound(downstream, current) {
  const result = { ...downstream };
  const chanceB = 1 - downstream.chanceA;
  result.weightedTurnsA += current.aActivations * downstream.chanceA;
  result.weightedTurnsB += current.bActivations * chanceB;
  result.battleTurns += current.battleTurns;
  result.battleRounds += 1;
  result.aActivations += current.aActivations;
  result.bActivations += current.bActivations;
  return result;
}

function expectedAttackTurnsToDefeat(distribution, hp) {
  const turns = new Float64Array(hp + 1);
  const successfulAttackChance = 1 - distribution[0];
  if (successfulAttackChance <= Number.EPSILON) return Infinity;
  for (let remaining = 1; remaining <= hp; remaining += 1) {
    let futureTurns = 0;
    for (let hits = 1; hits < distribution.length && hits < remaining; hits += 1) {
      futureTurns += distribution[hits] * turns[remaining - hits];
    }
    turns[remaining] = (1 + futureTurns) / successfulAttackChance;
  }
  return turns[hp];
}

function finaliseMatchup(a, b, metrics, poolA, poolB, extras) {
  const chanceAOverall = clamp(metrics.chanceA, 0, 1);
  const chanceBOverall = 1 - chanceAOverall;
  const chanceA = hitChance(a, b);
  const chanceB = hitChance(b, a);
  const hitsA = explodingHitDistribution(poolA, chanceA, b.hp);
  const hitsB = explodingHitDistribution(poolB, chanceB, a.hp);
  const criticalHitMultiplier = 1 / (1 - 1 / 6);
  const shareA = chanceAOverall * 100;
  return {
    a,
    b,
    mode: "combat",
    effectiveStrikeA: poolA,
    effectiveStrikeB: poolB,
    strikeAdjustmentA: poolA - a.strike,
    strikeAdjustmentB: poolB - b.strike,
    hitChanceA: chanceA,
    hitChanceB: chanceB,
    explodingSixes: true,
    criticalHits: true,
    expectedHitsA: poolA * chanceA * criticalHitMultiplier,
    expectedHitsB: poolB * chanceB * criticalHitMultiplier,
    expectedChargeHitsA: extras.initiativePoolA * chanceA * criticalHitMultiplier,
    expectedChargeHitsB: extras.initiativePoolB * chanceB * criticalHitMultiplier,
    shareA,
    victoryTurnsA: chanceAOverall > Number.EPSILON
      ? metrics.weightedTurnsA / chanceAOverall
      : null,
    victoryTurnsB: chanceBOverall > Number.EPSILON
      ? metrics.weightedTurnsB / chanceBOverall
      : null,
    victoryHpA: chanceAOverall > Number.EPSILON
      ? clamp(metrics.weightedHpA / chanceAOverall, 1, a.hp)
      : null,
    victoryHpB: chanceBOverall > Number.EPSILON
      ? clamp(metrics.weightedHpB / chanceBOverall, 1, b.hp)
      : null,
    battleTurns: metrics.battleTurns,
    battleRounds: metrics.battleRounds,
    aActivations: metrics.aActivations,
    bActivations: metrics.bActivations,
    soloTurnsA: expectedAttackTurnsToDefeat(hitsA, b.hp),
    soloTurnsB: expectedAttackTurnsToDefeat(hitsB, a.hp),
    winner: shareA > 50.000001 ? "a" : shareA < 49.999999 ? "b" : "even",
    ...extras
  };
}

/**
 * Resolve a pairwise engagement. The first unit to activate each round gets
 * Initiative. This engine models striking only; legacy shooting flags are
 * ignored. By default either
 * unit is equally likely to activate first each round. This activation policy
 * is a benchmark assumption, not a rule about Master Tactician bidding.
 */
export function resolveRulesMatchup(a, b, options = {}) {
  const modifiers = normaliseModifiers(options.modifiers);
  const heightAdvantage = clamp(Math.round(Number(options.heightAdvantage) || 0), -1, 1);
  const outflanker = options.outflanker === "a" || options.outflanker === "b"
    ? options.outflanker
    : null;
  const heightAdjustmentA = heightAdvantage * modifiers.height;
  const heightAdjustmentB = -heightAdjustmentA;
  const outflankAdjustmentA = outflanker === "a" ? modifiers.outflanking : outflanker === "b" ? -modifiers.outflanking : 0;
  const outflankAdjustmentB = -outflankAdjustmentA;
  const evasionAdjustmentA = 0;
  const evasionAdjustmentB = 0;
  const modifierAdjustmentA = heightAdjustmentA + outflankAdjustmentA + evasionAdjustmentA;
  const modifierAdjustmentB = heightAdjustmentB + outflankAdjustmentB + evasionAdjustmentB;
  const rawPoolA = a.strike + modifierAdjustmentA;
  const rawPoolB = b.strike + modifierAdjustmentB;
  const poolA = Math.max(1, rawPoolA);
  const poolB = Math.max(1, rawPoolB);
  // Apply the minimum only AFTER every modifier, including Initiative.
  const initiativePoolA = Math.max(1, rawPoolA + modifiers.initiative);
  const initiativePoolB = Math.max(1, rawPoolB + modifiers.initiative);
  const firstProbabilityA = Number.isFinite(options.firstProbabilityA)
    ? clamp(options.firstProbabilityA, 0, 1) : 0.5;
  const chanceA = hitChance(a, b);
  const chanceB = hitChance(b, a);
  const distributionCache = new Map();
  const attackBranchCache = new Map();
  const roundBranchCache = new Map();
  const roundCache = new Map();

  function hitDistribution(attacker, pool, defenderHp) {
    const key = `${attacker}:${pool}:${defenderHp}`;
    if (!distributionCache.has(key)) {
      distributionCache.set(
        key,
        explodingHitDistribution(pool, attacker === "a" ? chanceA : chanceB, defenderHp)
      );
    }
    return distributionCache.get(key);
  }

  function attackBranches(attacker, pool, hpA, hpB) {
    const cacheKey = `${attacker}:${pool}:${hpA}:${hpB}`;
    const cached = attackBranchCache.get(cacheKey);
    if (cached) return cached;
    const attackerIsA = attacker === "a";
    const defenderHp = attackerIsA ? hpB : hpA;
    const branchMap = new Map();
    const addBranch = branch => {
      const key = `${branch.winner || "-"}:${branch.hpA}:${branch.hpB}`;
      const existing = branchMap.get(key);
      if (existing) existing.probability += branch.probability;
      else branchMap.set(key, branch);
    };

    hitDistribution(attacker, pool, defenderHp).forEach((probability, hits) => {
      if (!probability) return;
      addBranch({
        winner: hits >= defenderHp ? attacker : null,
        hpA: attackerIsA ? hpA : hpA - hits,
        hpB: attackerIsA ? hpB - hits : hpB,
        probability
      });
    });
    const branches = [...branchMap.values()];
    attackBranchCache.set(cacheKey, branches);
    return branches;
  }

  function roundBranches(first, hpA, hpB) {
    const cacheKey = `${first}:${hpA}:${hpB}`;
    const cached = roundBranchCache.get(cacheKey);
    if (cached) return cached;
    const firstIsA = first === "a";
    const second = firstIsA ? "b" : "a";
    const firstPool = firstIsA ? initiativePoolA : initiativePoolB;
    const secondPool = firstIsA ? poolB : poolA;
    const firstOnly = {
      aActivations: firstIsA ? 1 : 0,
      bActivations: firstIsA ? 0 : 1,
      battleTurns: 1
    };
    const fullRound = { aActivations: 1, bActivations: 1, battleTurns: 2 };
    const branchMap = new Map();
    const addBranch = branch => {
      const current = branch.current;
      const key = [
        branch.winner || "-",
        branch.hpA,
        branch.hpB,
        current.aActivations,
        current.bActivations,
        current.battleTurns
      ].join(":");
      const existing = branchMap.get(key);
      if (existing) existing.probability += branch.probability;
      else branchMap.set(key, branch);
    };

    attackBranches(first, firstPool, hpA, hpB).forEach(firstBranch => {
      if (firstBranch.winner) {
        addBranch({ ...firstBranch, current: firstOnly });
        return;
      }
      attackBranches(second, secondPool, firstBranch.hpA, firstBranch.hpB)
        .forEach(secondBranch => addBranch({
          ...secondBranch,
          current: fullRound,
          probability: firstBranch.probability * secondBranch.probability
        }));
    });
    const branches = [...branchMap.values()];
    roundBranchCache.set(cacheKey, branches);
    return branches;
  }

  function roundMetrics(hpA, hpB) {
    const key = `${hpA}:${hpB}`;
    const cached = roundCache.get(key);
    if (cached) return cached;
    const aggregate = emptyMetrics();
    let selfLoopProbability = 0;

    ["a", "b"].forEach(first => {
      roundBranches(first, hpA, hpB).forEach(branch => {
        const probability = (first === "a" ? firstProbabilityA : 1 - firstProbabilityA) * branch.probability;
        if (branch.winner) {
          combineMetrics(
            aggregate,
            terminalMetrics(branch.winner, branch.hpA, branch.hpB, branch.current),
            probability
          );
        } else if (branch.hpA === hpA && branch.hpB === hpB) {
          selfLoopProbability += probability;
        } else {
          combineMetrics(
            aggregate,
            prependRound(roundMetrics(branch.hpA, branch.hpB), branch.current),
            probability
          );
        }
      });
    });

    const exitProbability = 1 - selfLoopProbability;
    const result = emptyMetrics();
    result.chanceA = aggregate.chanceA / exitProbability;
    result.weightedHpA = aggregate.weightedHpA / exitProbability;
    result.weightedHpB = aggregate.weightedHpB / exitProbability;
    result.battleTurns = (aggregate.battleTurns + selfLoopProbability * 2) / exitProbability;
    result.battleRounds = (aggregate.battleRounds + selfLoopProbability) / exitProbability;
    result.aActivations = (aggregate.aActivations + selfLoopProbability) / exitProbability;
    result.bActivations = (aggregate.bActivations + selfLoopProbability) / exitProbability;
    result.weightedTurnsA = (
      aggregate.weightedTurnsA + selfLoopProbability * result.chanceA
    ) / exitProbability;
    result.weightedTurnsB = (
      aggregate.weightedTurnsB + selfLoopProbability * (1 - result.chanceA)
    ) / exitProbability;
    roundCache.set(key, result);
    return result;
  }

  function openingMetrics(first) {
    const result = emptyMetrics();
    roundBranches(first, a.hp, b.hp).forEach(branch => {
      const metrics = branch.winner
        ? terminalMetrics(branch.winner, branch.hpA, branch.hpB, branch.current)
        : prependRound(roundMetrics(branch.hpA, branch.hpB), branch.current);
      combineMetrics(result, metrics, branch.probability);
    });
    return result;
  }

  const regular = roundMetrics(a.hp, b.hp);
  const aFirst = openingMetrics("a");
  const bFirst = openingMetrics("b");
  const overall = emptyMetrics();
  combineMetrics(overall, aFirst, firstProbabilityA);
  combineMetrics(overall, bFirst, 1 - firstProbabilityA);

  // Exact finite-horizon distribution, with the remaining probability kept as
  // an explicit tail. Only requested for the inspected pair, not every cell.
  const duration = options.durationRounds ? (() => {
    const horizon = clamp(Math.round(options.durationRounds), 1, 100);
    let states = new Map([[`${a.hp}:${b.hp}`, { hpA: a.hp, hpB: b.hp, probability: 1 }]]);
    const probabilities = [];
    for (let round = 1; round <= horizon; round += 1) {
      const next = new Map();
      let ended = 0;
      states.forEach(state => {
        ["a", "b"].forEach(first => {
          const orderProbability = first === "a" ? firstProbabilityA : 1 - firstProbabilityA;
          roundBranches(first, state.hpA, state.hpB).forEach(branch => {
            const probability = state.probability * orderProbability * branch.probability;
            if (branch.winner) ended += probability;
            else {
              const key = `${branch.hpA}:${branch.hpB}`;
              const entry = next.get(key) || { hpA: branch.hpA, hpB: branch.hpB, probability: 0 };
              entry.probability += probability;
              next.set(key, entry);
            }
          });
        });
      });
      probabilities.push(ended);
      states = next;
    }
    const tail = [...states.values()].reduce((sum, state) => sum + state.probability, 0);
    const quantile = target => {
      let cumulative = 0;
      const index = probabilities.findIndex(probability => {
        cumulative += probability;
        return cumulative >= target - 1e-12;
      });
      return index < 0 ? null : index + 1;
    };
    return { probabilities, tail, horizon, median: quantile(.5), p90: quantile(.9) };
  })() : null;

  return finaliseMatchup(a, b, overall, poolA, poolB, {
    modifierAdjustmentA,
    modifierAdjustmentB,
    initiativePoolA,
    initiativePoolB,
    firstProbabilityA,
    duration,
    heightAdvantage,
    heightAdjustmentA,
    heightAdjustmentB,
    outflanker,
    outflankAdjustmentA,
    outflankAdjustmentB,
    evasionAdjustmentA,
    evasionAdjustmentB,
    scenarioId: String(options.scenarioId || "neutral"),
    modifiers,
    firstStrikeBonus: modifiers.initiative,
    chargeBonus: 0,
    chargeProbabilityA: firstProbabilityA,
    chargeProbabilityB: 1 - firstProbabilityA,
    chanceAWhenFirst: aFirst.chanceA,
    chanceAWhenSecond: bFirst.chanceA,
    chanceAWhenACharges: aFirst.chanceA,
    chanceAWhenBCharges: bFirst.chanceA,
    regularRoundChanceA: regular.chanceA,
    chargeScenarios: [
      {
        id: "a-charges",
        charger: "a",
        probability: firstProbabilityA,
        shareA: aFirst.chanceA * 100,
        battleRounds: aFirst.battleRounds
      },
      {
        id: "b-charges",
        charger: "b",
        probability: 1 - firstProbabilityA,
        shareA: bFirst.chanceA * 100,
        battleRounds: bFirst.battleRounds
      }
    ]
  });
}
