import { JsonRpcProvider } from 'ethers6';
import { loadConfig } from './config.js';

/**
 * Error codes and patterns that indicate a transient failure worth retrying
 * on another RPC endpoint.
 */
const RETRIABLE_HTTP_STATUSES = new Set([429, 502, 503]);
const RETRIABLE_NODE_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET']);
const RETRIABLE_MSG_PATTERNS = [
  /rate.?limit/i,
  /too many requests/i,
  /timeout/i,
  /service unavailable/i,
  /bad gateway/i,
  /connection refused/i,
];

function isRetriable(err) {
  if (err.status && RETRIABLE_HTTP_STATUSES.has(err.status)) return true;
  if (err.code && RETRIABLE_NODE_CODES.has(err.code)) return true;
  if (err.message) {
    for (const pattern of RETRIABLE_MSG_PATTERNS) {
      if (pattern.test(err.message)) return true;
    }
  }
  return false;
}

export class FallbackProvider {
  /**
   * @param {string} primaryUrl  - Primary RPC URL (required)
   * @param {string[]} fallbackUrls - Ordered list of fallback URLs
   */
  constructor(primaryUrl, fallbackUrls = []) {
    if (!primaryUrl) {
      throw new Error('FallbackProvider requires a primary RPC URL');
    }
    this._primaryUrl = primaryUrl;
    this._fallbackUrls = fallbackUrls;
    // Underlying ethers provider always points at the current primary
    this._ethersProvider = new JsonRpcProvider(primaryUrl);
  }

  /**
   * Send a single JSON-RPC request to `url`. Override in tests to avoid
   * real network calls.
   *
   * @param {string} url
   * @param {string} method
   * @param {any[]} params
   * @returns {Promise<any>}
   */
  async _rawSend(url, method, params) {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}: ${response.statusText}`);
      err.status = response.status;
      throw err;
    }

    const json = await response.json();
    if (json.error) {
      const err = new Error(json.error.message ?? 'RPC error');
      err.code = json.error.code;
      throw err;
    }

    return json.result;
  }

  /**
   * Try the primary URL first; on retriable errors try each fallback in order.
   * Session-sticky: the first URL that succeeds becomes the new primary.
   *
   * @param {string} method
   * @param {any[]} params
   * @returns {Promise<any>}
   */
  async _sendWithFallback(method, params) {
    const urls = [this._primaryUrl, ...this._fallbackUrls];
    const errors = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const result = await this._rawSend(url, method, params);

        // Session-sticky: promote successful fallback to primary
        if (i > 0) {
          const oldPrimary = this._primaryUrl;
          this._primaryUrl = url;
          this._fallbackUrls = [
            oldPrimary,
            ...urls.slice(1, i),
            ...urls.slice(i + 1),
          ];
          this._ethersProvider = new JsonRpcProvider(this._primaryUrl);
        }

        return result;
      } catch (err) {
        if (!isRetriable(err) || i === urls.length - 1) {
          // Non-retriable: throw immediately without trying fallbacks
          if (!isRetriable(err)) throw err;
        }
        errors.push({ url, error: err });
      }
    }

    // All URLs failed — redact API keys from URLs before logging
    const redact = (u) => { try { const o = new URL(u); return `${o.protocol}//${o.host}${o.pathname.replace(/\/[^/]{20,}$/, '/***')}`; } catch { return '[invalid url]'; } };
    const summary = errors
      .map(({ url, error }) => `${redact(url)}: ${error.message}`)
      .join('; ');
    throw new Error(`All RPC endpoints failed — ${summary}`);
  }

  /**
   * Generic JSON-RPC send.
   */
  async send(method, params) {
    return this._sendWithFallback(method, params);
  }

  /**
   * eth_call — routes through fallback path.
   */
  async call(tx) {
    return this._sendWithFallback('eth_call', [tx, 'latest']);
  }

  /**
   * eth_blockNumber — routes through fallback path.
   */
  async getBlockNumber() {
    return this._sendWithFallback('eth_blockNumber', []);
  }

  /**
   * eth_getBalance — routes through fallback path.
   */
  async getBalance(address) {
    return this._sendWithFallback('eth_getBalance', [address, 'latest']);
  }

  /**
   * Return the underlying ethers JsonRpcProvider (e.g. for Wallet.connect()).
   * Always reflects the current primary URL (updated after fallback switches).
   */
  getEthersProvider() {
    return this._ethersProvider;
  }

  /**
   * Wait for a transaction receipt with fallback support.
   * Polls eth_getTransactionReceipt via _sendWithFallback every pollIntervalMs
   * instead of relying on ethers' slow built-in waitForTransaction.
   *
   * @param {string} txHash
   * @param {number} [_confirmations=1]  unused, kept for API compat
   * @param {number} [timeoutMs=300000]
   * @param {number} [pollIntervalMs=3000]
   * @returns {Promise<import('ethers6').TransactionReceipt|null>}
   */
  async waitForTransaction(txHash, _confirmations = 1, timeoutMs = 300000, pollIntervalMs = 3000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const raw = await this._sendWithFallback('eth_getTransactionReceipt', [txHash]);
      if (raw) {
        // Parse into a minimal receipt-like object with the fields callers need
        return {
          status: parseInt(raw.status, 16),
          blockNumber: parseInt(raw.blockNumber, 16),
          transactionHash: raw.transactionHash,
          gasUsed: parseInt(raw.gasUsed, 16),
        };
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return null;
  }
}

/**
 * Build a FallbackProvider from an env object.
 *
 * @param {Record<string, string>} env
 * @returns {FallbackProvider}
 */
export function createProvider(env) {
  let effectiveEnv = env;
  if (!effectiveEnv?.ETH_RPC_URL) {
    // Fallback: load from ~/.aurehub/.env when env vars are not exported
    try {
      const cfg = loadConfig();
      effectiveEnv = { ...cfg.env, ...effectiveEnv };
    } catch (_) {
      // ignore — will throw below if still missing
    }
  }

  const primaryUrl = effectiveEnv.ETH_RPC_URL;
  if (!primaryUrl) {
    throw new Error(
      'ETH_RPC_URL is required in env to create a provider'
    );
  }

  const fallbackUrls = effectiveEnv.ETH_RPC_URL_FALLBACK
    ? effectiveEnv.ETH_RPC_URL_FALLBACK.split(',').map((u) => u.trim()).filter(Boolean)
    : [];

  return new FallbackProvider(primaryUrl, fallbackUrls);
}
