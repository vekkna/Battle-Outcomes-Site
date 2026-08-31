import test from "node:test";
import assert from "node:assert/strict";

import {
  FIRST_STRIKE_BONUS,
  attackTargetNumber,
  effectiveStrikes,
  evasionModifier,
  explodingHitDistribution,
  hitChance,
  resolveRulesMatchup
} from "../combat-engine.js";

const unit = (overrides = {}) => ({
  id: overrides.name?.toLowerCase().replaceAll(" ", "-") || "unit",
  name: "Unit",
  strike: 5,
  drill: 0,
  speed: 0,
  shooting: false,
  ap: false,
  defense: 4,
  hp: 7,
  ...overrides
});

test("normal attacks use Defence as their target number", () => {
  const attacker = unit({ name: "Attacker" });
  for (let defense = 1; defense <= 6; defense += 1) {
    const defender = unit({ name: `DEF ${defense}`, defense });
    assert.equal(attackTargetNumber(attacker, defender), defense);
    assert.equal(hitChance(attacker, defender), (7 - defense) / 6);
  }
});

test("armour-piercing uses the lower of Defence and 3", () => {
  const attacker = unit({ name: "AP", ap: true });
  const expectations = [1, 2, 3, 3, 3, 3];
  expectations.forEach((target, index) => {
    const defender = unit({ name: `DEF ${index + 1}`, defense: index + 1 });
    assert.equal(attackTargetNumber(attacker, defender), target);
    assert.equal(hitChance(attacker, defender), (7 - target) / 6);
  });
});

test("critical hits chain against the same target number", () => {
  const distribution = explodingHitDistribution(1, 4 / 6, 7);
  assert.ok(Math.abs(distribution.reduce((sum, probability) => sum + probability, 0) - 1) < 1e-12);
  const twoOrMore = distribution.slice(2).reduce((sum, probability) => sum + probability, 0);
  assert.ok(Math.abs(twoOrMore - 1 / 9) < 1e-12);
  assert.ok(distribution[3] > 0);
});

test("a final attack pool can be zero", () => {
  const distribution = explodingHitDistribution(0, 0.5, 7);
  assert.equal(distribution[0], 1);
  assert.equal(distribution.slice(1).reduce((sum, probability) => sum + probability, 0), 0);
  assert.equal(effectiveStrikes(unit({ strike: 1 }), unit(), -20).strikeA, 0);
});

test("height adds one die to the higher attacker and removes one from the lower", () => {
  const a = unit({ name: "A" });
  const b = unit({ name: "B" });
  const result = resolveRulesMatchup(a, b, { heightAdvantage: 1 });
  assert.equal(result.heightAdjustmentA, 1);
  assert.equal(result.heightAdjustmentB, -1);
  assert.equal(result.effectiveStrikeA, 6);
  assert.equal(result.effectiveStrikeB, 4);
  assert.ok(result.shareA > 50);
});

test("outflanking applies +2 and -2 exactly once", () => {
  const a = unit({ name: "A" });
  const b = unit({ name: "B" });
  const result = resolveRulesMatchup(a, b, { outflanker: "a" });
  assert.equal(result.outflankAdjustmentA, 2);
  assert.equal(result.outflankAdjustmentB, -2);
  assert.equal(result.effectiveStrikeA, 7);
  assert.equal(result.effectiveStrikeB, 3);
  assert.ok(result.shareA > 50);
});

test("height and outflanking stack in the final attack pool", () => {
  const result = resolveRulesMatchup(unit({ name: "A" }), unit({ name: "B" }), {
    heightAdvantage: 1,
    outflanker: "a"
  });
  assert.equal(result.modifierAdjustmentA, 3);
  assert.equal(result.modifierAdjustmentB, -3);
  assert.equal(result.effectiveStrikeA, 8);
  assert.equal(result.effectiveStrikeB, 2);
});

