import { ethers } from 'ethers';
import { buildDataQuality } from './wallet-contract.js';
import { buildTransactionSample, computeDelta7d, computeFingerprintScore } from './_wallet-helpers.js';
import { getOrCache } from './_dune.js';
import { sanitizeLabel } from './_sanitize.js';
import { makeProviderResult } from './_wallet-providers.js';
import { withProviderCache } from './_provider-cache.js';
import { recordProviderCall } from './_provider-telemetry.js';
import { getRedisConfig } from './_ratelimit.js';

const TX_SAMPLE_LIMIT = 200;
const ENRICHMENT_BUDGET_MS = 7000;

function providerUnavailable(source, action = 'request') {
  return { source, message: `${action} unavailable`, severity: 'partial' };
}

const PROTOCOL_MAP = {
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": { name: "Uniswap V2", type: "defi", color: "#FF007A" },
  "0xe592427a0aece92de3edee1f18e0157c05861564": { name: "Uniswap V3", type: "defi", color: "#FF007A" },
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": { name: "Uniswap Universal", type: "defi", color: "#FF007A" },
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": { name: "Uniswap Universal Router", type: "defi", color: "#FF007A" },
  "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": { name: "Aave V3", type: "defi", color: "#B6509E" },
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": { name: "Aave V2", type: "defi", color: "#B6509E" },
  "0x00000000219ab540356cbb839cbe05303d7705fa": { name: "ETH2 Staking", type: "defi", color: "#627EEA" },
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": { name: "0x Exchange", type: "defi", color: "#2D9CDB" },
  "0x1111111254eeb25477b68fb85ed929f73a960582": { name: "1inch V5", type: "defi", color: "#1B314F" },
  "0x1111111254760f7ab3f16433eea9304126dcd199": { name: "1inch V4", type: "defi", color: "#1B314F" },
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": { name: "SushiSwap", type: "defi", color: "#FA52A0" },
  "0xbeef01735c132ada46aa9aa4c54623caa92a64cb": { name: "Curve Finance", type: "defi", color: "#C4A200" },
  "0xd51a44d3fae010294c616388b506acda1bfaae46": { name: "Curve Tricrypto", type: "defi", color: "#C4A200" },
  "0xba12222222228d8ba445958a75a0704d566bf2c8": { name: "Balancer V2", type: "defi", color: "#1E1E1E" },
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": { name: "Lido stETH", type: "defi", color: "#00A3FF" },
  "0x889edc2edab5f40e902b864ad4d7ade8e412f9b1": { name: "Lido Withdrawal", type: "defi", color: "#00A3FF" },
  "0xdd3f50f8a6cafbe9b31a427582963f465e745af8": { name: "Rocket Pool", type: "defi", color: "#E8742A" },
  "0xa17581a9e3356d9a858b789d68b4d866e593ae94": { name: "Compound V3", type: "defi", color: "#00D395" },
  "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b": { name: "Compound V2", type: "defi", color: "#00D395" },
  "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb": { name: "Frax Finance", type: "defi", color: "#000000" },
  "0xf403c135812408bfbe8713b5a23a04b3d48aae31": { name: "Convex Finance", type: "defi", color: "#FF5A1F" },
  "0xfc89b519658967fcbe1f525f1b8f4bf62d9b9018": { name: "GMX", type: "defi", color: "#1D51C9" },
  "0x0000000000a39bb272e79075ade125fd351887ac": { name: "Blur", type: "nft", color: "#FF8700" },
  "0x00000000000000adc04c56bf30ac9d3c0aaf14dc": { name: "Seaport 1.5", type: "nft", color: "#2081E2" },
  "0x59728544b08ab483533076417fbbb2fd0b17ce3a": { name: "LooksRare", type: "nft", color: "#0CE466" },
  "0x00000000006c3852cbef3e08e8df289169ede581": { name: "Seaport 1.1", type: "nft", color: "#2081E2" },
};

const SANCTIONS = new Set([
  "0x8589427373d6d84e98730d7795d8f6f8731fda16",
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b",
  "0x722122df12d4e14e13ac3b6895a86e84145b6967",
]);

const GRAPH_HOSTED  = 'https://api.thegraph.com/subgraphs/name';
const GRAPH_GATEWAY = 'https://gateway.thegraph.com/api';

const SUBGRAPH_IDS = {
  uniswapV3: '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
  aaveV3:    'Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL87g',
};

