import { describe, it, expect } from 'vitest';
import { formatMarketOutput, extractTokenIds } from '../browse.js';

const mockMarket = {
  question: 'Will BTC reach $100k by Dec 2025?',
  active: true,
  neg_risk: false,
  tokens: [
    { outcome: 'Yes', token_id: '712345', price: 0.72 },
    { outcome: 'No',  token_id: '523456', price: 0.28 },
  ],
  min_incentive_size: '5',
};

const mockOrderbooks = {
  '712345': { bids: [{ price: '0.71', size: '100' }], asks: [{ price: '0.73', size: '200' }] },
  '523456': { bids: [{ price: '0.27', size: '80'  }], asks: [{ price: '0.29', size: '150' }] },
};

describe('formatMarketOutput', () => {
  it('includes market question', () => {
    const out = formatMarketOutput(mockMarket, mockOrderbooks);
    expect(out).toContain('Will BTC reach $100k');
  });

  it('shows YES and NO token prices', () => {
    const out = formatMarketOutput(mockMarket, mockOrderbooks);
    expect(out).toContain('YES');
    expect(out).toContain('NO');
    expect(out).toContain('0.72');
  });

  it('shows neg_risk flag', () => {
    const out = formatMarketOutput({ ...mockMarket, neg_risk: true }, mockOrderbooks);
    expect(out).toContain('neg_risk: true');
  });

  it('shows token IDs', () => {
    const out = formatMarketOutput(mockMarket, mockOrderbooks);
    expect(out).toContain('712345');
  });

  it('shows min order size', () => {
    const out = formatMarketOutput(mockMarket, mockOrderbooks);
    expect(out).toContain('Min order');
    expect(out).toContain('$5');
  });

  it('renders — fallbacks when orderbooks and marketInfo are missing', () => {
    const out = formatMarketOutput(mockMarket, {});
    expect(out).toContain('—');
    expect(out).toContain('Will BTC reach $100k');
  });
});

describe('extractTokenIds', () => {
  it('returns YES and NO token IDs', () => {
    const ids = extractTokenIds(mockMarket);
    expect(ids.YES).toBe('712345');
    expect(ids.NO).toBe('523456');
  });
});