test("evasion removes two shooting dice against Mobility 3 or greater", () => {
  const shooter = unit({ name: "Shooter", shooting: true });
  const mobile = unit({ name: "Mobile", speed: 3 });
  const slow = unit({ name: "Slow", speed: 2 });
  assert.equal(evasionModifier(shooter, mobile), -2);
  assert.equal(evasionModifier(shooter, slow), 0);
  assert.equal(evasionModifier(unit({ name: "Melee" }), mobile), 0);

  const result = resolveRulesMatchup(shooter, mobile);
  assert.equal(result.evasionAdjustmentA, -2);
  assert.equal(result.effectiveStrikeA, 3);
  assert.equal(result.evasionAdjustmentB, 0);
});

test("First Strike adds one die only to the first activation", () => {
  const a = unit({ name: "A", strike: 5, defense: 4 });
  const b = unit({ name: "B", strike: 5, defense: 4 });
  const result = resolveRulesMatchup(a, b);
  assert.equal(FIRST_STRIKE_BONUS, 1);
  assert.equal(result.firstStrikeBonus, 1);
  assert.ok(result.chanceAWhenFirst > 0.5);
  assert.ok(result.chanceAWhenSecond < 0.5);
  assert.ok(Math.abs(result.chanceAWhenFirst + result.chanceAWhenSecond - 1) < 1e-12);
  assert.ok(Math.abs(
    result.expectedChargeHitsA - (result.effectiveStrikeA + 1) * result.hitChanceA * 1.2
  ) < 1e-12);
  assert.ok(Math.abs(result.shareA - 50) < 1e-9);
});

test("retired optional-rule flags cannot change the fixed combat rules", () => {
  const a = unit({ name: "A", strike: 6 });
  const b = unit({ name: "B", defense: 5 });
  const current = resolveRulesMatchup(a, b);
  const legacyOptions = resolveRulesMatchup(a, b, {
    explodingSixes: false,
    criticalFail: true,
    ruleSet: "disruption"
  });
  assert.equal(legacyOptions.explodingSixes, true);
  assert.equal(legacyOptions.criticalHits, true);
  assert.equal(legacyOptions.shareA, current.shareA);
});

test("swapping units produces complementary neutral results", () => {
  const a = unit({ name: "A", strike: 6, shooting: true, speed: 4, defense: 3 });
  const b = unit({ name: "B", strike: 4, speed: 3, defense: 5, ap: true });
  const forward = resolveRulesMatchup(a, b).shareA;
  const reverse = resolveRulesMatchup(b, a).shareA;
  assert.ok(Math.abs(forward + reverse - 100) < 1e-9);
});

test("mirrored positional situations remain complementary", () => {
  const a = unit({ name: "A", strike: 6, defense: 3 });
  const b = unit({ name: "B", strike: 4, defense: 5 });
  const forward = resolveRulesMatchup(a, b, {
    heightAdvantage: 1,
    outflanker: "a"
  });
  const reverse = resolveRulesMatchup(b, a, {
    heightAdvantage: -1,
    outflanker: "b"
  });
  assert.ok(Math.abs(forward.shareA + reverse.shareA - 100) < 1e-9);
});

test("all supported situations return finite probabilities within 0–100", () => {
  const roster = [
    unit({ name: "Guard", strike: 2, defense: 6 }),
    unit({ name: "Skirmishers", strike: 3, shooting: true, speed: 3, defense: 3 }),
    unit({ name: "Piercers", strike: 4, ap: true, defense: 4 })
  ];
  const situations = [
    {},
    { heightAdvantage: 1 },
    { heightAdvantage: -1 },
    { outflanker: "a" },
    { outflanker: "b" },
    { heightAdvantage: 1, outflanker: "a" }
  ];
  roster.forEach(a => roster.forEach(b => situations.forEach(options => {
    const result = resolveRulesMatchup(a, b, options);
    assert.ok(Number.isFinite(result.shareA));
    assert.ok(result.shareA >= 0 && result.shareA <= 100);
    assert.ok(Number.isFinite(result.battleRounds));
  })));
});