async function fetchWithTimeout(url, fetchImpl, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetchImpl(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

function detectAnomalies(transactions) {
  const anomalies = [];
  const amounts = transactions
    .map(t => Number(t.valueUSD))
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const median = amounts[Math.floor(amounts.length / 2)] || 0;

  transactions.forEach(tx => {
    if (median > 0 && tx.valueUSD > median * 10 && tx.valueUSD > 1000) {
      anomalies.push({
        type: "large_tx", severity: "medium",
        description: `Single tx of $${Math.round(tx.valueUSD).toLocaleString()} — ${Math.round(tx.valueUSD / median)}x the median`,
        date: tx.timeStamp
      });
    }
  });

  const sorted = [...transactions].sort((a, b) => Number(a.timeStamp) - Number(b.timeStamp));
  for (let i = 1; i < sorted.length; i++) {
    const gap = Number(sorted[i].timeStamp) - Number(sorted[i - 1].timeStamp);
    if (gap > 90 * 86400 && sorted[i].valueUSD > 5000) {
      anomalies.push({
        type: "dormancy_break", severity: "low",
        description: `${Math.round(gap / 86400)}-day dormancy followed by $${Math.round(sorted[i].valueUSD).toLocaleString()} move`,
        date: sorted[i].timeStamp
      });
    }
  }

  transactions.forEach(tx => {
    if (SANCTIONS.has(tx.to?.toLowerCase())) {
      anomalies.push({
        type: "sanctions", severity: "high",
        description: `Interaction with sanctioned address ${tx.to?.slice(0, 10)}...`,
        date: tx.timeStamp
      });
    }
  });

  return anomalies;
}

function findOpportunities(nodes, transactions) {
  const opportunities = [];
  const stables = nodes.filter(n => ["USDC", "USDT", "DAI"].includes(n.label));
  const hasNoYield = !nodes.some(n => ["Aave", "Compound", "Morpho"].some(p => n.label.includes(p)));
  if (stables.length && hasNoYield) {
    const idle = stables.reduce((sum, n) => sum + (n.balanceUSD || 0), 0);
    if (idle > 100) {
      opportunities.push({
        type: "yield", nodeId: stables[0].id,
        description: `$${Math.round(idle).toLocaleString()} in idle stablecoins could earn roughly 4.2% APY on Morpho Blue`,
        impactUSD: Math.round(idle * 0.042), estimated: true
      });
    }
  }
  const totalOverpaid = transactions.reduce((sum, tx) => {
    const paidGwei = Number(tx.gasPrice || 0) / 1e9;
    if (paidGwei > 15 * 1.5) return sum + ((paidGwei - 15) * Number(tx.gasUsed || 21000) * 1e-9 * 2500);
    return sum;
  }, 0);
  if (totalOverpaid > 50) {
    opportunities.push({
      type: "gas",
      description: `Estimated $${Math.round(totalOverpaid)} overpaid in gas vs a rough 15 gwei median — try off-peak hours or Flashbots Protect`,
      impactUSD: Math.round(totalOverpaid), estimated: true
    });
  }
  return opportunities;
}

async function fetchDuneData(address, { duneApiKey, duneQueryDexId, duneDeXCacheTtl = 900 }) {
  if (!duneApiKey || !duneQueryDexId?.trim()) return { dexTrades: [], sources: [] };

  try {
    const { rows, fromCache } = await getOrCache(
      duneQueryDexId,
      { wallet_address: address.toLowerCase() },
      { ttlSeconds: duneDeXCacheTtl }
    );
    // Filter snapshot rows to those matching this wallet address.
    const addrLc = address.toLowerCase();
    const walletRows = rows.filter(r =>
      String(r.wallet_address ?? r.taker ?? '').toLowerCase() === addrLc
    );
    console.info(`[wallet] Dune DEX trades: ${walletRows.length} rows (${fromCache ? 'cache hit' : 'latest snapshot'})`);
    return {
      dexTrades: walletRows,
      sources:   walletRows.length ? ['dune:dex-trades'] : [],
    };
  } catch (e) {
    console.warn('[wallet] Dune fetch failed (graceful degradation):', e.message);
    return { dexTrades: [], sources: [] };
  }
}

function graphEndpoint(hostedPath, subgraphId, graphApiKey) {
  if (graphApiKey && subgraphId) return `${GRAPH_GATEWAY}/${graphApiKey}/subgraphs/id/${subgraphId}`;
  return `${GRAPH_HOSTED}/${hostedPath}`;
}

async function queryGraph(endpoint, query, fetchImpl, variables = {}) {
  const startedAt = Date.now();
  let res;
  try {
    res = await fetchWithTimeout(endpoint, fetchImpl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    }, 8000);
  } catch (e) {
    recordProviderCall('thegraph', { ms: Date.now() - startedAt, ok: false });
    throw e;
  }
  recordProviderCall('thegraph', { ms: Date.now() - startedAt, ok: res.ok, status: res.status });
  if (!res.ok) throw new Error(`Graph HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function fetchGraphData(address, graphApiKey, fetchImpl) {
  const addr = address.toLowerCase();
  const out = {
    uniswapSwaps: [],
    aaveDeposits: [],
    aaveBorrows: [],
    ownedENSNames: [],
    sources: [],
  };

  await Promise.allSettled([
    ...(graphApiKey ? [
      queryGraph(
        graphEndpoint('uniswap/uniswap-v3', SUBGRAPH_IDS.uniswapV3, graphApiKey),
        `query($addr:String!,$skip:Int!){
          swaps(where:{origin:$addr},orderBy:timestamp,orderDirection:desc,first:200,skip:$skip){
            timestamp amountUSD
            token0{symbol} token1{symbol}
            pool{feeTier}
          }
        }`,
        fetchImpl,
        { addr, skip: 0 }
      ).then(d => {
        out.uniswapSwaps = d?.swaps || [];
        if (out.uniswapSwaps.length) out.sources.push('graph:uniswap-v3');
      }),
      queryGraph(
        graphEndpoint('aave/protocol-v3', SUBGRAPH_IDS.aaveV3, graphApiKey),
        `query($addr:String!){
          deposits(where:{caller:$addr},orderBy:timestamp,orderDirection:desc,first:100){
            timestamp amountUSD reserve{symbol}
          }
          borrows(where:{user:$addr},orderBy:timestamp,orderDirection:desc,first:100){
            timestamp amountUSD reserve{symbol}
          }
        }`,
        fetchImpl,
        { addr }
      ).then(d => {
        out.aaveDeposits = d?.deposits || [];
        out.aaveBorrows  = d?.borrows  || [];
        if (out.aaveDeposits.length || out.aaveBorrows.length) out.sources.push('graph:aave-v3');
      }),
    ] : []),

    queryGraph(
      `${GRAPH_HOSTED}/ensdomains/ens`,
      `query($addr:String!){
        account(id:$addr){
          registrations(first:20,orderBy:registrationDate,orderDirection:desc){
            domain{ name }
            expiryDate
          }
        }
      }`,
      fetchImpl,
      { addr }
    ).then(d => {
      out.ownedENSNames = (d?.account?.registrations || [])
        .map(r => ({ name: r.domain?.name, expiryDate: r.expiryDate }))
        .filter(r => r.name);
      if (out.ownedENSNames.length) out.sources.push('graph:ens');
    }),
  ]);

  return out;
}

function buildTokenPriceMap(prices, ethPrice) {
  return {
    'ETH':   ethPrice,
    'WETH':  ethPrice,
    'USDC':  prices['usd-coin']?.usd        || 1,
    'USDT':  prices['tether']?.usd          || 1,
    'DAI':   prices['dai']?.usd             || 1,
    'WBTC':  prices['wrapped-bitcoin']?.usd || 65000,
    'UNI':   prices['uniswap']?.usd         || 10,
    'AAVE':  prices['aave']?.usd            || 150,
    'LINK':  prices['chainlink']?.usd       || 15,
    'MKR':   prices['maker']?.usd           || 2000,
    'LDO':   prices['lido-dao']?.usd        || 2,
    'STETH': ethPrice,
    'CBETH': ethPrice * 0.99,
    'RETH':  ethPrice * 1.05,
  };
}

async function fetchEtherscanWalletData(address, etherscanKey, esBase, fetchImpl, elapsed) {
  if (!etherscanKey) {
    return {
      ethTxs: [], tokenTxs: [], ethBalanceWei: '0',
      errors: [providerUnavailable('provider_config', 'Wallet activity provider')],
    };
  }

  async function esGet(params) {
    const url = `${esBase}?${new URLSearchParams({ ...params, chainid: 1, apikey: etherscanKey })}`;
    const startedAt = Date.now();
    let r;
    try {
      r = await fetchWithTimeout(url, fetchImpl, {}, 8000);
    } catch (e) {
      recordProviderCall('etherscan', { ms: Date.now() - startedAt, ok: false });
      throw e;
    }
    recordProviderCall('etherscan', { ms: Date.now() - startedAt, ok: r.ok, status: r.status });
    if (!r.ok) throw new Error(`Etherscan HTTP ${r.status}`);
    const j = await r.json();
    if (j.status === '0') {
      if (j.message === 'No transactions found') return j.result;
      throw new Error('Etherscan response unavailable');
    }
    return j.result;
  }

  console.info(`[wallet-api] etherscan:start at ${elapsed()}ms`);
  const [balanceResult, txResult, tokenResult] = await Promise.allSettled([
    esGet({ module: 'account', action: 'balance', address, tag: 'latest' }),
    esGet({ module: 'account', action: 'txlist', address, sort: 'desc', offset: TX_SAMPLE_LIMIT, page: 1 }),
    esGet({ module: 'account', action: 'tokentx', address, sort: 'desc', offset: TX_SAMPLE_LIMIT, page: 1 }),
  ]);

  let ethBalanceWei = '0', ethTxs = [], tokenTxs = [];
  const errors = [];

  if (balanceResult.status === 'fulfilled') ethBalanceWei = balanceResult.value;
  else errors.push(providerUnavailable('etherscan', 'Balance lookup'));
  if (txResult.status === 'fulfilled') ethTxs = txResult.value || [];
  else errors.push(providerUnavailable('etherscan', 'Transaction history'));
  if (tokenResult.status === 'fulfilled') tokenTxs = tokenResult.value || [];
  else errors.push(providerUnavailable('etherscan', 'Token transfer history'));

  console.info(`[wallet-api] etherscan:done at ${elapsed()}ms — txs:${ethTxs.length} tokens:${tokenTxs.length}`);
  return { ethTxs, tokenTxs, ethBalanceWei, errors };
}

async function fetchAlchemyWalletData(address, alchemyKey, fetchImpl, elapsed) {
  if (!alchemyKey) return { isContract: null, errors: [] };

  console.info(`[wallet-api] alchemy:start at ${elapsed()}ms`);
  const errors = [];
  let isContract = null;
  const alchemyStartedAt = Date.now();
  try {
    const alchemyBase = `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    const [tokRes, nftRes, codeRes] = await Promise.allSettled([
      fetchWithTimeout(alchemyBase, fetchImpl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params: [address, 'erc20'] })
      }, 8000),
      fetchWithTimeout(`https://eth-mainnet.g.alchemy.com/nft/v3/${alchemyKey}/getNFTsForOwner?owner=${address}&withMetadata=false&pageSize=20`, fetchImpl, {}, 8000),
      fetchWithTimeout(alchemyBase, fetchImpl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
      }, 5000),
    ]);
    if (tokRes.status === 'fulfilled' && tokRes.value?.ok) {
      await tokRes.value.json();
    }
    if (nftRes.status === 'fulfilled' && nftRes.value?.ok) {
      await nftRes.value.json();
    }
    if (codeRes.status === 'fulfilled' && codeRes.value?.ok) {
      const codeData = await codeRes.value.json();
      const code = codeData?.result;
      if (typeof code === 'string') isContract = code !== '0x';
    }
    const anyOk = [tokRes, nftRes, codeRes].some(r => r.status === 'fulfilled' && r.value?.ok);
    recordProviderCall('alchemy', { ms: Date.now() - alchemyStartedAt, ok: anyOk });
  } catch {
    recordProviderCall('alchemy', { ms: Date.now() - alchemyStartedAt, ok: false });
    errors.push(providerUnavailable('alchemy', 'Alchemy enrichment'));
  }
  console.info(`[wallet-api] alchemy:done at ${elapsed()}ms — isContract:${isContract}`);
  return { isContract, errors };
}

