"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateSimpleMovingAverage } = require("../moving-average");

const history = values => values.map((close, index) => ({
  date: `2026-11-${String(index + 2).padStart(2, "0")}`,
  close,
}));

test("computes a 3-observation rolling average", () => {
  const output = calculateSimpleMovingAverage(history([10, 12, 14, 16, 18]), 3);
  assert.deepEqual(output.map(point => point.average), [null, null, 12, 14, 16]);
});

test("defaults to a 5-observation average", () => {
  const output = calculateSimpleMovingAverage(history([10, 20, 30, 40, 50]));
  assert.deepEqual(output.map(point => point.average), [null, null, null, null, 30]);
});

test("returns null while there is insufficient price history", () => {
  assert.deepEqual(calculateSimpleMovingAverage(history([10, 20]), 5).map(x => x.average), [null, null]);
});

test("handles invalid closing values by marking affected windows unavailable", () => {
  const output = calculateSimpleMovingAverage(history([10, null, 30, 40, 50, 60]), 3);
  assert.deepEqual(output.map(x => x.average), [null, null, null, null, 40, 50]);
});

test("preserves dates and does not change input data", () => {
  const input = history([1, 2, 3]);
  const snapshot = structuredClone(input);
  const output = calculateSimpleMovingAverage(input, 2);
  assert.equal(output[1].date, input[1].date);
  assert.deepEqual(input, snapshot);
});

test("rejects invalid periods and inputs", () => {
  assert.throws(() => calculateSimpleMovingAverage(history([1]), 0), RangeError);
  assert.throws(() => calculateSimpleMovingAverage(history([1]), 1.5), RangeError);
  assert.throws(() => calculateSimpleMovingAverage({}, 2), TypeError);
});
