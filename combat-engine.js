export const DEFAULT_BATTLEFIELD_SETTINGS = Object.freeze({
  noChargeChance: 0.2,
  flankOpportunityRate: 0.6,
  chargeDistanceBands: Object.freeze([
    Object.freeze({ id: "close", label: "0–2″", minSpeed: 0, bonus: 0, weight: 0.1 }),
    Object.freeze({ id: "short", label: "3–5″", minSpeed: 3, bonus: 1, weight: 0.35 }),
    Object.freeze({ id: "medium", label: "6–8″", minSpeed: 6, bonus: 2, weight: 0.35 }),
    Object.freeze({ id: "long", label: "9″+", minSpeed: 9, bonus: 3, weight: 0.2 })
  ]),
  speedControl: Object.freeze({
    equal: 0.5,
    oneToTwo: 0.6,
    threeToFive: 0.7,
    sixPlus: 0.8
  }),
  drillConversion: Object.freeze({
    equal: 0.5,
    plusOne: 0.65,
    plusTwo: 0.75,
    plusThree: 0.85,
    minusOne: 0.35,
    minusTwo: 0.25,
    minusThree: 0.15
  })
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function finiteChance(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : fallback;
}

function finiteWeight(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export function normaliseBattlefieldSettings(value = {}) {
  const saved = value && typeof value === "object" ? value : {};
  const savedBands = Array.isArray(saved.chargeDistanceBands) ? saved.chargeDistanceBands : [];
  const chargeDistanceBands = DEFAULT_BATTLEFIELD_SETTINGS.chargeDistanceBands.map((band, index) => ({
    ...band,
    weight: finiteWeight(savedBands[index]?.weight, band.weight)
  }));
  return {
    noChargeChance: finiteChance(saved.noChargeChance, DEFAULT_BATTLEFIELD_SETTINGS.noChargeChance),
    flankOpportunityRate: finiteChance(
      saved.flankOpportunityRate,
      DEFAULT_BATTLEFIELD_SETTINGS.flankOpportunityRate
    ),
    chargeDistanceBands,
    speedControl: {
      equal: finiteChance(saved.speedControl?.equal, DEFAULT_BATTLEFIELD_SETTINGS.speedControl.equal),
      oneToTwo: finiteChance(
        saved.speedControl?.oneToTwo,
        DEFAULT_BATTLEFIELD_SETTINGS.speedControl.oneToTwo
      ),
      threeToFive: finiteChance(
        saved.speedControl?.threeToFive,
        DEFAULT_BATTLEFIELD_SETTINGS.speedControl.threeToFive
      ),
      sixPlus: finiteChance(
        saved.speedControl?.sixPlus,
        DEFAULT_BATTLEFIELD_SETTINGS.speedControl.sixPlus
      )
    },
    drillConversion: {
      equal: finiteChance(
        saved.drillConversion?.equal,
        DEFAULT_BATTLEFIELD_SETTINGS.drillConversion.equal
      ),
      plusOne: finiteChance(
        saved.drillConversion?.plusOne,
        DEFAULT_BATTLEFIELD_SETTINGS.drillConversion.plusOne
      ),
      plusTwo: finiteChance(
        saved.drillConversion?.plusTwo,
        DEFAULT_BATTLEFIELD_SETTINGS.drillConversion.plusTwo
      ),
      plusThree: finiteChance(
        saved.drillConversion?.plusThree,
        DEFAULT_BATTLEFIELD_SETTINGS.drillConversion.plusThree
      ),
      minusOne: finiteChance(
        saved.drillConversion?.minusOne,
        DEFAULT_BATTLEFIELD_SETTINGS.drillConversion.minusOne
      ),
      minusTwo: finiteChance(
        saved.drillConversion?.minusTwo,
        DEFAULT_BATTLEFIELD_SETTINGS.drillConversion.minusTwo
      ),
      minusThree: finiteChance(
        saved.drillConversion?.minusThree,
        DEFAULT_BATTLEFIELD_SETTINGS.drillConversion.minusThree
      )
    }
  };
}

export function battlefieldSettingsKey(value) {
  const settings = normaliseBattlefieldSettings(value);
  return JSON.stringify({
    noChargeChance: settings.noChargeChance,
    flankOpportunityRate: settings.flankOpportunityRate,
    weights: settings.chargeDistanceBands.map(band => band.weight),
    speedControl: settings.speedControl,
    drillConversion: settings.drillConversion
  });
}

export function hitChance(attacker, defender) {
  if (attacker.ap) return 4 / 6;
  return (7 - defender.defense) / 6;
}

export function explodingHitDistribution(dice, chance, lethalHits) {
  const pool = Math.max(1, Math.round(Number(dice) || 0));
  const cap = Math.max(1, lethalHits);
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
      if (distribution[currentHits] === 0) continue;
      for (let addedHits = 0; addedHits <= cap; addedHits += 1) {
        const totalHits = Math.min(cap, currentHits + addedHits);
        combined[totalHits] += distribution[currentHits] * singleDie[addedHits];
      }
    }
    distribution = combined;
  }
  return distribution;
}

function expectedAttackTurnsToKill(hitDistribution, hp) {
  const turns = new Float64Array(hp + 1);
  const successfulTurnChance = 1 - hitDistribution[0];
  for (let remainingHp = 1; remainingHp <= hp; remainingHp += 1) {
    let futureTurns = 0;
    for (let hits = 1; hits < hitDistribution.length && hits < remainingHp; hits += 1) {
      futureTurns += hitDistribution[hits] * turns[remainingHp - hits];
    }
    turns[remainingHp] = (1 + futureTurns) / successfulTurnChance;
  }
  return turns[hp];
}

export function effectiveStrikes(a, b, combatModifier = 0) {
  const combatAdjustmentA = Number(combatModifier) || 0;
  const combatAdjustmentB = combatAdjustmentA === 0 ? 0 : -combatAdjustmentA;
  return {
    strikeA: Math.max(1, a.strike + combatAdjustmentA),
    strikeB: Math.max(1, b.strike + combatAdjustmentB),
    adjustmentA: combatAdjustmentA,
    adjustmentB: combatAdjustmentB,
    drillAdjustmentA: 0,
    drillAdjustmentB: 0,
    combatAdjustmentA,
    combatAdjustmentB
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

export function createCombatCore(a, b, combatModifier = 0) {
  const chanceA = hitChance(a, b);
  const chanceB = hitChance(b, a);
  const strikes = effectiveStrikes(a, b, combatModifier);
  const hitsA = explodingHitDistribution(strikes.strikeA, chanceA, b.hp);
  const hitsB = explodingHitDistribution(strikes.strikeB, chanceB, a.hp);
  const makeTable = () => Array.from({ length: a.hp + 1 }, () => new Float64Array(b.hp + 1));
  const aFirst = makeTable();
  const bFirst = makeTable();
  const aVictoryTurnsFromA = makeTable();
  const aVictoryTurnsFromB = makeTable();
  const aVictoryHpFromA = makeTable();
  const aVictoryHpFromB = makeTable();
  const bVictoryTurnsFromA = makeTable();
  const bVictoryTurnsFromB = makeTable();
  const bVictoryHpFromA = makeTable();
  const bVictoryHpFromB = makeTable();
  const battleTurnsFromA = makeTable();
  const battleTurnsFromB = makeTable();
  const aActivationsFromA = makeTable();
  const aActivationsFromB = makeTable();
  const bActivationsFromA = makeTable();
  const bActivationsFromB = makeTable();

  for (let hpA = 1; hpA <= a.hp; hpA += 1) {
    for (let hpB = 1; hpB <= b.hp; hpB += 1) {
      let aPositiveResult = 0;
      let aTurnsAfterAHit = 0;
      let aHpAfterAHit = 0;
      let bTurnsAfterAHit = 0;
      let bHpAfterAHit = 0;
      let battleTurnsAfterAHit = 0;
      let aActivationsAfterAHit = 0;
      let bActivationsAfterAHit = 0;
      for (let hits = 1; hits < hitsA.length; hits += 1) {
        const probability = hitsA[hits];
        if (hits >= hpB) {
          aPositiveResult += probability;
          aHpAfterAHit += probability * hpA;
        } else {
          const remainingB = hpB - hits;
          aPositiveResult += probability * bFirst[hpA][remainingB];
          aTurnsAfterAHit += probability * aVictoryTurnsFromB[hpA][remainingB];
          aHpAfterAHit += probability * aVictoryHpFromB[hpA][remainingB];
          bTurnsAfterAHit += probability * bVictoryTurnsFromB[hpA][remainingB];
          bHpAfterAHit += probability * bVictoryHpFromB[hpA][remainingB];
          battleTurnsAfterAHit += probability * battleTurnsFromB[hpA][remainingB];
          aActivationsAfterAHit += probability * aActivationsFromB[hpA][remainingB];
          bActivationsAfterAHit += probability * bActivationsFromB[hpA][remainingB];
        }
      }

      let bPositiveResult = 0;
      let aTurnsAfterBHit = 0;
      let aHpAfterBHit = 0;
      let bTurnsAfterBHit = 0;
      let bHpAfterBHit = 0;
      let battleTurnsAfterBHit = 0;
      let aActivationsAfterBHit = 0;
      let bActivationsAfterBHit = 0;
      for (let hits = 1; hits < hitsB.length; hits += 1) {
        const probability = hitsB[hits];
        if (hits >= hpA) {
          bHpAfterBHit += probability * hpB;
        } else {
          const remainingA = hpA - hits;
          bPositiveResult += probability * aFirst[remainingA][hpB];
          aTurnsAfterBHit += probability * aVictoryTurnsFromA[remainingA][hpB];
          aHpAfterBHit += probability * aVictoryHpFromA[remainingA][hpB];
          bTurnsAfterBHit += probability * bVictoryTurnsFromA[remainingA][hpB];
          bHpAfterBHit += probability * bVictoryHpFromA[remainingA][hpB];
          battleTurnsAfterBHit += probability * battleTurnsFromA[remainingA][hpB];
          aActivationsAfterBHit += probability * aActivationsFromA[remainingA][hpB];
          bActivationsAfterBHit += probability * bActivationsFromA[remainingA][hpB];
        }
      }

      const denominator = 1 - hitsA[0] * hitsB[0];
      aFirst[hpA][hpB] = (aPositiveResult + hitsA[0] * bPositiveResult) / denominator;
      bFirst[hpA][hpB] = bPositiveResult + hitsB[0] * aFirst[hpA][hpB];

      aVictoryTurnsFromA[hpA][hpB] = (
        hitsA[0] * aTurnsAfterBHit + aTurnsAfterAHit + aFirst[hpA][hpB]
      ) / denominator;
      aVictoryTurnsFromB[hpA][hpB] = hitsB[0] * aVictoryTurnsFromA[hpA][hpB] + aTurnsAfterBHit;
      aVictoryHpFromA[hpA][hpB] = (hitsA[0] * aHpAfterBHit + aHpAfterAHit) / denominator;
      aVictoryHpFromB[hpA][hpB] = hitsB[0] * aVictoryHpFromA[hpA][hpB] + aHpAfterBHit;

      const bWinChanceFromB = 1 - bFirst[hpA][hpB];
      bVictoryTurnsFromA[hpA][hpB] = (
        hitsA[0] * (bTurnsAfterBHit + bWinChanceFromB) + bTurnsAfterAHit
      ) / denominator;
      bVictoryTurnsFromB[hpA][hpB] = hitsB[0] * bVictoryTurnsFromA[hpA][hpB]
        + bTurnsAfterBHit
        + bWinChanceFromB;
      bVictoryHpFromA[hpA][hpB] = (hitsA[0] * bHpAfterBHit + bHpAfterAHit) / denominator;
      bVictoryHpFromB[hpA][hpB] = hitsB[0] * bVictoryHpFromA[hpA][hpB] + bHpAfterBHit;

      battleTurnsFromA[hpA][hpB] = (
        1 + hitsA[0] + hitsA[0] * battleTurnsAfterBHit + battleTurnsAfterAHit
      ) / denominator;
      battleTurnsFromB[hpA][hpB] = 1
        + hitsB[0] * battleTurnsFromA[hpA][hpB]
        + battleTurnsAfterBHit;

      aActivationsFromA[hpA][hpB] = (
        1 + hitsA[0] * aActivationsAfterBHit + aActivationsAfterAHit
      ) / denominator;
      aActivationsFromB[hpA][hpB] = hitsB[0] * aActivationsFromA[hpA][hpB]
        + aActivationsAfterBHit;
      bActivationsFromA[hpA][hpB] = (
        hitsA[0] * (1 + bActivationsAfterBHit) + bActivationsAfterAHit
      ) / denominator;
      bActivationsFromB[hpA][hpB] = 1
        + hitsB[0] * bActivationsFromA[hpA][hpB]
        + bActivationsAfterBHit;
    }
  }

  function stateMetrics(hpA, hpB, nextAttacker) {
    const nextIsA = nextAttacker === "a";
    return {
      chanceA: (nextIsA ? aFirst : bFirst)[hpA][hpB],
      battleTurns: (nextIsA ? battleTurnsFromA : battleTurnsFromB)[hpA][hpB],
      battleRounds: (nextIsA ? aActivationsFromA : bActivationsFromB)[hpA][hpB],
      weightedTurnsA: (nextIsA ? aVictoryTurnsFromA : aVictoryTurnsFromB)[hpA][hpB],
      weightedHpA: (nextIsA ? aVictoryHpFromA : aVictoryHpFromB)[hpA][hpB],
      weightedTurnsB: (nextIsA ? bVictoryTurnsFromA : bVictoryTurnsFromB)[hpA][hpB],
      weightedHpB: (nextIsA ? bVictoryHpFromA : bVictoryHpFromB)[hpA][hpB],
      aActivations: (nextIsA ? aActivationsFromA : aActivationsFromB)[hpA][hpB],
      bActivations: (nextIsA ? bActivationsFromA : bActivationsFromB)[hpA][hpB]
    };
  }

  return {
    a,
    b,
    combatModifier,
    chanceA,
    chanceB,
    strikes,
    hitsA,
    hitsB,
    stateMetrics,
    chanceAWhenFirst: aFirst[a.hp][b.hp],
    chanceAWhenSecond: bFirst[a.hp][b.hp]
  };
}

function neutralMetrics(core) {
  const result = emptyMetrics();
  combineMetrics(result, core.stateMetrics(core.a.hp, core.b.hp, "a"), 0.5);
  combineMetrics(result, core.stateMetrics(core.a.hp, core.b.hp, "b"), 0.5);
  return result;
}

function openingHitDistribution(core, attack, hpA, hpB) {
  const attacker = attack.attacker;
  const basePool = attacker === "a" ? core.strikes.strikeA : core.strikes.strikeB;
  const defenderHp = attacker === "a" ? hpB : hpA;
  const chance = attacker === "a" ? core.chanceA : core.chanceB;
  return explodingHitDistribution(Math.max(1, basePool + (attack.poolModifier || 0)), chance, defenderHp);
}

export function scriptedAttackPool(core, attack) {
  const basePool = attack.attacker === "a" ? core.strikes.strikeA : core.strikes.strikeB;
  return Math.max(1, basePool + (attack.poolModifier || 0));
}

export function resolveScriptedOpening(core, script, continuationNext) {
  const attacks = Array.isArray(script) ? script : [];

  function resolveFrom(index, hpA, hpB) {
    if (index >= attacks.length) return core.stateMetrics(hpA, hpB, continuationNext);
    const attack = attacks[index];
    const distribution = openingHitDistribution(core, attack, hpA, hpB);
    const result = emptyMetrics();

    distribution.forEach((probability, hits) => {
      if (!probability) return;
      const attackerIsA = attack.attacker === "a";
      const lethal = attackerIsA ? hits >= hpB : hits >= hpA;
      let branch;
      if (lethal) {
        branch = emptyMetrics();
        branch.chanceA = attackerIsA ? 1 : 0;
        branch.weightedTurnsA = attackerIsA ? 1 : 0;
        branch.weightedHpA = attackerIsA ? hpA : 0;
        branch.weightedTurnsB = attackerIsA ? 0 : 1;
        branch.weightedHpB = attackerIsA ? 0 : hpB;
        branch.battleTurns = 1;
        branch.battleRounds = 1;
        branch.aActivations = attackerIsA ? 1 : 0;
        branch.bActivations = attackerIsA ? 0 : 1;
      } else {
        const remainingA = attackerIsA ? hpA : hpA - hits;
        const remainingB = attackerIsA ? hpB - hits : hpB;
        const downstream = resolveFrom(index + 1, remainingA, remainingB);
        branch = { ...downstream };
        const chanceB = 1 - downstream.chanceA;
        branch.weightedTurnsA += attackerIsA ? downstream.chanceA : 0;
        branch.weightedTurnsB += attackerIsA ? 0 : chanceB;
        branch.battleTurns += 1;
        branch.aActivations += attackerIsA ? 1 : 0;
        branch.bActivations += attackerIsA ? 0 : 1;
        branch.battleRounds = attackerIsA ? branch.aActivations : branch.bActivations;
      }
      combineMetrics(result, branch, probability);
    });
    return result;
  }

  return resolveFrom(0, core.a.hp, core.b.hp);
}

function finaliseMatchup(core, metrics, extras = {}) {
  const chanceAOverall = clamp(metrics.chanceA, 0, 1);
  const chanceBOverall = 1 - chanceAOverall;
  const shareA = chanceAOverall * 100;
  const { a, b, strikes } = core;
  const victoryTurnsA = chanceAOverall > Number.EPSILON
    ? metrics.weightedTurnsA / chanceAOverall
    : null;
  const victoryHpA = chanceAOverall > Number.EPSILON
    ? clamp(metrics.weightedHpA / chanceAOverall, 1, a.hp)
    : null;
  const victoryTurnsB = chanceBOverall > Number.EPSILON
    ? metrics.weightedTurnsB / chanceBOverall
    : null;
  const victoryHpB = chanceBOverall > Number.EPSILON
    ? clamp(metrics.weightedHpB / chanceBOverall, 1, b.hp)
    : null;
  return {
    a,
    b,
    combatModifier: core.combatModifier,
    effectiveStrikeA: strikes.strikeA,
    effectiveStrikeB: strikes.strikeB,
    strikeAdjustmentA: strikes.adjustmentA,
    strikeAdjustmentB: strikes.adjustmentB,
    drillAdjustmentA: 0,
    drillAdjustmentB: 0,
    combatAdjustmentA: strikes.combatAdjustmentA,
    combatAdjustmentB: strikes.combatAdjustmentB,
    speedAttacker: null,
    hitChanceA: core.chanceA,
    hitChanceB: core.chanceB,
    expectedHitsA: strikes.strikeA * core.chanceA / (1 - 1 / 6),
    expectedHitsB: strikes.strikeB * core.chanceB / (1 - 1 / 6),
    chanceAWhenFirst: core.chanceAWhenFirst,
    chanceAWhenSecond: core.chanceAWhenSecond,
    shareA,
    victoryTurnsA,
    victoryTurnsB,
    victoryHpA,
    victoryHpB,
    battleTurns: metrics.battleTurns,
    battleRounds: metrics.battleRounds,
    soloTurnsA: expectedAttackTurnsToKill(core.hitsA, b.hp),
    soloTurnsB: expectedAttackTurnsToKill(core.hitsB, a.hp),
    winner: shareA > 50.000001 ? "a" : shareA < 49.999999 ? "b" : "even",
    ...extras
  };
}

export function resolveRulesMatchup(a, b, combatModifier = 0) {
  const core = createCombatCore(a, b, combatModifier);
  return finaliseMatchup(core, neutralMetrics(core), { mode: "combat" });
}

export function resolveOpeningEngagement(
  a,
  b,
  combatModifier = 0,
  script = [],
  continuationNext = "a"
) {
  const core = createCombatCore(a, b, combatModifier);
  const metrics = resolveScriptedOpening(core, script, continuationNext);
  return finaliseMatchup(core, metrics, {
    mode: "scripted",
    openingScript: script.map(attack => ({
      ...attack,
      pool: scriptedAttackPool(core, attack)
    })),
    continuationNext
  });
}

export function speedInitiativeShare(a, b, value = DEFAULT_BATTLEFIELD_SETTINGS) {
  const settings = normaliseBattlefieldSettings(value);
  const difference = Math.abs(a.speed - b.speed);
  let fasterShare;
  if (difference === 0) fasterShare = settings.speedControl.equal;
  else if (difference <= 2) fasterShare = settings.speedControl.oneToTwo;
  else if (difference <= 5) fasterShare = settings.speedControl.threeToFive;
  else fasterShare = settings.speedControl.sixPlus;
  if (difference === 0) return { a: 0.5, b: 0.5, faster: null, fasterShare: 0.5 };
  const aIsFaster = a.speed > b.speed;
  return {
    a: aIsFaster ? fasterShare : 1 - fasterShare,
    b: aIsFaster ? 1 - fasterShare : fasterShare,
    faster: aIsFaster ? "a" : "b",
    fasterShare
  };
}

export function drillConversionChance(difference, value = DEFAULT_BATTLEFIELD_SETTINGS) {
  const settings = normaliseBattlefieldSettings(value);
  if (difference >= 3) return settings.drillConversion.plusThree;
  if (difference === 2) return settings.drillConversion.plusTwo;
  if (difference === 1) return settings.drillConversion.plusOne;
  if (difference === 0) return settings.drillConversion.equal;
  if (difference === -1) return settings.drillConversion.minusOne;
  if (difference === -2) return settings.drillConversion.minusTwo;
  return settings.drillConversion.minusThree;
}

export function accessibleChargeBands(unit, value = DEFAULT_BATTLEFIELD_SETTINGS) {
  const settings = normaliseBattlefieldSettings(value);
  const accessible = settings.chargeDistanceBands.filter(band => unit.speed >= band.minSpeed);
  const weightedTotal = accessible.reduce((total, band) => total + band.weight, 0);
  if (weightedTotal > 0) {
    return accessible.map(band => ({ ...band, probability: band.weight / weightedTotal }));
  }
  if (!accessible.length) return [];
  return accessible.map((band, index) => ({ ...band, probability: index === 0 ? 1 : 0 }));
}

function chargeScenarioMetrics(core, charger, band, flank) {
  const defender = charger === "a" ? "b" : "a";
  const openingModifier = band.bonus + (flank ? 1 : 0);
  const script = [{ attacker: charger, poolModifier: openingModifier }];
  if (flank) script.push({ attacker: defender, poolModifier: -1 });
  return resolveScriptedOpening(core, script, flank ? charger : defender);
}

function aggregateOpeningStates(scenarios) {
  const definitions = [
    ["neutral", "Neutral opening"],
    ["a-frontal", "A makes a frontal charge"],
    ["b-frontal", "B makes a frontal charge"],
    ["a-flank", "A makes a flank charge"],
    ["b-flank", "B makes a flank charge"]
  ];
  return definitions.map(([id, label]) => {
    const members = scenarios.filter(scenario => scenario.state === id);
    const probability = members.reduce((total, scenario) => total + scenario.probability, 0);
    const contribution = members.reduce(
      (total, scenario) => total + scenario.probability * scenario.shareA,
      0
    );
    return {
      id,
      label,
      probability,
      shareA: probability > 0 ? contribution / probability : null,
      contribution
    };
  });
}

export function resolveBattlefieldMatchup(a, b, combatModifier = 0, value = DEFAULT_BATTLEFIELD_SETTINGS) {
  const settings = normaliseBattlefieldSettings(value);
  const core = createCombatCore(a, b, combatModifier);
  const scenarios = [];
  const neutral = neutralMetrics(core);
  scenarios.push({
    id: "neutral",
    state: "neutral",
    label: "Neutral opening",
    probability: settings.noChargeChance,
    shareA: neutral.chanceA * 100,
    metrics: neutral,
    charger: null,
    kind: "neutral",
    bonus: 0
  });

  const chargeChance = 1 - settings.noChargeChance;
  const initiative = speedInitiativeShare(a, b, settings);
  ["a", "b"].forEach(charger => {
    const chargerUnit = charger === "a" ? a : b;
    const defenderUnit = charger === "a" ? b : a;
    const initiatorChance = initiative[charger];
    const flankChance = settings.flankOpportunityRate
      * drillConversionChance(chargerUnit.drill - defenderUnit.drill, settings);
    accessibleChargeBands(chargerUnit, settings).forEach(band => {
      [
        { kind: "frontal", probability: 1 - flankChance },
        { kind: "flank", probability: flankChance }
      ].forEach(opening => {
        const probability = chargeChance * initiatorChance * band.probability * opening.probability;
        const metrics = chargeScenarioMetrics(core, charger, band, opening.kind === "flank");
        scenarios.push({
          id: `${charger}-${opening.kind}-${band.id}`,
          state: `${charger}-${opening.kind}`,
          label: `${charger === "a" ? a.name : b.name} ${opening.kind} charge at ${band.label}`,
          probability,
          shareA: metrics.chanceA * 100,
          metrics,
          charger,
          kind: opening.kind,
          distance: band.label,
          bonus: band.bonus,
          flankChance
        });
      });
    });
  });

  const mixed = emptyMetrics();
  scenarios.forEach(scenario => combineMetrics(mixed, scenario.metrics, scenario.probability));
  const probabilityTotal = scenarios.reduce((total, scenario) => total + scenario.probability, 0);
  if (probabilityTotal > 0 && Math.abs(probabilityTotal - 1) > 1e-12) {
    Object.keys(mixed).forEach(key => { mixed[key] /= probabilityTotal; });
    scenarios.forEach(scenario => { scenario.probability /= probabilityTotal; });
  }
  const openingStates = aggregateOpeningStates(scenarios);
  return finaliseMatchup(core, mixed, {
    mode: "battlefield",
    settingsKey: battlefieldSettingsKey(settings),
    scenarioProbabilityTotal: scenarios.reduce((total, scenario) => total + scenario.probability, 0),
    scenarios,
    openingStates,
    initiative
  });
}