async function fetchCoinGeckoPrices(coingeckoKey, fetchImpl, elapsed) {
  console.info(`[wallet-api] coingecko:start at ${elapsed()}ms`);
  const defaultPriceSource = coingeckoKey ? 'fallback' : 'estimated';
  const coinIds = 'ethereum,usd-coin,wrapped-bitcoin,dai,tether,lido-dao,uniswap,aave,chainlink,maker';
  const cgUrl = new URL('https://api.coingecko.com/api/v3/simple/price');
  cgUrl.searchParams.set('ids', coinIds);
  cgUrl.searchParams.set('vs_currencies', 'usd');
  const cgOptions = coingeckoKey ? { headers: { 'x-cg-demo-api-key': coingeckoKey } } : {};
  let result = { prices: {}, priceSource: defaultPriceSource, error: null };
  const cgStartedAt = Date.now();
  try {
    const pgRes = await fetchWithTimeout(cgUrl.toString(), fetchImpl, cgOptions, 8000);
    recordProviderCall('coingecko', { ms: Date.now() - cgStartedAt, ok: pgRes.ok, status: pgRes.status });
    if (pgRes.ok) {
      result = { prices: await pgRes.json(), priceSource: 'coingecko', error: null };
    }
  } catch {
    recordProviderCall('coingecko', { ms: Date.now() - cgStartedAt, ok: false });
    result = {
      prices: {},
      priceSource: defaultPriceSource,
      error: { source: 'coingecko', message: 'Price data unavailable', severity: 'partial' },
    };
  }
  console.info(`[wallet-api] coingecko:done at ${elapsed()}ms`);
  return result;
}

