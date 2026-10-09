class QuoteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "QuoteError";
    this.status = status;
  }
}

const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const nonemptyText = (value) => typeof value === "string" && value.trim() ? value.trim() : null;

async function fetchQuote(symbol, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("range", "1d");

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    const notFound = () => new QuoteError(404, `No quote found for ${symbol}. Check the ticker and try again.`);
    if (response.status === 404) throw notFound();
    if (!response.ok) throw new QuoteError(502, "The quote service is unavailable. Please try again later.");

    const data = await response.json();
    if (data?.chart?.error?.code === "Not Found") throw notFound();
    if (data?.chart?.error) throw new QuoteError(502, "The quote service could not complete this lookup.");

    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || !nonemptyText(meta.symbol) || !nonemptyText(meta.currency) ||
        !finiteNumber(meta.regularMarketPrice) || meta.regularMarketPrice < 0) {
      throw new QuoteError(502, "The quote service returned incomplete data. Please try again later.");
    }

    const previousClose = finiteNumber(meta.chartPreviousClose) ? meta.chartPreviousClose : meta.previousClose;
    const change = finiteNumber(previousClose) ? meta.regularMarketPrice - previousClose : null;
    const changePercent = change !== null && previousClose > 0 ? (change / previousClose) * 100 : null;
    const time = finiteNumber(meta.regularMarketTime) && meta.regularMarketTime > 0
      ? new Date(meta.regularMarketTime * 1000) : null;

    return {
      symbol: meta.symbol.trim().toUpperCase(),
      name: nonemptyText(meta.shortName) || nonemptyText(meta.longName),
      currency: meta.currency.trim(),
      price: meta.regularMarketPrice,
      change,
      changePercent,
      volume: finiteNumber(meta.regularMarketVolume) && meta.regularMarketVolume >= 0 ? meta.regularMarketVolume : null,
      asOf: time && Number.isFinite(time.getTime()) ? time.toISOString() : null,
      exchange: nonemptyText(meta.fullExchangeName) || nonemptyText(meta.exchangeName),
      source: "Yahoo Finance",
    };
  } catch (error) {
    if (error instanceof QuoteError) throw error;
    if (signal.aborted || error.name === "TimeoutError" || error.name === "AbortError") {
      throw new QuoteError(504, "The quote service took too long to respond. Please try again.");
    }
    throw new QuoteError(502, "Unable to reach the quote service. Please try again later.");
  }
}

module.exports = { fetchQuote, QuoteError };
