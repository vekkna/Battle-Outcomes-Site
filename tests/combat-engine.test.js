import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BATTLEFIELD_SETTINGS,
  accessibleChargeBands,
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

test("source Fanatics rules-only outcomes remain deterministic across all three combat scenarios", () => {
  const fanatics = sourceRoster.find(item => item.name === "Fanatics");
  const expected = {
    "Heavy Infantry": [92.35, 98.41, 99.87],
    Infantry: [60.27, 84.73, 97.63],
    Spearmen: [44.65, 68.87, 88.96],
    "Heavy Cavalry": [31.93, 69.09, 97.74],
    Lancers: [97.04, 99.96, 99.98],
    Cavalry: [78.57, 96.31, 99.92],
    Halberds: [93.70, 99.50, 99.99],
    "Light Infantry": [33.02, 53.78, 75.52],
    "Light Cavalry": [93.73, 99.35, 99.99]
  };
  Object.entries(expected).forEach(([name, values]) => {
    const opponent = sourceRoster.find(item => item.name === name);
    [0, 1, 2].forEach((modifier, index) => {
      assert.ok(
        Math.abs(resolveRulesMatchup(fanatics, opponent, modifier).shareA - values[index]) < 0.01,
        `${name}, modifier ${modifier}`
      );
    });
  });
});

test("swapping units produces complementary rules-only and battlefield results", () => {
  const a = unit({ name: "A", strike: 6, speed: 5, drill: 2 });
  const b = unit({ name: "B", strike: 4, defense: 5, speed: 4, drill: 1 });
  for (const resolver of [resolveRulesMatchup, resolveBattlefieldMatchup]) {
    const forward = resolver(a, b).shareA;
    const reverse = resolver(b, a).shareA;
    assert.ok(Math.abs(forward + reverse - 100) < 1e-9);
  }
});

test("rules-only outcomes ignore Speed and Drill", () => {
  const a = unit({ name: "A", strike: 5, defense: 4, speed: 99, drill: 99 });
  const b = unit({ name: "B", strike: 5, defense: 4, speed: 0, drill: 0 });
  assert.ok(Math.abs(resolveRulesMatchup(a, b).shareA - 50) < 1e-9);
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

test("every matchup mode returns a finite probability within 0–100", () => {
  const settings = normaliseBattlefieldSettings(DEFAULT_BATTLEFIELD_SETTINGS);
  for (const a of sourceRoster) {
    for (const b of sourceRoster) {
      if (a === b) continue;
      for (const modifier of [-2, -1, 0, 1, 2]) {
        for (const result of [
          resolveRulesMatchup(a, b, modifier),
          resolveBattlefieldMatchup(a, b, modifier, settings)
        ]) {
          assert.ok(Number.isFinite(result.shareA));
          assert.ok(result.shareA >= 0 && result.shareA <= 100);
        }
      }
    }
  }
});
