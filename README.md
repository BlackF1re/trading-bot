# trading-bot

Live-mainnet **paper arbitrage scanner** for native **Gram (GRAM) / USD₮** across **STON.fi** and **DeDust** on TON.

It reads current executable swap estimates, models sequential two-leg execution with configurable delays, subtracts an estimated network-cost reserve and safety buffer, and writes results to CSV/JSON. **No wallet, seed, signing, or transaction sending exists in this version.**

> Since 15 June 2026, Toncoin (TON) is displayed as Gram (GRAM). This project means the native TON-chain asset, not the separate legacy PoW jetton with a similar name.

## Run

Requirements: Node.js 20-22.

### Linux

```bash
cp .env.example .env
npm install --no-audit --no-fund
npm run check
npm start
```

### Windows 11

Run `install.bat`, then `start.bat`.

### Docker

```bash
cp .env.example .env
docker compose up --build -d
docker compose logs -f
```

Results are written to `data/`:

- `snapshots.csv` — every checked route;
- `opportunities.csv` — detected edges above the configured threshold;
- `paper_trades.csv` — delayed sequential paper executions;
- `summary.json` — rolling statistics.

Generate a report with:

```bash
npm run report
```

Configuration is documented inline in `.env.example`. Paper PnL is **not realized PnL**: no transaction enters a block, so actual gas, inclusion timing, failures, ordering, and competition are not perfectly reproduced.

Future wallet/live-trading notes: [`docs/WALLET.md`](docs/WALLET.md).
