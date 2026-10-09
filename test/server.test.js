const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createApp } = require("../server");
const { QuoteError } = require("../quote");

const quote = {
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
};

async function startServer(t, getQuote) {
  const server = createApp({ getQuote }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("quote API normalizes a ticker and returns an uncached JSON quote", async (t) => {
  const calls = [];
  const baseUrl = await startServer(t, async (symbol) => {
    calls.push(symbol);
    return quote;
  });

  const response = await fetch(`${baseUrl}/api/quote?symbol=%20aapl%20`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await response.json(), quote);
  assert.deepEqual(calls, ["AAPL"]);
});

test("quote API accepts supported punctuation in ticker symbols", async (t) => {
  const calls = [];
  const baseUrl = await startServer(t, async (symbol) => {
    calls.push(symbol);
    return { ...quote, symbol };
  });

  for (const symbol of ["BRK-B", "VOD.L", "^GSPC", "ES=F", "BTC-USD"]) {
    const response = await fetch(`${baseUrl}/api/quote?symbol=${encodeURIComponent(symbol)}`);
    assert.equal(response.status, 200, symbol);
    assert.equal((await response.json()).symbol, symbol);
  }
  assert.deepEqual(calls, ["BRK-B", "VOD.L", "^GSPC", "ES=F", "BTC-USD"]);
});

test("quote API rejects malformed or repeated symbols before calling the provider", async (t) => {
  const calls = [];
  const baseUrl = await startServer(t, async (symbol) => {
    calls.push(symbol);
    return quote;
  });

  for (const query of [
    "",
    "symbol=",
    "symbol=%20%20",
    "symbol=A%20APL",
    "symbol=https%3A%2F%2Fexample.com",
    "symbol=..%2Fsecret",
    "symbol=-AAPL",
    "symbol=AAAAAAAAAAAAAAAAAAAAA",
    "symbol=AAPL&symbol=MSFT",
    "symbol%5Bnested%5D=AAPL",
  ]) {
    const response = await fetch(`${baseUrl}/api/quote?${query}`);
    assert.equal(response.status, 400, query);
    const body = await response.json();
    assert.equal(typeof body.error, "string", query);
    assert.ok(body.error.length > 0, query);
  }
  assert.deepEqual(calls, []);
});

test("quote API preserves safe provider error statuses and messages", async (t) => {
  for (const status of [404, 502, 504]) {
    await t.test(`status ${status}`, async (t) => {
      const baseUrl = await startServer(t, async () => {
        throw new QuoteError(status, "Quote temporarily unavailable");
      });

      const response = await fetch(`${baseUrl}/api/quote?symbol=AAPL`);
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: "Quote temporarily unavailable" });
    });
  }
});

test("quote API hides unexpected implementation details behind a gateway error", async (t) => {
  const privateMessage = "internal authentication token: secret-value";
  const baseUrl = await startServer(t, async () => {
    throw new Error(privateMessage);
  });

  const response = await fetch(`${baseUrl}/api/quote?symbol=AAPL`);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
  assert.ok(!JSON.stringify(body).includes(privateMessage));
});

test("the application still serves its page and assets and returns 404 for unknown paths", async (t) => {
  const baseUrl = await startServer(t, async () => quote);
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /stock/i);

  const script = await fetch(`${baseUrl}/script.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.ok((await script.text()).length > 0);

  const missing = await fetch(`${baseUrl}/this-path-does-not-exist`);
  assert.equal(missing.status, 404);
});
