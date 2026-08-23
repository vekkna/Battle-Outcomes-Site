import test from "node:test";
import assert from "node:assert/strict";

import {
  COMBAT_CHARGE_BONUS,
  DEFAULT_BATTLEFIELD_SETTINGS,
  accessibleChargeBands,
  attackOutcomeDistribution,
  createCombatCore,
  drillConversionChance,
  effectiveStrikes,
  explodingHitDistribution,
  hitChance,
  normaliseBattlefieldSettings,
  resolveBattlefieldMatchup,
  resolveOpeningEngagement,
  resolveRulesMatchup,
  scriptedAttackPool,
  speedInitiativeShare
} from "../combat-engine.js";

const unit = (overrides = {}) => ({
  id: overrides.name?.toLowerCase().replaceAll(" ", "-") || "unit",
  name: "Unit",
  strike: 5,
  drill: 0,
  speed: 0,
  ap: false,
  defense: 4,
  hp: 7,
  ...overrides
});

const sourceRoster = [
  unit({ name: "Light Infantry", strike: 6, defense: 5 }),
  unit({ name: "Spearmen", strike: 5, defense: 5 }),
  unit({ name: "Heavy Infantry", strike: 4, defense: 3 }),
  unit({ name: "Fanatics", strike: 7, defense: 4 }),
  unit({ name: "Halberds", strike: 3, ap: true, defense: 3 }),
  unit({ name: "Heavy Cavalry", strike: 3, defense: 6 }),
  unit({ name: "Infantry", strike: 4, defense: 5 }),
  unit({ name: "Cavalry", strike: 3, defense: 5 }),
  unit({ name: "Light Cavalry", strike: 3, defense: 4 }),
  unit({ name: "Lancers", strike: 2, ap: true, defense: 4 })
];

test("source Fanatics charge-and-disruption outcomes remain deterministic", () => {
  const fanatics = sourceRoster.find(item => item.name === "Fanatics");
  const expected = {
    "Heavy Infantry": 91.17,
    Infantry: 64.27,
    Spearmen: 48.16,
    "Heavy Cavalry": 37.71,
    Lancers: 96.46,
    Cavalry: 81.61,
    Halberds: 92.01,
    "Light Infantry": 35.54,
    "Light Cavalry": 93.47
  };
  Object.entries(expected).forEach(([name, expectedShare]) => {
    const opponent = sourceRoster.find(item => item.name === name);
    assert.ok(
      Math.abs(resolveRulesMatchup(fanatics, opponent).shareA - expectedShare) < 0.01,
      name
    );
  });
});

test("swapping units produces complementary combat and battlefield results", () => {
  const a = unit({ name: "A", strike: 6, speed: 5, drill: 2 });
  const b = unit({ name: "B", strike: 4, defense: 5, speed: 4, drill: 1 });
  for (const resolver of [resolveRulesMatchup, resolveBattlefieldMatchup]) {
    const forward = resolver(a, b).shareA;
    const reverse = resolver(b, a).shareA;
    assert.ok(Math.abs(forward + reverse - 100) < 1e-9);
  }
});

test("combat outcomes ignore Speed, Drill and legacy positional modifiers", () => {
  const a = unit({ name: "A", strike: 5, defense: 4, speed: 99, drill: 99 });
  const b = unit({ name: "B", strike: 5, defense: 4, speed: 0, drill: 0 });
  assert.ok(Math.abs(resolveRulesMatchup(a, b).shareA - 50) < 1e-9);
  assert.equal(resolveRulesMatchup(a, b, 2).shareA, resolveRulesMatchup(a, b).shareA);
  assert.deepEqual(effectiveStrikes(a, b), {
    strikeA: 5,
    strikeB: 5,
    adjustmentA: 0,
    adjustmentB: 0,
    drillAdjustmentA: 0,
    drillAdjustmentB: 0,
    combatAdjustmentA: 0,
    combatAdjustmentB: 0
  });
});

test("charging adds no dice and both possible chargers are weighted equally", () => {
  const a = unit({ name: "A", strike: 5, defense: 4 });
  const b = unit({ name: "B", strike: 5, defense: 4 });
  const result = resolveRulesMatchup(a, b);
  assert.equal(COMBAT_CHARGE_BONUS, 0);
  assert.equal(result.chargeBonus, 0);
  assert.equal(result.chargeProbabilityA, 0.5);
  assert.equal(result.chargeProbabilityB, 0.5);
  assert.ok(result.chanceAWhenACharges > 0.5);
  assert.ok(result.chanceAWhenBCharges < 0.5);
  assert.ok(Math.abs(result.chanceAWhenACharges + result.chanceAWhenBCharges - 1) < 1e-12);
  assert.ok(Math.abs(result.shareA - 50) < 1e-12);
  assert.ok(Math.abs(result.expectedChargeHitsA - 5 * result.hitChanceA / (1 - 1 / 6)) < 1e-12);
});

