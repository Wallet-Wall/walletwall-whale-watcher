# Whale Watcher

Whale Watcher is a read-only large-wallet activity lens. Browse a set of watched wallets and click any one to see its balance, 7-day activity, largest transfer, counterparties, accumulation/distribution trend, and a 12-week activity cadence — all from a single focused surface.

Whale Watcher is part of the [WalletWall](https://walletwall.org) analytics suite.

> **No wallet connection required.** Whale Watcher never asks for private keys, seed phrases, or transaction signatures. All data is read-only from static fixture data unless wired by the user to their own read-only source.

## Disclaimers

- **Demo data only.** All values are synthetic fixture data by default.
- **No wallet connection.** This surface never connects to a wallet provider.
- **No custody.** No funds are held, managed, or accessed.
- **No signing.** No transaction construction or signing of any kind.
- **No transactions.** No on-chain write operations.
- **No paid Dune execution.** No live Dune query paths or paid analytics execution.
- **No scoring engine.** No signal heuristics, scoring weights, or Dune queries — those live in the private WalletWall app.
- **Not financial advice.** Nothing in this surface constitutes financial advice.
- **Not production quantum protection.** No quantum-resistant vault claims.

## Tech Stack

- React 18 + Vite 6
- Static fixture data (no live API dependencies, no backend)
- Vitest + Testing Library for tests

## Local Development

```bash
npm install
npm run dev
```

This starts the Vite dev server at `http://localhost:5173`. The app runs entirely on static fixture data — no API keys or environment variables required.

## Commands

```bash
npm run dev             # Vite dev server
npm run build           # Production build
npm run test            # Run test suite
npm run security:audit  # npm audit at moderate severity
npm run check           # test + build + audit
```

## Replacing Fixture Data

Whale Watcher ships with synthetic demo data in `src/data/whale-watcher.fixture.json`. To wire your own read-only data:

1. Replace the fixture file contents with your data, matching the schema in `docs/DATA_FIXTURES.md`.
2. Ensure your data source is read-only — no write access, no private keys.
3. If connecting to a live API, build a server-side proxy that holds credentials outside this repository. Never commit API keys, Dune query IDs, or scoring logic here.

See `docs/DATA_FIXTURES.md` for the full fixture schema and `docs/PUBLIC_SAFE_SCOPE.md` for what is intentionally out of scope.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md). To report a vulnerability, open a GitHub Security Advisory or email security@walletwall.org.

## Data Attribution

All fixture data is synthetic and for demonstration purposes only.
