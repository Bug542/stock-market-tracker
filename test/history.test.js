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
