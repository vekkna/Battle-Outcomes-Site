import test from "node:test";
import assert from "node:assert/strict";
import { normaliseSituation, pairingSituation, modifierImpact } from "../modifier-engine.js";
import { resolveRulesMatchup } from "../combat-engine.js";

const unit = (id, strike = 4, defense = 4) => ({ id, name: id, strike, defense, hp: 7, ap: false });
const a = unit("A");
const b = unit("B");
const neutral = (a, b) => resolveRulesMatchup(a, b);
const resolver = situations => (a, b) => resolveRulesMatchup(a, b, pairingSituation(a, b, situations));

test("invalid or missing situations default to neutral", () => {
  assert.deepEqual(normaliseSituation(null), { height: 0, flank: 0, order: 0 });
  assert.deepEqual(normaliseSituation({ height: 9, flank: "junk", order: -99 }), { height: 0, flank: 0, order: 0 });
  assert.deepEqual(normaliseSituation({ height: "1", flank: "-1", order: "0" }), { height: 1, flank: -1, order: 0 });
});

test("relative height and flank settings apply once, including opposite selections", () => {
  const options = pairingSituation(a, b, { A: { height: 1, flank: 1 }, B: { height: -1, flank: -1 } });
  assert.equal(options.heightAdvantage, 1);
  assert.equal(options.outflanker, "a");
  const result = resolveRulesMatchup(a, b, options);
  assert.equal(result.modifierAdjustmentA, 3);
  assert.equal(result.modifierAdjustmentB, -3);
  assert.equal(result.effectiveStrikeA, 7);
  assert.equal(result.effectiveStrikeB, 1);
});

test("matching settings cancel instead of awarding two mutually exclusive advantages", () => {
  for (const direction of [-1, 0, 1]) {
    const setting = { height: direction, flank: direction, order: direction };
    const options = pairingSituation(a, b, { A: setting, B: setting });
    assert.equal(options.heightAdvantage, 0);
    assert.equal(options.outflanker, null);
    assert.equal(options.firstProbabilityA, .5);
    assert.equal(resolveRulesMatchup(a, b, options).shareA, neutral(a, b).shareA);
  }
});

test("activation priority gives one unit first activation each round", () => {
  assert.equal(pairingSituation(a, b, { A: { order: 1 } }).firstProbabilityA, 1);
  assert.equal(pairingSituation(a, b, { A: { order: -1 } }).firstProbabilityA, 0);
  assert.equal(pairingSituation(a, b, { B: { order: 1 } }).firstProbabilityA, 0);
  assert.equal(pairingSituation(a, b, { A: { order: 0 }, B: { order: -1 } }).firstProbabilityA, 1);
});

test("all combinations preserve complementary outcomes when pair orientation reverses", () => {
  const stronger = unit("A", 6, 3);
  const weaker = unit("B", 3, 5);
  for (const height of [-1, 0, 1]) for (const flank of [-1, 0, 1]) for (const order of [-1, 0, 1]) {
    const situations = { A: { height, flank, order } };
    const forward = resolver(situations)(stronger, weaker);
    const reverse = resolver(situations)(weaker, stronger);
    assert.ok(Math.abs(forward.shareA + reverse.shareA - 100) < 1e-8);
    assert.ok(Math.abs(forward.battleRounds - reverse.battleRounds) < 1e-8);
  }
});

test("a neutral configuration changes neither ranks, odds nor duration", () => {
  const roster = [a, unit("B", 6, 5), unit("C", 2, 3)];
  const impact = modifierImpact(roster, neutral, resolver({}));
  assert.equal(impact.affected, 0);
  assert.equal(impact.meanAbsoluteDelta, 0);
  assert.equal(impact.meanRoundsDelta, 0);
  assert.equal(impact.reversals, 0);
  assert.ok(impact.entries.every(entry => entry.rankDelta === 0 && entry.winDelta === 0));
});

test("opponents are re-ranked and their odds change when a unit gains a modifier", () => {
  const roster = [a, b, unit("C")];
  const original = JSON.stringify(roster);
  const impact = modifierImpact(roster, neutral, resolver({ A: { flank: 1 } }));
  assert.equal(impact.entries[0].unit.id, "A");
  assert.ok(impact.entries.find(entry => entry.unit.id === "A").winDelta > 0);
  assert.ok(impact.entries.filter(entry => entry.unit.id !== "A").every(entry => entry.winDelta < 0 && entry.rank === 2));
  assert.equal(impact.pairs.length, 3);
  assert.equal(impact.affected, 2);
  assert.equal(impact.reversals, 0);
  assert.equal(impact.tiesBroken, 2);
  assert.ok(impact.meanAbsoluteDelta > 0);
  assert.equal(JSON.stringify(roster), original);
});

test("favourite reversals are counted once per distinct pairing", () => {
  const roster = [unit("A", 3), unit("B", 5)];
  const impact = modifierImpact(roster, neutral, resolver({ A: { height: 1, flank: 1 } }));
  assert.equal(impact.pairs.length, 1);
  assert.equal(impact.reversals, 1);
  assert.equal(impact.tiesBroken, 0);
  assert.equal(impact.entries[0].unit.id, "A");
  assert.equal(impact.entries[0].rankDelta, 1);
  assert.ok(impact.pairs[0].before.shareA < 30);
  assert.ok(impact.pairs[0].after.shareA > 60);
});
