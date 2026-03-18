import { vi, describe, it, expect, afterEach } from 'vitest';
import { formatMarketOutput, extractTokenIds, resolveMarket } from '../browse.js';

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
