import test from "node:test";
import assert from "node:assert/strict";

import {
  FIRST_STRIKE_BONUS,
  attackTargetNumber,
  effectiveStrikes,
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

test("zero-dice distribution is valid internally but a final attack pool has at least one die", () => {
  const distribution = explodingHitDistribution(0, 0.5, 7);
  assert.equal(distribution[0], 1);
  assert.equal(distribution.slice(1).reduce((sum, probability) => sum + probability, 0), 0);
  assert.equal(effectiveStrikes(unit({ strike: 1 }), unit(), -20).strikeA, 1);
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

test("legacy shooting and mobility fields do not affect strike outcomes", () => {
  const a = unit({ name: "A", strike: 3 });
  const b = unit({ name: "B", defense: 5 });
  const plain = resolveRulesMatchup(a, b);
  const legacy = resolveRulesMatchup({ ...a, shooting: true }, { ...b, speed: 3 });
  assert.equal(legacy.shareA, plain.shareA);
  assert.equal(legacy.battleRounds, plain.battleRounds);
  assert.equal(legacy.evasionAdjustmentA, 0);
});

test("Initiative adds one die only to the first activation", () => {
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

test("all modifiers including Initiative precede the one-die minimum", () => {
  const result = resolveRulesMatchup(unit({ strike: 1 }), unit({ strike: 1 }), {
    heightAdvantage: -1, outflanker: "b"
  });
  assert.equal(result.effectiveStrikeA, 1);
  assert.equal(result.initiativePoolA, 1);
  assert.equal(result.initiativePoolB, 5);
  assert.ok(Number.isFinite(result.battleRounds));
});

test("duration distribution agrees with an independently derived geometric engagement", () => {
  // One strain remaining, Defence 4: two-die first strike misses with p=1/4;
  // the one-die reply misses with p=1/2. A full round survives with p=1/8.
  const result = resolveRulesMatchup(unit({ strike: 1, hp: 1 }), unit({ strike: 1, hp: 1 }), { durationRounds: 8 });
  assert.ok(Math.abs(result.battleRounds - 8 / 7) < 1e-12);
  result.duration.probabilities.forEach((value, index) => {
    assert.ok(Math.abs(value - 7 / 8 * (1 / 8) ** index) < 1e-12);
  });
  assert.ok(Math.abs(result.duration.tail - (1 / 8) ** 8) < 1e-12);
  assert.equal(result.duration.median, 1);
  assert.equal(result.duration.p90, 2);
});

test("long engagement probability is retained in the tail", () => {
  const result = resolveRulesMatchup(unit({ strike: 1, defense: 6 }), unit({ strike: 1, defense: 6 }), { durationRounds: 2 });
  const duration = result.duration;
  assert.ok(duration.tail > .9);
  assert.equal(duration.median, null);
  assert.equal(duration.p90, null);
  assert.ok(Math.abs(duration.probabilities.reduce((sum, p) => sum + p, duration.tail) - 1) < 1e-10);
});

test("activation policy is explicit and symmetric under swapping units", () => {
  const a = unit({ strike: 4, defense: 5 });
  const b = unit({ strike: 7, defense: 3 });
  const first = resolveRulesMatchup(a, b, { firstProbabilityA: 1 });
  const reverse = resolveRulesMatchup(b, a, { firstProbabilityA: 0 });
  assert.ok(Math.abs(first.shareA + reverse.shareA - 100) < 1e-9);
  const second = resolveRulesMatchup(a, b, { firstProbabilityA: 0 });
  assert.ok(first.shareA > second.shareA);
});

test("exact wins and duration agree with independent seeded dice simulation", () => {
  let seed = 6178;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const a = unit({ strike: 2, defense: 5, ap: true });
  const b = unit({ strike: 5, defense: 4 });
  const trials = 30000;
  let wins = 0;
  let rounds = 0;
  const histogram = Array(12).fill(0);
  for (let trial = 0; trial < trials; trial += 1) {
    const strain = [0, 0];
    const fighters = [a, b];
    let round = 0;
    while (strain[0] < 7 && strain[1] < 7) {
      round += 1;
      const first = random() < .5 ? 0 : 1;
      for (const [step, attacker] of [first, 1 - first].entries()) {
        const defender = 1 - attacker;
        const attack = fighters[attacker];
        const target = attack.ap ? Math.min(3, fighters[defender].defense) : fighters[defender].defense;
        // A is lower AND outflanked: -3; B gets +3. Minimum applies last.
        let dice = Math.max(1, attack.strike + (attacker === 0 ? -3 : 3) + (step === 0 ? 1 : 0));
        while (dice-- > 0) {
          const roll = 1 + Math.floor(random() * 6);
          if (roll >= target) strain[defender] += 1;
          if (roll === 6) dice += 1;
        }
        if (strain[defender] >= 7) break;
      }
    }
    wins += strain[1] >= 7 ? 1 : 0;
    rounds += round;
    if (round <= 12) histogram[round - 1] += 1;
  }
  const exact = resolveRulesMatchup(a, b, { heightAdvantage: -1, outflanker: "b", durationRounds: 12 });
  assert.ok(Math.abs(exact.shareA / 100 - wins / trials) < .012);
  assert.ok(Math.abs(exact.battleRounds - rounds / trials) < .03);
  histogram.forEach((count, index) => assert.ok(Math.abs(count / trials - exact.duration.probabilities[index]) < .012));
});
