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

- [ ] **Confirm working directory and tests are green**

```bash
cd skills/polymarket-trade/scripts
npm test
```
Expected: all existing tests pass. If any fail, stop and fix before proceeding.

---

## Task 1: Add `axios` as explicit dependency

`axios` is currently installed as a transitive dep but not declared in `package.json`. Make it explicit.

**Files:**
- Modify: `scripts/package.json`

- [ ] **Step 1: Add axios**

```bash
cd skills/polymarket-trade/scripts
npm install axios
```

Expected: `package.json` now lists `"axios"` under `dependencies`.

- [ ] **Step 2: Verify tests still pass**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
cd ..
git add scripts/package.json scripts/package-lock.json
git commit -m "chore(polymarket-trade): add axios as explicit dependency"
```

---

## Task 2: `fetchPositions` — failing tests first

**Files:**
- Modify: `scripts/__tests__/balance.test.js`

Note: The existing file has a `toContain('100.000000')` assertion that will break when `formatBalances` is updated to use `toFixed(2)`. This task rewrites the whole file to fix that assertion and add the new tests — all in one go, before touching `balance.js`.

- [ ] **Step 1: Replace `balance.test.js` with merged content**

Overwrite `scripts/__tests__/balance.test.js` with:

```js
import { vi, describe, it, expect, afterEach } from 'vitest';
import { formatBalances, fetchPositions } from '../balance.js';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

// ── formatBalances (existing tests, updated for toFixed(2) USDC.e) ────────────

