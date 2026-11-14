"use strict";

/**
 * Calculate a simple moving average (SMA) from daily historical stock prices.
 * Each output is aligned with its input date. The first (period - 1) days
 * have no SMA, and any window with missing/invalid prices returns null.
 * Calendar gaps are fine: the period counts trading observations, not days.
 *
 * @param {{ date: string, close: number }[]} prices
 * @param {number} period Number of trading observations (default: 5)
 * @returns {{ date: string, average: number | null }[]}
 */
function calculateSimpleMovingAverage(prices, period = 5) {
  if (!Array.isArray(prices)) {
    throw new TypeError("Prices must be an array.");
  }
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError("Moving-average period must be a positive integer.");
  }

  let windowSum = 0;
  let validInWindow = 0;
  const isValid = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

  return prices.map((point, index) => {
    if (point === null || typeof point !== "object" || typeof point.date !== "string") {
      throw new TypeError("Each price must have a date and a close value.");
    }
    if (index >= period) {
      const previous = prices[index - period].close;
      if (isValid(previous)) {
        windowSum -= previous;
        validInWindow--;
      }
    }
    if (isValid(point.close)) {
      windowSum += point.close;
      validInWindow++;
    }
    return {
      date: point.date,
      average: index >= period - 1 && validInWindow === period ? windowSum / period : null,
    };
  });
}

module.exports = { calculateSimpleMovingAverage };
