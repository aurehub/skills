import { fileURLToPath } from 'url';
import { loadConfig } from './lib/config.js';
import { runBrowseEnvCheck } from './setup.js';

const DEFAULT_GAMMA_URL = 'https://gamma-api.polymarket.com';
const DEFAULT_CLOB_URL  = 'https://clob.polymarket.com';

// ── Pure formatting helpers (exported for testing) ────────────────────────────

export function extractTokenIds(market) {
  const yes = market.tokens?.find(t => t.outcome?.toLowerCase() === 'yes');
  const no  = market.tokens?.find(t => t.outcome?.toLowerCase() === 'no');
  return { YES: yes?.token_id ?? null, NO: no?.token_id ?? null };
}

export function formatMarketOutput(market, orderbooks = {}, marketInfo = null) {
  const ids = extractTokenIds(market);
  const yes = market.tokens?.find(t => t.outcome?.toLowerCase() === 'yes');
  const no  = market.tokens?.find(t => t.outcome?.toLowerCase() === 'no');
  const obYes = ids.YES ? orderbooks[ids.YES] : null;
  const obNo  = ids.NO  ? orderbooks[ids.NO]  : null;

  const bestBid = ob => ob?.bids?.[0]?.price ?? '—';
  const bestAsk = ob => ob?.asks?.[0]?.price ?? '—';
  const liq = ob => {
    if (!ob) return '—';
    const sum = [...(ob.bids ?? []), ...(ob.asks ?? [])]
      .reduce((acc, o) => acc + parseFloat(o.size ?? 0) * parseFloat(o.price ?? 0), 0);
    return `$${sum.toFixed(0)}`;
  };

  const lines = [
    `Market: "${market.question}"`,
    `Status: ${market.active ? 'ACTIVE' : 'CLOSED'} | neg_risk: ${!!market.neg_risk}`,
    `YES: ${yes?.price?.toFixed(2) ?? '—'} ($${yes?.price?.toFixed(2) ?? '—'})   ` +
      `bid/ask: ${bestBid(obYes)}/${bestAsk(obYes)}   liquidity: ${liq(obYes)}`,
    `NO:  ${no?.price?.toFixed(2)  ?? '—'} ($${no?.price?.toFixed(2)  ?? '—'})   ` +
      `bid/ask: ${bestBid(obNo)}/${bestAsk(obNo)}   liquidity: ${liq(obNo)}`,
    `Min order: $${marketInfo?.min_order_size ?? market.min_incentive_size ?? '—'}`,
    `Token IDs:`,
    `  YES: ${ids.YES ?? '(not found)'}`,
    `  NO:  ${ids.NO  ?? '(not found)'}`,
  ];
  return lines.join('\n');
}

// ── Network fetch helpers ─────────────────────────────────────────────────────

async function fetchGamma(url, query) {
  const { default: axios } = await import('axios');
  const endpoint = query.includes('/') ? `${url}/markets/${query}` : `${url}/markets?q=${encodeURIComponent(query)}`;
  const res = await axios.get(endpoint, { timeout: 10_000 });
  const data = res.data;
  return Array.isArray(data) ? data : (data.markets ?? [data]);
}

async function fetchOrderbook(clobUrl, tokenId) {
  const { default: axios } = await import('axios');
  const res = await axios.get(`${clobUrl}/orderbook/${tokenId}`, { timeout: 10_000 });
  return res.data;
}

async function fetchMarketInfo(clobUrl, conditionId) {
  const { default: axios } = await import('axios');
  const res = await axios.get(`${clobUrl}/markets/${conditionId}`, { timeout: 10_000 });
  return res.data;
}

// ── Main search function ──────────────────────────────────────────────────────

export async function search(query, cfg) {
  const gammaUrl = cfg.yaml?.polymarket?.gamma_url ?? DEFAULT_GAMMA_URL;
  const clobUrl  = cfg.yaml?.polymarket?.clob_url  ?? DEFAULT_CLOB_URL;

  const markets = await fetchGamma(gammaUrl, query);
  if (!markets.length) { console.log('No markets found.'); return; }

  for (const market of markets.slice(0, 5)) {
    const ids = extractTokenIds(market);
    const orderbooks = {};
    for (const [side, tokenId] of Object.entries(ids)) {
      if (tokenId) {
        try { orderbooks[tokenId] = await fetchOrderbook(clobUrl, tokenId); }
        catch { /* orderbook unavailable */ }
      }
    }
    // Fetch min_order_size + tick_size from CLOB /markets/<conditionId>
    // Gamma API may return conditionId (camelCase) or condition_id (snake_case)
    let marketInfo = null;
    const condId = market.conditionId ?? market.condition_id;
    if (condId) {
      try { marketInfo = await fetchMarketInfo(clobUrl, condId); }
      catch { /* CLOB market info unavailable */ }
    }
    console.log(formatMarketOutput(market, orderbooks, marketInfo));
    console.log('');
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const query = process.argv[2];
  if (!query) { console.error('Usage: node scripts/browse.js <keyword|slug>'); process.exit(1); }
  (async () => {
    try {
      runBrowseEnvCheck();
      const cfg = loadConfig();
      await search(query, cfg);
    } catch (e) {
      if (e.response?.status === 403) {
        console.error('❌ 403 Forbidden — Polymarket API blocked in your region. Use a VPN.');
      } else {
        console.error('❌', e.message);
      }
      process.exit(1);
    }
  })();
}
