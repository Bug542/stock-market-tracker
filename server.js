const express = require("express");
const path = require("path");
const { setGlobalProxyFromEnv } = require("node:http");
const { fetchQuote, QuoteError } = require("./quote");

function createApp({ getQuote = fetchQuote } = {}) {
  const app = express();

  app.get("/api/quote", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "";
    if (!/^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(symbol)) {
      return res.status(400).json({ error: "Enter a valid ticker symbol, such as AAPL, GME, or BRK-B." });
    }

    try {
      res.json(await getQuote(symbol));
    } catch (error) {
      const status = error instanceof QuoteError ? error.status : 502;
      const message = error instanceof QuoteError ? error.message : "Unable to load a quote. Please try again later.";
      res.status(status).json({ error: message });
    }
  });

  app.use(express.static(path.join(__dirname, "public")));
  return app;
}

if (require.main === module) {
  // Honor the cloud HTTPS proxy while keeping NO_PROXY local requests direct.
  setGlobalProxyFromEnv();
  const port = process.env.PORT || 3000;
  createApp().listen(port, (error) => {
    if (error) {
      console.error(`Unable to start the server on port ${port}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Server running on port ${port}`);
  });
}

module.exports = { createApp };
