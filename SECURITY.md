# Security Policy

## Scope

Whale Watcher is a read-only Ethereum wallet intelligence tool. It does not handle private keys, seed phrases, transaction signing, or financial transactions.

In scope for security reports:
- API key exposure or leakage to the frontend
- Server-side request forgery (SSRF) in API routes
- Injection vulnerabilities (XSS, SQL, command injection)
- Authentication or rate-limit bypass
- Sensitive data exposure in API responses

Out of scope:
- Vulnerabilities in Dune Analytics, Etherscan, Alchemy, or other upstream providers
- Denial of service without demonstrated impact
- Issues requiring physical access to the server

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Report by opening a [GitHub Security Advisory](../../security/advisories/new) on this repository, or email **security@walletwall.org**.

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

We aim to acknowledge reports within 48 hours and provide a resolution timeline within 7 days.

## Key Security Properties

- All provider API keys are server-side only and never sent to the frontend
- Public wallet data (labels, ENS names, token metadata) is treated as attacker-controlled text
- Session tokens are short-lived and IP-bound
- Rate limiting is applied per IP on all API routes
