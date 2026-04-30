const els = {
  symbols: document.querySelector("#symbols"),
  range: document.querySelector("#range"),
  capital: document.querySelector("#capital"),
  riskFree: document.querySelector("#riskFree"),
  loadData: document.querySelector("#loadData"),
  equalWeight: document.querySelector("#equalWeight"),
  notice: document.querySelector("#notice"),
  lastUpdated: document.querySelector("#lastUpdated"),
  allocationTable: document.querySelector("#allocationTable"),
  optimizationTable: document.querySelector("#optimizationTable"),
  rebalanceTable: document.querySelector("#rebalanceTable"),
  sampleCount: document.querySelector("#sampleCount"),
  frontierChart: document.querySelector("#frontierChart"),
  priceChart: document.querySelector("#priceChart"),
  currentReturn: document.querySelector("#currentReturn"),
  currentRisk: document.querySelector("#currentRisk"),
  bestSharpe: document.querySelector("#bestSharpe"),
  bestRisk: document.querySelector("#bestRisk"),
};

let model = {
  symbols: [],
  weights: [],
  prices: [],
  returns: [],
  meanReturns: [],
  covariance: [],
  simulations: [],
  current: null,
  maxSharpe: null,
  minVol: null,
};

function parseSymbols() {
  return els.symbols.value
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 12);
}

function equalWeights(count) {
  return Array.from({ length: count }, () => 1 / count);
}

function setNotice(message, type = "") {
  els.notice.className = `notice ${type}`.trim();
  els.notice.textContent = message;
}

async function loadData() {
  const symbols = parseSymbols();
  if (symbols.length < 2) {
    setNotice("Enter at least two tickers to optimize a portfolio.", "error");
    return;
  }

  setNotice("Loading real historical prices and optimizing portfolios...");
  els.loadData.disabled = true;

  try {
    const response = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols.join(","))}&range=${els.range.value}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load market data.");
    }

    model.symbols = payload.series.map((item) => item.symbol);
    model.weights = equalWeights(model.symbols.length);
    model.prices = alignPrices(payload.series);
    buildAnalytics();
    renderAll();
    els.lastUpdated.textContent = new Date(payload.fetchedAt).toLocaleString();
    setNotice(`Loaded ${model.prices.length} aligned trading days from ${payload.provider}.`, "success");
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    els.loadData.disabled = false;
  }
}

function alignPrices(series) {
  const maps = series.map((item) => new Map(item.rows.map((row) => [row.date, row.close])));
  const commonDates = [...maps[0].keys()].filter((date) => maps.every((map) => map.has(date))).sort();
  return commonDates.map((date) => ({
    date,
    values: maps.map((map) => map.get(date)),
  }));
}

function buildAnalytics() {
  model.returns = [];
  for (let i = 1; i < model.prices.length; i += 1) {
    const prior = model.prices[i - 1].values;
    const next = model.prices[i].values;
    model.returns.push(next.map((value, index) => value / prior[index] - 1));
  }

  model.meanReturns = transpose(model.returns).map(mean);
  model.covariance = covarianceMatrix(model.returns);
  model.current = portfolioStats(model.weights);
  model.simulations = simulatePortfolios(4500);
  model.maxSharpe = model.simulations.reduce((best, item) => (item.sharpe > best.sharpe ? item : best), model.simulations[0]);
  model.minVol = model.simulations.reduce((best, item) => (item.risk < best.risk ? item : best), model.simulations[0]);
}

