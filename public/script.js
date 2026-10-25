"use strict";

const searchForm = document.getElementById("stockSearchForm");
const stockInput = document.getElementById("stockInput");
const searchButton = document.getElementById("searchButton");
const searchStatus = document.getElementById("searchStatus");
const searchError = document.getElementById("searchError");
const stockCard = document.getElementById("stockCard");
const stockSymbol = document.getElementById("stockSymbol");
const stockName = document.getElementById("stockName");
const stockPrice = document.getElementById("stockPrice");
const stockChange = document.getElementById("stockChange");
const stockVolume = document.getElementById("stockVolume");
const stockExchange = document.getElementById("stockExchange");
const stockMetadata = document.getElementById("stockMetadata");
const stockSource = document.getElementById("stockSource");
const stockAsOf = document.getElementById("stockAsOf");
const tickerPattern = /^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/;

let requestId = 0;
let activeController = null;
let chartController = null;
let chartRequestId = 0;
let chartSymbol = "";
let chartRange = "1mo";
let chartType = "line";
let chartData = null;

const priceChart = document.getElementById("priceChart");
const chartStatus = document.getElementById("chartStatus");
const rangeButtons = document.querySelectorAll(".range-button");
const typeButtons = document.querySelectorAll(".chart-type-button");
const chartFootnote = document.getElementById("chartFootnote");

