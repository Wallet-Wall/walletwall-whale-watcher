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
# Fill in your keys — see .env.example for what each key does
npm run dev
```

This starts:
- Vite dev server on `http://localhost:3000`
- API shim on `http://localhost:3001`

The app falls back to demo wallet data when provider keys are not configured.

**Windows PowerShell:** use `npm.cmd` if `npm.ps1` is blocked by execution policy.

## Environment Variables

See [`.env.example`](.env.example) for the full list with inline documentation.

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | Signs session JWTs — use 32+ random characters |
| `DUNE_API_KEY` | Yes | 12-week wallet activity feed |
| `DUNE_QUERY_12WK_ACTIVE_WALLETS` | Yes | Numeric Dune query ID |
| `UPSTASH_REDIS_REST_URL` | Recommended | Durable rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Durable rate limiting |
| `ETHERSCAN_API_KEY` | Recommended | Live wallet data |
| `ALCHEMY_API_KEY` | Recommended | Live wallet data |
| `OPENROUTER_API_KEY` | Optional | AI narrative |

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
