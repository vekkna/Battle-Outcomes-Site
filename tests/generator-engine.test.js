import test from "node:test";
import assert from "node:assert/strict";

import { generatorRosterMetrics, generatorShareMatrix } from "../generator-engine.js";

const unit = (name, overrides = {}) => ({
  id: name.toLowerCase(),
  name,
  strike: 5,
  defense: 4,
  speed: 0,
  drill: 0,
  shooting: false,
  ap: false,
  hp: 7,
  ...overrides
});

const settings = {
  diversityTarget: 10,
  advantageRankTarget: 1.5,
  engagementTarget: 3.75,
  engagementTolerance: 0.5,
  mobilityTaxTarget: 1,
  apDiceGapTarget: 2
};

const weights = {
  diversity: 3,
  advantageImpact: 3,
  engagementLength: 3,
  mobilityTax: 2,
  apTax: 2
};

test("generator matchup estimates remain complementary", () => {
  const roster = [
    unit("A", { strike: 7, defense: 3 }),
    unit("B", { strike: 3, defense: 6 }),
    unit("C", { strike: 4, ap: true })
  ];
  const matrix = generatorShareMatrix(roster);
  matrix.forEach((row, first) => row.forEach((share, second) => {
    assert.ok(Math.abs(share + matrix[second][first] - 100) < 1e-9);
  }));
});

test("generator reports all five requested balancing measurements", () => {
  const roster = [
    unit("Tank", { strike: 3, defense: 6 }),
    unit("Glass", { strike: 7, defense: 3 }),
    unit("Mobile", { strike: 3, speed: 3, drill: 2 }),
    unit("AP", { strike: 2, speed: 3, drill: 2, ap: true })
  ];
  const metrics = generatorRosterMetrics(roster, settings, weights);
  assert.ok(metrics.roleSeparation > 0);
  assert.ok(metrics.advantageWinDelta > 0);
  assert.ok(metrics.engagementRounds > 0);
  assert.ok(metrics.mobilitySlope < 0);
  assert.equal(metrics.apDiceGap, 1);
  assert.ok(Number.isFinite(metrics.score));
});

test("lower attack pools produce longer estimated engagements", () => {
  const quick = [unit("A", { strike: 7 }), unit("B", { strike: 7 })];
  const slow = [unit("A", { strike: 2 }), unit("B", { strike: 2 })];
  const quickMetrics = generatorRosterMetrics(quick, settings, weights);
  const slowMetrics = generatorRosterMetrics(slow, settings, weights);
  assert.ok(slowMetrics.engagementRounds > quickMetrics.engagementRounds);
});

test("generator estimates include shooting evasion at Mobility 3", () => {
  const shooter = unit("Shooter", { shooting: true });
  const slowTarget = unit("Target", { speed: 2 });
  const evasiveTarget = unit("Target", { speed: 3 });
  const intoSlow = generatorShareMatrix([shooter, slowTarget])[0][1];
  const intoEvasive = generatorShareMatrix([shooter, evasiveTarget])[0][1];
  assert.ok(intoEvasive < intoSlow);
});
