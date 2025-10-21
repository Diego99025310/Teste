const { test } = require('node:test');
const assert = require('node:assert/strict');

const { calculateCommissionMultiplier, summarizePoints } = require('../src/utils/multiplier');

test('calculateCommissionMultiplier returns correct multiplier per band', () => {
  assert.deepStrictEqual(calculateCommissionMultiplier(0).multiplier, 0);
  assert.deepStrictEqual(calculateCommissionMultiplier(1).multiplier, 1);
  assert.deepStrictEqual(calculateCommissionMultiplier(4).multiplier, 1);
  assert.deepStrictEqual(calculateCommissionMultiplier(5).multiplier, 1.25);
  assert.deepStrictEqual(calculateCommissionMultiplier(10).multiplier, 1.25);
  assert.deepStrictEqual(calculateCommissionMultiplier(11).multiplier, 1.5);
  assert.deepStrictEqual(calculateCommissionMultiplier(15).multiplier, 1.5);
  assert.deepStrictEqual(calculateCommissionMultiplier(16).multiplier, 1.75);
  assert.deepStrictEqual(calculateCommissionMultiplier(20).multiplier, 1.75);
  assert.deepStrictEqual(calculateCommissionMultiplier(21).multiplier, 2);
  assert.deepStrictEqual(calculateCommissionMultiplier(30).multiplier, 2);
  assert.deepStrictEqual(calculateCommissionMultiplier(40).multiplier, 2);
});

test('summarizePoints applies multiplier over base amount', () => {
  const summary = summarizePoints(100, 12);
  assert.deepStrictEqual(summary.basePoints, 100);
  assert.deepStrictEqual(summary.multiplier, 1.5);
  assert.deepStrictEqual(summary.totalPoints, 150);
});
