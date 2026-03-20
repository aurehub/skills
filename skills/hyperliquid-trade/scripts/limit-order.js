#!/usr/bin/env node
/**
 * limit-order.js <place|list|cancel|modify> ...
 *
 * place spot  buy|sell  <COIN> <PRICE> <SIZE>
 * place perp  long|short <COIN> <PRICE> <SIZE> [--leverage N] [--cross|--isolated]
 * list [--coin COIN]
 * cancel <orderId>
 * modify <orderId> --price <newPrice> [--size <newSize>]
 */

import { loadConfig } from './lib/config.js';
import { createSigner } from './lib/signer.js';
import { createTransport, createInfoClient, createExchangeClient } from './lib/hl-client.js';
import { SymbolConverter, formatPrice, formatSize } from '@nktkas/hyperliquid/utils';
import { pathToFileURL } from 'url';

/**
 * Parse CLI arguments for limit-order.js.
 *
 * @param {string[]} args  process.argv.slice(2)
 * @returns {{ subcommand, mode, action, coin, price, size, leverage, isCross, orderId, newPrice, newSize }}
 */
export function parseLimitArgs(args) {
  const blank = { subcommand: null, mode: null, action: null, coin: null, price: null, size: null, leverage: null, isCross: true, orderId: null, newPrice: null, newSize: null };

  const [subcommand, ...rest] = args;
  if (!subcommand) throw new Error('Usage: limit-order.js <place|list|cancel|modify> ...');

  if (subcommand === 'list') {
    let coin = null;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--coin' && rest[i + 1]) coin = rest[++i];
    }
    return { ...blank, subcommand: 'list', coin };
  }

  if (subcommand === 'cancel') {
    const [orderIdStr] = rest;
    if (!orderIdStr) throw new Error('Missing orderId argument');
    const orderId = Number(orderIdStr);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new Error(`Invalid orderId: ${orderIdStr}`);
    return { ...blank, subcommand: 'cancel', orderId };
  }

  if (subcommand === 'modify') {
    const [orderIdStr, ...flags] = rest;
    if (!orderIdStr) throw new Error('Missing orderId argument');
    const orderId = Number(orderIdStr);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new Error(`Invalid orderId: ${orderIdStr}`);

    let newPrice = null;
    let newSize = null;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i] === '--price' && flags[i + 1]) {
        newPrice = parseFloat(flags[++i]);
        if (isNaN(newPrice) || newPrice <= 0) throw new Error('Invalid price: must be greater than zero');
      }
      if (flags[i] === '--size' && flags[i + 1]) {
        newSize = parseFloat(flags[++i]);
        if (isNaN(newSize) || newSize <= 0) throw new Error('Invalid size: must be greater than zero');
      }
    }
    if (newPrice === null) throw new Error('Missing required --price argument');
    return { ...blank, subcommand: 'modify', orderId, newPrice, newSize };
  }

  if (subcommand === 'place') {
    const [mode, actionOrDir, ...placeRest] = rest;
    if (!mode || !['spot', 'perp'].includes(mode)) throw new Error(`Unknown mode: ${mode}. Use spot or perp`);

    if (mode === 'spot') {
      const [action, coin, priceStr, sizeStr] = [actionOrDir, ...placeRest];
      if (!['buy', 'sell'].includes(action)) throw new Error(`Unknown spot action: ${action}. Use buy or sell`);
      if (!coin) throw new Error('Missing coin argument');
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) throw new Error('Invalid price: must be greater than zero');
      const size = parseFloat(sizeStr);
      if (isNaN(size) || size <= 0) throw new Error('Invalid size: must be greater than zero');
      return { ...blank, subcommand: 'place', mode: 'spot', action, coin, price, size };
    }

    if (mode === 'perp') {
      const [direction, coin, priceStr, sizeStr, ...flags] = [actionOrDir, ...placeRest];
      if (!['long', 'short'].includes(direction)) throw new Error(`Unknown perp direction: ${direction}. Use long or short`);
      if (!coin) throw new Error('Missing coin argument');
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) throw new Error('Invalid price: must be greater than zero');
      const size = parseFloat(sizeStr);
      if (isNaN(size) || size <= 0) throw new Error('Invalid size: must be greater than zero');

      let leverage = null;
      let isCross = true;
      for (let i = 0; i < flags.length; i++) {
        if (flags[i] === '--leverage' && flags[i + 1]) leverage = parseInt(flags[++i], 10);
        if (flags[i] === '--cross') isCross = true;
        if (flags[i] === '--isolated') isCross = false;
      }
      if (leverage !== null && (leverage < 1 || leverage > 100))
        throw new Error(`Leverage must be between 1 and 100, got: ${leverage}`);
      return { ...blank, subcommand: 'place', mode: 'perp', action: direction, coin, price, size, leverage, isCross };
    }
  }

  throw new Error(`Unknown subcommand: ${subcommand}. Use place, list, cancel, or modify`);
}

