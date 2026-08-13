# Future live-trading wallet

The current project is intentionally read-only. Do not add a seed phrase to `.env`; no code reads one.

For a future unattended live mode:

1. Create a dedicated hot wallet; never reuse the main wallet.
2. Fund it only with a bounded amount plus native GRAM for gas.
3. Store the signer outside Git; production deployments should use an OS/container secret or external signer rather than plaintext source files.
4. Build transactions only through the official STON.fi/DeDust SDK flow and enforce `minOut`, TTL, route allowlists, per-trade limits, daily-loss limits, balance checks, and a kill switch.
5. Add a shadow mode that constructs but does not sign/send transactions.
6. Validate with tiny real trades before increasing limits.

Manual TonConnect confirmation is appropriate for interactive use, but too slow for unattended arbitrage. An autonomous bot requires a dedicated signer and substantially stronger risk controls than paper mode.
