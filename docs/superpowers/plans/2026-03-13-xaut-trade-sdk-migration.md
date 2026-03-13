# xaut-trade SDK Migration & WDK Wallet Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate xaut-trade market orders from Foundry `cast` to `@uniswap/v3-sdk` + `ethers.js v6`, and add WDK encrypted wallet management as a recommended alternative to Foundry keystore.

**Architecture:** Two wallet backends (Foundry keystore, WDK encrypted vault) both produce an `ethers.Wallet` that feeds a unified trading layer built on `@uniswap/v3-sdk`. New code lives in `scripts/market/` with its own `package.json` (ethers v6). Existing `limit-order.js` (ethers v5) is untouched.

**Tech Stack:** ethers.js v6, @uniswap/v3-sdk v3, @uniswap/sdk-core v6, @tetherto/wdk-secret-manager, js-yaml, Node.js ≥ 18

**Spec:** `docs/superpowers/specs/2026-03-13-xaut-trade-sdk-migration-design.md`

---

## Chunk 1: Core Library Modules

### Task 1: Bootstrap `market/` package

**Files:**
- Create: `skills/xaut-trade/scripts/market/package.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "xaut-trade-market",
  "private": true,
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "ethers": "^6",
    "@uniswap/v3-sdk": "^3",
    "@uniswap/sdk-core": "^6",
    "@tetherto/wdk-secret-manager": "^1",
    "js-yaml": "^4",
    "jsbi": "^4"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd skills/xaut-trade/scripts/market && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Verify imports resolve**

Run: `cd skills/xaut-trade/scripts/market && node -e "import('ethers').then(m => console.log('ethers', m.ethers ? 'ok' : 'ok'))"`
Expected: `ethers ok`

- [ ] **Step 4: Add `market/node_modules/` to .gitignore if not already covered**

Check `skills/xaut-trade/.gitignore` or root `.gitignore`. Add `scripts/market/node_modules/` if needed.

- [ ] **Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/market/package.json skills/xaut-trade/scripts/market/package-lock.json
git commit -m "feat(xaut-trade): bootstrap market module with ethers v6 and uniswap v3-sdk"
```

---

### Task 2: `lib/config.js` — Configuration loader

**Files:**
- Create: `skills/xaut-trade/scripts/market/lib/config.js`
- Create: `skills/xaut-trade/scripts/market/lib/__tests__/config.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// config.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, resolveToken } from '../config.js';

const TMP = join(import.meta.dirname, '__tmp_config');

describe('config', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('parses .env file', () => {
    writeFileSync(join(TMP, '.env'), 'ETH_RPC_URL=https://eth.llamarpc.com\n# comment\nFOO=bar\n');
    writeFileSync(join(TMP, 'config.yaml'), 'wallet_mode: wdk\ntokens:\n  USDT:\n    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7"\n    decimals: 6\n');
    const cfg = loadConfig(TMP);
    expect(cfg.env.ETH_RPC_URL).toBe('https://eth.llamarpc.com');
    expect(cfg.env.FOO).toBe('bar');
    expect(cfg.yaml.wallet_mode).toBe('wdk');
  });

  it('resolves token symbol to address and decimals', () => {
    writeFileSync(join(TMP, '.env'), '');
    writeFileSync(join(TMP, 'config.yaml'), 'tokens:\n  USDT:\n    address: "0xdAC17"\n    decimals: 6\n');
    const cfg = loadConfig(TMP);
    const token = resolveToken(cfg, 'USDT');
    expect(token.address).toBe('0xdAC17');
    expect(token.decimals).toBe(6);
  });

  it('throws on unknown token symbol', () => {
    writeFileSync(join(TMP, '.env'), '');
    writeFileSync(join(TMP, 'config.yaml'), 'tokens:\n  USDT:\n    address: "0xdAC17"\n    decimals: 6\n');
    const cfg = loadConfig(TMP);
    expect(() => resolveToken(cfg, 'DOGE')).toThrow(/unknown token/i);
  });

  it('throws when wallet_mode is missing', () => {
    writeFileSync(join(TMP, '.env'), '');
    writeFileSync(join(TMP, 'config.yaml'), 'tokens: {}\n');
    const cfg = loadConfig(TMP);
    expect(cfg.yaml.wallet_mode).toBeUndefined();
  });
});
```

- [ ] **Step 2: Add vitest as dev dependency and run test to verify failure**

Run: `cd skills/xaut-trade/scripts/market && npm install -D vitest && npx vitest run lib/__tests__/config.test.js`
Expected: FAIL — `config.js` does not exist.

- [ ] **Step 3: Implement config.js**

```javascript
// lib/config.js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

/**
 * Parse a .env file into key-value pairs.
 * Ignores comments (#) and blank lines.
 */
function parseEnv(filePath) {
  const env = {};
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return env;
}

/**
 * Load config from a directory containing .env and config.yaml.
 * @param {string} configDir - defaults to ~/.aurehub
 */
export function loadConfig(configDir) {
  const envPath = join(configDir, '.env');
  const yamlPath = join(configDir, 'config.yaml');
  const env = parseEnv(envPath);
  let yamlCfg = {};
  try {
    yamlCfg = yaml.load(readFileSync(yamlPath, 'utf8')) || {};
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return { env, yaml: yamlCfg, configDir };
}

/**
 * Resolve a token symbol (e.g. "USDT") to { address, decimals }.
 */
export function resolveToken(config, symbol) {
  const tokens = config.yaml.tokens || {};
  const token = tokens[symbol];
  if (!token) throw new Error(`Unknown token: ${symbol}`);
  return { address: token.address, decimals: token.decimals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/config.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/market/lib/config.js skills/xaut-trade/scripts/market/lib/__tests__/config.test.js
git commit -m "feat(market): add config loader with .env and yaml parsing"
```

---

### Task 3: `lib/provider.js` — FallbackProvider

**Files:**
- Create: `skills/xaut-trade/scripts/market/lib/provider.js`
- Create: `skills/xaut-trade/scripts/market/lib/__tests__/provider.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// provider.test.js
import { describe, it, expect, vi } from 'vitest';
import { createProvider, FallbackProvider } from '../provider.js';

describe('FallbackProvider', () => {
  it('uses primary URL by default', () => {
    const provider = new FallbackProvider('https://primary.rpc', []);
    expect(provider.primaryUrl).toBe('https://primary.rpc');
  });

  it('throws when no URLs provided', () => {
    expect(() => new FallbackProvider('', [])).toThrow(/no rpc url/i);
  });

  it('falls back on error codes', async () => {
    const provider = new FallbackProvider('https://bad.rpc', ['https://good.rpc']);
    // Mock the internal _trySend to simulate failure then success
    let callCount = 0;
    provider._rawSend = async (url, method, params) => {
      callCount++;
      if (url === 'https://bad.rpc') {
        const err = new Error('rate limited');
        err.status = 429;
        throw err;
      }
      return { blockNumber: '0x1' };
    };
    const result = await provider._sendWithFallback('eth_blockNumber', []);
    expect(result.blockNumber).toBe('0x1');
    expect(callCount).toBe(2);
    // Session-sticky: primary should now be good.rpc
    expect(provider.primaryUrl).toBe('https://good.rpc');
  });

  it('throws after all URLs exhausted', async () => {
    const provider = new FallbackProvider('https://bad1.rpc', ['https://bad2.rpc']);
    provider._rawSend = async () => {
      const err = new Error('down');
      err.status = 502;
      throw err;
    };
    await expect(provider._sendWithFallback('eth_blockNumber', []))
      .rejects.toThrow(/all.*rpc.*exhausted/i);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/provider.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement provider.js**

```javascript
// lib/provider.js
import { JsonRpcProvider } from 'ethers';