if (process.argv[1] && new URL(import.meta.url).href === pathToFileURL(process.argv[1]).href) {
  const rawArgs = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseLimitArgs(rawArgs);
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }

  try {
    const cfg = loadConfig();
    const wallet = await createSigner(cfg, null);
    const address = await wallet.getAddress();
    const transport = createTransport(cfg);
    const info = createInfoClient(transport);

    if (parsed.subcommand === 'list') {
      await runList({ info, address, coin: parsed.coin });
    } else if (parsed.subcommand === 'cancel') {
      const exchange = createExchangeClient(transport, wallet);
      await runCancel({ info, exchange, address, transport, orderId: parsed.orderId });
    } else if (parsed.subcommand === 'modify') {
      const exchange = createExchangeClient(transport, wallet);
      await runModify({ info, exchange, address, transport, orderId: parsed.orderId, newPrice: parsed.newPrice, newSize: parsed.newSize });
    } else if (parsed.subcommand === 'place') {
      const exchange = createExchangeClient(transport, wallet);
      await runPlace({ info, exchange, address, transport, parsed, cfg });
    }
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err?.message ?? String(err) }) + '\n');
    process.exit(1);
  }
}

async function runList({ info, address, coin }) {
  const orders = await info.openOrders({ user: address });
  const filtered = coin ? orders.filter(o => o.coin === coin) : orders;
  process.stdout.write(JSON.stringify({
    orders: filtered.map(o => ({
      oid: o.oid,
      coin: o.coin,
      side: o.side,
      limitPx: o.limitPx,
      sz: o.sz,
      timestamp: o.timestamp,
    })),
  }) + '\n');
  process.exit(0);
}

async function runCancel({ info, exchange, address, transport, orderId }) {
  const orders = await info.openOrders({ user: address });
  const order = orders.find(o => o.oid === orderId);
  if (!order) {
    process.stderr.write(JSON.stringify({ error: `Order ${orderId} not found in open orders.` }) + '\n');
    process.exit(1);
  }

  const converter = await SymbolConverter.create({ transport });
  const assetId = converter.getAssetId(order.coin);
  if (assetId === undefined) {
    process.stderr.write(JSON.stringify({ error: `Asset ${order.coin} not found on Hyperliquid.` }) + '\n');
    process.exit(1);
  }

  await exchange.cancel({ cancels: [{ a: assetId, o: orderId }] });
  process.stdout.write(JSON.stringify({ ok: true, orderId }) + '\n');
  process.exit(0);
}

async function runModify({ info, exchange, address, transport, orderId, newPrice, newSize }) {
  const orders = await info.openOrders({ user: address });
  const order = orders.find(o => o.oid === orderId);
  if (!order) {
    process.stderr.write(JSON.stringify({ error: `Order ${orderId} not found in open orders.` }) + '\n');
    process.exit(1);
  }

  const converter = await SymbolConverter.create({ transport });
  const assetId = converter.getAssetId(order.coin);
  if (assetId === undefined) {
    process.stderr.write(JSON.stringify({ error: `Asset ${order.coin} not found on Hyperliquid.` }) + '\n');
    process.exit(1);
  }

  const szDec = converter.getSzDecimals(order.coin);
  if (szDec === undefined) {
    process.stderr.write(JSON.stringify({ error: `Size decimals for ${order.coin} not found.` }) + '\n');
    process.exit(1);
  }
  const finalSize = newSize ?? parseFloat(order.sz);
  const isBuy = order.side === 'B';

  // Output preview and require --confirmed (always single confirmation for modify)
  process.stdout.write(JSON.stringify({
    preview: true,
    orderId,
    coin: order.coin,
    side: order.side,
    oldPrice: parseFloat(order.limitPx),
    newPrice,
    oldSize: parseFloat(order.sz),
    newSize: finalSize,
  }) + '\n');

  if (!process.argv.includes('--confirmed')) {
    process.exit(0);
  }

  const p = formatPrice(newPrice, szDec);
  const s = formatSize(finalSize, szDec);

  await exchange.modify({
    oid: orderId,
    order: { a: assetId, b: isBuy, p, s, r: false, t: { limit: { tif: 'Gtc' } } },
  });

  process.stdout.write(JSON.stringify({ ok: true, orderId, newPrice, newSize: finalSize }) + '\n');
  process.exit(0);
}

