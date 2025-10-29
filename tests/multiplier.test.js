const { test } = require('node:test');
const assert = require('node:assert/strict');

const { calculateCommissionMultiplier, summarizePoints, getMultiplier } = require('../backend/utils/multiplier');

test('calculateCommissionMultiplier returns correct multiplier per activation band', () => {
  assert.deepStrictEqual(calculateCommissionMultiplier(0).multiplier, 0);
  assert.deepStrictEqual(calculateCommissionMultiplier(1).multiplier, 1);
  assert.deepStrictEqual(calculateCommissionMultiplier(4).multiplier, 1);
  assert.deepStrictEqual(calculateCommissionMultiplier(5).multiplier, 1.25);
  assert.deepStrictEqual(calculateCommissionMultiplier(9).multiplier, 1.25);
  assert.deepStrictEqual(calculateCommissionMultiplier(10).multiplier, 1.5);
  assert.deepStrictEqual(calculateCommissionMultiplier(14).multiplier, 1.5);
  assert.deepStrictEqual(calculateCommissionMultiplier(15).multiplier, 1.75);
  assert.deepStrictEqual(calculateCommissionMultiplier(19).multiplier, 1.75);
  assert.deepStrictEqual(calculateCommissionMultiplier(20).multiplier, 2);
  assert.deepStrictEqual(calculateCommissionMultiplier(30).multiplier, 2);
  assert.deepStrictEqual(calculateCommissionMultiplier(40).multiplier, 2);
});

test('summarizePoints applies multiplier over base amount', () => {
  const summary = summarizePoints(100, 12);
  assert.deepStrictEqual(summary.basePoints, 100);
  assert.deepStrictEqual(summary.multiplier, 1.5);
  assert.deepStrictEqual(summary.factor, 1.5);
  assert.deepStrictEqual(summary.activations, 12);
  assert.deepStrictEqual(summary.totalPoints, 150);
});

test('getMultiplier returns expected label per activation band', () => {
  assert.deepStrictEqual(getMultiplier(0), {
    factor: 0,
    label: 'Sem ativações validadas no ciclo',
    band: null,
    activations: 0
  });

  assert.deepStrictEqual(getMultiplier(3).label, '1 a 4 ativações validadas (100%)');
  assert.deepStrictEqual(getMultiplier(8).label, '5 a 9 ativações validadas (125%)');
  assert.deepStrictEqual(getMultiplier(12).label, '10 a 14 ativações validadas (150%)');
  assert.deepStrictEqual(getMultiplier(17).label, '15 a 19 ativações validadas (175%)');
  assert.deepStrictEqual(getMultiplier(25).label, '20 ou mais ativações validadas (200%)');
});