test("a one-HP engagement matches the hand-calculated charge recurrence", () => {
  const a = unit({ name: "A", strike: 1, defense: 6, hp: 1 });
  const b = unit({ name: "B", strike: 1, defense: 6, hp: 1 });
  const result = resolveRulesMatchup(a, b);
  assert.ok(Math.abs(result.chanceAWhenACharges - 37 / 72) < 1e-12);
  assert.ok(Math.abs(result.chanceAWhenBCharges - 35 / 72) < 1e-12);
  assert.ok(Math.abs(result.regularRoundChanceA - 0.5) < 1e-12);
});

test("only the second striker receives a same-round disruption penalty", () => {
  const result = resolveRulesMatchup(
    unit({ name: "A", strike: 6, defense: 4, hp: 7 }),
    unit({ name: "B", strike: 6, defense: 4, hp: 7 })
  );
  assert.ok(result.averageDisruptionA > 0);
  assert.ok(result.averageDisruptionB > 0);
  assert.ok(Math.abs(result.averageDisruptionA - result.averageDisruptionB) < 1e-12);
  assert.ok(result.chanceAWhenFirst > 0.5);
  assert.ok(result.chanceAWhenSecond < 0.5);
});

test("an individual +1 attack bonus applies to every strike including the opening", () => {
  const a = unit({ name: "A", strike: 5, defense: 4 });
  const b = unit({ name: "B", strike: 5, defense: 4 });
  const base = resolveRulesMatchup(a, b);
  const advantaged = resolveRulesMatchup(a, b, { attackBonusA: 1 });
  const reversed = resolveRulesMatchup(b, a, { attackBonusB: 1 });

  assert.equal(advantaged.attackBonusA, 1);
  assert.equal(advantaged.attackBonusB, 0);
  assert.equal(advantaged.effectiveStrikeA, 6);
  assert.equal(advantaged.effectiveStrikeB, 5);
  assert.ok(advantaged.shareA > base.shareA);
  assert.ok(Math.abs(advantaged.expectedHitsA - 6 * advantaged.hitChanceA / (1 - 1 / 6)) < 1e-12);
  assert.ok(Math.abs(advantaged.expectedChargeHitsA - 6 * advantaged.hitChanceA / (1 - 1 / 6)) < 1e-12);
  assert.ok(Math.abs(advantaged.shareA + reversed.shareA - 100) < 1e-9);

  const bothAdvantaged = resolveRulesMatchup(a, b, { attackBonusA: 1, attackBonusB: 1 });
  assert.ok(Math.abs(bothAdvantaged.shareA - 50) < 1e-9);
});

test("an individual attack advantage can be increased to +2 dice", () => {
  const a = unit({ name: "A", strike: 5, defense: 4 });
  const b = unit({ name: "B", strike: 5, defense: 4 });
  const plusOne = resolveRulesMatchup(a, b, { attackBonusA: 1 });
  const plusTwo = resolveRulesMatchup(a, b, { attackBonusA: 2 });
  assert.equal(plusTwo.attackBonusA, 2);
  assert.equal(plusTwo.effectiveStrikeA, 7);
  assert.ok(plusTwo.shareA > plusOne.shareA);
});

test("Penalties removes same-round wound disruption", () => {
  const a = unit({ name: "A", strike: 6, defense: 4, hp: 7 });
  const b = unit({ name: "B", strike: 6, defense: 4, hp: 7 });
  const disruption = resolveRulesMatchup(a, b, { ruleSet: "disruption" });
  const penalties = resolveRulesMatchup(a, b, { ruleSet: "penalties" });

  assert.equal(disruption.ruleSet, "disruption");
  assert.equal(disruption.woundDisruption, true);
  assert.ok(disruption.averageDisruptionA > 0);
  assert.ok(disruption.averageDisruptionB > 0);
  assert.equal(penalties.ruleSet, "penalties");
  assert.equal(penalties.woundDisruption, false);
  assert.equal(penalties.averageDisruptionA, 0);
  assert.equal(penalties.averageDisruptionB, 0);
});

