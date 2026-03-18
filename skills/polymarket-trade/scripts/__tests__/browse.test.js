import { vi, describe, it, expect, afterEach } from 'vitest';
import { formatMarketOutput, extractTokenIds, resolveMarket, search } from '../browse.js';

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
  it('returns YES and NO token IDs from tokens array (CLOB format)', () => {
    const ids = extractTokenIds(mockMarket);
    expect(ids.YES).toBe('712345');
    expect(ids.NO).toBe('523456');
  });

  it('returns YES and NO token IDs from clobTokenIds string (Gamma keyword format)', () => {
    const gammaMarket = {
      question: 'Will BTC hit 100k?',
      active: true,
      clobTokenIds: '["53135072abc","60869871def"]',
      outcomes: '["Yes","No"]',
    };
    const ids = extractTokenIds(gammaMarket);
    expect(ids.YES).toBe('53135072abc');
    expect(ids.NO).toBe('60869871def');
  });

  it('returns null/null when neither tokens nor clobTokenIds present', () => {
    const ids = extractTokenIds({ question: 'test', active: true });
    expect(ids.YES).toBeNull();
    expect(ids.NO).toBeNull();
  });
});

describe('formatMarketOutput with Gamma keyword format', () => {
  it('shows token IDs from clobTokenIds', () => {
    const gammaMarket = {
      question: 'Will BTC hit 100k?',
      active: true,
      neg_risk: false,
      clobTokenIds: '["53135072abc","60869871def"]',
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.72","0.28"]',
      min_incentive_size: '5',
    };
    const out = formatMarketOutput(gammaMarket, {});
    expect(out).toContain('53135072abc');
    expect(out).toContain('60869871def');
  });

  it('shows prices from outcomePrices when tokens array absent', () => {
    const gammaMarket = {
      question: 'Will BTC hit 100k?',
      active: true,
      neg_risk: false,
      clobTokenIds: '["53135072abc","60869871def"]',
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.72","0.28"]',
    };
    const out = formatMarketOutput(gammaMarket, {});
    expect(out).toContain('0.72');
    expect(out).toContain('0.28');
  });
});

// ── search (Events API path) ───────────────────────────────────────────────────

describe('search', () => {
  afterEach(() => vi.clearAllMocks());

  it('uses Events API for keyword search and flattens markets', async () => {
    const { default: axios } = await import('axios');
    const activeMarket = {
      question: 'Will BTC hit 100k by end of 2025?',
      active: true,
      closed: false,
      conditionId: 'cond123',
      clobTokenIds: '["tokenA","tokenB"]',
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.65","0.35"]',
    };
    const closedMarket = { ...activeMarket, question: 'Old closed market', active: true, closed: true };
    axios.get.mockImplementation(url => {
      if (url.includes('/events')) return Promise.resolve({ data: [{ markets: [activeMarket, closedMarket] }] });
      // orderbook + marketInfo calls — return empty
      return Promise.resolve({ data: {} });
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await search('bitcoin', { yaml: {} });
    const output = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Will BTC hit 100k');
    expect(output).not.toContain('Old closed market');
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/events?q=bitcoin&active=true&closed=false'),
      expect.any(Object),
    );
    logSpy.mockRestore();
  });
});

// ── resolveMarket ─────────────────────────────────────────────────────────────

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

// Use a different name to avoid collision with the existing mockMarket const above
const mockSlugMarket = {
  question: 'Will BTC reach $100k by Dec 2025?',
  slug: 'bitcoin-100k-2025',
  active: true,
  tokens: [],
};

describe('resolveMarket', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns market when exact slug found (200)', async () => {
    const { default: axios } = await import('axios');
    axios.get.mockResolvedValue({ data: mockSlugMarket });
    const result = await resolveMarket('bitcoin-100k-2025', { yaml: {} });
    expect(result).toEqual(mockSlugMarket);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/markets/bitcoin-100k-2025'),
      expect.any(Object),
    );
  });

  it('falls back to keyword search on 404, returns single result', async () => {
    const { default: axios } = await import('axios');
    const err404 = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    axios.get
      .mockRejectedValueOnce(err404)
      .mockResolvedValueOnce({ data: [mockSlugMarket] });
    const result = await resolveMarket('bitcoin 100k', { yaml: {} });
    expect(result).toEqual(mockSlugMarket);
  });

  it('calls process.exit(1) and prints list when multiple results found', async () => {
    const { default: axios } = await import('axios');
    const err404 = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    axios.get
      .mockRejectedValueOnce(err404)
      .mockResolvedValueOnce({ data: [mockSlugMarket, { ...mockSlugMarket, slug: 'bitcoin-200k-2025' }] });
    await expect(resolveMarket('bitcoin', { yaml: {} })).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 markets matching "bitcoin"'));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Specify the exact slug'));
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('throws Market not found when keyword search returns no results', async () => {
    const { default: axios } = await import('axios');
    const err404 = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    axios.get
      .mockRejectedValueOnce(err404)
      .mockResolvedValueOnce({ data: [] });
    await expect(resolveMarket('nonexistent-market', { yaml: {} })).rejects.toThrow('Market not found: nonexistent-market');
  });

  it('rethrows non-404 errors from slug fetch', async () => {
    const { default: axios } = await import('axios');
    const err403 = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
    axios.get.mockRejectedValue(err403);
    await expect(resolveMarket('some-slug', { yaml: {} })).rejects.toThrow('Forbidden');
  });
});
