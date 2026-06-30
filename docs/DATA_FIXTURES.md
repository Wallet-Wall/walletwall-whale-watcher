# Data Fixtures

Whale Watcher ships with synthetic, clearly labeled demo data located in `src/data/whale-watcher.fixture.json`. All demo addresses are clearly fake and must not be used for identity or attribution purposes.

## Fixture File

| File | Purpose |
|---|---|
| `whale-watcher.fixture.json` | Network KPIs and ranked watched-wallet rows with type, balance, activity, cadence, and quantum status |

## Fixture Schema

```jsonc
{
  "_note": "DEMO DATA ONLY — synthetic whale wallet activity fixture. All addresses are clearly fake demo labels.",
  "as_of": "<ISO timestamp>",
  "network": "Ethereum (demo)",
  "kpis": {
    "tracked_wallets": 8,
    "active_7d": 5,
    "total_moved_usd_7d": 184000000,
    "largest_spike_usd": 42000000,
    "median_quantum_readiness": "Review"
  },
  "wallets": [
    {
      "rank": 1,
      "label": "Demo Whale 001",
      "type": "whale" | "exchange" | "institution" | "protocol",
      "address_demo": "0xDEMOWH01...AAAA",
      "balance_usd": 1240000000,
      "activity_7d": 38,
      "largest_transfer_usd": 42000000,
      "counterparties": 17,
      "cadence_12w": [4, 6, 3, 8, 12, 9, 5, 7, 14, 11, 6, 38],
      "quantum_status": "ok" | "watch" | "review",
      "trend": "accumulating" | "distributing" | "dormant"
    }
  ]
}
```

### Entity Types

| Type | Color |
|---|---|
| `whale` | Terracotta (`#BF4E32`) |
| `exchange` | Steel blue (`#5B7EA6`) |
| `institution` | Dark green (`#2F8F67`) |
| `protocol` | Muted purple (`#7A6B9E`) |

### Quantum Status

| Status | Meaning | Badge |
|---|---|---|
| `ok` | On track | Safe (green) |
| `watch` | Worth monitoring | Warn (tan) |
| `review` | Elevated exposure | Risk (terracotta) |

`cadence_12w` is an array of 12 weekly transaction counts (oldest → newest), rendered as the detail-panel cadence chart.

## Replacing the Fixture With Your Own Data

To wire Whale Watcher to your own data source:

1. Replace the contents of `src/data/whale-watcher.fixture.json` with your data, matching the schema above.
2. Ensure your data source is **read-only** — no write access, no private keys, no paid Dune execution in this repo.
3. If connecting to Dune Analytics or a comparable provider, build a separate server-side proxy that holds credentials outside this repository. Never commit API keys, Dune query IDs, or scoring logic here.
4. Use clearly labeled demo addresses or sanitized public addresses only. Do not include real sensitive wallet labels or identity annotations.
5. Update `_note` and `as_of` to reflect the source and freshness.

## Live Connectors

Live wallet-activity connectors (e.g., Dune Analytics) are **out of scope** for this repository unless separately approved and scoped. This repository is intentionally fixture-only to remain publicly safe.
