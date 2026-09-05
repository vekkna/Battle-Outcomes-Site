import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODIFIERS, normaliseModifiers } from '../combat-rules.js';
import { resolveRulesMatchup } from '../combat-engine.js';

const unit = (id, overrides = {}) => ({ id, name: id, strike: 4, defense: 4, hp: 7, ap: false, ...overrides });

test('modifier defaults match Rules.docx and explicit zero is preserved', () => {
  assert.deepEqual(normaliseModifiers(null), { height: 1, outflanking: 2, initiative: 1 });
  assert.deepEqual(normaliseModifiers({ height: 0, outflanking: '1', initiative: 0 }), { height: 0, outflanking: 1, initiative: 0 });
  assert.deepEqual(DEFAULT_MODIFIERS, { height: 1, outflanking: 2, initiative: 1 });
});

test('modifier input is finite, integer and bounded without mutating the source', () => {
  const values = { height: -1, outflanking: 1000, initiative: 2.6 };
  assert.deepEqual(normaliseModifiers(values), { height: 0, outflanking: 99, initiative: 3 });
  assert.equal(values.initiative, 2.6);
  assert.deepEqual(normaliseModifiers({ height: '', outflanking: 'invalid', initiative: Infinity }), DEFAULT_MODIFIERS);
});

test('outflanking ±1 has the same dice effect as default height ±1', () => {
  const a = unit('A'), b = unit('B', { strike: 6, defense: 5 });
  const reducedFlank = resolveRulesMatchup(a, b, { outflanker: 'a', modifiers: { outflanking: 1 } });
  const height = resolveRulesMatchup(a, b, { heightAdvantage: 1 });
  const usualFlank = resolveRulesMatchup(a, b, { outflanker: 'a' });
  assert.equal(reducedFlank.outflankAdjustmentA, 1);
  assert.equal(reducedFlank.outflankAdjustmentB, -1);
  assert.equal(reducedFlank.shareA, height.shareA);
  assert.equal(reducedFlank.battleRounds, height.battleRounds);
  assert.ok(usualFlank.shareA > reducedFlank.shareA);
});

test('custom magnitudes stack and Initiative applies before the final-pool minimum', () => {
  const result = resolveRulesMatchup(unit('A'), unit('B'), {
    heightAdvantage: 1, outflanker: 'a', modifiers: { height: 2, outflanking: 1, initiative: 3 }
  });
  assert.equal(result.effectiveStrikeA, 7);
  assert.equal(result.effectiveStrikeB, 1);
  assert.equal(result.initiativePoolA, 10);
  assert.equal(result.initiativePoolB, 4);
  assert.equal(result.firstStrikeBonus, 3);
  const clamped = resolveRulesMatchup(unit('A', { strike: 1 }), unit('B'), {
    outflanker: 'b', modifiers: { outflanking: 4, initiative: 2 }
  });
  assert.equal(clamped.effectiveStrikeA, 1);
  assert.equal(clamped.initiativePoolA, 1);
});

test('zero positional magnitudes remove their effect even when the situation is selected', () => {
  const a = unit('A'), b = unit('B', { defense: 5 });
  const result = resolveRulesMatchup(a, b, {
    heightAdvantage: 1, outflanker: 'a', modifiers: { height: 0, outflanking: 0 }
  });
  assert.equal(result.shareA, resolveRulesMatchup(a, b).shareA);
  assert.equal(result.heightAdjustmentA, 0);
  assert.equal(result.outflankAdjustmentA, 0);
});

test('disabling Initiative preserves first-activation timing advantage', () => {
  const a = unit('A'), b = unit('B');
  const result = resolveRulesMatchup(a, b, { modifiers: { initiative: 0 }, firstProbabilityA: 1, durationRounds: 12 });
  assert.equal(result.initiativePoolA, result.effectiveStrikeA);
  assert.equal(result.expectedChargeHitsA, result.expectedHitsA);
  assert.equal(result.firstStrikeBonus, 0);
  assert.ok(result.shareA > 50);
  assert.ok(Math.abs(result.duration.probabilities.reduce((sum, probability) => sum + probability, result.duration.tail) - 1) < 1e-9);
});

test('custom modifier probabilities remain complementary in mirrored situations', () => {
  const a = unit('A', { strike: 2, defense: 6 }), b = unit('B', { strike: 5 });
  const modifiers = { height: 2, outflanking: 1, initiative: 0 };
  const forward = resolveRulesMatchup(a, b, { heightAdvantage: 1, outflanker: 'a', modifiers, firstProbabilityA: 1 });
  const reverse = resolveRulesMatchup(b, a, { heightAdvantage: -1, outflanker: 'b', modifiers, firstProbabilityA: 0 });
  assert.ok(Math.abs(forward.shareA + reverse.shareA - 100) < 1e-8);
  assert.ok(Math.abs(forward.battleRounds - reverse.battleRounds) < 1e-8);
});
