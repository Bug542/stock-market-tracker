const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchHistory, QuoteError } = require("../quote");
const { createApp } = require("../server");

test("historical prices skip null closes, deduplicate dates and sort", async () => {
  const payload = {chart:{result:[{
    meta:{currency:"USD"},
    timestamp:[1728000000,1727913600,1728000000,1728086400],
    indicators:{quote:[{close:[11,10,12,null]}]}
  }]}};
  const fetchImpl = async () => ({ok:true,status:200,json:async()=>payload});
  const history=await fetchHistory("AAPL",{fetchImpl,range:"1mo"});
  assert.equal(history.symbol,"AAPL");
  assert.equal(history.prices.length,2);
  assert.ok(history.prices[0].date < history.prices[1].date);
  assert.equal(history.prices[1].close,12);
});
test("invalid range rejected before provider request", async () => {
  await assert.rejects(fetchHistory("GME",{range:"5y"}), err=>err instanceof QuoteError && err.status===400);
});
test("provider errors report an appropriate status", async () => {
  await assert.rejects(fetchHistory("GME",{fetchImpl:async()=>({ok:false,status:503})}),
    err=>err instanceof QuoteError && err.status===502);
});
test("history endpoint rejects bad input and returns injected history", async () => {
  const app=createApp({getHistory:async (symbol,{range})=>({symbol,range,prices:[{date:"2026-10-01",close:10},{date:"2026-10-02",close:11}]})});
  const server=app.listen(0);
  try {
    const root="http://127.0.0.1:"+server.address().port;
    const invalid=await fetch(root+"/api/history?symbol=AAPL&range=5y");
    assert.equal(invalid.status,400);
    const good=await fetch(root+"/api/history?symbol=gme&range=3mo");
    assert.equal(good.status,200);
    const data=await good.json();
    assert.equal(data.symbol,"GME");
    assert.equal(data.range,"3mo");
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test("historical data includes valid OHLC while retaining closing prices", async () => {
  const payload = {chart:{result:[{
    meta:{currency:"USD"},
    timestamp:[1727913600,1728000000],
    indicators:{quote:[{open:[10,12],high:[13,15],low:[9,11],close:[12,13]}]}
  }]}};
  const fetchImpl = async () => ({ok:true,status:200,json:async()=>payload});
  const history = await fetchHistory("GME", {fetchImpl,range:"3mo"});
  assert.deepEqual(history.prices.map(({open,high,low,close}) => ({open,high,low,close})), [
    {open:10,high:13,low:9,close:12},
    {open:12,high:15,low:11,close:13}
  ]);
});

test("bad or missing OHLC is left out but valid closing prices remain", async () => {
  const payload = {chart:{result:[{
    meta:{currency:"USD"}, timestamp:[1727913600,1728000000],
    indicators:{quote:[{open:[10,null],high:[9,null],low:[8,null],close:[12,13]}]}
  }]}};
  const fetchImpl = async () => ({ok:true,status:200,json:async()=>payload});
  const history = await fetchHistory("AAPL", {fetchImpl});
  assert.deepEqual(history.prices.map(({date,close})=>close), [12,13]);
  assert.equal(Object.hasOwn(history.prices[0], "open"), false);
  assert.equal(Object.hasOwn(history.prices[1], "open"), false);
});


test("history API includes a date-aligned five-day moving average", async () => {
  const prices = [10, 12, 14, 16, 18, 20].map((close, index) => ({
    date: `2026-11-${String(index + 2).padStart(2, "0")}`,
    close
  }));
  const snapshot = structuredClone(prices);
  const app = createApp({
    getHistory: async (symbol, { range }) => ({ symbol, range, currency: "USD", prices })
  });
  const server = app.listen(0);
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const response = await fetch(base + "/api/history?symbol=AAPL&range=1mo");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const data = await response.json();
    assert.equal(data.symbol, "AAPL");
    assert.equal(data.range, "1mo");
    assert.deepEqual(data.movingAverage.map(point => point.date), prices.map(point => point.date));
    assert.deepEqual(data.movingAverage.map(point => point.average), [null, null, null, null, 14, 16]);
    assert.deepEqual(data.prices, snapshot);
    assert.deepEqual(prices, snapshot);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("history API reports no SMA with fewer than five trading prices", async () => {
  const app = createApp({
    getHistory: async () => ({
      symbol: "GME", range: "1mo",
      prices: [{ date: "2026-11-10", close: 5 }, { date: "2026-11-11", close: 6 }]
    })
  });
  const server = app.listen(0);
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const response = await fetch(base + "/api/history?symbol=GME");
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).movingAverage.map(point => point.average), [null, null]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
