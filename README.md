# Whale Watcher

Whale Watcher is a read-only Ethereum wallet activity workspace. Enter any wallet address or ENS name to inspect movement patterns, 12-week activity cadence, large transfer spikes, counterparty relationships, and post-quantum exposure — all from a single focused surface.

Whale Watcher is part of the [WalletWall](https://walletwall.org) suite, hosted at [whales.walletwall.org](https://whales.walletwall.org).

> **No wallet connection required.** Whale Watcher never asks for private keys, seed phrases, or transaction signatures. All data is read-only from public on-chain sources.

## Tech Stack

- React 19 + Vite 8
- Recharts for activity charts
- Node.js / Vercel serverless functions (`api/`)
- [Dune Analytics](https://dune.com) for 12-week wallet activity
- Etherscan + Alchemy for live wallet data
- OpenRouter / OpenAI / Anthropic for optional AI narrative (first available wins)
- Optional Upstash Redis for durable rate limiting

## Local Development

```bash
npm install
cp .env.example .env
```

Open `.env` and set at least `SESSION_SECRET` to a random 32-character string. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then start the dev servers:

```bash
npm run dev
```

This starts:
- Vite dev server on `http://localhost:3000`
- API shim on `http://localhost:3001`

The app falls back to demo wallet data when provider keys are not configured, so the UI is fully explorable with only `SESSION_SECRET` set.

**Try it out:** enter `vitalik.eth` or `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` in the search box to see a fully-populated wallet view with live data.

**Windows PowerShell:** use `npm.cmd` if `npm.ps1` is blocked by execution policy.

## Environment Variables

See [`.env.example`](.env.example) for the full list with inline documentation.

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Local: recommended · Prod: required | Signs session JWTs — use 32+ random characters. Falls back to an ephemeral key in local dev only. |
| `DUNE_API_KEY` | Recommended | 12-week wallet activity feed. Falls back to demo data. |
| `DUNE_QUERY_12WK_ACTIVE_WALLETS` | Recommended | Numeric Dune query ID for the 12-week activity feed. |
| `UPSTASH_REDIS_REST_URL` | Recommended | Durable rate limiting across restarts |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Durable rate limiting across restarts |
| `ETHERSCAN_API_KEY` | Recommended | Live wallet transactions and balances |
| `ALCHEMY_API_KEY` | Recommended | Live wallet data and ENS resolution |
| `COINGECKO_API_KEY` | Optional | Token price data — unauthenticated CoinGecko used as fallback |
| `GRAPH_API_KEY` | Optional | The Graph gateway key for Uniswap V3 / Aave V3 subgraph enrichment |
| `GCP_SERVICE_ACCOUNT_JSON` | Optional | Service account JSON for BigQuery wallet activity (primary source for `/api/wallet-activity` when set) |
| `OPENROUTER_API_KEY` | Optional | AI narrative (first available provider wins) |
| `OPENAI_API_KEY` | Optional | AI narrative fallback |
| `ANTHROPIC_API_KEY` | Optional | AI narrative fallback |

### Dune Query Schema

`DUNE_QUERY_12WK_ACTIVE_WALLETS` should return one row per wallet per active day with these columns:

| Column | Type | Description |
|---|---|---|
| `address` | string | Wallet address (0x…) |
| `label` | string | Optional label |
| `category` | string | e.g. `exchange`, `defi`, `retail` |
| `activity_tier` | string | e.g. `whale`, `active`, `dormant` |
| `last_seen` | date | Most recent transaction date |
| `tx_count_48h` | number | Transactions in last 48 hours |
| `usd_volume_48h` | number | Volume (USD) in last 48 hours |
| `activity_day` | date | Day for this row's activity bucket |
| `tx_count_day` | number | Transactions on this day |
| `usd_volume_day` | number | Volume (USD) on this day |
| `intensity_score` | number | Normalized activity intensity (0–1) |

## Commands

```bash
npm run dev             # API + Vite dev server
npm run build           # Production build
npm run test            # Node test suite
npm run lint            # Static checks
npm run security:audit  # npm audit at moderate severity
npm run check           # lint + test + build + audit
```

## Contributing

Contributions are welcome. Please:

1. Fork and create a feature branch from `main`
2. Keep changes focused — one issue or feature per PR
3. Run `npm run check` before opening a PR
4. Do not commit `.env` files or real API keys
5. UI changes should use the existing cream/terracotta color palette

See [CONTRIBUTING.md](CONTRIBUTING.md) for more detail.

## Security

- All provider API keys are server-side only — never sent to the frontend
- Public wallet data (labels, ENS names, token metadata) is treated as attacker-controlled text
- Session tokens are short-lived and IP-bound

To report a security issue, open a GitHub Security Advisory or email security@walletwall.org.

## Data Attribution

- On-chain data: Etherscan, Alchemy
- Wallet activity feeds: [Dune Analytics](https://dune.com)
- AI narrative: OpenRouter / OpenAI / Anthropic (optional)