test("Penalties turns each modifier die into a reciprocal bonus and penalty", () => {
  const a = unit({ name: "A", strike: 5, defense: 4 });
  const b = unit({ name: "B", strike: 5, defense: 4 });
  const advantaged = resolveRulesMatchup(a, b, {
    ruleSet: "penalties",
    attackBonusA: 2
  });

  assert.equal(advantaged.attackBonusA, 2);
  assert.equal(advantaged.attackBonusB, 0);
  assert.equal(advantaged.modifierAdjustmentA, 2);
  assert.equal(advantaged.modifierAdjustmentB, -2);
  assert.equal(advantaged.effectiveStrikeA, 7);
  assert.equal(advantaged.effectiveStrikeB, 3);
  assert.ok(advantaged.shareA > 50);
  const reversed = resolveRulesMatchup(b, a, {
    ruleSet: "penalties",
    attackBonusB: 2
  });
  assert.ok(Math.abs(advantaged.shareA + reversed.shareA - 100) < 1e-9);

  const offset = resolveRulesMatchup(a, b, {
    ruleSet: "penalties",
    attackBonusA: 4,
    attackBonusB: 4
  });
  assert.equal(offset.effectiveStrikeA, 5);
  assert.equal(offset.effectiveStrikeB, 5);
  assert.ok(Math.abs(offset.shareA - 50) < 1e-9);
});

test("mirror engagements produce complete symmetric results", () => {
  const cavalry = unit({ name: "Cavalry", strike: 7, defense: 4, hp: 7 });
  for (const options of [{}, { attackBonusA: 1, attackBonusB: 1 }]) {
    const mirror = resolveRulesMatchup(cavalry, cavalry, options);
    assert.ok(Math.abs(mirror.shareA - 50) < 1e-9);
    assert.equal(mirror.winner, "even");
    assert.ok(Number.isFinite(mirror.battleRounds));
    assert.ok(mirror.battleRounds > 0);
    assert.ok(Math.abs(mirror.chanceAWhenACharges + mirror.chanceAWhenBCharges - 1) < 1e-12);
    assert.ok(Math.abs(mirror.victoryHpA - mirror.victoryHpB) < 1e-12);
  }
  assert.ok(Math.abs(resolveBattlefieldMatchup(cavalry, cavalry).shareA - 50) < 1e-9);
});

test("a one-point Speed advantage gives 60/40 conditional charge control", () => {
  const control = speedInitiativeShare(
    unit({ name: "A", speed: 5 }),
    unit({ name: "B", speed: 4 })
  );
  assert.equal(control.a, 0.6);
  assert.equal(control.b, 0.4);
});

test("Drill changes flank conversion without changing the base attack pool", () => {
  const a = unit({ name: "A", strike: 4, drill: 2 });
  const b = unit({ name: "B", strike: 4, drill: 0 });
  assert.equal(drillConversionChance(a.drill - b.drill), 0.75);
  assert.equal(drillConversionChance(b.drill - a.drill), 0.25);
  assert.equal(effectiveStrikes(a, b).strikeA, 4);
  assert.equal(effectiveStrikes(a, b).strikeB, 4);
});

test("charge dice affect the scripted opening attack only", () => {
  const a = unit({ name: "A", strike: 4 });
  const b = unit({ name: "B", strike: 4, defense: 5 });
  const charged = resolveOpeningEngagement(a, b, 0, [{ attacker: "a", poolModifier: 2 }], "b");
  assert.equal(charged.openingScript[0].pool, 6);
  assert.equal(charged.effectiveStrikeA, 4);
  assert.notEqual(charged.shareA, resolveRulesMatchup({ ...a, strike: 6 }, b).shareA);
});

test("the defender acts next after a frontal charge if it survives", () => {
  const a = unit({ name: "A", strike: 3 });
  const b = unit({ name: "B", strike: 6 });
  const correct = resolveOpeningEngagement(a, b, 0, [{ attacker: "a", poolModifier: 1 }], "b");
  const incorrectExtraTurn = resolveOpeningEngagement(a, b, 0, [{ attacker: "a", poolModifier: 1 }], "a");
  assert.equal(correct.continuationNext, "b");
  assert.ok(correct.shareA < incorrectExtraTurn.shareA);
});

test("a temporary flank modifies only the opening attack and immediate reply", () => {
  const a = unit({ name: "A", strike: 4 });
  const b = unit({ name: "B", strike: 4 });
  const flank = resolveOpeningEngagement(
    a,
    b,
    0,
    [
      { attacker: "a", poolModifier: 2 },
      { attacker: "b", poolModifier: -1 }
    ],
    "a"
  );
  assert.deepEqual(flank.openingScript.map(attack => attack.pool), [6, 3]);
  assert.equal(flank.effectiveStrikeA, 4);
  assert.equal(flank.effectiveStrikeB, 4);
  assert.notEqual(flank.shareA, resolveRulesMatchup(a, b, 1).shareA);
});

test("all final and temporary attack pools have a minimum of one", () => {
  const a = unit({ name: "A", strike: 1 });
  const b = unit({ name: "B", strike: 1 });
  const strikes = effectiveStrikes(a, b, -20);
  assert.equal(strikes.strikeA, 1);
  const core = createCombatCore(a, b);
  assert.equal(scriptedAttackPool(core, { attacker: "b", poolModifier: -20 }), 1);
});

