# Contributing to Whale Watcher

Thanks for contributing. Here is what you need to know.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Branch Model

- `main` is the production branch — do not push directly
- Create a feature branch: `git checkout -b feature/your-feature-name`
- Open a pull request against `main`

## Before Opening a PR

Run the full check suite and make sure everything passes:

```bash
npm run check
```

This runs lint, tests, build, and a security audit. A PR that fails any of these will not be merged.

## Scope Rules

- One issue or feature per PR — keep it reviewable
- Do not refactor unrelated code in the same PR as a bug fix
- Do not commit `dist/`, `node_modules/`, or `.env` files

## API Keys and Secrets

- Never commit real API keys, tokens, or credentials
- `.env.example` uses placeholder values only
- If you discover a hardcoded secret, stop and open a security advisory

## UI Guidelines

- Use the existing cream (`#FAF8F3`) and terracotta (`#BF4E32`) palette
- Status indicators use small green brick styling — not circular dots
- Do not introduce purple/violet accents or generic green dots

## Wallet Data Copy

When writing UI text that references a wallet:

- Use: `this wallet`, `this address`, `the wallet`
- Avoid: `your wallet`, `you moved`, `your strategy`

Whale Watcher shows public read-only on-chain data. It does not imply ownership or financial advice.

## Code Style

- No comments explaining what code does — well-named identifiers do that
- Add a comment only when the **why** is non-obvious (a constraint, a bug workaround, a hidden invariant)
- No multi-paragraph docstrings
