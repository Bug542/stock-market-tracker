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
