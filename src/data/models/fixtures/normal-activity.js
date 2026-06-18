/**
 * Fixture: Normal wallet activity scenario.
 *
 * A regular DeFi user with moderate on-chain activity: token swaps, LP
 * management, and periodic staking.  Medium confidence because price data
 * for some smaller tokens required estimation.
 */

import { makeSourceMetadata, makeDataQuality } from '../source-metadata.js';
import { makeHistoricalWalletBaseline } from '../historical-baseline.js';
import { makeLiveWalletEvent } from '../live-events.js';
import { makeWalletSignal, makeSignalId } from '../signals.js';

const WALLET = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f';
const CHAIN  = 'ethereum';

const WINDOW_START = '2026-04-15T00:00:00.000Z';
const WINDOW_END   = '2026-05-01T00:00:00.000Z';

export const duneScheduledSource = makeSourceMetadata({
  sourceId:   'dune-normal-activity-apr',
  sourceType: 'dune_scheduled',
  queryId:    'q_wallet_activity_30d',
  fetchedAt:  '2026-05-01T03:00:00.000Z',
  isCached:   false,
});

export const normalBaseline = makeHistoricalWalletBaseline({
  walletAddress:        WALLET,
  chain:                CHAIN,
  baselineWindowStart:  WINDOW_START,
  baselineWindowEnd:    WINDOW_END,
  totalVolumeUSD:       87_400,
  totalVolumeEstimated: true,
  txCount:              34,
  uniqueCounterparties: 8,
  topTokenFlows: [
    { tokenSymbol: 'ETH',  tokenAddress: null,                                           volumeUSD: 41_000, volumeEstimated: false, direction: 'net', txCount: 12 },
    { tokenSymbol: 'LINK', tokenAddress: '0x514910771af9ca656af840dff83e8264ecf986ca', volumeUSD: 18_200, volumeEstimated: true,  direction: 'in',  txCount:  8 },
    { tokenSymbol: 'UNI',  tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', volumeUSD: 12_600, volumeEstimated: true,  direction: 'out', txCount:  6 },
    { tokenSymbol: 'USDC', tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', volumeUSD: 15_600, volumeEstimated: false, direction: 'net', txCount:  8 },
  ],
  topCounterparties: [
    { address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', label: 'Uniswap V2',   volumeUSD: 55_000, txCount: 18, counterpartyType: 'dex' },
    { address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', label: 'Aave V3',     volumeUSD: 22_000, txCount: 10, counterpartyType: 'protocol' },
  ],
  protocolUsage: [
    { protocolName: 'Uniswap V2', protocolAddress: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', protocolType: 'defi',    volumeUSD: 55_000, txCount: 18, attributionConfidence: 'high' },
    { protocolName: 'Aave V3',    protocolAddress: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', protocolType: 'staking', volumeUSD: 22_000, txCount: 10, attributionConfidence: 'high' },
  ],
  dataQuality: makeDataQuality({
    isEstimated: true, isPartial: false, isFallback: false,
    confidence: 'medium',
    warnings: ['Price data for LINK and UNI estimated from nearest available CoinGecko snapshot.'],
    sources: [duneScheduledSource],
  }),
  source: duneScheduledSource,
});

export const normalLiveEvent = makeLiveWalletEvent({
  txHash:              '0xdef789abc123def789abc123def789abc123def789abc123def789abc123def7',
  walletAddress:       WALLET,
  chain:               CHAIN,
  timestamp:           '2026-05-01T09:12:44.000Z',
  eventType:           'swap',
  valueUSD:            1_840,
  valueEstimated:      false,
  tokenSymbol:         'LINK',
  counterpartyAddress: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
  counterpartyLabel:   'Uniswap V2',
  dataQuality:         makeDataQuality({ confidence: 'high' }),
  source: makeSourceMetadata({ sourceId: 'etherscan-live', sourceType: 'etherscan', fetchedAt: '2026-05-01T09:15:00.000Z' }),
});

export const normalActivitySignal = makeWalletSignal({
  signalId:      makeSignalId(WALLET, 'protocol_entry', WINDOW_START),
  walletAddress: WALLET,
  chain:         CHAIN,
  signalType:    'protocol_entry',
  strength:      'medium',
  confidence:    'medium',
  windowStart:   WINDOW_START,
  windowEnd:     WINDOW_END,
  detectedAt:    '2026-05-01T10:00:00.000Z',
  evidence: {
    newProtocols:    ['Aave V3'],
    firstAaveDate:   '2026-04-17T00:00:00.000Z',
    aaveVolumeUSD:   22_000,
  },
  caveats: [
    'LINK and UNI volumes are estimated; exact values may differ.',
    'Protocol attribution based on known contract addresses only.',
  ],
  dataQuality: makeDataQuality({ isEstimated: true, confidence: 'medium', sources: [duneScheduledSource] }),
  sources: [duneScheduledSource],
});
