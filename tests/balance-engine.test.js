import test from "node:test";
import assert from "node:assert/strict";
import { rankRoster, compareProfiles, targetInversions, sameRoster } from "../balance-engine.js";

const roster = ["A", "B", "C", "D"].map(id => ({ id, name: id, targetTier: 0 }));
const matrix = [[50, 70, 60, 80], [30, 50, 40, 60], [40, 60, 50, 50], [20, 40, 50, 50]];
const resolve = (a, b) => ({ shareA: matrix["ABCD".indexOf(a.id)]["ABCD".indexOf(b.id)], battleRounds: 3 });

test("rankings exclude self-matches and use equally weighted distinct opponents", () => {
  const entries = rankRoster(roster, (a, b) => { assert.notEqual(a.id, b.id); return resolve(a, b); });
  assert.equal(entries[0].unit.id, "A");
  assert.equal(entries[0].average, 70);
  assert.equal(entries[0].rounds, 3);
});

test("equal scores share rank regardless of roster order", () => {
  const entries = rankRoster([...roster].reverse(), () => ({ shareA: 50, battleRounds: 2 }));
  assert.deepEqual(entries.map(entry => entry.rank), [1, 1, 1, 1]);
});

test("role comparisons separate a pure strength gap from a different matchup pattern", () => {
  const pair = compareProfiles(roster[0], roster[1], roster, resolve);
  assert.equal(pair.raw, 20);
  assert.equal(pair.centred, 0);
  assert.equal(pair.offset, 20);
  assert.deepEqual(pair.rows.map(row => row.opponent.id), ["C", "D"]);
  assert.equal(pair.differentCounters, 1);
});

test("insufficient common opponents never claims a measured role distance", () => {
  assert.equal(compareProfiles(roster[0], roster[1], roster.slice(0, 2), resolve), null);
  assert.equal(compareProfiles(roster[0], roster[1], roster.slice(0, 3), resolve).centred, null);
});

test("card order determines intended rank independently of obsolete tiers", () => {
  const intended = [roster[0], roster[2], roster[1], roster[3]];
  const entries = rankRoster(roster, resolve);
  assert.equal(targetInversions(entries, intended).length, 0);
  const reversed = [...intended].reverse().map(unit => ({ ...unit, targetTier: 5 }));
  assert.equal(targetInversions(entries, reversed).length, 6);
  assert.equal(entries[0].unit.id, "A");
});

test("moving one card updates the relevant intended-order conflicts", () => {
  const entries = rankRoster(roster, resolve);
  const conflicts = targetInversions(entries, [roster[3], roster[0], roster[2], roster[1]]);
  assert.deepEqual(conflicts.map(({ stronger, weaker }) => [stronger.unit.id, weaker.unit.id]), [
    ["D", "A"], ["D", "C"], ["D", "B"]
  ]);
});

test("tied outcomes are flagged against a strict intended card order", () => {
  const entries = rankRoster(roster, () => ({ shareA: 50, battleRounds: 2 }));
  assert.equal(targetInversions(entries, roster).length, 6);
});

test("reference comparisons require the same opponent cohort but tolerate reordering", () => {
  assert.equal(sameRoster(roster, [...roster].reverse()), true);
  assert.equal(sameRoster(roster, roster.slice(1)), false);
  assert.equal(sameRoster(roster, [...roster.slice(1), { id: "E" }]), false);
});