function computeDataConfidence(txCount) {
  if (txCount > 50) return 'HIGH';
  if (txCount > 10) return 'MED';
  return 'LOW';
}

// ── Extracted helpers — reduce cognitive complexity of liveWalletProvider (S3776) ──

function computeTokenUSD(sym, rawValue, decimals, tokenPrices) {
  const dec = Number.parseInt(decimals, 10);
  if (!Number.isFinite(dec) || dec < 0 || dec > 30) return 0;
  const amount = Number(rawValue) / Math.pow(10, dec);
  if (!Number.isFinite(amount)) return 0;
  const price = tokenPrices[sym?.toUpperCase()];
  if (!price) return 0;
  return Math.min(amount * price, 1e10);
}

function buildTokenMap(tokenTxs, address, tokenPrices) {
  const tokenMap = {};
  tokenTxs.forEach(tx => {
    const rawSym = tx.tokenSymbol || 'UNKNOWN';
    const { label: sym, spam } = sanitizeLabel(rawSym);
    const id = `token_${(spam ? 'spam_' + rawSym.slice(0, 8) : sym).toLowerCase().replace(/\W+/g, '_')}`;
    if (!tokenMap[id]) {
      tokenMap[id] = {
        id, label: sym, type: 'token', color: '#627EEA',
        volumeUSD: 0, volumeEstimated: true, interactions: 0,
        riskScore: spam ? 9 : 0.8, balanceUSD: null, priceUSD: null, priceUnavailable: false,
        spam: spam || false,
        firstSeen: tx.timeStamp, lastActive: tx.timeStamp,
        protocolAttributionConfidence: 'medium',
        timeline: {}, topCounterparties: {}, anomalies: [], opportunities: [],
      };
    }
    if (spam) { tokenMap[id].interactions++; return; }
    const node = tokenMap[id];
    const ts = Number.parseInt(tx.timeStamp, 10);
    const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
    if (!node.timeline[dateStr]) node.timeline[dateStr] = { date: dateStr, volumeUSD: 0, txCount: 0, estimated: true };
    const val = computeTokenUSD(sym, tx.value, tx.tokenDecimal, tokenPrices);
    node.volumeEstimated = !tokenPrices[sym?.toUpperCase()];
    node.priceUnavailable = !tokenPrices[sym?.toUpperCase()];
    node.timeline[dateStr].volumeUSD += val;
    node.timeline[dateStr].txCount += 1;
    node.volumeUSD += val;
    node.interactions++;
    node.lastActive = Math.max(node.lastActive, ts);
    node.firstSeen = Math.min(node.firstSeen, ts);
    const cpKey = (tx.to?.toLowerCase() === address.toLowerCase() ? tx.from : tx.to)?.toLowerCase();
    if (!cpKey) return;
    if (!node.topCounterparties[cpKey]) {
      node.topCounterparties[cpKey] = { address: cpKey, label: PROTOCOL_MAP[cpKey]?.name || cpKey.slice(0, 10) + '...', volumeUSD: 0 };
    }
    node.topCounterparties[cpKey].volumeUSD += val;
  });
  return tokenMap;
}

function buildProtocolMap(allTxs) {
  const protocolMap = {};
  allTxs.forEach(tx => {
    const proto = PROTOCOL_MAP[tx.to?.toLowerCase()];
    if (!proto) return;
    const id = `protocol_${proto.name.toLowerCase().replace(/\s+/g, '_')}`;
    if (!protocolMap[id]) {
      protocolMap[id] = {
        id, label: proto.name, type: proto.type, color: proto.color,
        volumeUSD: 0, volumeEstimated: true, interactions: 0,
        riskScore: 1, balanceUSD: null, priceUSD: null,
        protocolAttributionConfidence: 'high',
        firstSeen: tx.timeStamp, lastActive: tx.timeStamp,
        timeline: {}, topCounterparties: {}, anomalies: [], opportunities: [],
      };
    }
    const node = protocolMap[id];
    const dateStr = new Date(tx.timeStamp * 1000).toISOString().slice(0, 10);
    if (!node.timeline[dateStr]) node.timeline[dateStr] = { date: dateStr, volumeUSD: 0, txCount: 0, estimated: true };
    node.timeline[dateStr].volumeUSD += tx.valueUSD || 0;
    node.timeline[dateStr].txCount += 1;
    node.volumeUSD += tx.valueUSD || 0;
    node.interactions++;
    node.lastActive = Math.max(node.lastActive, tx.timeStamp);
    node.firstSeen = Math.min(node.firstSeen, tx.timeStamp);
  });
  return protocolMap;
}

