const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 4273);
const root = __dirname;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function normalizeSymbols(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 12);
}

async function fetchYahooSeries(symbol, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d&events=history`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 portfolio-tracker/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`${symbol}: Yahoo Finance returned ${response.status}`);
  }

  const data = await response.json();
  const result = data.chart && data.chart.result && data.chart.result[0];
  if (!result || !result.timestamp || !result.indicators || !result.indicators.quote) {
    throw new Error(`${symbol}: no chart data returned`);
  }

  const close = result.indicators.adjclose?.[0]?.adjclose || result.indicators.quote[0].close;
  const currency = result.meta?.currency || "USD";
  const exchange = result.meta?.exchangeName || result.meta?.fullExchangeName || "";
  const rows = result.timestamp
    .map((stamp, index) => ({
      date: new Date(stamp * 1000).toISOString().slice(0, 10),
      close: Number(close[index]),
    }))
    .filter((row) => Number.isFinite(row.close) && row.close > 0);

  if (rows.length < 40) {
    throw new Error(`${symbol}: insufficient price history`);
  }

  return { symbol, currency, exchange, rows };
}

async function handlePrices(req, res, url) {
  const symbols = normalizeSymbols(url.searchParams.get("symbols"));
  const range = url.searchParams.get("range") || "1y";
  const allowedRanges = new Set(["6mo", "1y", "2y", "5y"]);

  if (!symbols.length) {
    sendJson(res, 400, { error: "Provide at least one symbol." });
    return;
  }

  if (!allowedRanges.has(range)) {
    sendJson(res, 400, { error: "Range must be 6mo, 1y, 2y, or 5y." });
    return;
  }

  try {
    const series = await Promise.all(symbols.map((symbol) => fetchYahooSeries(symbol, range)));
    sendJson(res, 200, {
      provider: "Yahoo Finance chart endpoint",
      fetchedAt: new Date().toISOString(),
      range,
      series,
    });
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  if (url.pathname === "/api/prices") {
    handlePrices(req, res, url);
    return;
  }

  const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^[/\\]+/, "");
  const safePath = path.normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
});

server.listen(port, () => {
  console.log(`Portfolio optimizer running at http://localhost:${port}`);
});
