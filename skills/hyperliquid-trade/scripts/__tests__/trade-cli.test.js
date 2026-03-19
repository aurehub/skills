import { describe, it, expect } from 'vitest';
import { parseArgs, ioPrice, closeDirection } from '../lib/trade-helpers.js';

describe('parseArgs', () => {
  it('parses spot buy', () => {
    const args = ['spot', 'buy', 'ETH', '0.1'];
    expect(parseArgs(args)).toEqual({
      mode: 'spot', action: 'buy', coin: 'ETH', size: 0.1,
      direction: null, leverage: null, isCross: true,
    });
  });

  it('parses spot sell', () => {
    const args = ['spot', 'sell', 'BTC', '0.05'];
    expect(parseArgs(args)).toEqual({
      mode: 'spot', action: 'sell', coin: 'BTC', size: 0.05,
      direction: null, leverage: null, isCross: true,
    });
  });

  it('parses perp open long with leverage and --cross', () => {
    const args = ['perp', 'open', 'ETH', 'long', '0.1', '--leverage', '5', '--cross'];
    const result = parseArgs(args);
    expect(result.mode).toBe('perp');
    expect(result.action).toBe('open');
    expect(result.direction).toBe('long');
    expect(result.leverage).toBe(5);
    expect(result.isCross).toBe(true);
  });

  it('parses perp open short with --isolated', () => {
    const args = ['perp', 'open', 'ETH', 'short', '0.1', '--leverage', '10', '--isolated'];
    const result = parseArgs(args);
    expect(result.direction).toBe('short');
    expect(result.isCross).toBe(false);
  });

  it('parses perp close', () => {
    const args = ['perp', 'close', 'ETH', '0.1'];
    expect(parseArgs(args)).toMatchObject({
      mode: 'perp', action: 'close', coin: 'ETH', size: 0.1,
    });
  });

  it('defaults leverage to null when not specified', () => {
    const args = ['perp', 'open', 'ETH', 'long', '0.1'];
    const result = parseArgs(args);
    expect(result.leverage).toBeNull();
    expect(result.isCross).toBe(true);
  });

  it('throws on missing coin', () => {
    expect(() => parseArgs(['spot', 'buy'])).toThrow();
  });

  it('throws on invalid size', () => {
    expect(() => parseArgs(['spot', 'buy', 'ETH', 'abc'])).toThrow();
  });
});

describe('ioPrice', () => {
  it('buy price is 5% above mid', () => {
    expect(ioPrice(true, 3000)).toBeCloseTo(3150);
  });

  it('sell price is 5% below mid', () => {
    expect(ioPrice(false, 3000)).toBeCloseTo(2850);
  });
});

describe('closeDirection', () => {
  it('long position (szi > 0) needs a sell to close', () => {
    expect(closeDirection(0.5)).toBe(false);
  });

  it('short position (szi < 0) needs a buy to close', () => {
    expect(closeDirection(-0.5)).toBe(true);
  });
});
