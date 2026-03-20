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
      return { ...blank, subcommand: 'place', mode: 'perp', action: direction, coin, price, size, leverage, isCross };
    }
  }

  throw new Error(`Unknown subcommand: ${subcommand}. Use place, list, cancel, or modify`);
}
