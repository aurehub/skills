import { HttpTransport, ExchangeClient, InfoClient } from '@nktkas/hyperliquid';

/**
 * Create HttpTransport pointed at the configured API URL.
 *
 * @param {{ yaml: object }} cfg  Result of loadConfig()
 * @returns {HttpTransport}
 */
export function createTransport(cfg) {
  const apiUrl = cfg?.yaml?.api_url ?? 'https://api.hyperliquid.xyz';
  const isTestnet = cfg?.yaml?.network === 'testnet';
  return new HttpTransport({ apiUrl, isTestnet });
}

/**
 * Create an InfoClient (read-only queries).
 *
 * @param {HttpTransport} transport
 * @returns {InfoClient}
 */
export function createInfoClient(transport) {
  return new InfoClient({ transport });
}

/**
 * Create an ExchangeClient (trading operations).
 * wallet must be an ethers.Wallet (v6) instance.
 *
 * @param {HttpTransport} transport
 * @param {import('ethers').Wallet} wallet
 * @returns {ExchangeClient}
 */
export function createExchangeClient(transport, wallet) {
  return new ExchangeClient({ transport, wallet });
}
