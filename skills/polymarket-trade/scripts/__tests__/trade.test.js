import { describe, it, expect } from 'vitest';
import { getSafetyLevel, validateHardStops } from '../trade.js';

describe('getSafetyLevel', () => {
  it('under warn threshold → proceed', () => {
    expect(getSafetyLevel(10, { warn_threshold_usd: 50, confirm_threshold_usd: 500 })).toBe('proceed');
  });
  it('at warn threshold → warn', () => {
    expect(getSafetyLevel(50, { warn_threshold_usd: 50, confirm_threshold_usd: 500 })).toBe('warn');
  });
  it('between thresholds → warn', () => {
    expect(getSafetyLevel(200, { warn_threshold_usd: 50, confirm_threshold_usd: 500 })).toBe('warn');
  });
  it('at confirm threshold → confirm', () => {
    expect(getSafetyLevel(500, { warn_threshold_usd: 50, confirm_threshold_usd: 500 })).toBe('confirm');
  });
  it('over confirm threshold → confirm', () => {
    expect(getSafetyLevel(1000, { warn_threshold_usd: 50, confirm_threshold_usd: 500 })).toBe('confirm');
  });
});

describe('validateHardStops', () => {
  const ok = { usdceBalance: 200, polBalance: 0.05, marketActive: true, minOrderSize: 5 };

  it('passes when all conditions ok', () => {
    expect(() => validateHardStops(100, ok)).not.toThrow();
  });
  it('throws when USDC.e insufficient', () => {
    expect(() => validateHardStops(100, { ...ok, usdceBalance: 50 })).toThrow('USDC.e');
  });
  it('throws when gas too low', () => {
    expect(() => validateHardStops(100, { ...ok, polBalance: 0.005 })).toThrow('POL');
  });
  it('throws when market is closed', () => {
    expect(() => validateHardStops(100, { ...ok, marketActive: false })).toThrow('CLOSED');
  });
  it('throws when below min order size', () => {
    expect(() => validateHardStops(3, { ...ok, minOrderSize: 5 })).toThrow('min');
  });
});
