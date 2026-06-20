/**
 * Dune execution / write guard — the single source of truth for whether ANY
 * credit-spending or query-mutating Dune operation is permitted.
 *
 * ## Why this exists
 *
 * The Dune credit spike was NOT caused by the public app (its routes are
 * read-only and never execute). The real spend path is **coding agents and
 * dev/CI sessions** running Dune execute/refresh/update/create/delete commands
 * — via the API or the `dune` CLI — during implementation and "quick
 * validation". This guard makes that impossible to do by accident.
 *
 * ## Fail-closed contract
 *
 * An execution / write is allowed ONLY when ALL of the following hold. If any
 * one is missing, the operation throws. There is no partial-credit path.
 *
 *   1. `ALLOW_DUNE_EXECUTION === 'true'`
 *        (legacy alias `DUNE_ALLOW_EXECUTION === 'true'` still accepted)
 *   2. `DUNE_EXECUTION_ACK === 'I_UNDERSTAND_THIS_COSTS_CREDITS'`
 *        (a deliberate, un-guessable acknowledgement phrase)
 *   3. A dedicated **write** key is present: `DUNE_WRITE_API_KEY`.
 *        The read key (`DUNE_READONLY_API_KEY` / `DUNE_API_KEY`) can NEVER
 *        authorize a write — so "only DUNE_API_KEY is present" fails closed.
 *   4. The process is NOT an automated runner (CI / GitHub Actions /
 *        `NODE_ENV=test`). Automation can never spend credits, full stop.
 *
 * No Claude / Codex / Jules / CI / local script / test can satisfy all four by
 * accident. Crossing this gate is a deliberate, one-off human action.
 *
 * This module is pure (it takes an `env` object) so it can be unit-tested
 * without touching `process.env`, and reused by both the Dune API client (the
 * gated execute path in _dune.js) and the CLI pre-flight guard
 * (`scripts/dune-guard.mjs`).
 */

export const ACK_PHRASE = 'I_UNDERSTAND_THIS_COSTS_CREDITS';

/**
 * Dune CLI / API subcommands that either spend credits or mutate a query.
 * Used by the CLI pre-flight guard to hard-fail before a `dune` invocation.
 */
export const DENYLISTED_DUNE_COMMANDS = Object.freeze([
  'execute',
  'refresh',
  'create',
  'update',
  'delete',
  'archive',
  'unarchive',
  'upload',
  'make-private',
  'make-public',
]);

/** Read-only / metadata Dune operations that never spend credits. */
export const ALLOWED_DUNE_COMMANDS = Object.freeze([
  'results',
  'read',
  'get',
  'list',
  'usage',
  'status',
]);

function isTrue(v) {
  return v === 'true' || v === true;
}

/** True when an env var is present and not an explicit off value. */
function present(v) {
  return v != null && v !== '' && v !== 'false' && v !== '0';
}

/**
 * True when running inside an automated / hosted environment (CI, GitHub
 * Actions, Vercel build or serverless runtime, or a test runner). Execution is
 * hard-blocked here regardless of the other flags. Detection is deliberately
 * permissive — a false positive only blocks a credit-spend that should never
 * happen in automation anyway, so we err toward blocking.
 * @param {Record<string, string|undefined>} env
 */
export function isAutomatedEnv(env = process.env) {
  return (
    present(env.CI) ||
    present(env.GITHUB_ACTIONS) ||
    present(env.VERCEL) ||
    present(env.VERCEL_ENV) ||
    env.NODE_ENV === 'test' ||
    present(env.VITEST) ||
    env.npm_lifecycle_event === 'test'
  );
}

/**
 * Pure evaluation of the execution gate. Never throws.
 * @param {Record<string, string|undefined>} env
 * @returns {{ allowed: boolean, reasons: string[] }}
 *   `reasons` lists every unmet condition (empty when allowed).
 */
export function evaluateDuneExecution(env = process.env) {
  const reasons = [];

  const allowFlag = isTrue(env.ALLOW_DUNE_EXECUTION) || isTrue(env.DUNE_ALLOW_EXECUTION);
  if (!allowFlag) {
    reasons.push("ALLOW_DUNE_EXECUTION is not 'true'");
  }

  if (env.DUNE_EXECUTION_ACK !== ACK_PHRASE) {
    reasons.push(`DUNE_EXECUTION_ACK is not set to ${ACK_PHRASE}`);
  }

  if (!env.DUNE_WRITE_API_KEY) {
    reasons.push(
      'DUNE_WRITE_API_KEY is not set (a dedicated write key is required; ' +
      'the read key DUNE_READONLY_API_KEY/DUNE_API_KEY can never authorize a write)',
    );
  }

  if (isAutomatedEnv(env)) {
    reasons.push('running in an automated environment (CI / test) — execution is hard-blocked');
  }

  return { allowed: reasons.length === 0, reasons };
}

/**
 * Throw unless the execution gate is fully open.
 *
 * The message intentionally begins with "Dune query execution is disabled" so
 * existing guardrail assertions keep matching.
 * @param {Record<string, string|undefined>} env
 */
export function assertDuneExecutionAllowed(env = process.env) {
  const { allowed, reasons } = evaluateDuneExecution(env);
  if (allowed) return;
  throw new Error(
    'Dune query execution is disabled — it spends credits and/or mutates ' +
    'queries, so it is fail-closed by default. To unlock for a deliberate, ' +
    'one-off human action set ALL of: ALLOW_DUNE_EXECUTION=true, ' +
    `DUNE_EXECUTION_ACK=${ACK_PHRASE}, DUNE_WRITE_API_KEY=<write key>, and ` +
    'run outside CI/tests. Unmet: ' + reasons.join('; ') + '.',
  );
}

/**
 * Classify a Dune CLI invocation (argv array or a command string).
 * @param {string[]|string} argv
 * @returns {{ subcommand: string|null, mutating: boolean }}
 */
export function classifyDuneCommand(argv) {
  const parts = Array.isArray(argv)
    ? argv.slice()
    : String(argv).trim().split(/\s+/);

  // Drop a leading "dune" / "npx" / "node" wrapper token.
  while (parts.length && /^(dune|npx|node|--?\w[\w-]*)$/.test(parts[0]) && parts[0] !== 'query') {
    // keep going until we hit a non-flag, non-wrapper token
    if (/^--?/.test(parts[0])) { parts.shift(); continue; }
    if (parts[0] === 'dune' || parts[0] === 'npx' || parts[0] === 'node') { parts.shift(); continue; }
    break;
  }
  // Drop a leading "query" namespace token (e.g. `dune query execute`).
  if (parts[0] === 'query') parts.shift();

  const subcommand = parts.find(p => !/^--?/.test(p)) ?? null;
  const mutating = subcommand != null && DENYLISTED_DUNE_COMMANDS.includes(subcommand);
  return { subcommand, mutating };
}

/**
 * Throw if a Dune CLI command would spend credits / mutate a query and the
 * execution gate is not open.
 * @param {string[]|string} argv
 * @param {Record<string, string|undefined>} env
 */
export function assertDuneCommandAllowed(argv, env = process.env) {
  const { subcommand, mutating } = classifyDuneCommand(argv);
  if (!mutating) return;
  const { allowed, reasons } = evaluateDuneExecution(env);
  if (allowed) return;
  throw new Error(
    `Blocked Dune CLI command "${subcommand}" — it is on the credit-spend / ` +
    'mutation denylist and the execution gate is closed. ' +
    'Unmet: ' + reasons.join('; ') + '.',
  );
}
