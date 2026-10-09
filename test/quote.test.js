const assert = require("node:assert/strict");
const test = require("node:test");
const { fetchQuote, QuoteError } = require("../quote");

function chartPayload(overrides = {}) {
  return {
    chart: {
      result: [{
        meta: {
          symbol: "AAPL",
          shortName: "Apple Inc.",
          currency: "USD",
          regularMarketPrice: 150,
          regularMarketTime: 1700000000,
          regularMarketVolume: 1234567,
          chartPreviousClose: 120,
          fullExchangeName: "NasdaqGS",
          ...overrides,
        },
      }],
      error: null,
    },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchPayload(payload, status = 200) {
  return async () => jsonResponse(payload, status);
}

async function rejectsWithStatus(action, status) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof QuoteError);
    assert.equal(error.status, status);
    assert.equal(typeof error.message, "string");
    assert.ok(error.message.length > 0);
    return true;
  });
}

test("fetchQuote maps market metadata and calculates change from the previous close", async () => {
  const result = await fetchQuote("AAPL", {
    fetchImpl: fetchPayload(chartPayload()),
  });

  assert.deepEqual(result, {
    symbol: "AAPL",
    name: "Apple Inc.",
    currency: "USD",
    price: 150,
    change: 30,
    changePercent: 25,
    volume: 1234567,
    asOf: "2023-11-14T22:13:20.000Z",
    exchange: "NasdaqGS",
    source: "Yahoo Finance",
  });
});

test("fetchQuote uses the fixed HTTPS provider endpoint and supplies a timeout signal", async () => {
  let request;
  await fetchQuote("^GSPC", {
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return jsonResponse(chartPayload({ symbol: "^GSPC" }));
    },
  });

  assert.equal(request.url.origin, "https://query1.finance.yahoo.com");
  assert.equal(request.url.pathname, "/v8/finance/chart/%5EGSPC");
  assert.equal(request.url.searchParams.get("interval"), "1d");
  assert.equal(request.url.searchParams.get("range"), "1d");
  assert.equal(new Headers(request.options.headers).get("accept"), "application/json");
  assert.ok(request.options.signal instanceof AbortSignal);
});

test("fetchQuote preserves Yahoo pence currencies and normalizes the returned symbol", async () => {
  const result = await fetchQuote("VOD.L", {
    fetchImpl: fetchPayload(chartPayload({ symbol: "vod.l", currency: "GBp" })),
  });

  assert.equal(result.symbol, "VOD.L");
  assert.equal(result.currency, "GBp");
});

test("fetchQuote falls back to long name, exchange name, and previousClose", async () => {
  const result = await fetchQuote("AAPL", {
    fetchImpl: fetchPayload(chartPayload({
      shortName: null,
      longName: "Apple Incorporated",
      fullExchangeName: null,
      exchangeName: "NMS",
      chartPreviousClose: null,
      previousClose: 200,
    })),
  });

  assert.equal(result.name, "Apple Incorporated");
  assert.equal(result.exchange, "NMS");
  assert.equal(result.change, -50);
  assert.equal(result.changePercent, -25);
});

test("fetchQuote preserves valid zero prices and volumes without inventing a percentage", async () => {
  const result = await fetchQuote("AAPL", {
    fetchImpl: fetchPayload(chartPayload({
      regularMarketPrice: 0,
      regularMarketVolume: 0,
      chartPreviousClose: 0,
    })),
  });

  assert.equal(result.price, 0);
  assert.equal(result.volume, 0);
  assert.equal(result.change, 0);
  assert.equal(result.changePercent, null);
});

test("fetchQuote reports unknown optional market data as null", async () => {
  const result = await fetchQuote("AAPL", {
    fetchImpl: fetchPayload(chartPayload({
      shortName: null,
      regularMarketTime: null,
      regularMarketVolume: null,
      chartPreviousClose: null,
      fullExchangeName: null,
    })),
  });

  assert.equal(result.name, null);
  assert.equal(result.volume, null);
  assert.equal(result.asOf, null);
  assert.equal(result.exchange, null);
  assert.equal(result.change, null);
  assert.equal(result.changePercent, null);
});

test("fetchQuote rejects invalid optional volume and timestamps without rejecting the quote", async () => {
  const result = await fetchQuote("AAPL", {
    fetchImpl: fetchPayload(chartPayload({
      regularMarketVolume: -1,
      regularMarketTime: 1e30,
    })),
  });

  assert.equal(result.volume, null);
  assert.equal(result.asOf, null);
  assert.equal(result.price, 150);
});

test("fetchQuote rejects missing or invalid core market fields", async (t) => {
  for (const [description, metadata] of [
    ["missing price", { regularMarketPrice: null }],
    ["negative price", { regularMarketPrice: -1 }],
    ["string price", { regularMarketPrice: "150" }],
    ["missing symbol", { symbol: null }],
    ["empty symbol", { symbol: "" }],
    ["missing currency", { currency: null }],
    ["empty currency", { currency: "" }],
  ]) {
    await t.test(description, async () => {
      await rejectsWithStatus(() => fetchQuote("AAPL", {
        fetchImpl: fetchPayload(chartPayload(metadata)),
      }), 502);
    });
  }
});

test("fetchQuote identifies an unknown ticker from either HTTP or provider errors", async (t) => {
  await t.test("HTTP 404", async () => {
    await rejectsWithStatus(() => fetchQuote("MISSING", {
      fetchImpl: fetchPayload({}, 404),
    }), 404);
  });

  await t.test("chart error", async () => {
    await rejectsWithStatus(() => fetchQuote("MISSING", {
      fetchImpl: fetchPayload({
        chart: { result: null, error: { code: "Not Found", description: "No data found" } },
      }),
    }), 404);
  });
});

test("fetchQuote translates rate limits and provider failures to gateway errors", async (t) => {
  for (const status of [401, 429, 500, 503]) {
    await t.test(`HTTP ${status}`, async () => {
      await rejectsWithStatus(() => fetchQuote("AAPL", {
        fetchImpl: fetchPayload({}, status),
      }), 502);
    });
  }
});

test("fetchQuote translates malformed provider responses to gateway errors", async (t) => {
  for (const [description, payload] of [
    ["null payload", null],
    ["missing chart", {}],
    ["empty results", { chart: { result: [], error: null } }],
    ["missing metadata", { chart: { result: [{}], error: null } }],
    ["provider error", { chart: { result: null, error: { code: "Internal Error" } } }],
  ]) {
    await t.test(description, async () => {
      await rejectsWithStatus(() => fetchQuote("AAPL", {
        fetchImpl: fetchPayload(payload),
      }), 502);
    });
  }

  await t.test("invalid JSON", async () => {
    await rejectsWithStatus(() => fetchQuote("AAPL", {
      fetchImpl: async () => new Response("{broken", { status: 200 }),
    }), 502);
  });
});

test("fetchQuote translates network errors and timeout errors", async (t) => {
  await t.test("network failure", async () => {
    await rejectsWithStatus(() => fetchQuote("AAPL", {
      fetchImpl: async () => { throw new TypeError("fetch failed"); },
    }), 502);
  });

  await t.test("timeout", async () => {
    await rejectsWithStatus(() => fetchQuote("AAPL", {
      fetchImpl: async () => { throw new DOMException("Operation timed out", "TimeoutError"); },
    }), 504);
  });
});
