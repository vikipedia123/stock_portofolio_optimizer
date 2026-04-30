# Stock Portfolio Management and Optimization App

This is a simple local web app that reads real historical stock prices and performs long-only portfolio analytics.

## Run

From the workspace root:

```powershell
cd "C:\Users\Vicki.Burckel\Documents\Codex\2026-04-30\create-a-pptx-on-the-travel"
npm run start:portfolio
```

Open:

```text
http://localhost:4273
```

## What it does

- Fetches daily historical close prices from Yahoo Finance's chart endpoint.
- Calculates daily returns, annualized return, annualized volatility, covariance, and Sharpe ratio.
- Lets you edit current portfolio weights.
- Runs random long-only portfolio simulations to estimate:
  - max-Sharpe allocation
  - minimum-volatility allocation
  - efficient-frontier samples
- Adds a 30-trading-day forecast layer using:
  - exponentially weighted recent returns
  - exponentially weighted covariance
  - bootstrap forward paths from historical daily returns
- Shows forecast max-Sharpe allocation, forecast minimum-volatility allocation, and 10th/50th/90th percentile simulated performance.
- Shows approximate rebalance value and share changes.

## Limits

- Educational only; not financial advice.
- Uses historical data, which does not predict future performance.
- The 30-day forecast is a statistical scenario simulation, not a reliable prediction.
- Random simulation is an approximation, not a formal constrained optimizer.
- Market data may be delayed, adjusted, incomplete, or unavailable.