function buildCounterpartyNodes(tokenMap, address) {
  const counterpartyMap = {};
  Object.values(tokenMap).forEach(tokenNode => {
    Object.entries(tokenNode.topCounterparties).forEach(([addrLc, cp]) => {
      if (PROTOCOL_MAP[addrLc]) return;
      if (addrLc === address.toLowerCase()) return;
      const cpId = 'cp_' + addrLc.slice(2, 12);
      if (!counterpartyMap[cpId]) {
        counterpartyMap[cpId] = {
          id: cpId,
          label: addrLc.slice(0, 6) + '…' + addrLc.slice(-4),
          fullAddress: addrLc,
          type: 'counterparty', color: '#94A3B8',
          volumeUSD: 0, volumeEstimated: true, interactions: 0, riskScore: 0,
          balanceUSD: null, priceUSD: null, firstSeen: null, lastActive: null,
          protocolAttributionConfidence: 'low',
          timeline: [], topCounterparties: [], anomalies: [], opportunities: [],
          _tokenLinks: {},
        };
      }
      counterpartyMap[cpId].volumeUSD += cp.volumeUSD || 0;
      counterpartyMap[cpId].interactions++;
      counterpartyMap[cpId]._tokenLinks[tokenNode.id] =
        (counterpartyMap[cpId]._tokenLinks[tokenNode.id] || 0) + (cp.volumeUSD || 0);
    });
  });
  return Object.values(counterpartyMap)
    .filter(cp => cp.volumeUSD > 50 || cp.interactions > 1)
    .sort((a, b) => b.volumeUSD - a.volumeUSD)
    .slice(0, 10);
}

function buildGraphEdges(nodes, topCounterpartyNodes) {
  const edges = [];
  nodes.filter(n => n.type === 'token').forEach(tokenNode => {
    if (tokenNode.volumeUSD > 0 || tokenNode.interactions > 0) {
      edges.push({
        source: 'focal_wallet', target: tokenNode.id,
        weightUSD: Math.round(tokenNode.volumeUSD || tokenNode.interactions * 10),
        txCount: tokenNode.interactions,
      });
    }
  });
  nodes.filter(n => n.type === 'defi' || n.type === 'nft').forEach(proto => {
    ['eth', ...nodes.filter(n => n.type === 'token').map(n => n.id)].forEach(tokenId => {
      const tokenNode = nodes.find(n => n.id === tokenId);
      if (!tokenNode) return;
      const vol = Math.min(tokenNode.volumeUSD, proto.volumeUSD) * 0.4;
      if (vol > 100) edges.push({ source: tokenId, target: proto.id, weightUSD: Math.round(vol), txCount: Math.round(proto.interactions * 0.3) });
    });
  });
  topCounterpartyNodes.forEach(cp => {
    if (!nodes.some(n => n.id === cp.id)) return;
    Object.entries(cp._tokenLinks || {}).forEach(([tokenId, vol]) => {
      if (nodes.some(n => n.id === tokenId) && vol > 50) {
        edges.push({ source: tokenId, target: cp.id, weightUSD: Math.round(vol), txCount: 1 });
      }
    });
  });
  return edges;
}

function applyGraphEnrichment(nodes, graphData) {
  if (graphData.uniswapSwaps.length) {
    const uniNode = nodes.find(n => n.label.includes('Uniswap V3'));
    if (uniNode) {
      const graphVol = graphData.uniswapSwaps.reduce((s, sw) => s + Number.parseFloat(sw.amountUSD || 0), 0);
      if (graphVol > uniNode.volumeUSD) { uniNode.volumeUSD = Math.round(graphVol); uniNode.volumeEstimated = false; }
      uniNode.interactions = Math.max(uniNode.interactions, graphData.uniswapSwaps.length);
      uniNode.graphEnriched = true;
      const pairCounts = {};
      graphData.uniswapSwaps.forEach(sw => {
        const pair = `${sw.token0?.symbol}/${sw.token1?.symbol}`;
        pairCounts[pair] = (pairCounts[pair] || 0) + 1;
      });
      uniNode.topPairs = Object.entries(pairCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([pair, count]) => ({ pair, count }));
    }
  }
  if (graphData.aaveDeposits.length || graphData.aaveBorrows.length) {
    const aaveNode = nodes.find(n => n.label.includes('Aave'));
    if (aaveNode) {
      const depVol = graphData.aaveDeposits.reduce((s, d) => s + Number.parseFloat(d.amountUSD || 0), 0);
      const borVol = graphData.aaveBorrows.reduce((s, b) => s + Number.parseFloat(b.amountUSD || 0), 0);
      const totalVol = depVol + borVol;
      if (totalVol > aaveNode.volumeUSD) { aaveNode.volumeUSD = Math.round(totalVol); aaveNode.volumeEstimated = false; }
      aaveNode.interactions = Math.max(aaveNode.interactions, graphData.aaveDeposits.length + graphData.aaveBorrows.length);
      aaveNode.graphEnriched = true;
      aaveNode.aaveDeposits = graphData.aaveDeposits.slice(0, 10).map(d => ({
        asset: d.reserve?.symbol, amountUSD: Math.round(Number.parseFloat(d.amountUSD || 0)),
        date: new Date(Number.parseInt(d.timestamp) * 1000).toISOString().slice(0, 10),
      }));
      aaveNode.aaveBorrows = graphData.aaveBorrows.slice(0, 10).map(b => ({
        asset: b.reserve?.symbol, amountUSD: Math.round(Number.parseFloat(b.amountUSD || 0)),
        date: new Date(Number.parseInt(b.timestamp) * 1000).toISOString().slice(0, 10),
      }));
    }
  }
}

