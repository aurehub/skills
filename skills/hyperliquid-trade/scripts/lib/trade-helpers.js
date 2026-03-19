/**
 * Parse CLI arguments for trade.js.
 *
 * Usage patterns:
 *   spot buy|sell <COIN> <SIZE>
 *   perp open <COIN> long|short <SIZE> [--leverage N] [--cross|--isolated]
 *   perp close <COIN> <SIZE>
 *
 * @param {string[]} args  process.argv.slice(2)
 * @returns {{ mode, action, coin, size, direction, leverage, isCross }}
 */
export function parseArgs(args) {
  const [mode, action, ...rest] = args;

  if (!mode || !action) throw new Error('Usage: trade.js <spot|perp> <buy|sell|open|close> ...');

  if (mode === 'spot') {
    if (!['buy', 'sell'].includes(action)) throw new Error(`Unknown spot action: ${action}. Use buy or sell`);
    const [coin, sizeStr] = rest;
    if (!coin) throw new Error('Missing coin argument');
    const size = parseFloat(sizeStr);
    if (isNaN(size) || size <= 0) throw new Error(`Invalid size: ${sizeStr}`);
    return { mode: 'spot', action, coin, size, direction: null, leverage: null, isCross: true };
  }

  if (mode === 'perp') {
    if (action === 'close') {
      const [coin, sizeStr] = rest;
      if (!coin) throw new Error('Missing coin argument');
      const size = parseFloat(sizeStr);
      if (isNaN(size) || size <= 0) throw new Error(`Invalid size: ${sizeStr}`);
      return { mode: 'perp', action: 'close', coin, size, direction: null, leverage: null, isCross: true };
    }

    if (action === 'open') {
      const [coin, direction, sizeStr, ...flags] = rest;
      if (!coin) throw new Error('Missing coin argument');
      if (!['long', 'short'].includes(direction)) throw new Error(`Direction must be long or short, got: ${direction}`);
      const size = parseFloat(sizeStr);
      if (isNaN(size) || size <= 0) throw new Error(`Invalid size: ${sizeStr}`);

      let leverage = null;
      let isCross = true;
      for (let i = 0; i < flags.length; i++) {
        if (flags[i] === '--leverage' && flags[i + 1]) leverage = parseInt(flags[++i], 10);
        if (flags[i] === '--cross') isCross = true;
        if (flags[i] === '--isolated') isCross = false;
      }
      if (leverage !== null && (leverage < 1 || leverage > 100)) throw new Error(`Leverage must be between 1 and 100, got: ${leverage}`);
      return { mode: 'perp', action: 'open', coin, size, direction, leverage, isCross };
    }
  }

  throw new Error(`Unknown mode/action: ${mode} ${action}`);
}

/**
 * Calculate IOC limit price with 5% slippage budget.
 * Buy: +5% above mid. Sell: -5% below mid.
 *
 * @param {boolean} isBuy
 * @param {number} mid  Mid price as a number
 * @returns {number}
 */
export function ioPrice(isBuy, mid) {
  return isBuy ? mid * 1.05 : mid * 0.95;
}

/**
 * Determine the closing order side from position size.
 * szi > 0 = long → close by selling (isBuy = false)
 * szi < 0 = short → close by buying (isBuy = true)
 *
 * @param {number} szi  Signed position size
 * @returns {boolean} isBuy
 */
export function closeDirection(szi) {
  return szi < 0;
}
