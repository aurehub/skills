# polymarket-trade: Positions & Market Resolve Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add position tracking to `balance.js` and keyword-based market resolution to `browse.js`/`trade.js`.

**Architecture:** Feature 1 adds `fetchPositions(address, cfg)` to `balance.js` using the public `data-api.polymarket.com/positions` endpoint. Feature 2 adds `resolveMarket(query, cfg)` to `browse.js`, replacing the fragile exact-slug-only IIFE in `trade.js` CLI with a slug-first, keyword-fallback approach.

**Tech Stack:** Node.js ESM, vitest, axios (dynamic import), ethers v5, `@polymarket/clob-client`

**Spec:** `skills/polymarket-trade/DESIGN.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/balance.js` | Modify | Add `fetchPositions`, update `getBalances` + `formatBalances` |
| `scripts/browse.js` | Modify | Add exported `resolveMarket(query, cfg)` |
| `scripts/trade.js` | Modify | Replace inline market IIFE with `resolveMarket` |
| `scripts/__tests__/balance.test.js` | Modify | New tests for `fetchPositions` + updated `formatBalances` |
| `scripts/__tests__/browse.test.js` | Modify | New tests for `resolveMarket` |
| `config.example.yaml` | Modify | Add `data_url` under `polymarket:` |
| `SKILL.tests.yaml` | Modify | Add 2 new test cases |

---

## Pre-flight

- [ ] **Confirm working directory**

```bash
cd skills/polymarket-trade/scripts
npm test
```
Expected: all tests pass (green). If any fail, stop and fix before proceeding.

---

## Task 1: Add `axios` as explicit dependency

`axios` is currently installed as a transitive dep but not listed in `package.json`. Make it explicit so it won't break on a clean install.

**Files:**
- Modify: `scripts/package.json`

- [ ] **Step 1: Add axios to dependencies**

```bash
cd skills/polymarket-trade/scripts
npm install axios
```

Expected: `package.json` now lists `"axios": "^1.x.x"` under `dependencies`.

- [ ] **Step 2: Verify tests still pass**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..  # back to skills/polymarket-trade
git add scripts/package.json scripts/package-lock.json
git commit -m "chore(polymarket-trade): add axios as explicit dependency"
```

---

## Task 2: `fetchPositions` — failing tests first

**Files:**
- Modify: `scripts/__tests__/balance.test.js`

- [ ] **Step 1: Add failing tests for `fetchPositions`**

Append to `scripts/__tests__/balance.test.js`:

```js
import { vi, describe, it, expect, afterEach } from 'vitest';
import { fetchPositions, formatBalances } from '../balance.js';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

describe('fetchPositions', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns positions array on success', async () => {
    const { default: axios } = await import('axios');
    axios.get.mockResolvedValue({
      data: [
        { outcome: 'YES', slug: 'bitcoin-100k-2025', size: '42.5', curPrice: '0.72', currentValue: '30.60', title: 'Will BTC reach $100k?' },
      ],
    });
    const result = await fetchPositions('0xabc', { yaml: {} });
    expect(result).toHaveLength(1);
    expect(result[0].outcome).toBe('YES');
    expect(result[0].slug).toBe('bitcoin-100k-2025');
  });

  it('returns [] on network error (silent skip)', async () => {
    const { default: axios } = await import('axios');
    axios.get.mockRejectedValue(new Error('Network error'));
    const result = await fetchPositions('0xabc', { yaml: {} });
    expect(result).toEqual([]);
  });

  it('uses data_url from config when set', async () => {
    const { default: axios } = await import('axios');
    axios.get.mockResolvedValue({ data: [] });
    await fetchPositions('0xabc', { yaml: { polymarket: { data_url: 'https://custom.example.com' } } });
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://custom.example.com'),
      expect.any(Object),
    );
  });
});