describe('formatBalances', () => {
  it('formats address and all three balances', () => {
    const result = { address: '0xABC', pol: '0.1234', usdce: '100.000000', clob: '50.00', positions: [] };
    const out = formatBalances(result);
    expect(out).toContain('0xABC');
    expect(out).toContain('0.1234');
    expect(out).toContain('$100.00');   // toFixed(2) — was '100.000000'
    expect(out).toContain('50.00');
  });

  it('omits CLOB line when clob is null', () => {
    const result = { address: '0xABC', pol: '0.1234', usdce: '100.000000', clob: null, positions: [] };
    const out = formatBalances(result);
    expect(out).not.toContain('CLOB');
  });

  it('renders Positions section when positions present', () => {
    const b = {
      address: '0xabc', pol: '0.1000', usdce: '100.500000', clob: null,
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

// ── fetchPositions ────────────────────────────────────────────────────────────

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
```

- [ ] **Step 2: Run to verify new tests fail (fetchPositions not yet exported)**

```bash
cd skills/polymarket-trade/scripts
npx vitest run __tests__/balance.test.js
```

Expected: FAIL on `fetchPositions` tests — `fetchPositions is not a function`. The updated `formatBalances` tests may also fail since `positions` field doesn't exist yet.

---

## Task 3: Implement `fetchPositions` in `balance.js`

**Files:**
- Modify: `scripts/balance.js`

- [ ] **Step 1: Rewrite `balance.js`**

Overwrite `scripts/balance.js` with:

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

- [ ] **Step 2: Run balance tests**

```bash
cd skills/polymarket-trade/scripts
npx vitest run __tests__/balance.test.js
```

Expected: all balance tests pass.

- [ ] **Step 3: Run full suite**

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

Note: The existing file already declares `const mockMarket` and imports from vitest. This task replaces the import line and appends new tests using a different variable name (`mockSlugMarket`) to avoid re-declaration.

- [ ] **Step 1: Update imports, then append `resolveMarket` tests**

In `scripts/__tests__/browse.test.js`, make these edits in order:

**First** — replace line 1 (vitest import):
```js
import { describe, it, expect } from 'vitest';
```
With:
```js
import { vi, describe, it, expect, afterEach } from 'vitest';
```

**Second** — replace line 2 (browse.js import, add `resolveMarket`):
```js
import { formatMarketOutput, extractTokenIds } from '../browse.js';
```
With:
```js
import { formatMarketOutput, extractTokenIds, resolveMarket } from '../browse.js';
```

**Third** — append to the end of the file:

```js
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

  it('calls process.exit(1) when multiple results found', async () => {
    const { default: axios } = await import('axios');
    const err404 = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    axios.get
      .mockRejectedValueOnce(err404)
      .mockResolvedValueOnce({ data: [mockSlugMarket, { ...mockSlugMarket, slug: 'bitcoin-200k-2025' }] });
    await expect(resolveMarket('bitcoin', { yaml: {} })).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
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
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
cd skills/polymarket-trade/scripts
npx vitest run __tests__/browse.test.js
```

Expected: existing tests pass, new `resolveMarket` tests FAIL — `resolveMarket is not a function`.

---

## Task 5: Implement `resolveMarket` in `browse.js`

**Files:**
- Modify: `scripts/browse.js`

- [ ] **Step 1: Add `resolveMarket` before the CLI entry point**

In `scripts/browse.js`, add the following function before the line `// ── CLI entry point`:

```js
// ── Market resolution (slug-first, keyword fallback) ──────────────────────────

export async function resolveMarket(query, cfg) {
  const { default: axios } = await import('axios');
  const gammaUrl = cfg.yaml?.polymarket?.gamma_url ?? DEFAULT_GAMMA_URL;

  // Step 1: try exact slug via direct axios call.
  // Do NOT use fetchGamma() here — it uses a query.includes('/') heuristic that
  // misroutes slugs like 'bitcoin-100k-2025' (no '/') into keyword search.
  try {
    const res = await axios.get(`${gammaUrl}/markets/${query}`, { timeout: 10_000 });
    return res.data;
  } catch (e) {
    if (e.response?.status !== 404) throw e;
  }

  // Step 2: keyword fallback via fetchGamma (issues GET /markets?q=<query>)
  const markets = await fetchGamma(gammaUrl, query);
  if (markets.length === 0) throw new Error(`Market not found: ${query}`);
  if (markets.length === 1) return markets[0];

  // Multiple results — print list and exit
  console.error(`Found ${markets.length} markets matching "${query}":`);
  markets.slice(0, 5).forEach((m, i) => {
    const status = m.active ? 'ACTIVE' : 'CLOSED';
    console.error(`  ${i + 1}. ${(m.slug ?? '(no slug)').padEnd(36)} "${m.question}"  ${status}`);
  });
  console.error(`\nSpecify the exact slug: node scripts/trade.js --buy --market <slug> --side YES|NO --amount <usd>`);
  process.exit(1);
}
```

- [ ] **Step 2: Run browse tests**

```bash
cd skills/polymarket-trade/scripts
npx vitest run __tests__/browse.test.js
```

Expected: all browse tests pass.

- [ ] **Step 3: Run full suite**

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

- [ ] **Step 1: Update the import line**

Find line 9 in `scripts/trade.js`:
```js
import { extractTokenIds } from './browse.js';
```
Replace with:
```js
import { extractTokenIds, resolveMarket } from './browse.js';
```

- [ ] **Step 2: Replace the inline market fetch block**

Find this block (starts around line 217 — search for the comment):
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
      // Resolve market by exact slug or keyword fallback (see browse.js resolveMarket)
      const market = await resolveMarket(query, cfg);
```

- [ ] **Step 3: Run full test suite**

```bash
cd skills/polymarket-trade/scripts
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

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

Find the `polymarket:` block:
```yaml
polymarket:
  clob_url: "https://clob.polymarket.com"
  gamma_url: "https://gamma-api.polymarket.com"
  chain_id: 137              # 137 = Polygon mainnet, 80002 = Amoy testnet
```

Replace with:
```yaml
polymarket:
  clob_url: "https://clob.polymarket.com"
  gamma_url: "https://gamma-api.polymarket.com"
  data_url: "https://data-api.polymarket.com"
  chain_id: 137              # 137 = Polygon mainnet, 80002 = Amoy testnet
```

- [ ] **Step 2: Add two test cases to `SKILL.tests.yaml`**

Find this block near the end of the `full:` suite (use it as anchor):
```yaml
      - id: full-setup-no-relay
        description: Setup — CLOB credential derivation, no relay
```

Insert the two new cases immediately before it:
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

Verify the final state:

```bash
git log --oneline -6
```

Expected (5 new commits):
```
<hash> chore(polymarket-trade): add data_url config and new SKILL test cases
<hash> feat(polymarket-trade): use resolveMarket in trade.js CLI
<hash> feat(polymarket-trade): add resolveMarket with keyword fallback to browse.js
<hash> feat(polymarket-trade): add position tracking to balance.js
<hash> chore(polymarket-trade): add axios as explicit dependency
```