const RETRIABLE_CODES = new Set([429, 502, 503]);
const RETRIABLE_MESSAGES = /timeout|rate.?limit|ECONNREFUSED|ETIMEDOUT/i;

function isRetriable(err) {
  if (RETRIABLE_CODES.has(err.status || err.statusCode)) return true;
  if (RETRIABLE_MESSAGES.test(err.message || '')) return true;
  return false;
}

export class FallbackProvider {
  constructor(primaryUrl, fallbackUrls = []) {
    if (!primaryUrl) throw new Error('No RPC URL provided');
    this.primaryUrl = primaryUrl;
    this.fallbackUrls = fallbackUrls;
    this._provider = new JsonRpcProvider(primaryUrl);
  }

  /** Low-level RPC send — override in tests */
  async _rawSend(url, method, params) {
    const tempProvider = new JsonRpcProvider(url);
    return await tempProvider.send(method, params);
  }

  async _sendWithFallback(method, params) {
    const urls = [this.primaryUrl, ...this.fallbackUrls];
    const errors = [];
    for (const url of urls) {
      try {
        const result = await this._rawSend(url, method, params);
        // Session-sticky: promote successful URL
        if (url !== this.primaryUrl) {
          this.primaryUrl = url;
          this._provider = new JsonRpcProvider(url);
        }
        return result;
      } catch (err) {
        errors.push({ url, error: err.message });
        if (!isRetriable(err)) throw err;
      }
    }
    throw new Error(`All RPC URLs exhausted: ${JSON.stringify(errors)}`);
  }

  /** Proxy ethers provider interface — all methods go through fallback */
  async send(method, params) {
    return this._sendWithFallback(method, params);
  }

  async call(tx) {
    // Route through fallback-aware send
    return this._sendWithFallback('eth_call', [tx, 'latest']);
  }

  async getBlockNumber() {
    const hex = await this.send('eth_blockNumber', []);
    return Number(hex);
  }

  async getBalance(address) {
    const hex = await this.send('eth_getBalance', [address, 'latest']);
    return BigInt(hex);
  }

  /** Return the underlying ethers provider for operations that need a full Provider object (e.g. Wallet.connect) */
  getEthersProvider() {
    return this._provider;
  }
}

/**
 * Create a FallbackProvider from config environment.
 */
