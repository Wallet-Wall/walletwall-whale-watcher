# Whale Watcher — Surface Overview

Whale Watcher is a read-only large-wallet activity lens. It is one of the surfaces in the WalletWall analytics suite. Sibling surfaces include [Stable Seer](https://github.com/Wallet-Wall/walletwall-stable-seer), [Coinstellation](https://github.com/Wallet-Wall/walletwall-coinstellation), and [Holder Wall](https://github.com/Wallet-Wall/walletwall-holder-wall).

---

## What Whale Watcher Shows

- **Watched-wallet list** with label, entity type, balance, 7-day activity, and quantum-readiness status
- **KPIs:** tracked wallets, wallets active in the last 7 days, 7-day volume, largest single transfer, median quantum readiness
- **Per-wallet detail:** balance, activity count, largest transfer, counterparty count, accumulation/distribution/dormant trend, and a demo address
- **12-week activity cadence** rendered as a compact bar chart per wallet

## What Whale Watcher Does Not Do

- No live wallet data
- No wallet connection
- No transactions or swaps
- No vault write flows or custody claims
- No paid Dune execution
- No scoring engine, signal heuristics, or Dune queries (these live in the private app)

## Design Intent

Surfaces the large-wallet movement signal layer so a reader can assess concentration, cadence, and exposure at a glance. In the full product, these signals feed vault-readiness decisions — but that upstream scoring logic and its data pipeline are **not present here**. This repo is the interface and a synthetic fixture only.

---

## How the Surfaces Relate

All WalletWall surfaces are read-only lenses on the same underlying subject: the safety and exposure profile of stablecoins and the wallets that hold them.

- **Whale Watcher** (this repo) examines large wallets: movement, cadence, counterparties, and exposure.
- **Stable Seer** examines the stablecoin itself: peg health, liquidity, and pool structure.
- **Coinstellation** examines a wallet's relationships: who it transacts with and how value flows.
- **Holder Wall** examines holder distribution: concentration, entity type, and holding behavior.

Write flows, vault decisions, signing, scoring engines, and execution are intentionally out of scope for all public surface repositories.