function transpose(rows) {
  return rows[0].map((_, col) => rows.map((row) => row[col]));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function covarianceMatrix(rows) {
  const columns = transpose(rows);
  return columns.map((left, i) => columns.map((right, j) => covariance(left, right, model.meanReturns[i], model.meanReturns[j])));
}

function covariance(left, right, leftMean, rightMean) {
  const total = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  return total / Math.max(1, left.length - 1);
}

function portfolioStats(weights) {
  const tradingDays = 252;
  const riskFree = Number(els.riskFree.value || 0) / 100;
  const dailyReturn = weights.reduce((sum, weight, index) => sum + weight * model.meanReturns[index], 0);
  const annualReturn = dailyReturn * tradingDays;
  const dailyVariance = weights.reduce((outer, weightI, i) => (
    outer + weights.reduce((inner, weightJ, j) => inner + weightI * weightJ * model.covariance[i][j], 0)
  ), 0);
  const annualRisk = Math.sqrt(Math.max(0, dailyVariance) * tradingDays);
  const sharpe = annualRisk === 0 ? 0 : (annualReturn - riskFree) / annualRisk;
  return { weights: [...weights], return: annualReturn, risk: annualRisk, sharpe };
}

function randomWeights(count) {
  const raw = Array.from({ length: count }, () => -Math.log(Math.random()));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

function simulatePortfolios(count) {
  const simulations = [portfolioStats(model.weights), portfolioStats(equalWeights(model.symbols.length))];
  for (let i = 0; i < count; i += 1) {
    simulations.push(portfolioStats(randomWeights(model.symbols.length)));
  }
  return simulations;
}

function renderAll() {
  renderMetrics();
  renderAllocationTable();
  renderOptimizationTable();
  renderRebalanceTable();
  drawFrontier();
  drawPrices();
}

function renderMetrics() {
  els.currentReturn.textContent = pct(model.current.return);
  els.currentRisk.textContent = pct(model.current.risk);
  els.bestSharpe.textContent = model.maxSharpe.sharpe.toFixed(2);
  els.bestRisk.textContent = pct(model.minVol.risk);
  els.sampleCount.textContent = `${model.simulations.length.toLocaleString()} samples`;
}

function renderAllocationTable() {
  const latest = model.prices.at(-1).values;
  const rows = model.symbols.map((symbol, index) => `
    <tr>
      <td class="ticker">${symbol}</td>
      <td>${money(latest[index])}</td>
      <td>${pct(model.meanReturns[index] * 252)}</td>
      <td>
        <input class="weight-input" type="number" min="0" max="100" step="1" value="${(model.weights[index] * 100).toFixed(0)}" data-weight="${index}" />
      </td>
      <td>${money(model.weights[index] * Number(els.capital.value || 0))}</td>
    </tr>
  `).join("");

  els.allocationTable.innerHTML = `
    <table>
      <thead><tr><th>Ticker</th><th>Last close</th><th>Annual return</th><th>Weight %</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  els.allocationTable.querySelectorAll("[data-weight]").forEach((input) => {
    input.addEventListener("change", updateWeightsFromInputs);
  });
}

function updateWeightsFromInputs() {
  const inputs = [...els.allocationTable.querySelectorAll("[data-weight]")];
  const raw = inputs.map((input) => Math.max(0, Number(input.value || 0)));
  const total = raw.reduce((sum, value) => sum + value, 0);
  model.weights = total > 0 ? raw.map((value) => value / total) : equalWeights(raw.length);
  model.current = portfolioStats(model.weights);
  model.simulations[0] = model.current;
  renderAll();
}

function renderOptimizationTable() {
  const rows = [
    ["Current", model.current],
    ["Max Sharpe", model.maxSharpe],
    ["Min Volatility", model.minVol],
  ].map(([label, item]) => `
    <tr>
      <td><span class="tag">${label}</span></td>
      <td>${pct(item.return)}</td>
      <td>${pct(item.risk)}</td>
      <td>${item.sharpe.toFixed(2)}</td>
      <td>${weightSummary(item.weights)}</td>
    </tr>
  `).join("");

  els.optimizationTable.innerHTML = `
    <table>
      <thead><tr><th>Portfolio</th><th>Return</th><th>Risk</th><th>Sharpe</th><th>Largest weights</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRebalanceTable() {
  const capital = Number(els.capital.value || 0);
  const latest = model.prices.at(-1).values;
  const rows = model.symbols.map((symbol, index) => {
    const currentValue = model.current.weights[index] * capital;
    const targetValue = model.maxSharpe.weights[index] * capital;
    const change = targetValue - currentValue;
    const shares = latest[index] ? change / latest[index] : 0;
    return `
      <tr>
        <td class="ticker">${symbol}</td>
        <td>${pct(model.current.weights[index])}</td>
        <td>${pct(model.maxSharpe.weights[index])}</td>
        <td class="${change >= 0 ? "positive" : "negative"}">${money(change)}</td>
        <td class="${shares >= 0 ? "positive" : "negative"}">${shares.toFixed(2)}</td>
      </tr>
    `;
  }).join("");

  els.rebalanceTable.innerHTML = `
    <table>
      <thead><tr><th>Ticker</th><th>Current</th><th>Target</th><th>Buy/Sell value</th><th>Approx. shares</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function weightSummary(weights) {
  return weights
    .map((weight, index) => ({ symbol: model.symbols[index], weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((item) => `${item.symbol} ${pct(item.weight, 0)}`)
    .join(", ");
}

function drawFrontier() {
  const canvas = els.frontierChart;
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  const pad = { l: 58, r: 22, t: 24, b: 48 };
  const risks = model.simulations.map((p) => p.risk);
  const returns = model.simulations.map((p) => p.return);
  const xScale = scaler(Math.min(...risks), Math.max(...risks), pad.l, canvas.width - pad.r);
  const yScale = scaler(Math.min(...returns), Math.max(...returns), canvas.height - pad.b, pad.t);
  drawAxes(ctx, canvas, pad, "Risk", "Return");

  model.simulations.forEach((p) => {
    ctx.fillStyle = "rgba(36, 88, 211, 0.18)";
    ctx.beginPath();
    ctx.arc(xScale(p.risk), yScale(p.return), 2, 0, Math.PI * 2);
    ctx.fill();
  });

  drawPoint(ctx, xScale(model.current.risk), yScale(model.current.return), "#cf8418", "Current");
  drawPoint(ctx, xScale(model.maxSharpe.risk), yScale(model.maxSharpe.return), "#139b65", "Max Sharpe");
  drawPoint(ctx, xScale(model.minVol.risk), yScale(model.minVol.return), "#c94747", "Min Vol");
}

function drawPrices() {
  const canvas = els.priceChart;
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);
  const pad = { l: 58, r: 22, t: 24, b: 48 };
  const normalized = model.symbols.map((_, index) => {
    const base = model.prices[0].values[index];
    return model.prices.map((row, rowIndex) => ({ x: rowIndex, y: (row.values[index] / base) * 100 }));
  });
  const allValues = normalized.flatMap((series) => series.map((p) => p.y));
  const xScale = scaler(0, model.prices.length - 1, pad.l, canvas.width - pad.r);
  const yScale = scaler(Math.min(...allValues), Math.max(...allValues), canvas.height - pad.b, pad.t);
  const colors = ["#2458d3", "#139b65", "#cf8418", "#c94747", "#0ea5b7", "#6d5bd0", "#5f738d", "#111827"];
  drawAxes(ctx, canvas, pad, "Time", "Base 100");

  normalized.forEach((series, index) => {
    ctx.strokeStyle = colors[index % colors.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((point, i) => {
      const x = xScale(point.x);
      const y = yScale(point.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillText(model.symbols[index], canvas.width - pad.r - 62, 26 + index * 18);
  });
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fbfcff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "13px Aptos, Segoe UI, Arial";
}

function drawAxes(ctx, canvas, pad, xLabel, yLabel) {
  ctx.strokeStyle = "#d9e1ec";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, canvas.height - pad.b);
  ctx.lineTo(canvas.width - pad.r, canvas.height - pad.b);
  ctx.stroke();
  ctx.fillStyle = "#647188";
  ctx.fillText(xLabel, canvas.width / 2 - 16, canvas.height - 16);
  ctx.save();
  ctx.translate(18, canvas.height / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function drawPoint(ctx, x, y, color, label) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(label, x + 9, y - 8);
}

function scaler(min, max, outMin, outMax) {
  const spread = max - min || 1;
  return (value) => outMin + ((value - min) / spread) * (outMax - outMin);
}

function pct(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

els.loadData.addEventListener("click", loadData);
els.equalWeight.addEventListener("click", () => {
  if (!model.symbols.length) return;
  model.weights = equalWeights(model.symbols.length);
  model.current = portfolioStats(model.weights);
  model.simulations[0] = model.current;
  renderAll();
});

els.capital.addEventListener("change", () => {
  if (model.symbols.length) renderAll();
});

els.riskFree.addEventListener("change", () => {
  if (!model.symbols.length) return;
  buildAnalytics();
  renderAll();
});

loadData();