test("charge-distance exclusions renormalize remaining scenario probabilities", () => {
  const bands = accessibleChargeBands(unit({ name: "A", speed: 4 }));
  assert.deepEqual(bands.map(band => band.id), ["close", "short"]);
  assert.ok(Math.abs(bands.reduce((sum, band) => sum + band.probability, 0) - 1) < 1e-12);
  assert.ok(Math.abs(bands[0].probability - (0.1 / 0.45)) < 1e-12);

  const matchup = resolveBattlefieldMatchup(
    unit({ name: "A", speed: 4 }),
    unit({ name: "B", speed: 1 })
  );
  assert.ok(Math.abs(matchup.scenarioProbabilityTotal - 1) < 1e-12);
  assert.ok(Math.abs(matchup.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0) - 1) < 1e-12);
});

test("AP and chained exploding-six behavior remain exact", () => {
  const attacker = unit({ name: "AP", ap: true });
  const defender = unit({ name: "Defender", defense: 6 });
  assert.equal(hitChance(attacker, defender), 4 / 6);
  const distribution = explodingHitDistribution(1, hitChance(attacker, defender), 7);
  assert.ok(Math.abs(distribution.reduce((sum, probability) => sum + probability, 0) - 1) < 1e-12);
  const twoOrMore = distribution.slice(2).reduce((sum, probability) => sum + probability, 0);
  assert.ok(Math.abs(twoOrMore - 1 / 9) < 1e-12);
});

test("exploding sixes can be disabled without changing the target number", () => {
  const distribution = explodingHitDistribution(2, 0.5, 3, false);
  assert.ok(Math.abs(distribution[0] - 0.25) < 1e-12);
  assert.ok(Math.abs(distribution[1] - 0.5) < 1e-12);
  assert.ok(Math.abs(distribution[2] - 0.25) < 1e-12);
  assert.equal(distribution[3], 0);

  const a = unit({ name: "A", strike: 3, defense: 6 });
  const b = unit({ name: "B", strike: 5, defense: 3 });
  const enabled = resolveRulesMatchup(a, b);
  const disabled = resolveRulesMatchup(a, b, { explodingSixes: false });
  assert.equal(enabled.explodingSixes, true);
  assert.equal(disabled.explodingSixes, false);
  assert.ok(Math.abs(disabled.expectedHitsA - disabled.effectiveStrikeA * disabled.hitChanceA) < 1e-12);
  assert.notEqual(disabled.shareA, enabled.shareA);
});

test("Critical Fail pools one retaliation die for every rolled 1", () => {
  const outcomes = attackOutcomeDistribution(2, 0.5, 7, {
    explodingSixes: false,
    criticalFail: true
  });
  const probability = failures => outcomes
    .filter(outcome => outcome.criticalFails === failures)
    .reduce((sum, outcome) => sum + outcome.probability, 0);
  assert.ok(Math.abs(probability(2) - 1 / 36) < 1e-12);
  assert.ok(Math.abs(probability(1) - 10 / 36) < 1e-12);
  assert.ok(Math.abs(probability(0) - 25 / 36) < 1e-12);
  assert.ok(Math.abs(outcomes.reduce((sum, outcome) => sum + outcome.probability, 0) - 1) < 1e-12);
});

test("Critical Fail changes combat outcomes and preserves mirror symmetry", () => {
  const a = unit({ name: "A", strike: 7, defense: 6 });
  const b = unit({ name: "B", strike: 2, defense: 4, ap: true });
  const disabled = resolveRulesMatchup(a, b, { criticalFail: false });
  const enabled = resolveRulesMatchup(a, b, { criticalFail: true });
  assert.equal(disabled.criticalFail, false);
  assert.equal(enabled.criticalFail, true);
  assert.notEqual(enabled.shareA, disabled.shareA);

  const mirror = resolveRulesMatchup(a, a, { criticalFail: true });
  assert.ok(Math.abs(mirror.shareA - 50) < 1e-9);
});

test("every matchup mode returns a finite probability within 0–100", () => {
  const settings = normaliseBattlefieldSettings(DEFAULT_BATTLEFIELD_SETTINGS);
  for (const a of sourceRoster) {
    for (const b of sourceRoster) {
      if (a === b) continue;
      const combat = resolveRulesMatchup(a, b);
      assert.ok(Number.isFinite(combat.shareA));
      assert.ok(combat.shareA >= 0 && combat.shareA <= 100);
      for (const modifier of [-2, -1, 0, 1, 2]) {
        const battlefield = resolveBattlefieldMatchup(a, b, modifier, settings);
        assert.ok(Number.isFinite(battlefield.shareA));
        assert.ok(battlefield.shareA >= 0 && battlefield.shareA <= 100);
      }
    }
  }
});
