# Public-Safe Scope

This document defines what is included and explicitly excluded from `walletwall-whale-watcher`.

## Included

- **Whale Watcher** — read-only large-wallet activity lens (static fixture data only)
- Public-safe UI components and brand styling
- Synthetic, clearly labeled demo fixture data
- Lightweight tests verifying render, fixture display, and absence of forbidden strings

## Explicitly Excluded — Do Not Add

| Category | Excluded Items |
|---|---|
| Secrets | Private API keys, Dune API keys, Alchemy keys, Etherscan keys, Infura project IDs, mnemonics, private keys of any kind |
| Execution | Paid Dune query execution, live data refresh endpoints, backend/serverless functions, server processes |
| Analytics | Production scoring weights, signal/heuristic engines, Dune query IDs or query names, output-column schemas, caching/quota strategy |
| Wallet | Wallet connection (WalletConnect or any provider), signing, transaction construction, authorization flows |
| Vault | Vault write flows, custody, deposit, swap, bridge, or yield execution |
| Data | Real wallet addresses or labels, production user data, annotated entity identities |
| History | Private repository git history |
| Config | Vercel project IDs, private deployment metadata, private org config, `.env` files |
| Claims | Claims of production quantum protection, audited vault safety, mainnet readiness, yield, or custody |

## Why This Repo Is Fixture-Only

Whale Watcher is a **product surface** published to build trust through transparency. The underlying intelligence — how movement signals, cadence, counterparty, and quantum-exposure scores are computed, and the Dune queries that feed them — is the WalletWall moat and stays in the private application. This repository intentionally ships the **interface and a synthetic fixture only**, with no backend and no live data path.

## Contribution Boundary

If you identify an implementation opportunity that falls outside the above scope, document it as a follow-up issue rather than implementing it. The product roadmap is owned by the WalletWall team.

## Permitted Follow-Up Topics (Document Only, Do Not Implement Here)

- Live read-only wallet-activity connectors (requires separate approval and scoping)
- User-owned data source wiring via a server-side proxy that holds credentials outside this repo
- Authentication or access control for private deployments
- Additional filtering or sorting capabilities for the watched-wallet list