export function createProvider(env) {
  const primary = env.ETH_RPC_URL;
  if (!primary) throw new Error('No RPC URL provided — set ETH_RPC_URL in ~/.aurehub/.env');
  const fallbacks = (env.ETH_RPC_URL_FALLBACK || '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);
  return new FallbackProvider(primary, fallbacks);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/provider.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/market/lib/provider.js skills/xaut-trade/scripts/market/lib/__tests__/provider.test.js
git commit -m "feat(market): add FallbackProvider with automatic RPC retry"
```

---

### Task 4: `lib/signer.js` — Unified signing layer

**Files:**
- Create: `skills/xaut-trade/scripts/market/lib/signer.js`
- Create: `skills/xaut-trade/scripts/market/lib/__tests__/signer.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// signer.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import { createSigner } from '../signer.js';

const TMP = join(import.meta.dirname, '__tmp_signer');

describe('signer', () => {
  let testWallet;

  beforeEach(async () => {
    mkdirSync(join(TMP, 'keystores'), { recursive: true });
    testWallet = Wallet.createRandom();
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('throws when wallet_mode is missing', async () => {
    const cfg = { env: {}, yaml: {}, configDir: TMP };
    await expect(createSigner(cfg, null)).rejects.toThrow(/wallet_mode/i);
  });

  it('creates signer from foundry keystore', async () => {
    const password = 'test-password-123';
    const encrypted = await testWallet.encrypt(password);
    writeFileSync(join(TMP, 'keystores', 'test-account'), encrypted);
    writeFileSync(join(TMP, 'password.txt'), password);

    const cfg = {
      env: {
        FOUNDRY_ACCOUNT: 'test-account',
        KEYSTORE_PASSWORD_FILE: join(TMP, 'password.txt'),
      },
      yaml: { wallet_mode: 'foundry' },
      configDir: TMP,
    };
    // Override keystore dir for testing
    const signer = await createSigner(cfg, null, { keystoreDir: join(TMP, 'keystores') });
    expect(signer.address.toLowerCase()).toBe(testWallet.address.toLowerCase());
  });

  it('creates signer from WDK encrypted vault', async () => {
    // Use wdk-secret-manager to create a vault
    const WdkSecretManager = (await import('@tetherto/wdk-secret-manager')).default;
    const password = 'my-secure-password-123';
    const salt = WdkSecretManager.generateSalt();
    const sm = new WdkSecretManager(password, salt, { iterations: 1000 }); // low iterations for test speed
    const { encryptedEntropy } = await sm.generateAndEncrypt();
    const entropy = sm.decrypt(encryptedEntropy);
    const mnemonic = sm.entropyToMnemonic(entropy);
    const expectedAddress = Wallet.fromPhrase(mnemonic).address;
    sm.dispose();

    // Write vault and password files
    writeFileSync(join(TMP, '.wdk_vault'), JSON.stringify({
      encryptedEntropy: encryptedEntropy.toString('hex'),
      salt: salt.toString('hex'),
      iterations: 1000,
    }));
    writeFileSync(join(TMP, '.wdk_password'), password);

    const cfg = {
      env: { WDK_PASSWORD_FILE: join(TMP, '.wdk_password') },
      yaml: {
        wallet_mode: 'wdk',
        wdk_vault_file: join(TMP, '.wdk_vault'),
      },
      configDir: TMP,
    };
    const signer = await createSigner(cfg, null);
    expect(signer.address.toLowerCase()).toBe(expectedAddress.toLowerCase());
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/signer.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement signer.js**

```javascript
// lib/signer.js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import { homedir } from 'node:os';

const DEFAULT_KEYSTORE_DIR = join(homedir(), '.foundry', 'keystores');
const DEFAULT_VAULT_FILE = join(homedir(), '.aurehub', '.wdk_vault');
const DEFAULT_PASSWORD_FILE = join(homedir(), '.aurehub', '.wdk_password');

/**
 * Create an ethers.Wallet from config.
 * @param {object} cfg - from loadConfig()
 * @param {import('ethers').Provider|null} provider - optional provider to connect
 * @param {object} opts - overrides for testing
 */
export async function createSigner(cfg, provider, opts = {}) {
  const mode = cfg.yaml.wallet_mode;
  if (!mode) {
    throw new Error(
      'wallet_mode not set in config.yaml. Run setup to select a wallet mode.'
    );
  }

  let wallet;

  if (mode === 'foundry') {
    wallet = await _fromFoundry(cfg, opts);
  } else if (mode === 'wdk') {
    wallet = await _fromWdk(cfg);
  } else {
    throw new Error(`Unknown wallet_mode: ${mode}`);
  }

  return provider ? wallet.connect(provider) : wallet;
}

async function _fromFoundry(cfg, opts) {
  const account = cfg.env.FOUNDRY_ACCOUNT;
  if (!account) throw new Error('FOUNDRY_ACCOUNT not set in .env');

  const keystoreDir = opts.keystoreDir || DEFAULT_KEYSTORE_DIR;
  const keystorePath = join(keystoreDir, account);
  const keystoreJson = readFileSync(keystorePath, 'utf8');

  const passwordFile = cfg.env.KEYSTORE_PASSWORD_FILE;
  if (!passwordFile) throw new Error('KEYSTORE_PASSWORD_FILE not set in .env');
  const password = readFileSync(passwordFile, 'utf8').trim();

  return Wallet.fromEncryptedJson(keystoreJson, password);
}

async function _fromWdk(cfg) {
  const WdkSecretManager = (await import('@tetherto/wdk-secret-manager')).default;

  const vaultPath = cfg.yaml.wdk_vault_file || DEFAULT_VAULT_FILE;
  const vaultJson = JSON.parse(readFileSync(vaultPath, 'utf8'));

  const passwordFile = cfg.env.WDK_PASSWORD_FILE || DEFAULT_PASSWORD_FILE;
  const password = readFileSync(passwordFile, 'utf8').trim();

  const salt = Buffer.from(vaultJson.salt, 'hex');
  const encryptedEntropy = Buffer.from(vaultJson.encryptedEntropy, 'hex');
  const iterations = vaultJson.iterations || 100_000;

  const sm = new WdkSecretManager(password, salt, { iterations });
  try {
    const entropy = sm.decrypt(encryptedEntropy);
    const mnemonic = sm.entropyToMnemonic(entropy);
    return Wallet.fromPhrase(mnemonic);
  } finally {
    sm.dispose();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/signer.test.js`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/market/lib/signer.js skills/xaut-trade/scripts/market/lib/__tests__/signer.test.js
git commit -m "feat(market): add unified signer with Foundry keystore and WDK vault backends"
```

---

### Task 5: `lib/erc20.js` — Token operations

**Files:**
- Create: `skills/xaut-trade/scripts/market/lib/erc20.js`
- Create: `skills/xaut-trade/scripts/market/lib/__tests__/erc20.test.js`

- [ ] **Step 1: Write failing test**

Test uses mocked provider to avoid RPC calls:

```javascript
// erc20.test.js
import { describe, it, expect, vi } from 'vitest';
import { getBalance, getAllowance, approve } from '../erc20.js';

// Minimal mock provider/signer
function mockProvider(returnValue) {
  return {
    call: vi.fn().mockResolvedValue(returnValue),
  };
}

function mockSigner(returnValue, address = '0x1111111111111111111111111111111111111111') {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    sendTransaction: vi.fn().mockResolvedValue({ hash: '0xabc', wait: vi.fn().mockResolvedValue({ status: 1 }) }),
    provider: mockProvider(returnValue),
  };
}

const USDT = { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 };
const ROUTER = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';

describe('erc20', () => {
  it('getBalance calls balanceOf and formats result', async () => {
    // 1000 USDT = 1000 * 10^6 = 1000000000 = 0x3B9ACA00
    const encoded = '0x' + '00'.repeat(31) + '3b9aca00'.padStart(2, '0');
    // Proper ABI encoding: 32 bytes
    const abiEncoded = '0x000000000000000000000000000000000000000000000000000000003b9aca00';
    const provider = mockProvider(abiEncoded);
    const balance = await getBalance(USDT, '0xWALLET', provider);
    expect(balance).toBe('1000.0');
    expect(provider.call).toHaveBeenCalledOnce();
  });

  it('getAllowance returns formatted value', async () => {
    const abiEncoded = '0x00000000000000000000000000000000000000000000000000000000000f4240'; // 1000000 = 1.0
    const provider = mockProvider(abiEncoded);
    const allowance = await getAllowance(USDT, '0xOWNER', ROUTER, provider);
    expect(allowance).toBe('1.0');
  });

  it('approve sends transaction and returns hash', async () => {
    const signer = mockSigner(null);
    const result = await approve(USDT, ROUTER, '1000', signer, { requiresResetApprove: false });
    expect(result.hash).toBe('0xabc');
    expect(signer.sendTransaction).toHaveBeenCalledOnce();
  });

  it('approve with USDT reset sends two transactions', async () => {
    const signer = mockSigner(null);
    const result = await approve(USDT, ROUTER, '1000', signer, { requiresResetApprove: true });
    expect(result.hash).toBe('0xabc');
    // Two calls: reset to 0, then approve amount
    expect(signer.sendTransaction).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/erc20.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement erc20.js**

```javascript
// lib/erc20.js
import { Contract, formatUnits, parseUnits, Interface } from 'ethers';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const iface = new Interface(ERC20_ABI);

/**
 * Get token balance, formatted with decimals.
 */
export async function getBalance(token, address, provider) {
  const calldata = iface.encodeFunctionData('balanceOf', [address]);
  const result = await provider.call({ to: token.address, data: calldata });
  const [raw] = iface.decodeFunctionResult('balanceOf', result);
  return formatUnits(raw, token.decimals);
}

/**
 * Get token allowance, formatted with decimals.
 */
export async function getAllowance(token, owner, spender, provider) {
  const calldata = iface.encodeFunctionData('allowance', [owner, spender]);
  const result = await provider.call({ to: token.address, data: calldata });
  const [raw] = iface.decodeFunctionResult('allowance', result);
  return formatUnits(raw, token.decimals);
}

/**
 * Approve spender for amount. Handles USDT reset-to-zero if needed.
 * @param {object} token - { address, decimals }
 * @param {string} spender - spender address
 * @param {string} amount - human-readable amount (e.g. "1000")
 * @param {import('ethers').Wallet} signer
 * @param {object} opts - { requiresResetApprove: boolean }
 */
export async function approve(token, spender, amount, signer, opts = {}) {
  const rawAmount = parseUnits(amount, token.decimals);

  if (opts.requiresResetApprove) {
    const resetData = iface.encodeFunctionData('approve', [spender, 0n]);
    const resetTx = await signer.sendTransaction({ to: token.address, data: resetData });
    await resetTx.wait();
  }

  const data = iface.encodeFunctionData('approve', [spender, rawAmount]);
  const tx = await signer.sendTransaction({ to: token.address, data });
  await tx.wait();
  return { hash: tx.hash };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/erc20.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/market/lib/erc20.js skills/xaut-trade/scripts/market/lib/__tests__/erc20.test.js
git commit -m "feat(market): add erc20 module with balance, allowance, and USDT-safe approve"
```

---

### Task 6: `lib/uniswap.js` — Quote & Swap

**Files:**
- Create: `skills/xaut-trade/scripts/market/lib/uniswap.js`
- Create: `skills/xaut-trade/scripts/market/lib/__tests__/uniswap.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// uniswap.test.js
import { describe, it, expect, vi } from 'vitest';
import { quote, buildSwap } from '../uniswap.js';

// Mock provider for QuoterV2 call
function mockProvider(amountOut) {
  return {
    call: vi.fn().mockResolvedValue(
      // ABI-encode (uint256 amountOut, uint160 sqrtPriceX96, uint32 initializedTicksCrossed, uint256 gasEstimate)
      '0x' +
      BigInt(amountOut).toString(16).padStart(64, '0') +
      '0'.repeat(64) + // sqrtPriceX96
      '0'.repeat(64) + // ticks
      '0'.repeat(64)   // gas
    ),
  };
}

const TOKENS = {
  USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  XAUT: { address: '0x68749665FF8D2d112Fa859AA293F07a622782F38', decimals: 6 },
};

const CONTRACTS = {
  quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
};

describe('uniswap', () => {
  it('quote returns amountOut', async () => {
    const provider = mockProvider(33000n); // 0.033 XAUT
    const result = await quote({
      tokenIn: TOKENS.USDT,
      tokenOut: TOKENS.XAUT,
      amountIn: '100', // 100 USDT
      fee: 500,
      contracts: CONTRACTS,
      provider,
    });
    expect(result.amountOut).toBeDefined();
  });

  it('buildSwap returns tx params with to and data', () => {
    const result = buildSwap({
      tokenIn: TOKENS.USDT,
      tokenOut: TOKENS.XAUT,
      amountIn: '100',
      minAmountOut: '0.033',
      fee: 500,
      recipient: '0x1111111111111111111111111111111111111111',
      deadline: Math.floor(Date.now() / 1000) + 300,
      contracts: CONTRACTS,
    });
    expect(result.to).toBe(CONTRACTS.router);
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/uniswap.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement uniswap.js**

```javascript
// lib/uniswap.js
import { Interface, parseUnits, formatUnits } from 'ethers';
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import { Pool, Route, Trade, SwapRouter, FeeAmount } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

const CHAIN_ID = 1; // Ethereum mainnet

const QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];
const quoterIface = new Interface(QUOTER_V2_ABI);

/**
 * Get a quote from QuoterV2.
 */
export async function quote({ tokenIn, tokenOut, amountIn, fee, contracts, provider }) {
  const rawAmountIn = parseUnits(amountIn, tokenIn.decimals);
  const calldata = quoterIface.encodeFunctionData('quoteExactInputSingle', [{
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: rawAmountIn,
    fee,
    sqrtPriceLimitX96: 0n,
  }]);

  const result = await provider.call({ to: contracts.quoter, data: calldata });
  const decoded = quoterIface.decodeFunctionResult('quoteExactInputSingle', result);

  return {
    amountOut: formatUnits(decoded.amountOut, tokenOut.decimals),
    amountOutRaw: decoded.amountOut.toString(),
    sqrtPriceX96: decoded.sqrtPriceX96After.toString(),
    gasEstimate: decoded.gasEstimate.toString(),
  };
}

/**
 * Build swap calldata using Uniswap v3-sdk SwapRouter.
 * Returns { to, data, value } ready for signer.sendTransaction().
 */
export function buildSwap({ tokenIn, tokenOut, amountIn, minAmountOut, fee, recipient, deadline, contracts }) {
  const tIn = new Token(CHAIN_ID, tokenIn.address, tokenIn.decimals);
  const tOut = new Token(CHAIN_ID, tokenOut.address, tokenOut.decimals);

  const rawAmountIn = parseUnits(amountIn, tokenIn.decimals);
  const rawMinAmountOut = parseUnits(minAmountOut, tokenOut.decimals);

  // Build a minimal pool (we only need it for routing, not for pricing)
  // Use placeholder liquidity and tick values — the actual swap goes through the router
  const pool = new Pool(
    tIn, tOut,
    fee,
    JSBI.BigInt('79228162514264337593543950336'), // sqrtRatioX96 ~= 1:1 placeholder
    JSBI.BigInt('1000000000'),
    0
  );

  const route = new Route([pool], tIn, tOut);

  const rawIn = JSBI.BigInt(rawAmountIn.toString());
  const rawMinOut = JSBI.BigInt(rawMinAmountOut.toString());

  const { calldata, value } = SwapRouter.swapCallParameters(
    Trade.createUncheckedTrade({
      route,
      inputAmount: CurrencyAmount.fromRawAmount(tIn, rawIn),
      outputAmount: CurrencyAmount.fromRawAmount(tOut, rawMinOut),
      tradeType: TradeType.EXACT_INPUT,
    }),
    {
      slippageTolerance: new Percent(0), // slippage already baked into minAmountOut
      deadline,
      recipient,
    }
  );

  return { to: contracts.router, data: calldata, value };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/uniswap.test.js`
Expected: 2 tests PASS.

Note: If `@uniswap/v3-sdk` has issues with JSBI, install it: `npm install jsbi` and re-run.

- [ ] **Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/market/lib/uniswap.js skills/xaut-trade/scripts/market/lib/__tests__/uniswap.test.js
git commit -m "feat(market): add uniswap module with QuoterV2 quote and SwapRouter calldata"
```

---

### Task 7: `lib/create-wallet.js` — WDK encrypted wallet creation

**Files:**
- Create: `skills/xaut-trade/scripts/market/lib/create-wallet.js`
- Create: `skills/xaut-trade/scripts/market/lib/__tests__/create-wallet.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// create-wallet.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const TMP = join(import.meta.dirname, '__tmp_create_wallet');
const SCRIPT = join(import.meta.dirname, '..', 'create-wallet.js');

describe('create-wallet', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'password.txt'), 'my-secure-password-123');
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('creates encrypted vault file and outputs address', () => {
    const vaultPath = join(TMP, '.wdk_vault');
    const result = execFileSync('node', [
      SCRIPT,
      '--password-file', join(TMP, 'password.txt'),
      '--vault-file', vaultPath,
    ], { encoding: 'utf8' });

    const output = JSON.parse(result.trim());
    expect(output.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(output.vaultFile).toBe(vaultPath);

    // Vault file should exist with encrypted data
    const vault = JSON.parse(readFileSync(vaultPath, 'utf8'));
    expect(vault.encryptedEntropy).toBeDefined();
    expect(vault.salt).toBeDefined();
    expect(vault.iterations).toBe(100000);

    // Vault should NOT contain plaintext mnemonic
    const raw = readFileSync(vaultPath, 'utf8');
    expect(raw).not.toMatch(/\b\w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+ \w+\b/);
  });

  it('errors if vault file already exists', () => {
    const vaultPath = join(TMP, '.wdk_vault');
    writeFileSync(vaultPath, '{}');
    expect(() => {
      execFileSync('node', [
        SCRIPT,
        '--password-file', join(TMP, 'password.txt'),
        '--vault-file', vaultPath,
      ], { encoding: 'utf8' });
    }).toThrow();
  });

  it('overwrites with --force', () => {
    const vaultPath = join(TMP, '.wdk_vault');
    writeFileSync(vaultPath, '{}');
    const result = execFileSync('node', [
      SCRIPT,
      '--password-file', join(TMP, 'password.txt'),
      '--vault-file', vaultPath,
      '--force',
    ], { encoding: 'utf8' });
    const output = JSON.parse(result.trim());
    expect(output.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('errors if password is too short', () => {
    writeFileSync(join(TMP, 'short.txt'), 'short');
    expect(() => {
      execFileSync('node', [
        SCRIPT,
        '--password-file', join(TMP, 'short.txt'),
        '--vault-file', join(TMP, '.wdk_vault'),
      ], { encoding: 'utf8', stdio: 'pipe' });
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/create-wallet.test.js`
Expected: FAIL — script not found.

- [ ] **Step 3: Implement create-wallet.js**

```javascript
#!/usr/bin/env node
// lib/create-wallet.js
// Creates an encrypted WDK vault. Called by setup.sh.

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { Wallet } from 'ethers';
import WdkSecretManager from '@tetherto/wdk-secret-manager';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--password-file') args.passwordFile = argv[++i];
    else if (argv[i] === '--vault-file') args.vaultFile = argv[++i];
    else if (argv[i] === '--force') args.force = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const passwordFile = args.passwordFile;
  const vaultFile = args.vaultFile || resolve(homedir(), '.aurehub', '.wdk_vault');
  const force = args.force || false;

  if (!passwordFile) {
    console.error('Error: --password-file is required');
    process.exit(1);
  }

  const password = readFileSync(passwordFile, 'utf8').trim();
  if (password.length < 12) {
    console.error('Error: password must be at least 12 characters');
    process.exit(1);
  }

  if (existsSync(vaultFile) && !force) {
    console.error(`Error: vault file already exists: ${vaultFile}. Use --force to overwrite.`);
    process.exit(1);
  }

  const salt = WdkSecretManager.generateSalt();
  const sm = new WdkSecretManager(password, salt, { iterations: 100_000 });

  try {
    const { encryptedEntropy } = await sm.generateAndEncrypt();

    // Temporarily decrypt to derive address
    const entropy = sm.decrypt(encryptedEntropy);
    const mnemonic = sm.entropyToMnemonic(entropy);
    const wallet = Wallet.fromPhrase(mnemonic);
    const address = wallet.address;

    // Write vault
    const vaultData = {
      encryptedEntropy: encryptedEntropy.toString('hex'),
      salt: salt.toString('hex'),
      iterations: 100_000,
    };
    writeFileSync(vaultFile, JSON.stringify(vaultData, null, 2));
    chmodSync(vaultFile, 0o600);

    console.log(JSON.stringify({ address, vaultFile }));
  } finally {
    sm.dispose();
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run lib/__tests__/create-wallet.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/market/lib/create-wallet.js skills/xaut-trade/scripts/market/lib/__tests__/create-wallet.test.js
git commit -m "feat(market): add WDK encrypted wallet creation with wdk-secret-manager"
```

---

### Task 8: `swap.js` — CLI entry point

**Files:**
- Create: `skills/xaut-trade/scripts/market/swap.js`
- Create: `skills/xaut-trade/scripts/market/__tests__/swap-cli.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// __tests__/swap-cli.test.js
import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../swap.js';

describe('swap CLI arg parser', () => {
  it('parses quote subcommand', () => {
    const args = parseCliArgs(['quote', '--side', 'buy', '--amount', '100']);
    expect(args.command).toBe('quote');
    expect(args.side).toBe('buy');
    expect(args.amount).toBe('100');
  });

  it('parses approve subcommand', () => {
    const args = parseCliArgs(['approve', '--token', 'USDT', '--amount', '1000']);
    expect(args.command).toBe('approve');
    expect(args.token).toBe('USDT');
    expect(args.amount).toBe('1000');
  });

  it('parses swap subcommand', () => {
    const args = parseCliArgs(['swap', '--side', 'buy', '--amount', '100', '--min-out', '0.033']);
    expect(args.command).toBe('swap');
    expect(args.side).toBe('buy');
    expect(args.amount).toBe('100');
    expect(args.minOut).toBe('0.033');
  });

  it('parses balance subcommand', () => {
    const args = parseCliArgs(['balance']);
    expect(args.command).toBe('balance');
  });

  it('parses allowance subcommand', () => {
    const args = parseCliArgs(['allowance', '--token', 'USDT']);
    expect(args.command).toBe('allowance');
    expect(args.token).toBe('USDT');
  });

  it('parses address subcommand', () => {
    const args = parseCliArgs(['address']);
    expect(args.command).toBe('address');
  });

  it('errors on unknown subcommand', () => {
    expect(() => parseCliArgs(['foo'])).toThrow(/unknown command/i);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run __tests__/swap-cli.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement swap.js**

```javascript
#!/usr/bin/env node
// swap.js — CLI entry point for market order operations
// Usage: node swap.js <command> [options]

import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, resolveToken } from './lib/config.js';
import { createProvider } from './lib/provider.js';
import { createSigner } from './lib/signer.js';
import { getBalance, getAllowance, approve } from './lib/erc20.js';
import { quote, buildSwap } from './lib/uniswap.js';

const VALID_COMMANDS = new Set(['quote', 'balance', 'allowance', 'approve', 'swap', 'address']);

export function parseCliArgs(argv) {
  const command = argv[0];
  if (!command || !VALID_COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${command}. Valid: ${[...VALID_COMMANDS].join(', ')}`);
  }
  const args = { command };
  for (let i = 1; i < argv.length; i++) {
    switch (argv[i]) {
      case '--side': args.side = argv[++i]; break;
      case '--amount': args.amount = argv[++i]; break;
      case '--min-out': args.minOut = argv[++i]; break;
      case '--token': args.token = argv[++i]; break;
      case '--config-dir': args.configDir = argv[++i]; break;
      default: throw new Error(`Unknown option: ${argv[i]}`);
    }
  }
  return args;
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const configDir = args.configDir || join(homedir(), '.aurehub');
  const cfg = loadConfig(configDir);
  const env = cfg.env;

  const provider = createProvider(env);
  const ethersProvider = provider.getEthersProvider();

  const contracts = cfg.yaml.contracts || {};
  const tokenRules = cfg.yaml.token_rules || {};
  const pairs = cfg.yaml.pairs || [];

  // Resolve buy/sell pair
  function resolvePair(side) {
    if (side === 'buy') {
      return { tokenIn: resolveToken(cfg, 'USDT'), tokenOut: resolveToken(cfg, 'XAUT') };
    } else if (side === 'sell') {
      return { tokenIn: resolveToken(cfg, 'XAUT'), tokenOut: resolveToken(cfg, 'USDT') };
    }
    throw new Error(`Invalid side: ${side}. Use "buy" or "sell".`);
  }

  function findFee(tokenInSymbol, tokenOutSymbol) {
    const pair = pairs.find(p => p.token_in === tokenInSymbol && p.token_out === tokenOutSymbol && p.enabled);
    return pair ? pair.fee_tier : 500;
  }

  switch (args.command) {
    case 'address': {
      const signer = await createSigner(cfg, ethersProvider);
      output({ address: signer.address });
      break;
    }

    case 'balance': {
      const signer = await createSigner(cfg, ethersProvider);
      const address = signer.address;
      const usdt = resolveToken(cfg, 'USDT');
      const xaut = resolveToken(cfg, 'XAUT');
      const [usdtBal, xautBal, ethBal] = await Promise.all([
        getBalance(usdt, address, ethersProvider),
        getBalance(xaut, address, ethersProvider),
        ethersProvider.getBalance(address).then(b => (Number(b) / 1e18).toFixed(6)),
      ]);
      output({ address, ETH: ethBal, USDT: usdtBal, XAUT: xautBal });
      break;
    }

    case 'allowance': {
      if (!args.token) throw new Error('--token is required for allowance');
      const signer = await createSigner(cfg, ethersProvider);
      const token = resolveToken(cfg, args.token);
      const allowance = await getAllowance(token, signer.address, contracts.router, ethersProvider);
      output({ token: args.token, allowance, spender: contracts.router });
      break;
    }

    case 'quote': {
      if (!args.side || !args.amount) throw new Error('--side and --amount are required for quote');
      const { tokenIn, tokenOut } = resolvePair(args.side);
      const inSymbol = args.side === 'buy' ? 'USDT' : 'XAUT';
      const outSymbol = args.side === 'buy' ? 'XAUT' : 'USDT';
      const fee = findFee(inSymbol, outSymbol);
      const result = await quote({ tokenIn, tokenOut, amountIn: args.amount, fee, contracts, provider: ethersProvider });
      output({ side: args.side, amountIn: args.amount, tokenIn: inSymbol, tokenOut: outSymbol, ...result });
      break;
    }

    case 'approve': {
      if (!args.token || !args.amount) throw new Error('--token and --amount are required for approve');
      const signer = await createSigner(cfg, ethersProvider);
      const token = resolveToken(cfg, args.token);
      const rules = tokenRules[args.token] || {};
      const result = await approve(token, contracts.router, args.amount, signer, {
        requiresResetApprove: !!rules.requires_reset_approve,
      });
      output({ token: args.token, amount: args.amount, spender: contracts.router, txHash: result.hash });
      break;
    }

    case 'swap': {
      if (!args.side || !args.amount || !args.minOut) throw new Error('--side, --amount, and --min-out are required for swap');
      const signer = await createSigner(cfg, ethersProvider);
      const { tokenIn, tokenOut } = resolvePair(args.side);
      const inSymbol = args.side === 'buy' ? 'USDT' : 'XAUT';
      const outSymbol = args.side === 'buy' ? 'XAUT' : 'USDT';
      const fee = findFee(inSymbol, outSymbol);
      const deadline = Math.floor(Date.now() / 1000) + (cfg.yaml.risk?.deadline_seconds || 300);
      const txParams = buildSwap({
        tokenIn, tokenOut,
        amountIn: args.amount,
        minAmountOut: args.minOut,
        fee,
        recipient: signer.address,
        deadline,
        contracts,
      });
      const tx = await signer.sendTransaction(txParams);
      const receipt = await tx.wait();
      output({
        side: args.side,
        amountIn: args.amount,
        minAmountOut: args.minOut,
        txHash: tx.hash,
        status: receipt.status === 1 ? 'success' : 'failed',
        gasUsed: receipt.gasUsed.toString(),
      });
      break;
    }
  }
}

// Only run main when executed directly (not imported for testing)
import { fileURLToPath } from 'node:url';
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch(err => {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run __tests__/swap-cli.test.js`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/market/swap.js skills/xaut-trade/scripts/market/__tests__/swap-cli.test.js
git commit -m "feat(market): add swap.js CLI with quote, balance, allowance, approve, swap, address subcommands"
```

---

## Chunk 2: Setup & SKILL.md Migration

### Task 9: Modify `setup.sh` — add wallet mode selection

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh`

- [ ] **Step 1: Read current setup.sh to identify insertion points**

Read `skills/xaut-trade/scripts/setup.sh` fully. Identify:
- Where the Foundry installation step begins (around line 42)
- Where config.yaml is written

- [ ] **Step 2: Add wallet mode selection at the top of the interactive flow**

Insert after the initial `~/.aurehub` directory creation but before Foundry checks. Add:

```bash
# === Wallet Mode Selection ===
echo ""
echo "=== Wallet Mode ==="
echo "[1] WDK (recommended) — seed-phrase based, no external tools needed"
echo "[2] Foundry (advanced) — requires Foundry installed, keystore-based"
echo ""
read -p "Select [1]: " wallet_mode_choice
wallet_mode_choice="${wallet_mode_choice:-1}"

if [ "$wallet_mode_choice" = "1" ]; then
  WALLET_MODE="wdk"
elif [ "$wallet_mode_choice" = "2" ]; then
  WALLET_MODE="foundry"
else
  echo "Invalid choice. Defaulting to WDK."
  WALLET_MODE="wdk"
fi
```

- [ ] **Step 3: Add WDK setup branch**

After the wallet mode selection, add the WDK path:

```bash
if [ "$WALLET_MODE" = "wdk" ]; then
  # Check Node.js >= 18
  if ! command -v node &>/dev/null; then
    echo "Error: Node.js is required. Install from https://nodejs.org/"
    exit 1
  fi
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js >= 18 required (found v$NODE_VERSION)"
    exit 1
  fi

  # Prompt for wallet password
  echo ""
  read -s -p "Enter wallet password (min 12 characters): " WDK_PASSWORD
  echo ""
  if [ ${#WDK_PASSWORD} -lt 12 ]; then
    echo "Error: Password must be at least 12 characters."
    exit 1
  fi
  read -s -p "Confirm password: " WDK_PASSWORD_CONFIRM
  echo ""
  if [ "$WDK_PASSWORD" != "$WDK_PASSWORD_CONFIRM" ]; then
    echo "Error: Passwords do not match."
    exit 1
  fi

  # Write password file
  WDK_PASSWORD_FILE="$HOME/.aurehub/.wdk_password"
  echo "$WDK_PASSWORD" > "$WDK_PASSWORD_FILE"
  chmod 600 "$WDK_PASSWORD_FILE"

  # Install market module dependencies
  MARKET_DIR="$(cd "$(dirname "$0")" && pwd)/market"
  if [ -f "$MARKET_DIR/package.json" ]; then
    echo "Installing market module dependencies..."
    (cd "$MARKET_DIR" && npm install --silent)
  fi

  # Create encrypted wallet
  VAULT_FILE="$HOME/.aurehub/.wdk_vault"
  RESULT=$(node "$MARKET_DIR/lib/create-wallet.js" --password-file "$WDK_PASSWORD_FILE" --vault-file "$VAULT_FILE")
  WALLET_ADDRESS=$(echo "$RESULT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).address))")
  echo "Wallet created: $WALLET_ADDRESS"

  # Skip to config writing (skip all Foundry steps)
fi
```

- [ ] **Step 4: Wrap existing Foundry steps in `if [ "$WALLET_MODE" = "foundry" ]; then ... fi`**

The existing Foundry installation, keystore creation, and password file steps should only run when `WALLET_MODE=foundry`.

- [ ] **Step 5: Update config.yaml generation to include `wallet_mode`**

Where `config.yaml` is written/copied, ensure `wallet_mode: $WALLET_MODE` is added.
For WDK mode, also add `wdk_vault_file: ~/.aurehub/.wdk_vault`.

- [ ] **Step 6: Update .env generation**

For WDK mode, write:
```
ETH_RPC_URL=https://eth.llamarpc.com
# ETH_RPC_URL_FALLBACK=https://rpc.merkle.io,https://rpc.flashbots.net,https://eth.drpc.org
WDK_PASSWORD_FILE=~/.aurehub/.wdk_password
```

For Foundry mode, keep existing behavior.

- [ ] **Step 7: Test manually (WDK path)**

Run: `bash skills/xaut-trade/scripts/setup.sh`
Select [1] WDK, enter password, verify vault file created.

- [ ] **Step 8: Commit**

```bash
git add skills/xaut-trade/scripts/setup.sh
git commit -m "feat(setup): add wallet mode selection with WDK encrypted vault support"
```

---

### Task 10: Update SKILL.md — environment checks and trade instructions

> **Note for agentic workers:** This task modifies SKILL.md, the main agent instruction file. Read the entire current SKILL.md first, then apply changes systematically section by section. The spec's "SKILL.md Changes" section (lines 202-217) defines what must change.

**Files:**
- Modify: `skills/xaut-trade/SKILL.md`

- [ ] **Step 1: Read current SKILL.md fully**

Understand the environment readiness check section and trade instruction sections. Note every occurrence of `cast` commands.

- [ ] **Step 2: Update environment readiness check**

Replace the `cast --version` and keystore-only checks with dual-mode detection. The new check flow:

1. Check `~/.aurehub/config.yaml` exists → if not, redirect to setup.
2. Read `wallet_mode` from config.yaml → if missing, instruct user to re-run setup: "wallet_mode not set. Run setup to select a wallet mode."
3. If `wallet_mode: wdk`:
   - Check `~/.aurehub/.wdk_vault` exists → if not: "WDK vault not found. Run setup."
   - Check `WDK_PASSWORD_FILE` in .env and file readable → if not: "WDK password file not found."
   - Check Node.js ≥ 18: `node -v`
4. If `wallet_mode: foundry`:
   - Check `cast --version` available
   - Check keystore: `ls ~/.foundry/keystores/$FOUNDRY_ACCOUNT`
   - Check `KEYSTORE_PASSWORD_FILE` readable
   - Check Node.js ≥ 18 (needed for market module)
5. Both modes: check `~/.aurehub/.env` exists, run `node market/swap.js address` to verify wallet loads correctly.

- [ ] **Step 3: Replace all `cast call/send` trade instructions**

Replace every occurrence of `cast`-based trading commands with `node market/swap.js` equivalents:

- Quote: `node market/swap.js quote --side buy --amount <N>`
- Balance: `node market/swap.js balance`
- Allowance: `node market/swap.js allowance --token USDT`
- Approve: `node market/swap.js approve --token USDT --amount <N>`
- Swap: `node market/swap.js swap --side buy --amount <N> --min-out <M>`
- Address: `node market/swap.js address`

- [ ] **Step 4: Update the `source ~/.aurehub/.env` pattern**

Current SKILL.md instructs agent to `source ~/.aurehub/.env` in every Bash block and derive `WALLET_ADDRESS` via `cast wallet address`. Replace with:
- Agent runs `node market/swap.js address` to get wallet address (works for both modes).
- Or runs `node market/swap.js balance` which includes the address.

- [ ] **Step 5: Update `cast` residual references**

Keep `cast wallet list` only in Foundry mode context. Add note that WDK mode has zero `cast` dependency.

- [ ] **Step 6: Commit**

```bash
git add skills/xaut-trade/SKILL.md
git commit -m "feat(xaut-trade): migrate SKILL.md from cast to node swap.js with dual wallet mode"
```

---

### Task 11: Update reference files

> **Note for agentic workers:** For each file, read the current content first, then replace `cast` commands with `node market/swap.js` equivalents. Preserve the existing document structure (headings, confirmation gates, safety checks). The new CLI commands output JSON — update parsing instructions accordingly.

**Files:**
- Modify: `skills/xaut-trade/references/onboarding.md`
- Modify: `skills/xaut-trade/references/balance.md`
- Modify: `skills/xaut-trade/references/quote.md`
- Modify: `skills/xaut-trade/references/buy.md`
- Modify: `skills/xaut-trade/references/sell.md`
- Modify: `skills/xaut-trade/references/live-trading-runbook.md`
- Create: `skills/xaut-trade/references/wallet-modes.md`

- [ ] **Step 1: Update onboarding.md**

Read current file. Add wallet mode selection at the top of the manual setup flow:
- New section: "Step 0: Choose Wallet Mode" with WDK (recommended) and Foundry (advanced)
- WDK branch: check Node.js ≥ 18, set password, run `node market/lib/create-wallet.js`, write `.env`
- Foundry branch: existing steps (install Foundry, import/create keystore, password file)
- Both branches converge at: write `config.yaml` with `wallet_mode`, verify with `node market/swap.js address`

- [ ] **Step 2: Update balance.md**

Replace all `cast` commands:
- `cast wallet address ...` → `node market/swap.js address` (outputs `{ "address": "0x..." }`)
- `cast call <token> "balanceOf(address)" ...` → `node market/swap.js balance` (outputs `{ "address": "...", "ETH": "...", "USDT": "...", "XAUT": "..." }`)
- Remove `cast abi-decode` / `cast to-dec` parsing steps — swap.js outputs pre-formatted values

- [ ] **Step 3: Update quote.md**

Replace:
- `cast call <quoter> "quoteExactInputSingle(...)" ...` → `node market/swap.js quote --side buy --amount <N>` (outputs `{ "amountOut": "...", "gasEstimate": "..." }`)
- Remove manual `cast abi-decode` parsing
- Slippage calculation logic stays (agent computes minAmountOut from amountOut)

- [ ] **Step 4: Rewrite buy.md**

Read current buy.md. Rewrite with this structure (preserve confirmation gates and safety checks):
1. **Allowance check**: `node market/swap.js allowance --token USDT` → parse `{ "allowance": "..." }`
2. **Approve (if needed)**: `node market/swap.js approve --token USDT --amount <N>` → parse `{ "txHash": "..." }` (USDT reset-to-zero handled internally by erc20.js)
3. **Swap**: `node market/swap.js swap --side buy --amount <N> --min-out <M>` → parse `{ "txHash": "...", "status": "success", "gasUsed": "..." }`
4. **Verify**: `node market/swap.js balance`

Keep: confirmation thresholds (<$10 / $10-1000 / >$1000), slippage warning, insufficient balance hard-stop

- [ ] **Step 5: Rewrite sell.md**

Read current sell.md. Rewrite with same structure as buy.md but with these differences:
1. **Precision check first**: verify XAUT amount has ≤ 6 decimal places → hard-stop if exceeded
2. **Direction**: `--side sell` (XAUT → USDT), `--token XAUT` for allowance/approve
3. **No approve reset**: XAUT is standard ERC-20, erc20.js skips reset-to-zero (controlled by `token_rules` in config.yaml)
4. **Quote**: `node market/swap.js quote --side sell --amount <N>`

Keep: same confirmation thresholds and safety checks as buy

- [ ] **Step 6: Update live-trading-runbook.md**

Read current file. Replace:
- "Agent uses `cast call/send`" → "Agent uses `node market/swap.js <subcommand>`"
- Update the "What Agent does vs what User does" table
- Update mandatory checkpoints to reference new commands

- [ ] **Step 7: Create wallet-modes.md**

```markdown
# Wallet Modes

## WDK Mode (Recommended)

- **Storage**: Encrypted vault (`~/.aurehub/.wdk_vault`) using `@tetherto/wdk-secret-manager`
- **Encryption**: PBKDF2 with 100k iterations, seed never stored as plaintext
- **Dependencies**: Node.js ≥ 18 only — no external tools required
- **Setup**: Choose password → encrypted vault created automatically
- **Config**: `wallet_mode: wdk` + `WDK_PASSWORD_FILE` in `.env`

## Foundry Mode (Advanced)

- **Storage**: Foundry keystore (`~/.foundry/keystores/<account>`) — standard Web3 Secret Storage
- **Encryption**: Scrypt-based (Foundry default)
- **Dependencies**: Foundry (`cast`) must be installed
- **Setup**: Install Foundry → import/create keystore → set password file
- **Config**: `wallet_mode: foundry` + `FOUNDRY_ACCOUNT` + `KEYSTORE_PASSWORD_FILE` in `.env`

## Switching Modes

Re-run `setup.sh` and select the other mode. Existing wallet data is not deleted — you can switch back.

## Security Comparison

| Feature | WDK | Foundry |
|---------|-----|---------|
| Seed/key encryption at rest | PBKDF2 (100k iter) | Scrypt |
| Password file | `~/.aurehub/.wdk_password` | `~/.aurehub/.wallet.password` |
| External tool required | No | Yes (Foundry) |
| Key derivation | BIP-39/BIP-44 (HD wallet) | Single key per keystore |
```

- [ ] **Step 8: Commit all reference changes**

```bash
git add skills/xaut-trade/references/
git commit -m "docs(xaut-trade): migrate all references from cast to node swap.js"
```

---

### Task 12: Update config.example.yaml

**Files:**
- Modify: `skills/xaut-trade/config.example.yaml`

- [ ] **Step 1: Add wallet_mode field**

Add at the top of config.example.yaml:

```yaml
# Wallet mode: "wdk" (recommended) or "foundry" (advanced)
# Set during setup — do not change manually without re-running setup
wallet_mode: wdk

# WDK vault file path (WDK mode only)
# wdk_vault_file: ~/.aurehub/.wdk_vault
```

- [ ] **Step 2: Commit**

```bash
git add skills/xaut-trade/config.example.yaml
git commit -m "docs(xaut-trade): add wallet_mode to config.example.yaml"
```

---

### Task 13: Update .env.example

**Files:**
- Modify: `skills/xaut-trade/.env.example`

- [ ] **Step 1: Read current .env.example**

- [ ] **Step 2: Add WDK environment variables**

Add a WDK section:

```bash
# === WDK Mode (recommended) ===
# WDK_PASSWORD_FILE=~/.aurehub/.wdk_password

# === Foundry Mode (advanced) ===
# FOUNDRY_ACCOUNT=aurehub-wallet
# KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
```

Update the existing Foundry variables to be clearly marked as Foundry-mode-only.

- [ ] **Step 3: Commit**

```bash
git add skills/xaut-trade/.env.example
git commit -m "docs(xaut-trade): add WDK env vars to .env.example"
```

---

## Chunk 3: Testing & Validation

### Task 14: Integration smoke test

**Files:**
- Create: `skills/xaut-trade/scripts/market/__tests__/integration.test.js`

- [ ] **Step 1: Write integration test that verifies module wiring**

```javascript
// integration.test.js
// Verifies all modules can be imported and basic wiring works
import { describe, it, expect } from 'vitest';

describe('module imports', () => {
  it('imports config', async () => {
    const m = await import('../lib/config.js');
    expect(typeof m.loadConfig).toBe('function');
    expect(typeof m.resolveToken).toBe('function');
  });

  it('imports provider', async () => {
    const m = await import('../lib/provider.js');
    expect(typeof m.createProvider).toBe('function');
    expect(typeof m.FallbackProvider).toBe('function');
  });

  it('imports signer', async () => {
    const m = await import('../lib/signer.js');
    expect(typeof m.createSigner).toBe('function');
  });

  it('imports erc20', async () => {
    const m = await import('../lib/erc20.js');
    expect(typeof m.getBalance).toBe('function');
    expect(typeof m.getAllowance).toBe('function');
    expect(typeof m.approve).toBe('function');
  });

  it('imports uniswap', async () => {
    const m = await import('../lib/uniswap.js');
    expect(typeof m.quote).toBe('function');
    expect(typeof m.buildSwap).toBe('function');
  });

  it('imports swap CLI parser', async () => {
    const m = await import('../swap.js');
    expect(typeof m.parseCliArgs).toBe('function');
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run`
Expected: All tests PASS across all test files.

- [ ] **Step 3: Commit**

```bash
git add skills/xaut-trade/scripts/market/__tests__/integration.test.js
git commit -m "test(market): add integration smoke test for module imports"
```

---

### Task 15: Update SKILL.tests.yaml

**Files:**
- Modify: `skills/xaut-trade/SKILL.tests.yaml`

- [ ] **Step 1: Read current test cases**

Identify which test cases reference `cast` commands in their expected behavior.

- [ ] **Step 2: Update test case expectations**

For each test case that references `cast`, update `contains` and `not_contains` assertions:

- **tc-002** (quote preview): change `contains: ["cast call", "QUOTER"]` → `contains: ["node market/swap.js quote", "amountOut"]`
- **tc-003** (approval): change `contains: ["cast send", "approve"]` → `contains: ["node market/swap.js approve", "--token USDT"]`
- **tc-010** (sell quote): change `contains: ["cast call"]` → `contains: ["node market/swap.js quote", "--side sell"]`
- **tc-014** (sell approval): update to expect `node market/swap.js approve --token XAUT` (no reset-to-zero mention)
- **All test cases** referencing `cast call`/`cast send` for trading: replace with corresponding `node market/swap.js` subcommand

- [ ] **Step 3: Add new test cases for wallet mode**

Add these test cases to the `full` suite:

```yaml
- id: tc-029
  name: "WDK mode env check"
  suite: [full]
  input: "buy 100 USDT of XAUT"
  env_override:
    wallet_mode: wdk
    wdk_vault_exists: false
  expect:
    type: gate
    contains: ["vault not found", "setup"]

- id: tc-030
  name: "missing wallet_mode redirects to setup"
  suite: [full]
  input: "buy 100 USDT of XAUT"
  env_override:
    wallet_mode: null
  expect:
    type: gate
    contains: ["wallet_mode", "setup"]

- id: tc-031
  name: "Foundry mode env check"
  suite: [full]
  input: "buy 100 USDT of XAUT"
  env_override:
    wallet_mode: foundry
    foundry_installed: false
  expect:
    type: gate
    contains: ["Foundry", "cast"]
```

- [ ] **Step 4: Commit**

```bash
git add skills/xaut-trade/SKILL.tests.yaml
git commit -m "test(xaut-trade): update test cases for swap.js migration and dual wallet modes"
```

---

### Task 16: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd skills/xaut-trade/scripts/market && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Verify limit-order.js still works**

Run: `cd skills/xaut-trade/scripts && node limit-order.js --help` (or equivalent)
Expected: No errors, existing functionality intact.

- [ ] **Step 3: Verify no git-tracked files are accidentally modified**

Run: `git diff --name-only` and confirm only intended files are changed.

- [ ] **Step 4: Final commit if any cleanup needed**

Stage only relevant files explicitly (do not use `git add -A`):
```bash
git add skills/xaut-trade/
git commit -m "chore(xaut-trade): final cleanup for SDK migration"
```
