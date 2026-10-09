# Stock Market Tracker

A small Express app for looking up stock quotes by ticker symbol.

## Development

Use Node.js 24.14 or newer (Node 24 LTS recommended).

```sh
npm start
# Or restart automatically when backend files change:
npm run dev
```

The server uses port 3000 by default. Set `PORT` to choose another port.
Open the app in a browser, enter a ticker such as AAPL, GME, NVDA, or BRK-B,
and click Search or press Enter. The quote shows price, change from the previous
close, volume, exchange, and the provider's quote timestamp. Missing values are
shown as unavailable. Quotes may be delayed; check the displayed timestamp.
Charts, support/resistance, and news remain placeholders.

## Quote source

`GET /api/quote?symbol=AAPL` retrieves Yahoo Finance chart metadata on the server.
No API key is required. Yahoo's public endpoint is unofficial and can change,
reject requests, or rate limit access. Provider failures display an error rather
than sample prices. The request times out after eight seconds.

The server honors `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` using Node's
built-in proxy support. Restricted environments must allow HTTPS access to
`query1.finance.yahoo.com`. The cloud environment draft includes this domain.
Live quote retrieval was verified in the current cloud machine; retain this
domain when publishing the environment for future tasks.

The API returns HTTP 400 for malformed tickers, 404 for unknown symbols,
502 for provider failures, and 504 for provider timeouts.

## Dependencies and tests

This repository currently commits `node_modules`. To reinstall from the lockfile
without changing those tracked files in the cloud environment:

```sh
mkdir -p /workspace/.onboarding/stock-market-tracker
cp package.json package-lock.json /workspace/.onboarding/stock-market-tracker/
npm ci --prefix /workspace/.onboarding/stock-market-tracker --cache /workspace/.onboarding/npm-cache --no-audit --no-fund
```

The server resolves its committed dependencies in the checkout. The separate
installation checks that the lockfile can reproduce them.

```sh
npm test
```

Tests use Node's built-in test runner and controlled provider responses. They
cover quote mapping, input validation, HTTP errors, timeouts, and static serving
without requiring Internet access or a market-data account.
