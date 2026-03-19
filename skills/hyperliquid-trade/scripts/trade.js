#!/usr/bin/env node
/**
 * trade.js <spot|perp> <buy|sell|open|close> <COIN> [direction] <SIZE> [--leverage N] [--cross|--isolated]
 */
import { loadConfig } from './lib/config.js';
import { createSigner } from './lib/signer.js';
import { createTransport, createInfoClient, createExchangeClient } from './lib/hl-client.js';
import { parseArgs, ioPrice, closeDirection } from './lib/trade-helpers.js';
import { SymbolConverter, formatPrice, formatSize } from '@nktkas/hyperliquid/utils';

const rawArgs = process.argv.slice(2);

let parsed;
try {
  parsed = parseArgs(rawArgs);
} catch (err) {
  process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
  process.exit(1);
}

const { mode, action, coin, size, direction, leverage, isCross } = parsed;

try {
  const cfg = loadConfig();
  const wallet = await createSigner(cfg, null);
  const address = await wallet.getAddress();
  const transport = createTransport(cfg);
  const info = createInfoClient(transport);

  // Resolve asset index and size decimals
  const converter = await SymbolConverter.create({ transport });
  const symbol = mode === 'spot' ? `${coin}/USDC` : coin;
  const assetId = converter.getAssetId(symbol);
  if (assetId === undefined) {
    process.stderr.write(JSON.stringify({ error: `Asset ${coin} not found on Hyperliquid. Check the symbol and try again.` }) + '\n');
    process.exit(1);
  }
  const szDec = converter.getSzDecimals(symbol);

  // Get mid price
  const mids = await info.allMids();
  const midRaw = mids[symbol] ?? mids[coin];
  if (!midRaw) {
    process.stderr.write(JSON.stringify({ error: `Could not fetch mid price for ${coin}.` }) + '\n');
    process.exit(1);
  }
  const mid = parseFloat(midRaw);

  if (mode === 'spot') {
    const isBuy = action === 'buy';
    const sz = formatSize(size, szDec);

    const exchange = createExchangeClient(transport, wallet);
    const result = await exchange.order({
      orders: [{ a: assetId, b: isBuy, p: formatPrice(ioPrice(isBuy, mid), szDec, 'spot'), s: sz, r: false, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na',
    });

    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
    process.exit(0);
  }

  if (mode === 'perp') {
    if (action === 'open') {
      const isBuy = direction === 'long';
      const exchange = createExchangeClient(transport, wallet);

      // Set leverage before opening position
      if (leverage !== null) {
        await exchange.updateLeverage({
          asset: assetId,
          isCross,
          leverage,
        });
      }

      const sz = formatSize(size, szDec);

      const result = await exchange.order({
        orders: [{ a: assetId, b: isBuy, p: formatPrice(ioPrice(isBuy, mid), szDec, 'perp'), s: sz, r: false, t: { limit: { tif: 'Ioc' } } }],
        grouping: 'na',
      });

      process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
      process.exit(0);
    }

    if (action === 'close') {
      // Auto-detect direction from open position
      const state = await info.clearinghouseState({ user: address });
      const pos = state.assetPositions.find(p => p.position.coin === coin);

      if (!pos) {
        process.stderr.write(JSON.stringify({ error: `No open position found for ${coin}.` }) + '\n');
        process.exit(1);
      }

      const szi = parseFloat(pos.position.szi);
      const isBuy = closeDirection(szi);

      const exchange = createExchangeClient(transport, wallet);
      const sz = formatSize(size, szDec);

      const result = await exchange.order({
        orders: [{ a: assetId, b: isBuy, p: formatPrice(ioPrice(isBuy, mid), szDec, 'perp'), s: sz, r: true, t: { limit: { tif: 'Ioc' } } }],
        grouping: 'na',
      });

      process.stdout.write(JSON.stringify({ ok: true, result, closedDirection: szi > 0 ? 'long' : 'short' }) + '\n');
      process.exit(0);
    }
  }

  process.stderr.write(JSON.stringify({ error: `Unknown mode/action: ${mode} ${action}` }) + '\n');
  process.exit(1);

} catch (err) {
  process.stderr.write(JSON.stringify({ error: err?.message ?? String(err) }) + '\n');
  process.exit(1);
}