function applyDuneEnrichment(nodes, duneData, apiErrors) {
  if (!duneData.dexTrades.length) return;
  const duneByProject = new Map();
  duneData.dexTrades.forEach(t => {
    const proj = t.project?.toLowerCase() ?? '';
    if (!proj) return;
    if (!duneByProject.has(proj)) duneByProject.set(proj, { vol: 0, count: 0, pairs: new Map() });
    const stats = duneByProject.get(proj);
    stats.vol   += Number.parseFloat(t.amount_usd || 0);
    stats.count += 1;
    const pair = `${t.token_bought_symbol}/${t.token_sold_symbol}`;
    stats.pairs.set(pair, (stats.pairs.get(pair) || 0) + 1);
  });
  nodes.forEach(node => {
    const labelLower = node.label.toLowerCase();
    const match = [...duneByProject.entries()].find(([proj]) => labelLower.includes(proj));
    if (!match) return;
    const [, stats] = match;
    if (stats.vol > node.volumeUSD) { node.volumeUSD = Math.round(stats.vol); node.volumeEstimated = false; }
    node.interactions = Math.max(node.interactions, stats.count);
    node.duneEnriched  = true;
    node.topPairs = [...stats.pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([pair, count]) => ({ pair, count }));
  });
  apiErrors.push({
    source: 'dune',
    message: `Enriched with: ${duneData.sources.join(', ')} (${duneData.dexTrades.length} trades across ${duneByProject.size} DEXes)`,
    severity: 'info',
  });
}

