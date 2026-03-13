import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../swap.js';

describe('parseCliArgs', () => {
  it('parses quote subcommand with --side and --amount', () => {
    const result = parseCliArgs(['quote', '--side', 'buy', '--amount', '100']);
    expect(result.command).toBe('quote');
    expect(result.side).toBe('buy');
    expect(result.amount).toBe('100');
  });

  it('parses approve with --token and --amount', () => {
    const result = parseCliArgs(['approve', '--token', 'USDT', '--amount', '1000']);
    expect(result.command).toBe('approve');
    expect(result.token).toBe('USDT');
    expect(result.amount).toBe('1000');
  });

  it('parses swap with --side, --amount, --min-out', () => {
    const result = parseCliArgs(['swap', '--side', 'sell', '--amount', '0.5', '--min-out', '1500']);
    expect(result.command).toBe('swap');
    expect(result.side).toBe('sell');
    expect(result.amount).toBe('0.5');
    expect(result.minOut).toBe('1500');
  });

  it('parses balance (no args needed)', () => {
    const result = parseCliArgs(['balance']);
    expect(result.command).toBe('balance');
  });

  it('parses allowance with --token', () => {
    const result = parseCliArgs(['allowance', '--token', 'XAUT']);
    expect(result.command).toBe('allowance');
    expect(result.token).toBe('XAUT');
  });

  it('parses address', () => {
    const result = parseCliArgs(['address']);
    expect(result.command).toBe('address');
  });

  it('parses sign with --data-file', () => {
    const result = parseCliArgs(['sign', '--data-file', '/tmp/typed-data.json']);
    expect(result.command).toBe('sign');
    expect(result.dataFile).toBe('/tmp/typed-data.json');
  });

  it('parses cancel-nonce with --word-pos and --mask', () => {
    const result = parseCliArgs(['cancel-nonce', '--word-pos', '42', '--mask', '115792089237316195423570985008687907853269984665640564039457584007913129639935']);
    expect(result.command).toBe('cancel-nonce');
    expect(result.wordPos).toBe('42');
    expect(result.mask).toBe('115792089237316195423570985008687907853269984665640564039457584007913129639935');
  });

  it('errors on unknown subcommand', () => {
    expect(() => parseCliArgs(['unknown-cmd'])).toThrow(/unknown command/i);
  });

  it('parses --config-dir override', () => {
    const result = parseCliArgs(['balance', '--config-dir', '/tmp/myconfig']);
    expect(result.command).toBe('balance');
    expect(result.configDir).toBe('/tmp/myconfig');
  });
});
