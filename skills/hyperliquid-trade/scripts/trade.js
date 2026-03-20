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
  const baseCoin = coin.replace(/\/USDC$/i, '');
  const symbol = mode === 'spot' ? `${baseCoin}/USDC` : baseCoin;
  const assetId = converter.getAssetId(symbol);
  if (assetId === undefined) {
    process.stderr.write(JSON.stringify({ error: `Asset ${baseCoin} not found on Hyperliquid. Check the symbol and try again.` }) + '\n');
    process.exit(1);
  }
  const szDec = converter.getSzDecimals(symbol);
  if (szDec === undefined) {
    process.stderr.write(JSON.stringify({ error: `Size decimals for ${symbol} not found.` }) + '\n');
    process.exit(1);
  }

  // Get mid price
  const mids = await info.allMids();
  const midRaw = mids[symbol] ?? mids[coin];
  if (!midRaw) {
    process.stderr.write(JSON.stringify({ error: `Could not fetch mid price for ${coin}.` }) + '\n');
    process.exit(1);
  }
  const mid = parseFloat(midRaw);
  if (!isFinite(mid) || mid <= 0) {
    process.stderr.write(JSON.stringify({ error: `Invalid mid price for ${baseCoin}: ${midRaw}` }) + '\n');
    process.exit(1);
  }

  const risk = cfg?.yaml?.risk ?? {};
  const toFinitePos = (v, fallback) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : fallback);
  const confirmThreshold = toFinitePos(risk.confirm_trade_usd, 100);
  const largeThreshold = toFinitePos(risk.large_trade_usd, 1000);
  const leverageWarn = toFinitePos(risk.leverage_warn, 20);

  if (mode === 'spot') {
    const isBuy = action === 'buy';
    const tradeValue = size * mid;

    process.stdout.write(JSON.stringify({
      preview: true,
      action: `${isBuy ? 'Buy' : 'Sell'} ${baseCoin} (Spot)`,
      coin: baseCoin,
      side: action,
      size,
      estPrice: mid,
      tradeValue: tradeValue.toFixed(2),
      requiresConfirm: tradeValue >= confirmThreshold,
      requiresDoubleConfirm: tradeValue >= largeThreshold,
    }) + '\n');
    if (!process.argv.includes('--confirmed')) process.exit(0);

    const sz = formatSize(size, szDec);
    const exchange = createExchangeClient(transport, wallet);
    const result = await exchange.order({
      orders: [{ a: assetId, b: isBuy, p: formatPrice(ioPrice(isBuy, mid), szDec, 'spot'), s: sz, r: false, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na',
    });

    const status0 = result?.response?.data?.statuses?.[0];
    if (!status0?.filled) {
      process.stderr.write(JSON.stringify({ error: 'Order not filled — price moved beyond the 5% IOC limit. Check current price and retry.' }) + '\n');
      process.exit(1);
    }

    process.stdout.write(JSON.stringify({ ok: true, oid: status0.filled.oid, avgPx: status0.filled.avgPx, filledSz: status0.filled.totalSz }) + '\n');
    process.exit(0);
  }

  if (mode === 'perp') {
    if (action === 'open') {
      const isBuy = direction === 'long';
      const lev = leverage ?? 1;
      const marginUsed = (size * mid) / lev;
      const leverageWarning = leverage !== null && leverage >= leverageWarn;

      process.stdout.write(JSON.stringify({
        preview: true,
        action: `Open ${isBuy ? 'Long' : 'Short'} ${baseCoin} (Perpetual)`,
        coin: baseCoin,
        direction,
        size,
        leverage: lev,
        marginMode: isCross ? 'Cross' : 'Isolated',
        estPrice: mid,
        marginUsed: marginUsed.toFixed(2),
        requiresConfirm: marginUsed >= confirmThreshold,
        requiresDoubleConfirm: marginUsed >= largeThreshold,
        leverageWarning,
      }) + '\n');
      if (!process.argv.includes('--confirmed')) process.exit(0);

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

      const status0 = result?.response?.data?.statuses?.[0];
      if (!status0?.filled) {
        process.stderr.write(JSON.stringify({ error: 'Order not filled — price moved beyond the 5% IOC limit. Check current price and retry.' }) + '\n');
        process.exit(1);
      }

      process.stdout.write(JSON.stringify({ ok: true, oid: status0.filled.oid, avgPx: status0.filled.avgPx, filledSz: status0.filled.totalSz }) + '\n');
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
      if (!isFinite(szi) || szi === 0) {
        process.stderr.write(JSON.stringify({ error: `Invalid or zero position size for ${coin}: ${pos.position.szi}` }) + '\n');
        process.exit(1);
      }
      const posSize = Math.abs(szi);
      if (size > posSize) {
        process.stderr.write(JSON.stringify({
          error: `Close size ${size} exceeds open position size ${posSize}. Use ${posSize} to fully close.`,
        }) + '\n');
        process.exit(1);
      }
      const isBuy = closeDirection(szi);

      const closeValue = size * mid;
      process.stdout.write(JSON.stringify({
        preview: true,
        action: `Close ${szi > 0 ? 'Long' : 'Short'} ${baseCoin} (Perpetual)`,
        coin: baseCoin,
        size,
        positionSize: posSize,
        closingDirection: isBuy ? 'buy' : 'sell',
        estPrice: mid,
        tradeValue: closeValue.toFixed(2),
        requiresConfirm: closeValue >= confirmThreshold,
        requiresDoubleConfirm: closeValue >= largeThreshold,
      }) + '\n');
      if (!process.argv.includes('--confirmed')) process.exit(0);

      const exchange = createExchangeClient(transport, wallet);
      const sz = formatSize(size, szDec);

      const result = await exchange.order({
        orders: [{ a: assetId, b: isBuy, p: formatPrice(ioPrice(isBuy, mid), szDec, 'perp'), s: sz, r: true, t: { limit: { tif: 'Ioc' } } }],
        grouping: 'na',
      });

      const status0 = result?.response?.data?.statuses?.[0];
      if (!status0?.filled) {
        process.stderr.write(JSON.stringify({ error: 'Order not filled — price moved beyond the 5% IOC limit. Check current price and retry.' }) + '\n');
        process.exit(1);
      }

      process.stdout.write(JSON.stringify({ ok: true, oid: status0.filled.oid, avgPx: status0.filled.avgPx, filledSz: status0.filled.totalSz, closedDirection: szi > 0 ? 'long' : 'short' }) + '\n');
      process.exit(0);
    }
  }

  process.stderr.write(JSON.stringify({ error: `Unknown mode/action: ${mode} ${action}` }) + '\n');
  process.exit(1);

} catch (err) {
  process.stderr.write(JSON.stringify({ error: err?.message ?? String(err) }) + '\n');
  process.exit(1);
}