async function runEnrichment({ address, alchemyKey, graphApiKey, fetchImpl, duneApiKey, duneQueryDexId, duneDeXCacheTtl, elapsed, apiErrors }) {
  let ens       = null;
  let graphData = { uniswapSwaps: [], aaveDeposits: [], aaveBorrows: [], ownedENSNames: [], sources: [] };
  let duneData  = { dexTrades: [], sources: [] };

  if (elapsed() > ENRICHMENT_BUDGET_MS) {
    console.info(`[wallet-api] enrichment:skipped at ${elapsed()}ms (budget ${ENRICHMENT_BUDGET_MS}ms exceeded)`);
    apiErrors.push({ source: 'enrichment', message: 'Skipped optional enrichment to keep wallet lookup responsive.', severity: 'info' });
  } else {
    console.info(`[wallet-api] enrichment:start at ${elapsed()}ms`);
    await Promise.allSettled([
      alchemyKey
        ? new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`)
            .lookupAddress(address).then(n => { ens = n; }).catch(() => {})
        : Promise.resolve(),
      fetchGraphData(address, graphApiKey, fetchImpl).then(d => { graphData = d; }).catch(() => {}),
      fetchDuneData(address, { duneApiKey, duneQueryDexId, duneDeXCacheTtl }).then(d => { duneData = d; }).catch(() => {}),
    ]);
    console.info(`[wallet-api] enrichment:done at ${elapsed()}ms`);
  }
  return { ens, graphData, duneData };
}

function computeOverallRiskScore(anomalies) {
  if (anomalies.some(a => a.severity === 'high')) return 7;
  if (anomalies.some(a => a.severity === 'medium')) return 4;
  return 2;
}

function applyAnomaliesAndOpportunities(nodes, anomalies, opportunities) {
  const primaryNode = nodes.find(n => n.id === 'eth') || nodes[0];
  if (primaryNode && anomalies.length) {
    primaryNode.anomalies = [...(primaryNode.anomalies || []), ...anomalies];
  }
  for (const opp of opportunities) {
    const target = (opp.nodeId && nodes.find(n => n.id === opp.nodeId))
      || nodes.find(n => n.id === 'eth')
      || nodes[0];
    if (target) target.opportunities = [...(target.opportunities || []), opp];
  }
}

function buildProviderWarnings(transactionSample, tokenTxs, usingFallbackPrices, apiErrors) {
  return [
    transactionSample.isSampled ? `Loaded latest ${transactionSample.loadedCount} normal transactions; totals may be partial.` : null,
    tokenTxs.length >= TX_SAMPLE_LIMIT ? `Loaded latest ${tokenTxs.length} token transfers; token interaction totals may be partial.` : null,
    usingFallbackPrices ? 'Some USD values use fallback or estimated prices.' : null,
    ...apiErrors.filter(e => e.severity === 'partial' || e.severity === 'error').map(e => `${e.source}: ${e.message}`),
  ];
}

export async function liveWalletProvider({
  address,
  keys = {},
  fetchImpl = globalThis.fetch,
  timing = {},
}) {
  const startedAt = timing.startedAt ?? Date.now();
  const elapsed = () => Date.now() - startedAt;

  const {
    etherscanKey,
    alchemyKey,
    coingeckoKey,
    graphApiKey,
    duneApiKey,
    duneQueryDexId,
    duneDeXCacheTtl = 900,
  } = keys;

  const esBase = `https://api.etherscan.io/v2/api`;

  const esData   = await fetchEtherscanWalletData(address, etherscanKey, esBase, fetchImpl, elapsed);
  const alchData = await fetchAlchemyWalletData(address, alchemyKey, fetchImpl, elapsed);
  const tProvider = elapsed();

  const cgData   = await fetchCoinGeckoPrices(coingeckoKey, fetchImpl, elapsed);
  const tCoingecko = elapsed();

  const isContract = alchData.isContract;
  const apiErrors = [...esData.errors, ...alchData.errors];
  if (cgData.error) apiErrors.push(cgData.error);

  const { ethTxs, tokenTxs, ethBalanceWei } = esData;
  const { prices, priceSource } = cgData;

  const ethPrice = prices['ethereum']?.usd || 3500;
  const ethBalance = Number.parseInt(ethBalanceWei, 10) / 1e18 || 0;

  const TOKEN_PRICES = buildTokenPriceMap(prices, ethPrice);

  const allTxs = ethTxs.map(tx => ({
    hash: tx.hash, from: tx.from, to: tx.to,
    valueETH: Number.parseInt(tx.value, 10) / 1e18,
    valueUSD: (Number.parseInt(tx.value, 10) / 1e18) * ethPrice,
    estimated: true,
    gasPrice: Number.parseInt(tx.gasPrice, 10),
    gasUsed: Number.parseInt(tx.gasUsed, 10),
    timeStamp: Number.parseInt(tx.timeStamp, 10)
  }));
  const transactionSample = buildTransactionSample(allTxs, TX_SAMPLE_LIMIT);

  const tokenMap = buildTokenMap(tokenTxs, address, TOKEN_PRICES);
  const protocolMap = buildProtocolMap(allTxs);

  const ethTimeline = {};
  allTxs.forEach(tx => {
    const dateStr = new Date(tx.timeStamp * 1000).toISOString().slice(0, 10);
    if (!ethTimeline[dateStr]) ethTimeline[dateStr] = { date: dateStr, volumeUSD: 0, txCount: 0, estimated: true };
    ethTimeline[dateStr].volumeUSD += tx.valueUSD || 0;
    ethTimeline[dateStr].txCount += 1;
  });
  const ethNode = {
    id: 'eth', label: 'ETH', type: 'token', color: '#627EEA',
    volumeUSD: allTxs.reduce((s, t) => s + (t.valueUSD || 0), 0), volumeEstimated: true,
    interactions: allTxs.length,
    riskScore: 1, balanceUSD: ethBalance * ethPrice, priceUSD: ethPrice,
    protocolAttributionConfidence: 'high',
    firstSeen: allTxs.length ? new Date(allTxs.reduce((m, t) => Math.min(m, t.timeStamp), Infinity) * 1000).toISOString().slice(0, 10) : null,
    lastActive: allTxs.length ? new Date(allTxs.reduce((m, t) => Math.max(m, t.timeStamp), -Infinity) * 1000).toISOString().slice(0, 10) : null,
    timeline: Object.values(ethTimeline),
    topCounterparties: [], anomalies: [], opportunities: []
  };

  const topCounterpartyNodes = buildCounterpartyNodes(tokenMap, address);

  const focalFirstSeen = allTxs.length ? new Date(allTxs.reduce((m, t) => Math.min(m, t.timeStamp), Infinity) * 1000).toISOString().slice(0, 10) : null;
  const focalLastActive = allTxs.length ? new Date(allTxs.reduce((m, t) => Math.max(m, t.timeStamp), -Infinity) * 1000).toISOString().slice(0, 10) : null;
  const focalNode = {
    id: 'focal_wallet',
    label: address.slice(0, 6) + '…' + address.slice(-4),
    fullAddress: address,
    type: 'wallet',
    color: '#7B61FF',
    volumeUSD: allTxs.reduce((s, t) => s + (t.valueUSD || 0), 0),
    volumeEstimated: true,
    interactions: allTxs.length,
    riskScore: 0,
    balanceUSD: ethBalance * ethPrice,
    priceUSD: null,
    firstSeen: focalFirstSeen,
    lastActive: focalLastActive,
    protocolAttributionConfidence: 'high',
    timeline: Object.values(ethTimeline).sort((a, b) => a.date.localeCompare(b.date)),
    topCounterparties: [],
    anomalies: [],
    opportunities: [],
  };

  const finalizeNode = (node) => {
    const tl = Array.isArray(node.timeline)
      ? node.timeline
      : Object.values(node.timeline).sort((a, b) => a.date.localeCompare(b.date));
    const cps = Array.isArray(node.topCounterparties)
      ? node.topCounterparties
      : Object.values(node.topCounterparties).sort((a, b) => b.volumeUSD - a.volumeUSD).slice(0, 5);
    const d7 = computeDelta7d(tl);
    const ts = typeof node.firstSeen === 'number' ? new Date(node.firstSeen * 1000).toISOString().slice(0, 10) : node.firstSeen;
    const la = typeof node.lastActive === 'number' ? new Date(node.lastActive * 1000).toISOString().slice(0, 10) : node.lastActive;
    return { ...node, timeline: tl, topCounterparties: cps, delta7d: d7, firstSeen: ts, lastActive: la };
  };

  const nodes = [
    focalNode,
    finalizeNode(ethNode),
    ...Object.values(tokenMap).map(finalizeNode),
    ...Object.values(protocolMap).map(finalizeNode),
    ...topCounterpartyNodes.map(({ _tokenLinks, ...cp }) => cp),
  ].filter(n => n.interactions > 0 || n.id === 'eth' || n.id === 'focal_wallet')
    .sort((a, b) => (b.volumeUSD || 0) - (a.volumeUSD || 0))
    .slice(0, 48);

  const anomalies = detectAnomalies(allTxs);
  const opportunities = findOpportunities(nodes, allTxs);
  applyAnomaliesAndOpportunities(nodes, anomalies, opportunities);

  const edges = buildGraphEdges(nodes, topCounterpartyNodes);

  const firstSeen = allTxs.length ? new Date(allTxs.reduce((m, t) => Math.min(m, t.timeStamp), Infinity) * 1000).toISOString().slice(0, 10) : null;
  const lastActive = allTxs.length ? new Date(allTxs.reduce((m, t) => Math.max(m, t.timeStamp), -Infinity) * 1000).toISOString().slice(0, 10) : null;
  const overallRiskScore = computeOverallRiskScore(anomalies);
  const totalValueUSD = nodes.filter(n => n.type === 'token').reduce((s, n) => s + (n.balanceUSD || 0), 0);
  const fp = computeFingerprintScore(nodes, allTxs, overallRiskScore);

  const enriched = await runEnrichment({
    address, alchemyKey, graphApiKey, fetchImpl,
    duneApiKey, duneQueryDexId, duneDeXCacheTtl,
    elapsed, apiErrors,
  });
  const { ens, graphData, duneData } = enriched;

  applyGraphEnrichment(nodes, graphData);

  if (graphData.sources.length) {
    apiErrors.push({ source: 'graph', message: `Enriched with: ${graphData.sources.join(', ')}`, severity: 'info' });
  }

  applyDuneEnrichment(nodes, duneData, apiErrors);

  const usingFallbackPrices = priceSource !== 'coingecko';
  const hasProviderWarnings = apiErrors.some(e => e.severity === 'partial' || e.severity === 'error');
  const hasRealData         = !!(etherscanKey || alchemyKey);
  const realDataSource      = hasProviderWarnings ? 'PARTIAL' : 'REAL';
  const dataSource          = hasRealData ? realDataSource : 'MOCK';
  const dataQuality         = buildDataQuality({
    isFallback: usingFallbackPrices,
    isDemo:     false,
    isPartial:  transactionSample.isSampled || tokenTxs.length >= TX_SAMPLE_LIMIT || hasProviderWarnings,
    warnings:   buildProviderWarnings(transactionSample, tokenTxs, usingFallbackPrices, apiErrors),
  });

  console.info(`[wallet-api] response:send at ${elapsed()}ms — nodes:${nodes.length} edges:${edges.slice(0, 60).length}`);

  const tTotal = elapsed();

  return makeProviderResult({
    ok: true,
    provider: etherscanKey ? 'etherscan' : 'alchemy',
    source: dataSource.toLowerCase(),
    timing: {
      totalMs: tTotal,
      providerMs: tProvider,
      coingeckoMs: tCoingecko - tProvider,
    },
    payload: {
      address, ens, chain: 'ethereum', isContract,
      sources: {
        walletActivity: etherscanKey ? 'etherscan' : 'alchemy_only',
        prices: priceSource,
      },
      dataQuality,
      transactionSample,
      valueMetadata: {
        isEstimated: priceSource !== 'coingecko',
        priceSource,
        valueScope: 'eth_only',
      },
      ownedENSNames: graphData.ownedENSNames,
      totalValueUSD: Math.round(totalValueUSD), totalValueEstimated: true, valueScope: 'eth_only',
      ethBalance,
      firstSeen, lastActive,
      txCount: allTxs.length,
      overallRiskScore,
      dataConfidence: computeDataConfidence(allTxs.length),
      dataSource,
      apiErrors,
      transactions: allTxs.slice(0, 200),
      fingerprintScore: fp,
      nodes,
      edges: edges.slice(0, 60),
      ...(process.env.DEBUG_WALLET_LOAD === 'true' ? { _debug: { totalElapsedMs: elapsed() } } : {}),
    },
    warnings: buildProviderWarnings(transactionSample, tokenTxs, usingFallbackPrices, apiErrors).filter(Boolean),
    errors: apiErrors,
    partial: transactionSample.isSampled || tokenTxs.length >= TX_SAMPLE_LIMIT || hasProviderWarnings,
    freshness: lastActive,
  });
}

const WALLET_CACHE_TTL_SECONDS = Number(process.env.WALLET_CACHE_TTL_SECONDS) || 600;       // 10 min fresh window
const WALLET_STALE_TTL_SECONDS = Number(process.env.WALLET_STALE_TTL_SECONDS) || 86_400;    // 24h stale fallback

// Wallet result caching is enabled where it protects real provider spend:
// production runtimes and any deployment with durable (Redis) cache configured.
// It can be forced on/off with WALLET_CACHE_ENABLED. Left off in local/test runs
// without Redis so each request exercises the live provider path directly.
function walletCacheEnabled() {
  if (process.env.WALLET_CACHE_ENABLED === 'false') return false;
  if (process.env.WALLET_CACHE_ENABLED === 'true') return true;
  if (getRedisConfig().enabled) return true;
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

// Only cache results that actually carry provider data. A fully-degraded result
// (every provider failed, no transactions, zero balance) is never cached so the
// next request can retry — mirrors the "never cache empty/error" rule elsewhere.
function isCacheableWalletResult(result) {
  const p = result?.payload;
  if (!p || p.dataSource === 'MOCK') return false;
  const hasData = (p.txCount || 0) > 0
    || (p.ethBalance || 0) > 0
    || (Array.isArray(p.nodes) && p.nodes.length > 2);
  return Boolean(hasData);
}

/**
 * Cached wrapper around liveWalletProvider, keyed by chain+address.
 *
 * Protects Etherscan/Alchemy/CoinGecko/The Graph from being re-called on repeated
 * wallet lookups, route navigation, retries, and GalaxyView node expansions of the
 * same address. Both /api/wallet and /api/wallet-expand share this cache, so an
 * expansion right after a lookup is a cache hit with zero upstream calls.
 *
 * On a fresh cache hit the returned envelope carries `fromCache: true`; on upstream
 * failure with a prior cached value it serves stale (`stale: true`) instead of
 * breaking the page.
 *
 * @param {{ address: string, keys?: object, fetchImpl?: Function, timing?: object,
 *           ttlSeconds?: number }} args
 */
export async function cachedLiveWalletProvider({
  address,
  keys = {},
  fetchImpl = globalThis.fetch,
  timing = {},
  ttlSeconds = WALLET_CACHE_TTL_SECONDS,
}) {
  if (!walletCacheEnabled()) {
    const value = await liveWalletProvider({ address, keys, fetchImpl, timing });
    return { ...value, fromCache: false, stale: false, cacheAgeSeconds: null };
  }
  const cacheKey = `ethereum:${String(address).toLowerCase()}`;
  const { value, fromCache, stale, ageSeconds } = await withProviderCache({
    provider: 'wallet-live',
    key: cacheKey,
    ttlSeconds,
    staleTtlSeconds: WALLET_STALE_TTL_SECONDS,
    isCacheable: isCacheableWalletResult,
    load: () => liveWalletProvider({ address, keys, fetchImpl, timing }),
  });
  return { ...value, fromCache, stale, cacheAgeSeconds: ageSeconds };
}
