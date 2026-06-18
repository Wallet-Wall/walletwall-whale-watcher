/**
 * Fixture: Stable Seer result.
 *
 * A trending token with rising volume and price momentum.  Note that this
 * result contains ONLY market-level data (volume, price, trend signals).
 * It does NOT include holder counts, whale breakdowns, or any wallet-level
 * analytics — those belong in HolderWallTile / HistoricalWalletBaseline.
 */

import { makeSourceMetadata, makeDataQuality } from '../source-metadata.js';
import { makeStableSeerResult } from '../stable-seer.js';

export const radarDuneSource = makeSourceMetadata({
  sourceId:        'dune-dex-volume-24h',
  sourceType:      'dune_scheduled',
  queryId:         'q_dex_volume_24h',
  fetchedAt:       '2026-05-01T07:00:00.000Z',
  isCached:        false,
});

export const radarCoinGeckoSource = makeSourceMetadata({
  sourceId:   'coingecko-price-feed',
  sourceType: 'coingecko',
  fetchedAt:  '2026-05-01T07:55:00.000Z',
  isCached:   true,
  cacheAgeSeconds: 300,
});

export const pepeSeerResult = makeStableSeerResult({
  tokenSymbol:        'PEPE',
  tokenAddress:       '0x6982508145454ce325ddbe47a25d4ec3d2311933',
  chain:              'ethereum',
  scanWindowStart:    '2026-04-30T07:00:00.000Z',
  scanWindowEnd:      '2026-05-01T07:00:00.000Z',
  volumeUSD:          148_700_000,
  volumeEstimated:    false,
  txCount:            24_312,
  priceUSD:           0.0000142,
  priceChangePercent: 18.4,
  trend:              'rising',
  trendSignals: [
    'DEX volume up 3.2× vs prior 24 h window',
    'Transaction count increased 78% in the past 6 h',
    'Price momentum positive across major DEX pairs',
  ],
  dataQuality: makeDataQuality({
    isEstimated: false,
    isPartial:   false,
    isFallback:  false,
    confidence:  'high',
    sources:     [radarDuneSource, radarCoinGeckoSource],
  }),
  source: radarDuneSource,
});