describe('formatBalances — positions', () => {
  it('renders Positions section when positions present', () => {
    const b = {
      address: '0xabc',
      pol: '0.1000',
      usdce: '100.500000',
      clob: null,
      positions: [
        { outcome: 'YES', slug: 'bitcoin-100k-2025', size: '42.5', curPrice: '0.72', currentValue: '30.60' },
      ],
    };
    const out = formatBalances(b);
    expect(out).toContain('Positions');
    expect(out).toContain('YES');
    expect(out).toContain('bitcoin-100k-2025');
    expect(out).toContain('42.50');
  });

  it('omits Positions section when positions is empty', () => {
    const b = { address: '0xabc', pol: '0.1000', usdce: '100.00', clob: null, positions: [] };
    const out = formatBalances(b);
    expect(out).not.toContain('Positions');
  });

  it('formats USDC.e to 2 decimal places', () => {
    const b = { address: '0xabc', pol: '0.1000', usdce: '100.500000', clob: null, positions: [] };
    const out = formatBalances(b);
    expect(out).toContain('$100.50');
    expect(out).not.toContain('100.500000');
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd skills/polymarket-trade/scripts
npm test -- __tests__/balance.test.js
```

Expected: FAIL — `fetchPositions is not a function` (or similar). If tests pass unexpectedly, something is wrong.

---

## Task 3: Implement `fetchPositions` in `balance.js`

**Files:**
- Modify: `scripts/balance.js`

- [ ] **Step 1: Add `fetchPositions` export and update `getBalances` + `formatBalances`**

Replace the contents of `scripts/balance.js` with:

```js
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ethers } from 'ethers';
import { loadConfig, resolveRpcUrl } from './lib/config.js';
import { createSigner } from './lib/signer.js';
import { createL2Client } from './lib/clob.js';
import { checkEnvFile, checkVaultFile, checkPasswordFile, checkConfigFile } from './setup.js';

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
const AUREHUB_DIR = join(homedir(), '.aurehub');
const DEFAULT_DATA_URL = 'https://data-api.polymarket.com';

export async function fetchPositions(address, cfg) {
  try {
    const { default: axios } = await import('axios');
    const dataUrl = cfg.yaml?.polymarket?.data_url ?? DEFAULT_DATA_URL;
    const res = await axios.get(
      `${dataUrl}/positions?user=${address}&sizeThreshold=.1`,
      { timeout: 10_000 },
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

export async function getBalances(cfg) {
  const rpcUrl = resolveRpcUrl(cfg);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = (await createSigner(cfg)).connect(provider);
  const address = wallet.address;

  const contracts = cfg.yaml?.contracts ?? {};
  const usdceAddr = contracts.usdc_e ?? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

  const polBal   = await provider.getBalance(address);
  const usdce    = new ethers.Contract(usdceAddr, ERC20_ABI, provider);
  const usdceBal = await usdce.balanceOf(address);

  const result = {
    address,
    pol:       parseFloat(ethers.utils.formatEther(polBal)).toFixed(4),
    usdce:     ethers.utils.formatUnits(usdceBal, 6),
    clob:      null,
    positions: [],
  };

  const credsPath = join(AUREHUB_DIR, '.polymarket_clob');
  if (existsSync(credsPath)) {
    try {
      const client = await createL2Client(cfg, wallet, credsPath);
      await client.updateBalanceAllowance({ asset_type: 'COLLATERAL' });
      const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
      result.clob = (parseFloat(bal.balance) / 1e6).toFixed(2);
    } catch { /* CLOB balance optional */ }
  }

  result.positions = await fetchPositions(address, cfg);

  return result;
}

export function formatBalances(b) {
  const lines = [
    `💰 ${b.address}`,
    `   POL:    ${b.pol}`,
    `   USDC.e: $${parseFloat(b.usdce).toFixed(2)}  ← trading token`,
  ];
  if (b.clob !== null) lines.push(`   CLOB:   $${b.clob}  ← available for orders`);

  if (b.positions?.length > 0) {
    lines.push('');
    lines.push('   Positions:');
    for (const p of b.positions) {
      const size  = parseFloat(p.size).toFixed(2);
      const price = parseFloat(p.curPrice).toFixed(2);
      const value = parseFloat(p.currentValue).toFixed(2);
      lines.push(`     ${p.outcome.padEnd(4)} ${p.slug.padEnd(32)} ${size} shares  $${price}/share  ~$${value}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      checkEnvFile(); checkVaultFile(); checkPasswordFile(); checkConfigFile();
      const cfg = loadConfig();
      const b = await getBalances(cfg);
      console.log(formatBalances(b));
    } catch (e) {
      console.error('❌', e.message);
      process.exit(1);
    }
  })();
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd skills/polymarket-trade/scripts
npm test -- __tests__/balance.test.js
```

Expected: all balance tests pass (including the new ones).

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd ..
git add scripts/balance.js scripts/__tests__/balance.test.js
git commit -m "feat(polymarket-trade): add position tracking to balance.js"
```

---

## Task 4: `resolveMarket` — failing tests first

**Files:**
- Modify: `scripts/__tests__/browse.test.js`

- [ ] **Step 1: Add failing tests for `resolveMarket`**

Append to `scripts/__tests__/browse.test.js`:

```js
import { vi, describe, it, expect, afterEach } from 'vitest';
import { resolveMarket } from '../browse.js';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

const mockMarket = {
  question: 'Will BTC reach $100k by Dec 2025?',
  slug: 'bitcoin-100k-2025',
  active: true,
  tokens: [],
};

describe('resolveMarket', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns market when exact slug found (200)', async () => {
    const { default: axios } = await import('axios');
    axios.get.mockResolvedValue({ data: mockMarket });
    const cfg = { yaml: {} };
    const result = await resolveMarket('bitcoin-100k-2025', cfg);
    expect(result).toEqual(mockMarket);
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
      .mockResolvedValueOnce({ data: [mockMarket] });
    const cfg = { yaml: {} };
    const result = await resolveMarket('bitcoin 100k', cfg);
    expect(result).toEqual(mockMarket);
  });

  it('calls process.exit(1) and prints list when multiple results found', async () => {
    const { default: axios } = await import('axios');
    const err404 = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    axios.get
      .mockRejectedValueOnce(err404)
      .mockResolvedValueOnce({ data: [mockMarket, { ...mockMarket, slug: 'bitcoin-200k-2025' }] });
    const cfg = { yaml: {} };
    await expect(resolveMarket('bitcoin', cfg)).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('throws Market not found when keyword search returns no results', async () => {
    const { default: axios } = await import('axios');
    const err404 = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    axios.get
      .mockRejectedValueOnce(err404)
      .mockResolvedValueOnce({ data: [] });
    const cfg = { yaml: {} };
    await expect(resolveMarket('nonexistent-market', cfg)).rejects.toThrow('Market not found: nonexistent-market');
  });

  it('rethrows non-404 errors from slug fetch', async () => {
    const { default: axios } = await import('axios');
    const err403 = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
    axios.get.mockRejectedValue(err403);
    const cfg = { yaml: {} };
    await expect(resolveMarket('some-slug', cfg)).rejects.toThrow('Forbidden');
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd skills/polymarket-trade/scripts
npm test -- __tests__/browse.test.js
```

Expected: FAIL — `resolveMarket is not a function`.

---

## Task 5: Implement `resolveMarket` in `browse.js`

**Files:**
- Modify: `scripts/browse.js`

- [ ] **Step 1: Add `resolveMarket` export to `browse.js`**

Add the following function before the CLI entry point in `scripts/browse.js`:

```js
// ── Market resolution (slug-first, keyword fallback) ──────────────────────────

export async function resolveMarket(query, cfg) {
  const { default: axios } = await import('axios');
  const gammaUrl = cfg.yaml?.polymarket?.gamma_url ?? DEFAULT_GAMMA_URL;

  // Step 1: try exact slug directly (do NOT use fetchGamma — it uses a '/' heuristic
  // that would misroute slugs like 'bitcoin-100k-2025' into keyword search)
  try {
    const res = await axios.get(`${gammaUrl}/markets/${query}`, { timeout: 10_000 });
    return res.data;
  } catch (e) {
    if (e.response?.status !== 404) throw e;
  }

  // Step 2: keyword fallback
  const markets = await fetchGamma(gammaUrl, query);
  if (markets.length === 0) throw new Error(`Market not found: ${query}`);
  if (markets.length === 1) return markets[0];

  // Multiple results — print and exit
  console.error(`Found ${markets.length} markets matching "${query}":`);
  markets.slice(0, 5).forEach((m, i) => {
    const status = m.active ? 'ACTIVE' : 'CLOSED';
    console.error(`  ${i + 1}. ${(m.slug ?? '(no slug)').padEnd(36)} "${m.question}"  ${status}`);
  });
  console.error(`\nSpecify the exact slug: node scripts/trade.js --buy --market <slug> --side YES|NO --amount <usd>`);
  process.exit(1);
}
```

- [ ] **Step 2: Run browse tests to verify they pass**

```bash
cd skills/polymarket-trade/scripts
npm test -- __tests__/browse.test.js
```

Expected: all browse tests pass.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd ..
git add scripts/browse.js scripts/__tests__/browse.test.js
git commit -m "feat(polymarket-trade): add resolveMarket with keyword fallback to browse.js"
```

---

## Task 6: Update `trade.js` to use `resolveMarket`

**Files:**
- Modify: `scripts/trade.js`

- [ ] **Step 1: Update the import line and replace the inline market IIFE**

In `scripts/trade.js`, find line 9:
```js
import { extractTokenIds } from './browse.js';
```
Replace with:
```js
import { extractTokenIds, resolveMarket } from './browse.js';
```

Then find the inline market fetch IIFE (lines ~218-224):
```js
      // Browse to get market + token IDs
      const markets = await (async () => {
        // Re-use browse search but return raw market object
        const { default: axios } = await import('axios');
        const gammaUrl = cfg.yaml?.polymarket?.gamma_url ?? 'https://gamma-api.polymarket.com';
        const res = await axios.get(`${gammaUrl}/markets/${query}`, { timeout: 10_000 });
        return [res.data];
      })();
      const market = markets[0];
      if (!market) throw new Error(`Market not found: ${query}`);
```
Replace with:
```js
      // Resolve market by slug or keyword (see browse.js resolveMarket)
      const market = await resolveMarket(query, cfg);
```

- [ ] **Step 2: Run full test suite**

```bash
cd skills/polymarket-trade/scripts
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..
git add scripts/trade.js
git commit -m "feat(polymarket-trade): use resolveMarket in trade.js CLI"
```

---

## Task 7: Config and SKILL.tests.yaml updates

**Files:**
- Modify: `config.example.yaml`
- Modify: `SKILL.tests.yaml`

- [ ] **Step 1: Add `data_url` to `config.example.yaml`**

In `config.example.yaml`, find the `polymarket:` section:
```yaml
polymarket:
  clob_url: "https://clob.polymarket.com"
  gamma_url: "https://gamma-api.polymarket.com"
  chain_id: 137              # 137 = Polygon mainnet, 80002 = Amoy testnet
```
Add `data_url` as the first entry:
```yaml
polymarket:
  clob_url: "https://clob.polymarket.com"
  gamma_url: "https://gamma-api.polymarket.com"
  data_url: "https://data-api.polymarket.com"
  chain_id: 137              # 137 = Polygon mainnet, 80002 = Amoy testnet
```

- [ ] **Step 2: Add two test cases to `SKILL.tests.yaml`**

In `SKILL.tests.yaml`, append to the `full:` suite tests (before the final line):

```yaml
      - id: full-balance-positions
        description: Balance — shows open positions when held
        prompt: "Show my Polymarket balance and positions"
        expect:
          - pattern: "balance\\.js"
            type: command
          - pattern: "Positions|shares"
            type: output

      - id: full-trade-keyword
        description: Trade — keyword input resolves market, agent confirms slug
        prompt: "Buy $10 YES on bitcoin"
        expect:
          - pattern: "trade\\.js.*--buy.*--side YES"
            type: command
```

- [ ] **Step 3: Run full test suite one final time**

```bash
cd skills/polymarket-trade/scripts
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd ..
git add config.example.yaml SKILL.tests.yaml
git commit -m "chore(polymarket-trade): add data_url config and new SKILL test cases"
```

---

## Done

All tasks complete. Verify final state:

```bash
git log --oneline -6
```

Expected output (4 new commits on top of existing):
```
<hash> chore(polymarket-trade): add data_url config and new SKILL test cases
<hash> feat(polymarket-trade): use resolveMarket in trade.js CLI
<hash> feat(polymarket-trade): add resolveMarket with keyword fallback to browse.js
<hash> feat(polymarket-trade): add position tracking to balance.js
<hash> chore(polymarket-trade): add axios as explicit dependency
```