async function runPlace({ info, exchange, address, transport, parsed, cfg }) {
  const { mode, action, coin, price, size, leverage, isCross } = parsed;
  const risk = cfg?.yaml?.risk ?? {};
  const confirmThreshold = risk.confirm_trade_usd ?? 100;
  const largeThreshold = risk.large_trade_usd ?? 1000;
  const leverageWarn = risk.leverage_warn ?? 20;

  const converter = await SymbolConverter.create({ transport });
  const symbol = mode === 'spot' ? `${coin}/USDC` : coin;
  const assetId = converter.getAssetId(symbol);
  if (assetId === undefined) {
    process.stderr.write(JSON.stringify({ error: `Asset ${coin} not found on Hyperliquid.` }) + '\n');
    process.exit(1);
  }
  const szDec = converter.getSzDecimals(symbol);
  if (szDec === undefined) {
    process.stderr.write(JSON.stringify({ error: `Size decimals for ${symbol} not found.` }) + '\n');
    process.exit(1);
  }

  // Balance check
  if (mode === 'spot') {
    const spotState = await info.spotClearinghouseState({ user: address });
    if (action === 'buy') {
      const usdcBalance = parseFloat(
        spotState.balances.find(b => b.coin === 'USDC')?.total ?? '0'
      );
      const needed = price * size;
      if (usdcBalance < needed) {
        process.stderr.write(JSON.stringify({
          error: `Insufficient balance: have $${usdcBalance.toFixed(2)}, need $${needed.toFixed(2)}. Deposit at app.hyperliquid.xyz.`,
        }) + '\n');
        process.exit(1);
      }
    } else {
      const tokenBalance = parseFloat(
        spotState.balances.find(b => b.coin === coin)?.total ?? '0'
      );
      if (tokenBalance < size) {
        process.stderr.write(JSON.stringify({
          error: `Insufficient balance: have ${tokenBalance} ${coin}, need ${size}.`,
        }) + '\n');
        process.exit(1);
      }
    }
  } else {
    const perpState = await info.clearinghouseState({ user: address });
    const withdrawable = parseFloat(perpState.withdrawable ?? '0');
    const effectiveLeverage = leverage ?? 1;
    const marginNeeded = (price * size) / effectiveLeverage;
    if (withdrawable < marginNeeded) {
      process.stderr.write(JSON.stringify({
        error: `Insufficient margin: have $${withdrawable.toFixed(2)}, need $${marginNeeded.toFixed(2)}.`,
      }) + '\n');
      process.exit(1);
    }
  }

  const tradeValue = price * size;
  const marginUsed = mode === 'perp' ? tradeValue / (leverage ?? 1) : null;
  const confirmValue = mode === 'perp' ? (marginUsed ?? tradeValue) : tradeValue;

  process.stdout.write(JSON.stringify({
    preview: true,
    action: mode === 'spot'
      ? `${action === 'buy' ? 'Buy' : 'Sell'} ${coin} (Spot)`
      : `Open ${action === 'long' ? 'Long' : 'Short'} ${coin} (Perpetual)`,
    coin,
    side: action,
    price,
    size,
    leverage: mode === 'perp' ? (leverage ?? 1) : undefined,
    marginMode: mode === 'perp' ? (isCross ? 'Cross' : 'Isolated') : undefined,
    tradeValue: tradeValue.toFixed(2),
    marginUsed: marginUsed !== null ? marginUsed.toFixed(2) : undefined,
    confirmThreshold,
    largeThreshold,
    leverageWarn: mode === 'perp' ? leverageWarn : undefined,
    requiresConfirm: confirmValue >= confirmThreshold,
    requiresDoubleConfirm: confirmValue >= largeThreshold,
    leverageWarning: mode === 'perp' && (leverage ?? 1) >= leverageWarn,
  }) + '\n');

  if (!process.argv.includes('--confirmed')) {
    process.exit(0);
  }

  const isBuy = action === 'buy' || action === 'long';
  if (mode === 'perp' && leverage !== null) {
    await exchange.updateLeverage({ asset: assetId, isCross, leverage });
  }

  const p = formatPrice(price, szDec);
  const s = formatSize(size, szDec);

  const result = await exchange.order({
    orders: [{ a: assetId, b: isBuy, p, s, r: false, t: { limit: { tif: 'Gtc' } } }],
    grouping: 'na',
  });

  const status0 = result.response.data.statuses[0];
  let oid, orderStatus;
  if (status0?.resting) {
    oid = status0.resting.oid;
    orderStatus = 'resting';
  } else if (status0?.filled) {
    oid = status0.filled.oid;
    orderStatus = 'filled';
  } else {
    process.stderr.write(JSON.stringify({ error: `Order error: ${JSON.stringify(status0)}` }) + '\n');
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ ok: true, oid, coin, side: action, price, size, status: orderStatus }) + '\n');
  process.exit(0);
}
