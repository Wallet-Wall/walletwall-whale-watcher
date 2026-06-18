/**
 * NarrativeInput / NarrativeCard — AI-readable inputs and sourced narrative outputs.
 *
 * NarrativeInput bundles the signals and context that get passed to the AI layer
 * (api/analyze.js, api/chat.js).  NarrativeCard is the structured output that
 * components like WhaleWatcher render.
 *
 * Both carry full source provenance so the UI can display confidence levels and
 * data-freshness indicators rather than bare text.
 *
 * Hard rules:
 *   - NarrativeCard MUST NOT contain investment advice.
 *   - caveats MUST be non-empty before any card reaches the UI.
 *   - sources MUST list every SourceMetadata that contributed to the narrative.
 */

import { makeSourceMetadata } from './source-metadata.js';

/**
 * @typedef {'analytical'|'casual'} NarrativeTone
 * @typedef {'whale_watcher'|'defi_digest'|'staking_update'|'market_pulse'|'intel_brief'} CardType
 */

/**
 * @typedef {Object} NarrativeInput
 * @property {string}      walletAddress - Wallet address the narrative is about
 * @property {string}      chain         - Chain identifier
 * @property {import('./signals.js').WalletSignal[]}                      signals      - Signals driving this narrative
 * @property {import('./historical-baseline.js').HistoricalWalletBaseline|null} baseline - Historical context window
 * @property {import('./live-events.js').LiveWalletEvent[]}               recentEvents - Recent live events for context
 * @property {string[]}    focusTopics   - Topics to emphasise (e.g. ['defi', 'accumulation'])
 * @property {NarrativeTone|null} requestedTone - Preferred tone; null means the AI decides
 */

/**
 * @typedef {Object} NarrativeCard
 * @property {string}      cardId        - Unique card identifier
 * @property {string}      walletAddress - Wallet address this card describes
 * @property {string}      headline      - Short headline (≤120 chars)
 * @property {string}      body          - Narrative body text
 * @property {string[]}    keyPoints     - Bullet-point key facts (max 5)
 * @property {CardType}    cardType      - Card category for routing to the right UI component
 * @property {import('./source-metadata.js').ConfidenceLevel} confidence - Overall narrative confidence
 * @property {string[]}    caveats       - Required disclaimers — must be non-empty
 * @property {string}      generatedAt   - ISO 8601 generation timestamp
 * @property {import('./source-metadata.js').SourceMetadata[]} sources  - All sources used
 * @property {import('./signals.js').WalletSignal[]}           signals  - Signals that drove this card
 */

/**
 * Factory for NarrativeInput.
 *
 * @param {Partial<NarrativeInput>} partial
 * @returns {NarrativeInput}
 */
export function makeNarrativeInput(partial = {}) {
  return {
    walletAddress: partial.walletAddress ?? '0x0000000000000000000000000000000000000000',
    chain:         partial.chain         ?? 'ethereum',
    signals:       Array.isArray(partial.signals)      ? partial.signals      : [],
    baseline:      partial.baseline      ?? null,
    recentEvents:  Array.isArray(partial.recentEvents) ? partial.recentEvents : [],
    focusTopics:   Array.isArray(partial.focusTopics)  ? partial.focusTopics  : [],
    requestedTone: partial.requestedTone ?? null,
  };
}

/**
 * Factory for NarrativeCard.
 *
 * @param {Partial<NarrativeCard>} partial
 * @returns {NarrativeCard}
 */
export function makeNarrativeCard(partial = {}) {
  const DEFAULT_CAVEAT = 'This narrative is based on publicly available on-chain data and does not constitute financial or investment advice.';

  const caveats = Array.isArray(partial.caveats) && partial.caveats.length > 0
    ? partial.caveats
    : [DEFAULT_CAVEAT];

  return {
    cardId:        partial.cardId        ?? `card-${Date.now().toString(36)}`,
    walletAddress: partial.walletAddress ?? '0x0000000000000000000000000000000000000000',
    headline:      typeof partial.headline === 'string' ? partial.headline.slice(0, 120) : '',
    body:          partial.body          ?? '',
    keyPoints:     Array.isArray(partial.keyPoints) ? partial.keyPoints.slice(0, 5) : [],
    cardType:      partial.cardType      ?? 'intel_brief',
    confidence:    partial.confidence    ?? 'medium',
    caveats,
    generatedAt:   partial.generatedAt   ?? new Date().toISOString(),
    sources:       Array.isArray(partial.sources) ? partial.sources : [makeSourceMetadata({ sourceType: 'ai_narrative' })],
    signals:       Array.isArray(partial.signals) ? partial.signals : [],
  };
}