function renderChart(prices, symbol, currency) {
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

async function loadChart(symbol) {
  if (chartController) chartController.abort();
  const currentId = ++chartRequestId;
  chartSymbol = symbol;
  chartController = new AbortController();
  chartData = null;
  priceChart.replaceChildren();
  chartStatus.textContent = "Loading " + chartRange + " price history for " + symbol + "...";
  try {
    const response = await fetch("/api/history?symbol=" + encodeURIComponent(symbol) + "&range=" + chartRange, {
      signal: chartController.signal, headers: { Accept: "application/json" }
    });
    const result = await response.json();
    if (currentId !== chartRequestId) return;
    if (!response.ok) throw new Error(result.error || "Unable to load chart data.");
    chartData = result;
    renderChart(result.prices, result.symbol, result.currency);
  } catch (error) {
    if (currentId !== chartRequestId || error.name === "AbortError") return;
    chartStatus.textContent = error.message || "Unable to load historical chart data.";
  }
}

typeButtons.forEach(button => button.addEventListener("click", () => {
  chartType = button.dataset.chartType;
  typeButtons.forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  if (chartData) renderChart(chartData.prices, chartData.symbol, chartData.currency);
}));

rangeButtons.forEach(button => button.addEventListener("click", () => {
  chartRange = button.dataset.range;
  rangeButtons.forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  if (chartSymbol) loadChart(chartSymbol);
}));

function clearError() {
  searchError.textContent = "";
  searchError.hidden = true;
  stockInput.removeAttribute("aria-invalid");
}

function showError(message, invalidInput = false) {
  searchError.textContent = message;
  searchError.hidden = false;
  if (invalidInput) stockInput.setAttribute("aria-invalid", "true");
}

function setLoading(loading) {
  searchButton.disabled = loading;
  searchButton.textContent = loading ? "Searching…" : "Search";
  stockCard.setAttribute("aria-busy", String(loading));
}

function clearQuote() {
  stockSymbol.textContent = "---";
  stockName.textContent = "";
  stockPrice.textContent = "---";
  stockChange.textContent = "---";
  stockChange.className = "";
  stockVolume.textContent = "---";
  stockExchange.textContent = "";
  stockExchange.hidden = true;
  stockSource.textContent = "";
  stockAsOf.textContent = "";
  stockAsOf.removeAttribute("datetime");
  stockMetadata.hidden = true;
}

function formatMoney(value, currency, signed = false) {
  if (!Number.isFinite(value)) return "Not available";
  const numberOptions = { maximumFractionDigits: 2 };
  if (signed) numberOptions.signDisplay = "exceptZero";
  // Mixed-case units such as GBp are distinct from ISO currencies such as GBP.
  if (typeof currency !== "string" || currency !== currency.toUpperCase() || currency === "GBX") {
    return `${new Intl.NumberFormat(undefined, numberOptions).format(value)} ${currency || ""}`.trim();
  }
  const options = { style: "currency", currency };
  if (signed) options.signDisplay = "exceptZero";
  try {
    return new Intl.NumberFormat(undefined, options).format(value);
  } catch {
    return `${new Intl.NumberFormat(undefined, numberOptions).format(value)} ${currency}`;
  }
}

function displayQuote(quote) {
  stockSymbol.textContent = quote.symbol;
  stockName.textContent = quote.name || "Company name not available";
  stockPrice.textContent = formatMoney(quote.price, quote.currency);

  const changeParts = [];
  if (Number.isFinite(quote.change)) {
    changeParts.push(formatMoney(quote.change, quote.currency, true));
  }
  if (Number.isFinite(quote.changePercent)) {
    const percent = new Intl.NumberFormat(undefined, {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: "exceptZero",
    }).format(quote.changePercent / 100);
    changeParts.push(changeParts.length ? `(${percent})` : percent);
  }
  stockChange.textContent = changeParts.join(" ") || "Not available";
  const direction = Number.isFinite(quote.change) ? quote.change : quote.changePercent;
  stockChange.className = direction > 0 ? "positive" : direction < 0 ? "negative" : "";
  stockVolume.textContent = Number.isFinite(quote.volume)
    ? new Intl.NumberFormat().format(quote.volume)
    : "Not available";
  stockExchange.textContent = `Exchange: ${quote.exchange || "Not available"}`;
  stockExchange.hidden = false;
  stockSource.textContent = `Source: ${quote.source}`;

  const quoteTime = quote.asOf ? new Date(quote.asOf) : null;
  if (quoteTime && Number.isFinite(quoteTime.getTime())) {
    stockAsOf.dateTime = quoteTime.toISOString();
    stockAsOf.textContent = `As of ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "long",
    }).format(quoteTime)}`;
  } else {
    stockAsOf.textContent = "Quote time not available";
  }
  stockMetadata.hidden = false;
}

stockInput.addEventListener("input", clearError);

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const symbol = stockInput.value.trim().toUpperCase();
  stockInput.value = symbol;

  const currentRequestId = ++requestId;
  if (activeController) activeController.abort();
  activeController = null;
  clearError();
  searchStatus.textContent = "";
  setLoading(false);

  if (!tickerPattern.test(symbol)) {
    showError("Enter a ticker symbol of up to 20 characters, such as AAPL or BRK-B. Use letters, numbers, or . ^ = -.", true);
    stockInput.focus();
    return;
  }

  clearQuote();
  if (chartController) chartController.abort();
  ++chartRequestId;
  chartSymbol = "";
  chartData = null;
  priceChart.replaceChildren();
  chartStatus.textContent = "Waiting for a successful stock lookup.";
  const controller = new AbortController();
  activeController = controller;
  setLoading(true);
  searchStatus.textContent = `Looking up ${symbol}…`;

  try {
    const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const quote = await response.json();
    if (currentRequestId !== requestId) return;
    if (!response.ok) {
      const fallbacks = {
        400: "Enter a valid ticker symbol and try again.",
        404: `No quote found for ${symbol}. Check the ticker symbol and try again.`,
        502: "The market data provider is unavailable. Try again shortly.",
        504: "The market data provider took too long to respond. Try again.",
      };
      showError(typeof quote.error === "string" && quote.error
        ? quote.error
        : fallbacks[response.status] || "Unable to load the quote. Try again.", response.status === 400);
      searchStatus.textContent = "";
      return;
    }
    displayQuote(quote);
    loadChart(quote.symbol);
    searchStatus.textContent = `Quote loaded for ${quote.symbol}.`;
  } catch (error) {
    if (currentRequestId !== requestId) return;
    searchStatus.textContent = "";
    if (error.name !== "AbortError") {
      showError("Unable to load the quote. Check your connection and try again.");
    }
  } finally {
    if (currentRequestId === requestId) {
      activeController = null;
      setLoading(false);
    }
  }
});
