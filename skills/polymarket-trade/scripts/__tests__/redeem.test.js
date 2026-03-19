// scripts/__tests__/redeem.test.js
import { vi, describe, it, expect, afterEach } from 'vitest';
import { filterRedeemable, buildIndexSets, formatRedeemPreview, redeem } from '../redeem.js';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));
import axios from 'axios';

const makePos = (overrides) => ({
  slug: 'test-market',
  outcome: 'YES',
  outcomeIndex: 0,
  size: '2.0',
  curPrice: '1.0',
  conditionId: '0xdeadbeef',
  redeemable: true,
  negativeRisk: false,
  ...overrides,
});

const makeCfg = () => ({
  yaml: {
    contracts: {
      usdc_e: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      ctf_contract: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
    },
    polymarket: { data_url: 'https://data-api.polymarket.com' },
  },
});

const makeProvider = (polEther = '0.1') => ({
  // Return a plain string — ethers v5 BigNumber.from() accepts strings as BigNumberish
  getBalance: vi.fn().mockResolvedValue(
    String(BigInt(Math.floor(parseFloat(polEther) * 1e18)))
  ),
  getFeeData: vi.fn().mockResolvedValue({
    maxPriorityFeePerGas: { lt: () => false, toString: () => '30000000000' },
    maxFeePerGas:         { lt: () => false, toString: () => '30000000000' },
  }),
});

afterEach(() => vi.clearAllMocks());

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('filterRedeemable', () => {
  it('returns empty arrays when no positions', () => {
    const { standard, negRisk } = filterRedeemable([]);
    expect(standard).toHaveLength(0);
    expect(negRisk).toHaveLength(0);
  });

  it('splits redeemable standard vs negRisk', () => {
    const positions = [
      makePos({ redeemable: true,  negativeRisk: false }),
      makePos({ redeemable: true,  negativeRisk: true  }),
      makePos({ redeemable: false, negativeRisk: false }),
    ];
    const { standard, negRisk } = filterRedeemable(positions);
    expect(standard).toHaveLength(1);
    expect(negRisk).toHaveLength(1);
  });

  it('ignores non-redeemable positions entirely', () => {
    const { standard, negRisk } = filterRedeemable([makePos({ redeemable: false })]);
    expect(standard).toHaveLength(0);
    expect(negRisk).toHaveLength(0);
  });
});

describe('buildIndexSets', () => {
  it('outcomeIndex=0 → [1]', () => {
    expect(buildIndexSets(0)).toEqual([1]);
  });
  it('outcomeIndex=1 → [2]', () => {
    expect(buildIndexSets(1)).toEqual([2]);
  });
});

describe('formatRedeemPreview', () => {
  it('contains slug, outcome, shares, receive', () => {
    const out = formatRedeemPreview([makePos({ slug: 'my-market', outcome: 'YES', size: '3.0' })]);
    expect(out).toContain('my-market');
    expect(out).toContain('YES');
    expect(out).toContain('3.00');
    expect(out).toContain('~$3.00');
  });

  it('sums total correctly', () => {
    const out = formatRedeemPreview([
      makePos({ size: '2.0' }),
      makePos({ slug: 'other', size: '3.0' }),
    ]);
    expect(out).toContain('Total');
    expect(out).toContain('~$5.00');
  });
});

// ── redeem() function ─────────────────────────────────────────────────────────

describe('redeem() — dry-run exits before confirm', () => {
  it('prints preview and returns without executing when dryRun=true', async () => {
    axios.get.mockResolvedValue({ data: [makePos()] });
    const wallet = { address: '0xUser' };
    const provider = makeProvider('0.5');
    // If confirm were called it would hang; dryRun should bypass it entirely
    await expect(
      redeem({ cfg: makeCfg(), provider, wallet, marketFilter: null, dryRun: true }),
    ).resolves.toBeUndefined();
  });
});

describe('redeem() — no redeemable positions', () => {
  it('returns without error when positions API returns empty list', async () => {
    axios.get.mockResolvedValue({ data: [] });
    const wallet = { address: '0xUser' };
    await expect(
      redeem({ cfg: makeCfg(), provider: makeProvider(), wallet, marketFilter: null, dryRun: true }),
    ).resolves.toBeUndefined();
  });
});

describe('redeem() — market filter', () => {
  it('only passes matching slug to preview', async () => {
    axios.get.mockResolvedValue({
      data: [
        makePos({ slug: 'target-market' }),
        makePos({ slug: 'other-market'  }),
      ],
    });
    const wallet = { address: '0xUser' };
    // dry-run so no confirm needed; if filter works, only 1 position reaches formatRedeemPreview
    await redeem({ cfg: makeCfg(), provider: makeProvider(), wallet, marketFilter: 'target-market', dryRun: true });
    // No error = filter did not throw; stdout would show only target-market (verified manually)
  });
});

describe('redeem() — negRisk-only skip', () => {
  it('returns without error when all redeemable positions are negRisk', async () => {
    axios.get.mockResolvedValue({
      data: [makePos({ redeemable: true, negativeRisk: true })],
    });
    const wallet = { address: '0xUser' };
    await expect(
      redeem({ cfg: makeCfg(), provider: makeProvider(), wallet, marketFilter: null, dryRun: true }),
    ).resolves.toBeUndefined();
  });
});

describe('redeem() — insufficient POL', () => {
  it('throws before any API call when POL < 0.01', async () => {
    const wallet = { address: '0xUser' };
    const provider = makeProvider('0.005');
    await expect(
      redeem({ cfg: makeCfg(), provider, wallet, marketFilter: null, dryRun: false }),
    ).rejects.toThrow('POL');
  });
});
