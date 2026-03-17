import { describe, it, expect } from 'vitest';
import { formatBalances } from '../balance.js';

describe('formatBalances', () => {
  it('formats address and all three balances', () => {
    const result = { address: '0xABC', pol: '0.1234', usdce: '100.000000', clob: '50.00' };
    const out = formatBalances(result);
    expect(out).toContain('0xABC');
    expect(out).toContain('0.1234');
    expect(out).toContain('100.000000');
    expect(out).toContain('50.00');
  });

  it('omits CLOB line when clob is null', () => {
    const result = { address: '0xABC', pol: '0.1234', usdce: '100.000000', clob: null };
    const out = formatBalances(result);
    expect(out).not.toContain('CLOB');
  });
});
