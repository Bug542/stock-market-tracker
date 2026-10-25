/**
 *
 *
 * Uses only built-in Node.js APIs. Carefully validates source markers before writing.
 * No dependencies installed, no API keys required.
 */
const fs = require('node:fs');
const path = require('node:path');
const base = process.cwd();
const files = new Map();

function getFile(relative) {
  const full = path.join(base, relative);
  if (!fs.existsSync(full)) throw new Error(`Missing ${relative}. Run from your stock-market-tracker folder.`);
  if (!files.has(relative)) files.set(relative, fs.readFileSync(full, 'utf8'));
  return files.get(relative);
}
function replaceOnce(relative, needle, replacement) {
  const src = getFile(relative);
  const occurrence = typeof needle === 'string'
    ? src.split(needle).length - 1
    : [...src.matchAll(new RegExp(needle.source, needle.flags.includes('g') ? needle.flags : needle.flags + 'g'))].length;
  if (occurrence !== 1) throw new Error(`${relative}: expected one unique edit location; found ${occurrence}. No files have been changed.`);
  files.set(relative, src.replace(needle, replacement));
}

try {
  if (getFile('public/index.html').includes('data-chart-type="candles"')) {
    console.log('Candlestick upgrade already appears to be installed; no changes made.');
    process.exit(0);
  }
  getFile('quote.js');
  getFile('public/script.js');
  getFile('public/style.css');
  getFile('test/history.test.js');

  // 1) Keep existing daily closes, but include valid OPEN/HIGH/LOW alongside each close.
  //    Rows with incomplete OHLC remain available to the line chart.
  replaceOnce('quote.js',
    '    const closes = result?.indicators?.quote?.[0]?.close;\n',
    '    const daily = result?.indicators?.quote?.[0];\n    const closes = daily?.close;\n    const opens = daily?.open;\n    const highs = daily?.high;\n    const lows = daily?.low;\n');
  replaceOnce('quote.js',
`      byDate.set(date.toISOString().slice(0, 10), closes[i]);
    }
    const prices = [...byDate].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, close]) => ({ date, close }));`,
`      const point = { close: closes[i] };
      // A candle is meaningful only when the four prices are finite and consistent.
      const open = opens?.[i], high = highs?.[i], low = lows?.[i];
      if ([open, high, low].every(finiteNumber) && open >= 0 && low >= 0 &&
          high >= Math.max(open, point.close) && low <= Math.min(open, point.close)) {
        Object.assign(point, { open, high, low });
      }
      byDate.set(date.toISOString().slice(0, 10), point);
    }
    const prices = [...byDate].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, point]) => ({ date, ...point }));`);

  // 2) Add clearly labeled view buttons and up-to-date explanatory footnote.
  replaceOnce('public/index.html',
`      <p id="chartStatus" role="status">Search for a stock to display historical prices.</p>`,
`      <div class="chart-controls" aria-label="Chart display type">
        <button type="button" class="chart-type-button active" data-chart-type="line" aria-pressed="true">Line</button>
        <button type="button" class="chart-type-button" data-chart-type="candles" aria-pressed="false">Candlesticks</button>
      </div>
      <p id="chartStatus" role="status">Search for a stock to display historical prices.</p>`);
  replaceOnce('public/index.html',
    '<p class="chart-footnote">Daily closing prices; market data may be delayed.</p>',
    '<p id="chartFootnote" class="chart-footnote">Daily closing prices; market data may be delayed.</p>');

  // 3) Preserve the original line chart and build native SVG candles, with title tooltips.
  const newChart = `function renderChart(prices, symbol, currency) {
  const candles = chartType === "candles";
  const points = candles ? prices.filter(p => [p.open, p.high, p.low, p.close].every(Number.isFinite) &&
    p.low >= 0 && p.high >= Math.max(p.open, p.close) && p.low <= Math.min(p.open, p.close)) : prices;
  if (points.length < (candles ? 1 : 2)) {
    priceChart.replaceChildren();
    chartStatus.textContent = candles
      ? "No complete daily open/high/low/close prices are available. Try Line view."
      : "Not enough data to draw the price chart.";
    return;
  }
  const width = 800, height = 320, padX = 62, padY = 32;
  const values = candles ? points.flatMap(p => [p.low, p.high]) : points.map(p => p.close);
  const low = Math.min(...values), high = Math.max(...values);
  const span = Math.max(high - low, high * 0.01, 0.01);
  const min = Math.max(0, low - span * 0.12), max = high + span * 0.12;
  const x = i => padX + ((i + 0.5) / points.length) * (width - 2 * padX);
  const y = value => padY + (1 - (value - min) / (max - min)) * (height - 2 * padY);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 800 320");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", symbol + (candles ? " daily candlestick chart" : " daily closing price chart") +
    " from " + points[0].date + " to " + points.at(-1).date);
  function element(tag, attributes, label, parent = svg) {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (label !== undefined) node.textContent = label;
    parent.appendChild(node);
    return node;
  }
  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * (i / 4);
    const yy = y(value);
    element("line", { x1: padX, x2: width-padX, y1: yy, y2: yy, stroke: "#334155", "stroke-width": 1 });
    element("text", { x: padX-8, y: yy+4, "text-anchor": "end", fill: "#cbd5e1", "font-size": 12 }, value.toFixed(2));
  }
  if (candles) {
    const candleWidth = Math.max(3, Math.min(18, ((width - 2 * padX) / points.length) * 0.6));
    points.forEach((p, i) => {
      const center = x(i);
      const color = p.close >= p.open ? "#4ade80" : "#f87171";
      const group = element("g", {});
      element("title", {}, p.date + " | Open: " + p.open.toFixed(2) +
        " | High: " + p.high.toFixed(2) + " | Low: " + p.low.toFixed(2) +
        " | Close: " + p.close.toFixed(2) + " " + currency, group);
      element("line", { x1: center, x2: center, y1: y(p.high), y2: y(p.low),
        stroke: color, "stroke-width": 2 }, undefined, group);
      element("rect", { x: center - candleWidth / 2, y: Math.min(y(p.open), y(p.close)),
        width: candleWidth, height: Math.max(1, Math.abs(y(p.open) - y(p.close))),
        fill: color, rx: 1 }, undefined, group);
    });
  } else {
    element("polyline", {
      points: points.map((p, i) => x(i).toFixed(1) + "," + y(p.close).toFixed(1)).join(" "),
      fill: "none", stroke: "#38bdf8", "stroke-width": 3, "stroke-linejoin": "round",
      "stroke-linecap": "round"
    });
  }
  [...new Set([0, Math.floor((points.length-1)/2), points.length-1])].forEach(i => {
    element("text", { x: x(i), y: height-7, "text-anchor": "middle", fill: "#cbd5e1", "font-size": 13 }, points[i].date);
  });
  priceChart.replaceChildren(svg);
  chartStatus.textContent = symbol + ": " + points.length +
    (candles ? " daily candlesticks (" : " daily closing prices (") + currency + ").";
  chartFootnote.textContent = candles
    ? "Green = close at or above open; red = close below open. Hover over a candle for OHLC data. Prices may be delayed."
    : "Daily closing prices; market data may be delayed.";
}

`;
  replaceOnce('public/script.js', /function renderChart\(prices, symbol, currency\) \{[\s\S]*?\n\}\n\n(?=async function loadChart)/, newChart);
  replaceOnce('public/script.js',
`let chartRange = "1mo";

const priceChart`,
`let chartRange = "1mo";
let chartType = "line";
let chartData = null;

const priceChart`);
  replaceOnce('public/script.js',
`const rangeButtons = document.querySelectorAll(".range-button");`,
`const rangeButtons = document.querySelectorAll(".range-button");
const typeButtons = document.querySelectorAll(".chart-type-button");
const chartFootnote = document.getElementById("chartFootnote");`);
  replaceOnce('public/script.js',
`  priceChart.replaceChildren();
  chartStatus.textContent = "Loading " + chartRange + " price history for " + symbol + "...";`,
`  chartData = null;
  priceChart.replaceChildren();
  chartStatus.textContent = "Loading " + chartRange + " price history for " + symbol + "...";`);
  replaceOnce('public/script.js',
`    renderChart(result.prices, result.symbol, result.currency);`,
`    chartData = result;
    renderChart(result.prices, result.symbol, result.currency);`);
  replaceOnce('public/script.js',
`rangeButtons.forEach(button => button.addEventListener("click", () => {`,
`typeButtons.forEach(button => button.addEventListener("click", () => {
  chartType = button.dataset.chartType;
  typeButtons.forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  if (chartData) renderChart(chartData.prices, chartData.symbol, chartData.currency);
}));

rangeButtons.forEach(button => button.addEventListener("click", () => {`);
  replaceOnce('public/script.js',
`  chartSymbol = "";
  priceChart.replaceChildren();`,
`  chartSymbol = "";
  chartData = null;
  priceChart.replaceChildren();`);
  replaceOnce('public/style.css',
`.range-button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }`,
`.range-button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
.chart-type-button { padding: 9px 16px; border-radius: 7px; border: 1px solid #64748b; background: #0f172a; color: #e2e8f0; cursor: pointer; }
.chart-type-button.active, .chart-type-button:hover { background: #1d4ed8; border-color: #60a5fa; }
.chart-type-button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }`);

  // 4) Add regression tests for valid candles and incomplete/malformed OHLC.
  const newTests = `

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
`;
  files.set('test/history.test.js', files.get('test/history.test.js') + newTests);

  // Write only after all checks pass, preventing half-updated source from a marker mismatch.
  for (const [relative, content] of files) {
    fs.writeFileSync(path.join(base, relative), content, 'utf8');
    console.log(`Updated ${relative}`);
  }
  console.log('\nWeek 6 candlestick chart installed! Run: npm test, then npm run dev');
} catch (error) {
  console.error('Upgrade did not complete:', error.message);
  process.exitCode = 1;
}
